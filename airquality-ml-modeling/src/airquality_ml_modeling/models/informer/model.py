import os
from pathlib import Path
from math import sqrt
import math

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

from ..base_model import BaseTimeSeriesModel
import configs.config as config


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Target columns for multi-output prediction
TARGET_COLUMNS = ["pm1_0", "pm2_5", "pm10", "aqi"]
NUM_TARGETS = len(TARGET_COLUMNS)


class _TriangularCausalMask:
    def __init__(self, batch_size, length, device="cpu"):
        mask_shape = [batch_size, 1, length, length]
        with torch.no_grad():
            self._mask = torch.triu(
                torch.ones(mask_shape, dtype=torch.bool), diagonal=1
            ).to(device)

    @property
    def mask(self):
        return self._mask


class _ProbMask:
    def __init__(self, batch_size, n_heads, length, index, scores, device="cpu"):
        mask = torch.ones(length, scores.shape[-1], dtype=torch.bool).to(device).triu(1)
        mask_ex = mask[None, None, :].expand(batch_size, n_heads, length, scores.shape[-1])
        indicator = mask_ex[
            torch.arange(batch_size)[:, None, None],
            torch.arange(n_heads)[None, :, None],
            index,
            :,
        ].to(device)
        self._mask = indicator.view(scores.shape).to(device)

    @property
    def mask(self):
        return self._mask


class _PositionalEmbedding(nn.Module):
    def __init__(self, d_model, max_len=5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model).float()
        pe.require_grad = False

        position = torch.arange(0, max_len).float().unsqueeze(1)
        div_term = (
            torch.arange(0, d_model, 2).float() * -(math.log(10000.0) / d_model)
        ).exp()

        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pe", pe.unsqueeze(0))

    def forward(self, x):
        return self.pe[:, : x.size(1)]


class _TokenEmbedding(nn.Module):
    def __init__(self, c_in, d_model):
        super().__init__()
        padding = 1 if torch.__version__ >= "1.5.0" else 2
        self.token_conv = nn.Conv1d(
            in_channels=c_in,
            out_channels=d_model,
            kernel_size=3,
            padding=padding,
            padding_mode="circular",
        )
        for module in self.modules():
            if isinstance(module, nn.Conv1d):
                nn.init.kaiming_normal_(
                    module.weight, mode="fan_in", nonlinearity="leaky_relu"
                )

    def forward(self, x):
        return self.token_conv(x.permute(0, 2, 1)).transpose(1, 2)


class _TimeFeatureEmbedding(nn.Module):
    def __init__(self, d_model, freq="h"):
        super().__init__()
        freq_map = {"h": 4, "t": 5, "s": 6, "m": 1, "a": 1, "w": 2, "d": 3, "b": 3}
        self.embed = nn.Linear(freq_map[freq], d_model)

    def forward(self, x):
        return self.embed(x)


class _DataEmbedding(nn.Module):
    def __init__(self, c_in, d_model, freq="h", dropout=0.1):
        super().__init__()
        self.value_embedding = _TokenEmbedding(c_in=c_in, d_model=d_model)
        self.position_embedding = _PositionalEmbedding(d_model=d_model)
        self.temporal_embedding = _TimeFeatureEmbedding(d_model=d_model, freq=freq)
        self.dropout = nn.Dropout(p=dropout)

    def forward(self, x, x_mark):
        x = (
            self.value_embedding(x)
            + self.position_embedding(x)
            + self.temporal_embedding(x_mark)
        )
        return self.dropout(x)


class _FullAttention(nn.Module):
    def __init__(self, mask_flag=True, factor=5, scale=None, attention_dropout=0.1, output_attention=False):
        super().__init__()
        self.scale = scale
        self.mask_flag = mask_flag
        self.output_attention = output_attention
        self.dropout = nn.Dropout(attention_dropout)

    def forward(self, queries, keys, values, attn_mask):
        batch_size, length, _, embed_dim = queries.shape
        scale = self.scale or 1.0 / sqrt(embed_dim)

        scores = torch.einsum("blhe,bshe->bhls", queries, keys)
        if self.mask_flag:
            if attn_mask is None:
                attn_mask = _TriangularCausalMask(batch_size, length, device=queries.device)
            scores.masked_fill_(attn_mask.mask, -np.inf)

        attn = self.dropout(torch.softmax(scale * scores, dim=-1))
        values_out = torch.einsum("bhls,bshd->blhd", attn, values)

        if self.output_attention:
            return values_out.contiguous(), attn
        return values_out.contiguous(), None


class _ProbAttention(nn.Module):
    def __init__(self, mask_flag=True, factor=5, scale=None, attention_dropout=0.1, output_attention=False):
        super().__init__()
        self.factor = factor
        self.scale = scale
        self.mask_flag = mask_flag
        self.output_attention = output_attention
        self.dropout = nn.Dropout(attention_dropout)

    def _prob_qk(self, queries, keys, sample_k, n_top):
        batch_size, n_heads, key_len, embed_dim = keys.shape
        _, _, query_len, _ = queries.shape

        keys_expand = keys.unsqueeze(-3).expand(batch_size, n_heads, query_len, key_len, embed_dim)
        index_sample = torch.randint(key_len, (query_len, sample_k))
        keys_sample = keys_expand[:, :, torch.arange(query_len).unsqueeze(1), index_sample, :]
        queries_keys = torch.matmul(queries.unsqueeze(-2), keys_sample.transpose(-2, -1)).squeeze(-2)

        sparsity = queries_keys.max(-1)[0] - torch.div(queries_keys.sum(-1), key_len)
        m_top = sparsity.topk(n_top, sorted=False)[1]
        q_reduce = queries[
            torch.arange(batch_size)[:, None, None],
            torch.arange(n_heads)[None, :, None],
            m_top,
            :,
        ]
        qk = torch.matmul(q_reduce, keys.transpose(-2, -1))
        return qk, m_top

    def _get_initial_context(self, values, query_len):
        batch_size, n_heads, value_len, _ = values.shape
        if not self.mask_flag:
            values_mean = values.mean(dim=-2)
            context = values_mean.unsqueeze(-2).expand(batch_size, n_heads, query_len, values_mean.shape[-1]).clone()
        else:
            assert query_len == value_len
            context = values.cumsum(dim=-2)
        return context

    def _update_context(self, context_in, values, scores, index, query_len, attn_mask):
        batch_size, n_heads, value_len, _ = values.shape

        if self.mask_flag:
            attn_mask = _ProbMask(batch_size, n_heads, query_len, index, scores, device=values.device)
            scores.masked_fill_(attn_mask.mask, -np.inf)

        attn = torch.softmax(scores, dim=-1)
        context_in[
            torch.arange(batch_size)[:, None, None],
            torch.arange(n_heads)[None, :, None],
            index,
            :,
        ] = torch.matmul(attn, values).type_as(context_in)

        if self.output_attention:
            attns = (torch.ones([batch_size, n_heads, value_len, value_len]) / value_len).type_as(attn).to(attn.device)
            attns[
                torch.arange(batch_size)[:, None, None],
                torch.arange(n_heads)[None, :, None],
                index,
                :,
            ] = attn
            return context_in, attns
        return context_in, None

    def forward(self, queries, keys, values, attn_mask):
        batch_size, query_len, n_heads, embed_dim = queries.shape
        _, key_len, _, _ = keys.shape

        queries = queries.transpose(2, 1)
        keys = keys.transpose(2, 1)
        values = values.transpose(2, 1)

        sample_k = min(key_len, self.factor * int(np.ceil(np.log(max(key_len, 2)))))
        n_top = min(query_len, self.factor * int(np.ceil(np.log(max(query_len, 2)))))

        scores_top, index = self._prob_qk(queries, keys, sample_k=sample_k, n_top=n_top)
        scale = self.scale or 1.0 / sqrt(embed_dim)
        scores_top = scores_top * scale

        context = self._get_initial_context(values, query_len)
        context, attn = self._update_context(context, values, scores_top, index, query_len, attn_mask)
        return context.transpose(2, 1).contiguous(), attn


class _AttentionLayer(nn.Module):
    def __init__(self, attention, d_model, n_heads, d_keys=None, d_values=None, mix=False):
        super().__init__()
        d_keys = d_keys or (d_model // n_heads)
        d_values = d_values or (d_model // n_heads)

        self.inner_attention = attention
        self.query_projection = nn.Linear(d_model, d_keys * n_heads)
        self.key_projection = nn.Linear(d_model, d_keys * n_heads)
        self.value_projection = nn.Linear(d_model, d_values * n_heads)
        self.out_projection = nn.Linear(d_values * n_heads, d_model)
        self.n_heads = n_heads
        self.mix = mix

    def forward(self, queries, keys, values, attn_mask):
        batch_size, query_len, _ = queries.shape
        _, key_len, _ = keys.shape
        n_heads = self.n_heads

        queries = self.query_projection(queries).view(batch_size, query_len, n_heads, -1)
        keys = self.key_projection(keys).view(batch_size, key_len, n_heads, -1)
        values = self.value_projection(values).view(batch_size, key_len, n_heads, -1)

        out, attn = self.inner_attention(queries, keys, values, attn_mask)
        if self.mix:
            out = out.transpose(2, 1).contiguous()
        out = out.view(batch_size, query_len, -1)
        return self.out_projection(out), attn


class _ConvLayer(nn.Module):
    def __init__(self, c_in):
        super().__init__()
        padding = 1 if torch.__version__ >= "1.5.0" else 2
        self.down_conv = nn.Conv1d(
            in_channels=c_in,
            out_channels=c_in,
            kernel_size=3,
            padding=padding,
            padding_mode="circular",
        )
        self.norm = nn.BatchNorm1d(c_in)
        self.activation = nn.ELU()
        self.max_pool = nn.MaxPool1d(kernel_size=3, stride=2, padding=1)

    def forward(self, x):
        x = self.down_conv(x.permute(0, 2, 1))
        x = self.norm(x)
        x = self.activation(x)
        x = self.max_pool(x)
        return x.transpose(1, 2)


class _EncoderLayer(nn.Module):
    def __init__(self, attention, d_model, d_ff=None, dropout=0.1, activation="relu"):
        super().__init__()
        d_ff = d_ff or 4 * d_model
        self.attention = attention
        self.conv1 = nn.Conv1d(in_channels=d_model, out_channels=d_ff, kernel_size=1)
        self.conv2 = nn.Conv1d(in_channels=d_ff, out_channels=d_model, kernel_size=1)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = F.relu if activation == "relu" else F.gelu

    def forward(self, x, attn_mask=None):
        new_x, attn = self.attention(x, x, x, attn_mask=attn_mask)
        x = x + self.dropout(new_x)
        y = x = self.norm1(x)
        y = self.dropout(self.activation(self.conv1(y.transpose(-1, 1))))
        y = self.dropout(self.conv2(y).transpose(-1, 1))
        return self.norm2(x + y), attn


class _Encoder(nn.Module):
    def __init__(self, attn_layers, conv_layers=None, norm_layer=None):
        super().__init__()
        self.attn_layers = nn.ModuleList(attn_layers)
        self.conv_layers = nn.ModuleList(conv_layers) if conv_layers is not None else None
        self.norm = norm_layer

    def forward(self, x, attn_mask=None):
        attns = []
        if self.conv_layers is not None:
            for attn_layer, conv_layer in zip(self.attn_layers, self.conv_layers):
                x, attn = attn_layer(x, attn_mask=attn_mask)
                x = conv_layer(x)
                attns.append(attn)
            x, attn = self.attn_layers[-1](x, attn_mask=attn_mask)
            attns.append(attn)
        else:
            for attn_layer in self.attn_layers:
                x, attn = attn_layer(x, attn_mask=attn_mask)
                attns.append(attn)

        if self.norm is not None:
            x = self.norm(x)
        return x, attns


class _DecoderLayer(nn.Module):
    def __init__(self, self_attention, cross_attention, d_model, d_ff=None, dropout=0.1, activation="relu"):
        super().__init__()
        d_ff = d_ff or 4 * d_model
        self.self_attention = self_attention
        self.cross_attention = cross_attention
        self.conv1 = nn.Conv1d(in_channels=d_model, out_channels=d_ff, kernel_size=1)
        self.conv2 = nn.Conv1d(in_channels=d_ff, out_channels=d_model, kernel_size=1)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.norm3 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = F.relu if activation == "relu" else F.gelu

    def forward(self, x, cross, x_mask=None, cross_mask=None):
        x = x + self.dropout(self.self_attention(x, x, x, attn_mask=x_mask)[0])
        x = self.norm1(x)
        x = x + self.dropout(self.cross_attention(x, cross, cross, attn_mask=cross_mask)[0])

        y = x = self.norm2(x)
        y = self.dropout(self.activation(self.conv1(y.transpose(-1, 1))))
        y = self.dropout(self.conv2(y).transpose(-1, 1))
        return self.norm3(x + y)


class _Decoder(nn.Module):
    def __init__(self, layers, norm_layer=None):
        super().__init__()
        self.layers = nn.ModuleList(layers)
        self.norm = norm_layer

    def forward(self, x, cross, x_mask=None, cross_mask=None):
        for layer in self.layers:
            x = layer(x, cross, x_mask=x_mask, cross_mask=cross_mask)
        if self.norm is not None:
            x = self.norm(x)
        return x


class _InformerCore(nn.Module):
    def __init__(
        self,
        enc_in,
        dec_in,
        c_out,
        seq_len,
        label_len,
        out_len,
        factor=5,
        d_model=512,
        n_heads=8,
        e_layers=3,
        d_layers=2,
        d_ff=512,
        dropout=0.0,
        attn="prob",
        freq="h",
        activation="gelu",
        output_attention=False,
        distil=True,
        mix=True,
        device=torch.device("cpu"),
    ):
        super().__init__()
        self.pred_len = out_len
        self.output_attention = output_attention

        self.enc_embedding = _DataEmbedding(enc_in, d_model, freq=freq, dropout=dropout)
        self.dec_embedding = _DataEmbedding(dec_in, d_model, freq=freq, dropout=dropout)
        attn_cls = _ProbAttention if attn == "prob" else _FullAttention

        self.encoder = _Encoder(
            [
                _EncoderLayer(
                    _AttentionLayer(
                        attn_cls(False, factor, attention_dropout=dropout, output_attention=output_attention),
                        d_model,
                        n_heads,
                        mix=False,
                    ),
                    d_model,
                    d_ff,
                    dropout=dropout,
                    activation=activation,
                )
                for _ in range(e_layers)
            ],
            [_ConvLayer(d_model) for _ in range(e_layers - 1)] if distil else None,
            norm_layer=torch.nn.LayerNorm(d_model),
        )

        self.decoder = _Decoder(
            [
                _DecoderLayer(
                    _AttentionLayer(
                        attn_cls(True, factor, attention_dropout=dropout, output_attention=False),
                        d_model,
                        n_heads,
                        mix=mix,
                    ),
                    _AttentionLayer(
                        _FullAttention(False, factor, attention_dropout=dropout, output_attention=False),
                        d_model,
                        n_heads,
                        mix=False,
                    ),
                    d_model,
                    d_ff,
                    dropout=dropout,
                    activation=activation,
                )
                for _ in range(d_layers)
            ],
            norm_layer=torch.nn.LayerNorm(d_model),
        )
        # Multi-output: predict all targets
        self.projection = nn.Linear(d_model, c_out, bias=True)

    def forward(self, x_enc, x_mark_enc, x_dec, x_mark_dec, enc_self_mask=None, dec_self_mask=None, dec_enc_mask=None):
        enc_out = self.enc_embedding(x_enc, x_mark_enc)
        enc_out, attns = self.encoder(enc_out, attn_mask=enc_self_mask)

        dec_out = self.dec_embedding(x_dec, x_mark_dec)
        dec_out = self.decoder(dec_out, enc_out, x_mask=dec_self_mask, cross_mask=dec_enc_mask)
        dec_out = self.projection(dec_out)

        if self.output_attention:
            return dec_out[:, -self.pred_len :, :], attns
        return dec_out[:, -self.pred_len :, :]


class _InformerDataset(Dataset):
    def __init__(self, x_data, y_data, time_marks, indices, seq_len, label_len, pred_len, num_targets=1):
        self.x_data = x_data
        self.y_data = y_data
        self.time_marks = time_marks
        self.indices = np.asarray(indices, dtype=np.int64)
        self.seq_len = seq_len
        self.label_len = label_len
        self.pred_len = pred_len
        self.num_targets = num_targets

    def __len__(self):
        return len(self.indices)

    def __getitem__(self, idx):
        pred_start = int(self.indices[idx])
        enc_start = pred_start - self.seq_len
        dec_start = pred_start - self.label_len
        pred_end = pred_start + self.pred_len

        enc_x = self.x_data[enc_start:pred_start]
        enc_mark = self.time_marks[enc_start:pred_start]
        # Multi-target: use all targets for label
        label_hist = self.y_data[dec_start:pred_start] if self.num_targets == 1 else self.y_data[dec_start:pred_start, :]
        dec_x = np.concatenate(
            [label_hist, np.zeros((self.pred_len, self.num_targets), dtype=np.float32)],
            axis=0,
        )
        dec_mark = self.time_marks[dec_start:pred_end]
        target = self.y_data[pred_start:pred_end] if self.num_targets == 1 else self.y_data[pred_start:pred_end, :]

        return (
            torch.tensor(enc_x, dtype=torch.float32),
            torch.tensor(enc_mark, dtype=torch.float32),
            torch.tensor(dec_x, dtype=torch.float32),
            torch.tensor(dec_mark, dtype=torch.float32),
            torch.tensor(target, dtype=torch.float32),
        )


class Informer(BaseTimeSeriesModel):
    def __init__(self):
        self.config_look_back = config.LOOK_BACK
        self.config_horizon = config.HORIZON
        self.config_label_len = getattr(config, "INFORMER_LABEL_LEN", 48)
        self.look_back = config.LOOK_BACK
        self.horizon = config.HORIZON
        self.label_len = min(max(1, self.config_label_len), self.look_back)
        self.features = None
        self.input_features = None
        self.scaler_X = MinMaxScaler()
        self.scaler_y = MinMaxScaler()
        self.model = None
        self.target_idx = 0
        self.history = None

    def _prepare_df(self, df_model):
        feat_existing = [f for f in config.FEATURES if f in df_model.columns]
        if not feat_existing:
            raise ValueError("Informer requires at least one input feature.")
        # Multi-target: predict all TARGET_COLUMNS
        self.target_columns = [f for f in TARGET_COLUMNS if f in feat_existing]
        if not self.target_columns:
            self.target_columns = [config.TARGET_COLUMN]
        self.target_idxs = [feat_existing.index(f) for f in self.target_columns]

        arr_inp = df_model[feat_existing].values.astype(np.float32)
        arr_tgt = df_model[self.target_columns].values.astype(np.float32)
        return arr_inp, arr_tgt, feat_existing

    def _make_time_marks(self, index):
        idx = pd.DatetimeIndex(index)
        df_t = pd.DataFrame(index=idx)
        df_t["month"] = idx.month / 12.0 - 0.5
        df_t["day"] = idx.day / 31.0 - 0.5
        df_t["weekday"] = idx.dayofweek / 6.0 - 0.5
        df_t["hour"] = idx.hour / 23.0 - 0.5
        df_t["minute"] = idx.minute / 59.0 - 0.5
        return df_t.values.astype(np.float32)

    def _resolve_window_params(self, train_len, test_len):
        look_back = int(self.config_look_back)
        horizon = int(self.config_horizon)
        label_len = min(max(1, int(self.config_label_len)), look_back)

        if train_len - look_back - horizon + 1 < 1:
            raise ValueError(
                f"Informer requires at least LOOK_BACK + HORIZON samples in train split. "
                f"Configured LOOK_BACK={look_back}, HORIZON={horizon}, train_len={train_len}."
            )

        if test_len < horizon:
            raise ValueError(
                f"Informer requires at least HORIZON samples in test split for backtest. "
                f"Configured HORIZON={horizon}, test_len={test_len}."
            )

        self.look_back = look_back
        self.horizon = horizon
        self.label_len = label_len

    def _window_indices(self, start_idx, total_len):
        first_pred_idx = max(self.look_back, start_idx)
        last_pred_idx = total_len - self.horizon + 1
        if first_pred_idx >= last_pred_idx:
            raise ValueError(
                f"No Informer windows available with LOOK_BACK={self.look_back}, "
                f"HORIZON={self.horizon}, start_idx={start_idx}, total_size={total_len}."
            )
        return np.arange(first_pred_idx, last_pred_idx, dtype=np.int64)

    def _model_params(self):
        return {
            "factor": getattr(config, "INFORMER_FACTOR", 3),
            "d_model": getattr(config, "INFORMER_D_MODEL", 128),
            "n_heads": getattr(config, "INFORMER_N_HEADS", 4),
            "e_layers": getattr(config, "INFORMER_E_LAYERS", 2),
            "d_layers": getattr(config, "INFORMER_D_LAYERS", 1),
            "d_ff": getattr(config, "INFORMER_D_FF", 256),
            "dropout": getattr(config, "INFORMER_DROPOUT", 0.1),
        }

    def _build_model(self, enc_in, num_targets, model_params=None):
        params = self._model_params()
        if model_params:
            params.update(model_params)
        return _InformerCore(
            enc_in=enc_in,
            dec_in=num_targets,
            c_out=num_targets,
            seq_len=self.look_back,
            label_len=self.label_len,
            out_len=self.horizon,
            factor=int(params["factor"]),
            d_model=int(params["d_model"]),
            n_heads=int(params["n_heads"]),
            e_layers=int(params["e_layers"]),
            d_layers=int(params["d_layers"]),
            d_ff=int(params["d_ff"]),
            dropout=float(params["dropout"]),
            attn="prob",
            freq="t",
            activation="gelu",
            output_attention=False,
            distil=True,
            mix=True,
            device=DEVICE,
        ).float().to(DEVICE)

    def train(self, train_data, df_model=None):
        if df_model is None:
            raise ValueError("Informer requires df_model with timestamp-aligned features.")

        torch.manual_seed(config.RANDOM_SEED)
        self.scaler_X = MinMaxScaler()
        self.scaler_y = MinMaxScaler()

        arr_inp, arr_tgt, inp_feats = self._prepare_df(df_model)
        self.input_features = inp_feats
        self.features = self.target_columns

        num_targets = len(self.target_columns)

        train_len = len(train_data)
        test_len = max(1, arr_inp.shape[0] - train_len)
        self._resolve_window_params(train_len=train_len, test_len=test_len)

        val_count = max(1, int(train_len * 0.1))
        fit_end = max(1, train_len - val_count)

        self.scaler_X.fit(arr_inp[:fit_end])
        self.scaler_y.fit(arr_tgt[:fit_end])

        train_x = self.scaler_X.transform(arr_inp[:train_len]).astype(np.float32)
        train_y = self.scaler_y.transform(arr_tgt[:train_len]).astype(np.float32)
        train_marks = self._make_time_marks(df_model.index[:train_len])

        window_idx = self._window_indices(self.look_back, len(train_x))
        total = len(window_idx)
        vc = 1 if total == 1 else max(1, int(total * 0.1))
        sp = max(1, total - vc)

        train_idx = window_idx[:sp]
        val_idx = window_idx[-vc:] if total > 1 else window_idx

        train_loader = DataLoader(
            _InformerDataset(train_x, train_y, train_marks, train_idx, self.look_back, self.label_len, self.horizon, num_targets),
            batch_size=config.BATCH_SIZE,
            shuffle=True,
        )
        val_loader = DataLoader(
            _InformerDataset(train_x, train_y, train_marks, val_idx, self.look_back, self.label_len, self.horizon, num_targets),
            batch_size=config.BATCH_SIZE,
            shuffle=False,
        )

        self.model = self._build_model(enc_in=train_x.shape[1], num_targets=num_targets)

        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=getattr(config, "INFORMER_LR", getattr(config, "LR", 1e-4)),
            weight_decay=getattr(config, "INFORMER_WEIGHT_DECAY", 1e-5),
        )
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer,
            mode="min",
            factor=0.5,
            patience=getattr(config, "LR_PATIENCE", 10),
        )

        best_val = float("inf")
        best_w = None
        patience = 0
        train_losses = []
        val_losses = []

        for epoch in range(1, config.EPOCHS + 1):
            self.model.train()
            t_sum = 0.0
            t_count = 0
            for enc_x, enc_mark, dec_x, dec_mark, yb in train_loader:
                enc_x = enc_x.to(DEVICE)
                enc_mark = enc_mark.to(DEVICE)
                dec_x = dec_x.to(DEVICE)
                dec_mark = dec_mark.to(DEVICE)
                yb = yb.to(DEVICE)

                optimizer.zero_grad()
                pred = self.model(enc_x, enc_mark, dec_x, dec_mark)
                loss = criterion(pred, yb)
                loss.backward()
                optimizer.step()
                t_sum += loss.item() * enc_x.size(0)
                t_count += enc_x.size(0)
            train_epoch_loss = t_sum / t_count if t_count else 0.0
            train_losses.append(train_epoch_loss)

            self.model.eval()
            v_sum = 0.0
            v_count = 0
            with torch.no_grad():
                for enc_x, enc_mark, dec_x, dec_mark, yb in val_loader:
                    enc_x = enc_x.to(DEVICE)
                    enc_mark = enc_mark.to(DEVICE)
                    dec_x = dec_x.to(DEVICE)
                    dec_mark = dec_mark.to(DEVICE)
                    yb = yb.to(DEVICE)
                    pred = self.model(enc_x, enc_mark, dec_x, dec_mark)
                    v_sum += criterion(pred, yb).item() * enc_x.size(0)
                    v_count += enc_x.size(0)
            v_loss = v_sum / v_count if v_count else 0.0
            val_losses.append(v_loss)
            scheduler.step(v_loss)

            if config.VERBOSE and epoch % 20 == 0:
                print(f"Epoch {epoch:>4} | train_loss={train_epoch_loss:.6f} | val_loss={v_loss:.6f}")

            if v_loss < best_val - config.MIN_DELTA:
                best_val = v_loss
                patience = 0
                best_w = {k: v.cpu().clone() for k, v in self.model.state_dict().items()}
            else:
                patience += 1
                if patience >= config.PATIENCE:
                    break

        if best_w is not None:
            self.model.load_state_dict(best_w)

        self.history = {"train_loss": train_losses, "val_loss": val_losses}
        return self

    def predict(self, train_data, test_data, df_model=None):
        if self.model is None:
            raise RuntimeError("Call train() before predict().")
        if df_model is None:
            raise ValueError("Informer requires df_model with timestamps.")

        arr_inp, arr_tgt, _ = self._prepare_df(df_model)
        arr_inp_s = self.scaler_X.transform(arr_inp).astype(np.float32)
        arr_tgt_s = self.scaler_y.transform(arr_tgt).astype(np.float32)
        time_marks = self._make_time_marks(df_model.index)

        num_targets = len(self.target_columns)
        window_idx = self._window_indices(len(train_data), len(arr_inp_s))
        loader = DataLoader(
            _InformerDataset(arr_inp_s, arr_tgt_s, time_marks, window_idx, self.look_back, self.label_len, self.horizon, num_targets),
            batch_size=config.BATCH_SIZE,
            shuffle=False,
        )

        self.model.eval()
        preds, trues = [], []
        with torch.no_grad():
            for enc_x, enc_mark, dec_x, dec_mark, yb in loader:
                pred = self.model(
                    enc_x.to(DEVICE),
                    enc_mark.to(DEVICE),
                    dec_x.to(DEVICE),
                    dec_mark.to(DEVICE),
                )
                preds.append(pred.cpu().numpy())
                trues.append(yb.numpy())

        preds = np.concatenate(preds, axis=0)
        trues = np.concatenate(trues, axis=0)

        # Inverse transform for all targets
        preds_inv = np.zeros_like(preds)
        trues_inv = np.zeros_like(trues)
        for i in range(num_targets):
            preds_inv[:, :, i] = self.scaler_y[i].inverse_transform(preds[:, :, i].reshape(-1, 1)).reshape(preds[:, :, i].shape)
            trues_inv[:, :, i] = self.scaler_y[i].inverse_transform(trues[:, :, i].reshape(-1, 1)).reshape(trues[:, :, i].shape)

        return preds_inv, trues_inv, self.features

    def forecast_future(self, df_model):
        if self.model is None:
            raise RuntimeError("Call train() or load() before forecast_future().")

        arr_inp, arr_tgt, _ = self._prepare_df(df_model)
        arr_inp_s = self.scaler_X.transform(arr_inp).astype(np.float32)
        arr_tgt_s = self.scaler_y.transform(arr_tgt).astype(np.float32)

        num_targets = len(self.target_columns)
        hist_idx = df_model.index[-self.label_len:]
        last_ts = df_model.index[-1]
        future_idx = pd.date_range(
            start=last_ts + pd.tseries.frequencies.to_offset(config.RESAMPLE_FREQ),
            periods=self.horizon,
            freq=config.RESAMPLE_FREQ,
        )

        enc_x = arr_inp_s[-self.look_back:]
        enc_mark = self._make_time_marks(df_model.index[-self.look_back:])
        label_hist = arr_tgt_s[-self.label_len:]
        dec_x = np.concatenate(
            [label_hist, np.zeros((self.horizon, num_targets), dtype=np.float32)],
            axis=0,
        )
        dec_mark = self._make_time_marks(hist_idx.append(future_idx))

        self.model.eval()
        with torch.no_grad():
            pred_s = self.model(
                torch.tensor(enc_x, dtype=torch.float32).unsqueeze(0).to(DEVICE),
                torch.tensor(enc_mark, dtype=torch.float32).unsqueeze(0).to(DEVICE),
                torch.tensor(dec_x, dtype=torch.float32).unsqueeze(0).to(DEVICE),
                torch.tensor(dec_mark, dtype=torch.float32).unsqueeze(0).to(DEVICE),
            ).cpu().numpy()[0]

        # Inverse transform for all targets
        pred_inv = np.zeros((self.horizon, num_targets))
        for i in range(num_targets):
            pred_inv[:, i] = self.scaler_y[i].inverse_transform(pred_s[:, i].reshape(-1, 1)).flatten()

        return pd.DataFrame(pred_inv, index=future_idx, columns=self.target_columns)

    def save(self, out_dir=None, name=None):
        if self.model is None:
            return
        out_dir = Path(out_dir) if out_dir else config.MODEL_OUTPUT_DIR
        os.makedirs(out_dir, exist_ok=True)
        name = name or getattr(config, "INFORMER_MODEL_NAME", "informer")
        base = str(out_dir / name)
        torch.save(self.model.state_dict(), base + "_informer.pt")
        joblib.dump(self.scaler_X, base + "_informer_scaler_X.joblib")
        joblib.dump(self.scaler_y, base + "_informer_scaler_y.joblib")
        joblib.dump(
            {
                "input_features": self.input_features,
                "features": self.features,
                "look_back": self.look_back,
                "horizon": self.horizon,
                "label_len": self.label_len,
                "model_params": self._model_params(),
                "num_targets": len(self.target_columns),
            },
            base + "_informer_meta.joblib",
        )

    @classmethod
    def load(cls, out_dir=None, name=None):
        out_dir = Path(out_dir) if out_dir else config.MODEL_OUTPUT_DIR
        name = name or getattr(config, "INFORMER_MODEL_NAME", "informer")
        base = str(out_dir / name)

        obj = cls()
        meta = joblib.load(base + "_informer_meta.joblib")
        obj.input_features = meta["input_features"]
        obj.features = meta.get("features", TARGET_COLUMNS)
        obj.target_columns = obj.features
        obj.look_back = int(meta["look_back"])
        obj.horizon = int(meta["horizon"])
        obj.label_len = int(meta["label_len"])
        num_targets = meta.get("num_targets", 1)
        obj.target_idxs = [
            obj.input_features.index(f) for f in obj.target_columns if f in obj.input_features
        ]

        obj.model = obj._build_model(
            enc_in=len(obj.input_features),
            num_targets=num_targets,
            model_params=meta.get("model_params"),
        )
        obj.model.load_state_dict(torch.load(base + "_informer.pt", map_location=DEVICE))
        obj.scaler_X = joblib.load(base + "_informer_scaler_X.joblib")
        obj.scaler_y = joblib.load(base + "_informer_scaler_y.joblib")
        return obj