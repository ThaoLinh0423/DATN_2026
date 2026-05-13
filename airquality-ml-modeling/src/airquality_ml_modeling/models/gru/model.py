"""
Multi-feature stacked GRU with direct multi-step forecasting.
PyTorch implementation — architecture from gru_aqi_pytorch.py.
Fixed: Single-target scaling and multi-step output (HORIZON) for air quality forecasting.
Enhanced: Multi-output prediction for all PM targets (pm1_0, pm2_5, pm10, aqi).
"""
import os
import re
import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import MinMaxScaler

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

from ..base_model import BaseTimeSeriesModel
import configs.config as config

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Target columns for multi-output prediction
TARGET_COLUMNS = ["pm1_0", "pm2_5", "pm10", "aqi"]
NUM_TARGETS = len(TARGET_COLUMNS)


def _default_input_features(expected_size: int) -> list[str]:
    base = list(config.FEATURES) + ["hour_sin", "hour_cos", "dow_sin", "dow_cos"]
    if expected_size <= len(base):
        return base[:expected_size]
    extra = [f"feature_{i}" for i in range(expected_size - len(base))]
    return base + extra

# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class _AQIDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.float32)
    def __len__(self): return len(self.X)
    def __getitem__(self, idx): return self.X[idx], self.y[idx]

# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------

class _StackedGRU(nn.Module):
    def __init__(self, input_size, gru_units, dropout=0.0, horizon=1, num_targets=1):
        super().__init__()
        self.gru_layers  = nn.ModuleList()
        self.drop_layers = nn.ModuleList()

        in_size = input_size
        for units in gru_units:
            self.gru_layers.append(
                nn.GRU(input_size=in_size, hidden_size=units,
                       num_layers=1, batch_first=True)
            )
            self.drop_layers.append(nn.Dropout(dropout))
            in_size = units

        # Multi-output: horizon steps x num_targets
        self.fc = nn.Sequential(
            nn.Linear(in_size, 32),
            nn.ReLU(),
            nn.Linear(32, horizon * num_targets),
        )
        self.horizon = horizon
        self.num_targets = num_targets

    def forward(self, x):
        out = x
        for i, (gru, drop) in enumerate(zip(self.gru_layers, self.drop_layers)):
            out, _ = gru(out)
            out    = drop(out)
            if i == len(self.gru_layers) - 1:
                out = out[:, -1, :]  # Lay trang thai cua timestep cuoi cung
        return self.fc(out).view(-1, self.horizon, self.num_targets)

# ---------------------------------------------------------------------------
# Model wrapper
# ---------------------------------------------------------------------------

class GRU(BaseTimeSeriesModel):

    def __init__(self):
        self.config_look_back = config.LOOK_BACK
        self.config_horizon   = config.HORIZON
        self.look_back        = config.LOOK_BACK
        self.horizon          = config.HORIZON
        self.features       = None
        self.input_features = None
        self.scaler_X       = MinMaxScaler()
        self.scaler_y       = MinMaxScaler()
        self.model          = None
        self.history        = None

    def _prepare_df(self, df_model):
        time_feats    = ["hour_sin", "hour_cos", "dow_sin", "dow_cos"]
        feat_existing = [f for f in config.FEATURES if f in df_model.columns]
        # Lay tat ca cac target columns co mat trong du lieu
        self.target_columns = [f for f in TARGET_COLUMNS if f in feat_existing]
        if not self.target_columns:
            self.target_columns = [config.TARGET_COLUMN]
        inp_feats     = feat_existing + [t for t in time_feats if t in df_model.columns]

        return (
            df_model[inp_feats].values,
            df_model[feat_existing].values,
            inp_feats,
            feat_existing,
        )

    def _make_supervised(self, arr_inp, arr_tgt_multi):
        X, Y = [], []
        for i in range(self.look_back, len(arr_inp) - self.horizon + 1):
            X.append(arr_inp[i - self.look_back: i, :])
            Y.append(arr_tgt_multi[i: i + self.horizon, :])
        if not X:
            raise ValueError(
                f"Not enough data to create supervised windows with LOOK_BACK={self.look_back} "
                f"and HORIZON={self.horizon}."
            )
        return np.stack(X, dtype=np.float32), np.stack(Y, dtype=np.float32)

    def _resolve_window_params(self, train_len, test_len):
        look_back = int(self.config_look_back)
        horizon = int(self.config_horizon)

        if train_len - look_back - horizon + 1 < 1:
            raise ValueError(
                f"GRU requires at least LOOK_BACK + HORIZON samples in train split. "
                f"Configured LOOK_BACK={look_back}, HORIZON={horizon}, train_len={train_len}."
            )

        if test_len < horizon:
            raise ValueError(
                f"GRU requires at least HORIZON samples in test split for backtest. "
                f"Configured HORIZON={horizon}, test_len={test_len}."
            )

        self.look_back = look_back
        self.horizon = horizon

    def _make_prediction_windows(self, arr_inp, arr_tgt_multi, start_idx):
        X, Y = [], []
        first_pred_idx = max(self.look_back, start_idx)
        last_pred_idx = len(arr_inp) - self.horizon + 1

        for i in range(first_pred_idx, last_pred_idx):
            X.append(arr_inp[i - self.look_back:i, :])
            Y.append(arr_tgt_multi[i: i + self.horizon, :])

        if not X:
            raise ValueError(
                f"No prediction windows available with LOOK_BACK={self.look_back}, "
                f"HORIZON={self.horizon}, train_size={start_idx}, total_size={len(arr_inp)}."
            )

        return np.stack(X, dtype=np.float32), np.stack(Y, dtype=np.float32)

    def train(self, train_data, df_model=None):
        torch.manual_seed(config.RANDOM_SEED)

        self.scaler_X = MinMaxScaler()
        self.scaler_y = MinMaxScaler()

        if df_model is not None:
            arr_inp, arr_tgt_full, inp_feats, feat_existing = self._prepare_df(df_model)
            self.target_idxs = [feat_existing.index(f) for f in self.target_columns]
            arr_tgt = arr_tgt_full[:, self.target_idxs]
        else:
            arr_inp = train_data.reshape(-1, 1); arr_tgt = arr_inp
            inp_feats = self.target_columns
            self.target_idxs = [0]

        self.input_features = inp_feats
        self.features = self.target_columns

        train_len = len(train_data)
        test_len = max(1, arr_inp.shape[0] - train_len)
        self._resolve_window_params(train_len=train_len, test_len=test_len)
        val_count = max(1, int(train_len * 0.1))
        fit_end = max(1, train_len - val_count)

        self.scaler_X.fit(arr_inp[:fit_end])
        self.scaler_y.fit(arr_tgt[:fit_end])

        arr_inp_s = self.scaler_X.transform(arr_inp[:train_len])
        arr_tgt_s = self.scaler_y.transform(arr_tgt[:train_len])

        X_all, Y_all = self._make_supervised(arr_inp_s, arr_tgt_s)
        total = X_all.shape[0]
        vc = 1 if total == 1 else max(1, int(total * 0.1))
        sp = max(1, total - vc)

        X_train, Y_train = X_all[:sp], Y_all[:sp]
        X_val, Y_val = (X_all[-vc:], Y_all[-vc:]) if total > 1 else (X_all, Y_all)

        train_loader = DataLoader(_AQIDataset(X_train, Y_train),
                                batch_size=config.BATCH_SIZE, shuffle=True)
        val_loader   = DataLoader(_AQIDataset(X_val, Y_val),
                                batch_size=config.BATCH_SIZE, shuffle=False)

        gru_dropout = getattr(config, "GRU_DROPOUT", 0.0)
        num_targets = len(self.target_columns)
        self.model  = _StackedGRU(
            input_size=arr_inp.shape[1],
            gru_units=config.GRU_UNITS,
            dropout=gru_dropout,
            horizon=self.horizon,
            num_targets=num_targets
        ).to(DEVICE)

        criterion  = nn.MSELoss()
        optimizer  = torch.optim.Adam(self.model.parameters(), lr=getattr(config, "LR", 1e-3))
        scheduler  = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=getattr(config, "LR_PATIENCE", 10))

        best_val   = float("inf")
        best_w     = None
        patience   = 0

        train_losses = []
        val_losses = []

        for epoch in range(1, config.EPOCHS + 1):
            self.model.train()
            t_sum = 0.0
            t_count = 0
            for xb, yb in train_loader:
                xb, yb = xb.to(DEVICE), yb.to(DEVICE)
                optimizer.zero_grad()
                outputs = self.model(xb)
                loss = criterion(outputs, yb)
                loss.backward()
                optimizer.step()
                t_sum += loss.item() * len(xb)
                t_count += len(xb)
            train_epoch_loss = t_sum / t_count if t_count else 0.0
            train_losses.append(train_epoch_loss)

            self.model.eval()
            v_sum = 0.0
            v_count = 0
            with torch.no_grad():
                for xb, yb in val_loader:
                    xb, yb   = xb.to(DEVICE), yb.to(DEVICE)
                    v_sum += criterion(self.model(xb), yb).item() * len(xb)
                    v_count += len(xb)
            val_loss = v_sum / v_count if v_count else 0.0
            val_losses.append(val_loss)
            scheduler.step(val_loss)

            if config.VERBOSE and epoch % 20 == 0:
                print(f"Epoch {epoch:>4} | train_loss={train_epoch_loss:.6f} | val_loss={val_loss:.6f}")

            if val_loss < best_val - config.MIN_DELTA:
                best_val = val_loss
                patience = 0
                best_w   = {k: v.cpu().clone() for k, v in self.model.state_dict().items()}
            else:
                patience += 1
                if patience >= config.PATIENCE:
                    break

        if best_w:
            self.model.load_state_dict(best_w)

        self.history = {"train_loss": train_losses, "val_loss": val_losses}
        return self

    def predict(self, train_data, test_data, df_model=None):
        if df_model is not None:
            arr_inp, arr_tgt_full, _, feat_existing = self._prepare_df(df_model)
            self.target_idxs = [feat_existing.index(f) for f in self.target_columns]
            arr_tgt = arr_tgt_full[:, self.target_idxs]
        else:
            arr_inp = np.concatenate([train_data, test_data]).reshape(-1, 1); arr_tgt = arr_inp

        arr_inp_s = self.scaler_X.transform(arr_inp)
        arr_tgt_s = self.scaler_y.transform(arr_tgt)

        X_test, Y_test = self._make_prediction_windows(arr_inp_s, arr_tgt_s, start_idx=len(train_data))
        loader = DataLoader(_AQIDataset(X_test, Y_test), batch_size=config.BATCH_SIZE)

        self.model.eval()
        preds, trues = [], []
        with torch.no_grad():
            for xb, yb in loader:
                preds.append(self.model(xb.to(DEVICE)).cpu().numpy())
                trues.append(yb.numpy())

        preds = np.concatenate(preds, axis=0)  # (N, HORIZON, num_targets)
        trues = np.concatenate(trues, axis=0)   # (N, HORIZON, num_targets)

        # Inverse transform cho tat ca cac targets
        num_targets = len(self.target_columns)
        preds_inv = np.zeros_like(preds)
        trues_inv = np.zeros_like(trues)
        for i in range(num_targets):
            preds_inv[:, :, i] = self.scaler_y[i].inverse_transform(preds[:, :, i].reshape(-1, 1)).reshape(preds[:, :, i].shape)
            trues_inv[:, :, i] = self.scaler_y[i].inverse_transform(trues[:, :, i].reshape(-1, 1)).reshape(trues[:, :, i].shape)

        return preds_inv, trues_inv, self.features

    def forecast_future(self, df_model):
        arr_inp, _, _, _ = self._prepare_df(df_model)
        last_window = arr_inp[-self.look_back:]
        scaled      = self.scaler_X.transform(last_window)
        last_ts     = df_model.index[-1]

        if config.FORECAST_MODE == "direct":
            return self._forecast_direct(scaled, last_ts)
        return self._forecast_iterative(scaled, last_ts)

    def _forecast_direct(self, last_window_scaled, last_ts):
        self.model.eval()
        X = torch.tensor(last_window_scaled, dtype=torch.float32).unsqueeze(0).to(DEVICE)
        with torch.no_grad():
            pred_s = self.model(X).cpu().numpy()  # (1, horizon, num_targets)

        num_targets = len(self.target_columns)
        pred_inv = np.zeros((self.horizon, num_targets))
        for i in range(num_targets):
            pred_inv[:, i] = self.scaler_y[i].inverse_transform(pred_s[0, :, i].reshape(-1, 1)).flatten()

        idx = pd.date_range(
            start=last_ts + pd.tseries.frequencies.to_offset(config.RESAMPLE_FREQ),
            periods=self.horizon, freq=config.RESAMPLE_FREQ)
        return pd.DataFrame(pred_inv, index=idx, columns=self.target_columns)

    def _forecast_iterative(self, last_window_scaled, last_ts):
        self.model.eval()
        window = last_window_scaled.copy()
        rows = []
        num_targets = len(self.target_columns)

        for _ in range(self.horizon):
            X = torch.tensor(window, dtype=torch.float32).unsqueeze(0).to(DEVICE)
            with torch.no_grad():
                next_s = self.model(X).cpu().numpy()[0, 0, :]

            step_pred = np.zeros(num_targets)
            for i in range(num_targets):
                step_pred[i] = self.scaler_y[i].inverse_transform([[next_s[i]]])[0, 0]
            rows.append(step_pred)

            new_row = window[-1].copy()
            for i, idx in enumerate(self.target_idxs):
                new_row[idx] = next_s[i]
            window = np.vstack([window[1:], new_row])

        idx = pd.date_range(
            start=last_ts + pd.tseries.frequencies.to_offset(config.RESAMPLE_FREQ),
            periods=self.horizon, freq=config.RESAMPLE_FREQ)
        return pd.DataFrame(np.array(rows), index=idx, columns=self.target_columns)

    def save(self, out_dir=None, name=None):
        from pathlib import Path
        out_dir = Path(out_dir) if out_dir else config.MODEL_OUTPUT_DIR
        os.makedirs(out_dir, exist_ok=True)
        name = (name or config.MODEL_NAME)
        base = str(out_dir / name)
        torch.save(self.model.state_dict(), base + "_gru.pt")
        joblib.dump(self.scaler_X, base + "_gru_scaler_X.joblib")
        joblib.dump(self.scaler_y, base + "_gru_scaler_y.joblib")
        joblib.dump(
            {
                "features": self.features,
                "input_features": self.input_features,
                "look_back": self.look_back,
                "horizon": self.horizon,
                "gru_units": list(config.GRU_UNITS),
                "num_targets": len(self.target_columns),
            },
            base + "_gru_meta.joblib",
        )

    @classmethod
    def load(cls, out_dir=None, name=None):
        from pathlib import Path
        out_dir = Path(out_dir) if out_dir else config.MODEL_OUTPUT_DIR
        name    = (name or config.MODEL_NAME)
        base    = str(out_dir / name)
        state_dict = torch.load(base + "_gru.pt", map_location=DEVICE)
        scaler_X = joblib.load(base + "_gru_scaler_X.joblib")
        scaler_y = joblib.load(base + "_gru_scaler_y.joblib")

        meta_path = base + "_gru_meta.joblib"
        meta = joblib.load(meta_path) if os.path.exists(meta_path) else {}

        layer_ids = {
            int(match.group(1))
            for key in state_dict
            if (match := re.match(r"gru_layers\.(\d+)\.weight_ih_l0$", key))
        }
        ordered_ids = sorted(layer_ids)
        gru_units = [
            int(state_dict[f"gru_layers.{layer_id}.weight_ih_l0"].shape[0] // 3)
            for layer_id in ordered_ids
        ]
        if not gru_units:
            gru_units = list(meta.get("gru_units", config.GRU_UNITS))
        input_size = int(state_dict[f"gru_layers.{ordered_ids[0]}.weight_ih_l0"].shape[1]) if ordered_ids else getattr(scaler_X, "n_features_in_", len(config.FEATURES))
        horizon = int(meta.get("horizon", state_dict["fc.2.weight"].shape[0] // meta.get("num_targets", 1)))
        num_targets = meta.get("num_targets", 1)

        obj             = cls()
        obj.features    = meta.get("features") or TARGET_COLUMNS
        obj.input_features = meta.get("input_features") or _default_input_features(
            getattr(scaler_X, "n_features_in_", input_size)
        )
        obj.target_columns = obj.features
        obj.target_idxs = [obj.input_features.index(f) for f in obj.target_columns if f in obj.input_features]
        obj.look_back = int(meta.get("look_back", obj.look_back))
        obj.horizon = horizon

        obj.model = _StackedGRU(
            input_size,
            gru_units,
            getattr(config, "GRU_DROPOUT", 0.0),
            horizon=horizon,
            num_targets=num_targets,
        ).to(DEVICE)
        obj.model.load_state_dict(state_dict)
        obj.scaler_X = scaler_X
        obj.scaler_y = scaler_y
        return obj