"""
Orchestrator — reads config.py, trains selected models, prints summary.
"""
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from scipy import stats

import configs.config as config
from src.airquality_ml_modeling.data_loader.loader import get_data
from src.airquality_ml_modeling.models import AVAILABLE_MODELS
from src.airquality_ml_modeling.utils.drift import (
    build_feature_baseline,
    resolve_drift_feature_names,
    save_json as save_drift_json,
)
from src.airquality_ml_modeling.utils.metrics import get_timeseries_metrics, evaluate_per_feature


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def save_json(obj, path):
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, default=str)


def check_alerts(future_df, thresholds):
    if future_df is None:
        return {}
    alerts = {}
    for feat, thr in thresholds.items():
        if feat not in future_df.columns:
            continue
        mask = future_df[feat] > thr
        if mask.any():
            alerts[feat] = list(
                zip(future_df.index[mask].tolist(), future_df[feat][mask].tolist())
            )
    return alerts


def format_horizon_label(horizon, freq_str):
    if not horizon or horizon <= 0:
        return "0 bước"
    label = f"{horizon} bước"
    try:
        delta = pd.tseries.frequencies.to_offset(freq_str) * horizon
        total_min = int(delta / pd.Timedelta(minutes=1))
        if total_min > 0:
            if total_min % (24 * 60) == 0:
                label += f" = {total_min // (24*60)} ngày"
            elif total_min % 60 == 0:
                label += f" = {total_min // 60} giờ"
            else:
                label += f" = {total_min} phút"
    except Exception:
        pass
    return label


def format_step_label(steps, freq_str):
    return format_horizon_label(steps, freq_str)


def freq_to_timedelta(freq_str):
    try:
        return pd.to_timedelta(freq_str)
    except Exception:
        base = pd.Timestamp("2000-01-01")
        return (base + pd.tseries.frequencies.to_offset(freq_str)) - base


def flatten_preds_to_times(df_index, preds_blocks, split_idx, look_back,
                           horizon, feature_names, freq_str):
    if preds_blocks.ndim == 1:
        n = len(preds_blocks)
        start = len(df_index) - n
        return pd.DataFrame(preds_blocks, index=df_index[start:start + n],
                            columns=feature_names)

    rows, idxs = [], []
    test_start_pos = max(look_back, split_idx)

    for i in range(preds_blocks.shape[0]):
        pos = test_start_pos + i
        if pos < len(df_index):
            ts = df_index[pos]
        else:
            last_ts = df_index[-1]
            steps = pos - len(df_index) + 1
            ts = pd.date_range(start=last_ts, periods=steps + 1, freq=freq_str)[-1]
        rows.append(preds_blocks[i, 0, :])
        idxs.append(ts)

    return pd.DataFrame(np.vstack(rows), index=idxs,
                        columns=feature_names).sort_index()


def make_window_dfs(df_index, y_pred_raw, y_true_raw, split_idx, look_back,
                    horizon, feature_names, freq_str):
    first_pos = max(look_back, split_idx)

    if y_pred_raw.ndim == 1:
        window_len = min(horizon, len(y_pred_raw), len(y_true_raw))
        if window_len < 1:
            return None, None
        ts_list = []
        for h in range(window_len):
            pos = first_pos + h
            if pos < len(df_index):
                ts_list.append(df_index[pos])
            else:
                last_ts = df_index[-1]
                steps = pos - len(df_index) + 1
                ts_list.append(
                    pd.date_range(start=last_ts, periods=steps + 1, freq=freq_str)[-1]
                )
        wpred = pd.DataFrame(y_pred_raw[:window_len], index=ts_list, columns=feature_names)
        wtrue = pd.DataFrame(y_true_raw[:window_len], index=ts_list, columns=feature_names)
        return wpred, wtrue

    if y_pred_raw.ndim != 3:
        return None, None

    window_len = min(horizon, y_pred_raw.shape[1], y_true_raw.shape[1])
    if window_len < 1:
        return None, None

    ts_list = []
    for h in range(window_len):
        pos = first_pos + h
        if pos < len(df_index):
            ts_list.append(df_index[pos])
        else:
            last_ts = df_index[-1]
            steps = pos - len(df_index) + 1
            ts_list.append(
                pd.date_range(start=last_ts, periods=steps + 1, freq=freq_str)[-1]
            )

    pred_vals = y_pred_raw[0, :window_len, :]  # (window_len, num_targets)
    true_vals = y_true_raw[0, :window_len, :]  # (window_len, num_targets)
    wpred = pd.DataFrame(pred_vals, index=ts_list, columns=feature_names)
    wtrue = pd.DataFrame(true_vals, index=ts_list, columns=feature_names)
    return wpred, wtrue


def compute_metrics(y_true, y_pred, feature_names):
    if y_pred.ndim == 3:
        # y_true, y_pred: (N, horizon, num_targets) → reshape to (N*horizon, num_targets)
        yt = y_true.reshape(-1, len(feature_names))
        yp = y_pred.reshape(-1, len(feature_names))
        return evaluate_per_feature(yt, yp, feature_names)
    if y_pred.ndim == 1:
        m = get_timeseries_metrics(y_true, y_pred)
        return {feature_names[0]: {"mae": m["MAE"], "rmse": float(m["RMSE"]),
                                   "mape": m.get("MAPE (%)")}}
    return evaluate_per_feature(y_true, y_pred, feature_names)


# ─────────────────────────────────────────────────────────────────────────────
# AQI bands
# ─────────────────────────────────────────────────────────────────────────────

AQI_BANDS = [
    (0,   50,  "#00e400", "Tốt (0–50)"),
    (51,  100, "#ffff00", "Trung bình (51–100)"),
    (101, 150, "#ff7e00", "Kém (101–150)"),
    (151, 200, "#ff0000", "Xấu (151–200)"),
    (201, 300, "#8f3f97", "Rất xấu (201–300)"),
    (301, 500, "#7e0023", "Nguy hại (301+)"),
]


def _draw_bands(ax, y_lo, y_hi):
    for lo, hi, color, _ in AQI_BANDS:
        blo = max(lo, y_lo); bhi = min(hi, y_hi)
        if blo >= bhi:
            continue
        ax.axhspan(blo, bhi, color=color, alpha=0.07, zorder=0)
    for lo, _, color, _ in AQI_BANDS:
        if y_lo < lo < y_hi:
            ax.axhline(lo, color=color, lw=0.7, ls="--", alpha=0.45, zorder=1)


def _fmt_xaxis(ax, freq_str, hour_interval=2, minute_interval=15):
    freq = (freq_str or "").lower()
    if "min" in freq or freq.endswith("t"):
        ax.xaxis.set_major_locator(mdates.HourLocator(interval=hour_interval))
        ax.xaxis.set_minor_locator(mdates.MinuteLocator(interval=minute_interval))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M\n%d/%m"))
    elif "h" in freq:
        ax.xaxis.set_major_locator(mdates.DayLocator())
        ax.xaxis.set_minor_locator(mdates.HourLocator(interval=6))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m/%Y"))
    else:
        ax.xaxis.set_major_locator(mdates.AutoDateLocator())
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d"))
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right", fontsize=9)


# ─────────────────────────────────────────────────────────────────────────────
# [NEW] Plot 1: Loss Curve (Train / Validation)
# ─────────────────────────────────────────────────────────────────────────────

def plot_loss_curve(history, model_name, features=None, save_path=None):
    """
    Ve duong loss train va validation theo epoch cho nhieu features.

    Parameters
    ----------
    history : dict — dict of feature names to {"train_loss": [...], "val_loss": [...]}
               hoac dict with single "train_loss"/"val_loss" for backward compatibility.
    features : list — features to plot (default: ["pm1_0", "pm2_5", "pm10", "aqi"])
    """
    if features is None:
        features = ["pm1_0", "pm2_5", "pm10", "aqi"]
    if history is None:
        print(f"[WARN] Khong co history de ve loss curve cho '{model_name}'.")
        return

    # Normalize input: detect if single-feature (old style) or multi-feature (new style)
    is_multi = any(k in history for k in features)
    if is_multi:
        feature_losses = {k: history[k] for k in features if k in history}
    else:
        # Backward compat: single train/val lists
        train_loss = history.get("train_loss") or history.get("loss", [])
        val_loss = history.get("val_loss") or history.get("val_loss", [])
        if len(train_loss) == 0:
            print(f"[WARN] train_loss rong cho '{model_name}'.")
            return
        feature_losses = {features[0]: {"train_loss": train_loss, "val_loss": val_loss}}

    n_features = len(feature_losses)
    fig, axes = plt.subplots(n_features, 1, figsize=(12, 5 * n_features),
                              sharex=True)
    if n_features == 1:
        axes = [axes]
    fig.patch.set_facecolor("#f5f5f5")
    fig.suptitle(f"Duong Loss Huan Luyen -- {model_name.upper()}",
                 fontsize=14, fontweight="bold", y=1.01)

    colors = ["#1565c0", "#d84315", "#43a047", "#ff8f00"]
    for i, (feat, loss_data) in enumerate(feature_losses.items()):
        ax = axes[i]
        train_loss = loss_data.get("train_loss") or loss_data.get("loss", [])
        val_loss = loss_data.get("val_loss") or []

        if len(train_loss) == 0:
            ax.text(0.5, 0.5, f"Khong co loss data cho '{feat}'",
                    ha="center", va="center", transform=ax.transAxes)
            ax.set_axis_off()
            continue

        epochs = np.arange(1, len(train_loss) + 1)
        ax.set_facecolor("#ffffff")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        color = colors[i % len(colors)]

        ax.plot(epochs, train_loss, color=color, lw=2.2, label="Train Loss", zorder=3)
        if val_loss and len(val_loss) == len(train_loss):
            ax.plot(epochs, val_loss, color="#e53935", lw=2.2, ls="--", label="Val Loss", zorder=4)
            best_ep = int(np.argmin(val_loss)) + 1
            best_val = float(np.min(val_loss))
            ax.axvline(best_ep, color="#43a047", lw=1.5, ls=":", alpha=0.8)
            ax.scatter([best_ep], [best_val], color="#43a047", s=80, zorder=5,
                       label=f"Best val ep={best_ep} ({best_val:.4f})")
            ax.fill_between(epochs, np.array(train_loss, dtype=float),
                            np.array(val_loss, dtype=float),
                            where=np.array(val_loss) > np.array(train_loss),
                            color="#ff8f00", alpha=0.10, label="Overfit zone")

        ax.set_ylabel(f"Loss {feat.upper()}", fontsize=11, fontweight="bold")
        ax.legend(fontsize=9, framealpha=0.9, loc="upper right")
        ax.grid(ls="--", alpha=0.3)

        final_train = float(train_loss[-1])
        note = f"Train: {final_train:.4f}"
        if val_loss:
            note += f"   |   Val: {float(val_loss[-1]):.4f}"
        ax.text(0.99, 0.97, note, transform=ax.transAxes, fontsize=9,
                ha="right", va="top",
                bbox=dict(boxstyle="round,pad=0.35", fc="#fffde7", ec="#f9a825", alpha=0.95))

    ax_final = axes[-1]
    ax_final.set_xlabel("Epoch", fontsize=11)
    plt.tight_layout()
    if save_path:
        plt.savefig(str(save_path), dpi=150, bbox_inches="tight")
        print(f"[INFO] Loss curve -> {save_path}")
        plt.close(fig)
    else:
        plt.show()


# ─────────────────────────────────────────────────────────────────────────────
# [NEW] Plot 2: Full Backtest Overview
# ─────────────────────────────────────────────────────────────────────────────

def plot_full_backtest(df_model, backtest_df, model_name, split_idx,
                       features=None, save_path=None, freq_str="5min"):
    """
    Ve toan bo chuoi thoi gian cho nhieu features: train (xam) + test actual (xanh) + predicted (do).
    """
    if features is None:
        features = ["pm1_0", "pm2_5", "pm10", "aqi"]
    missing = [f for f in features if f not in df_model.columns or f not in backtest_df.columns]
    if missing:
        print(f"[WARN] Missing columns for full backtest: {missing}")
        features = [f for f in features if f in df_model.columns and f in backtest_df.columns]
    if not features:
        print(f"[WARN] No valid features for full backtest '{model_name}'.")
        return

    n_features = len(features)
    fig, axes = plt.subplots(n_features, 1, figsize=(18, 5 * n_features), sharex=True)
    if n_features == 1:
        axes = [axes]
    fig.patch.set_facecolor("#f5f5f5")
    fig.suptitle(f"Tong quan du bao toan bo Test Set -- {model_name.upper()}",
                 fontsize=13, fontweight="bold", y=1.01)

    feat_colors = ["#1565c0", "#d84315", "#43a047", "#ff8f00"]

    for i, feat in enumerate(features):
        ax = axes[i]
        actual = df_model[feat].dropna()
        train_s = actual.iloc[:split_idx]
        test_s = actual.iloc[split_idx:]
        pred_s = backtest_df[feat].dropna()

        ax.set_facecolor("#ffffff")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        all_vals = pd.concat([actual, pred_s]).dropna()
        y_lo = max(0, float(all_vals.min()) - 5)
        y_hi = float(all_vals.max()) + 10

        ax.plot(train_s.index, train_s.values,
                color="#90a4ae", lw=1.2, alpha=0.7, label="Tap train", zorder=2)
        ax.plot(test_s.index, test_s.values,
                color=feat_colors[i % len(feat_colors)], lw=1.8, label="Thuc te (test)", zorder=3)
        ax.plot(pred_s.index, pred_s.values,
                color="#d84315", lw=1.6, ls="--", alpha=0.85, label="Du bao (test)", zorder=4)

        if split_idx < len(actual):
            split_ts = actual.index[split_idx]
            ax.axvline(split_ts, color="#6d4c41", lw=1.5, ls=":", alpha=0.9)
            ax.text(split_ts, y_hi * 0.97, " Train|Test",
                    fontsize=9, color="#6d4c41", va="top")

        common_idx = test_s.index.intersection(pred_s.index)
        if len(common_idx) > 0:
            y_t = test_s.reindex(common_idx).values
            y_p = pred_s.reindex(common_idx).values
            mask = ~(np.isnan(y_t) | np.isnan(y_p))
            if mask.sum() > 0:
                mae_bt = float(np.mean(np.abs(y_t[mask] - y_p[mask])))
                rmse_bt = float(np.sqrt(np.mean((y_t[mask] - y_p[mask])**2)))
                note = f"MAE: {mae_bt:.2f}   RMSE: {rmse_bt:.2f}   N={mask.sum()}"
                ax.text(0.01, 0.97, note, transform=ax.transAxes, fontsize=9,
                        va="top", ha="left",
                        bbox=dict(boxstyle="round,pad=0.4", fc="#fffde7", ec="#f9a825", alpha=0.95))

        ax.set_ylim(y_lo, y_hi)
        ax.set_ylabel(feat.upper(), fontsize=11, fontweight="bold")
        ax.grid(axis="both", ls="--", alpha=0.25)
        ax.legend(fontsize=9, loc="upper left", framealpha=0.9, ncol=3)

        if i == n_features - 1:
            _fmt_xaxis(ax, freq_str)

    plt.tight_layout()
    if save_path:
        plt.savefig(str(save_path), dpi=150, bbox_inches="tight")
        print(f"[INFO] Full backtest -> {save_path}")
        plt.close(fig)
    else:
        plt.show()


# ─────────────────────────────────────────────────────────────────────────────
# [NEW] Plot 3: Residual Analysis (Distribution + QQ Plot)
# ─────────────────────────────────────────────────────────────────────────────

def plot_residual_analysis(y_true, y_pred, model_name, features=None, save_path=None):
    """
    Bo 4 bieu do phan tich sai so cho nhieu features:
      1. Histogram phan phoi sai so + duong normal fit
      2. QQ-plot kiem tra chuan hoa
      3. Residual theo thoi gian (scatter)
      4. Actual vs Predicted scatter
    """
    if features is None:
        features = ["pm1_0", "pm2_5", "pm10", "aqi"]
    if y_pred is None or y_true is None:
        print(f"[WARN] Missing y_true/y_pred for residual analysis '{model_name}'.")
        return

    n_features = len(features)
    fig, axes = plt.subplots(n_features, 4, figsize=(24, 5 * n_features))
    if n_features == 1:
        axes = axes.reshape(1, -1)
    fig.patch.set_facecolor("#f5f5f5")
    fig.suptitle(f"Phan tich Sai so (Residual) -- {model_name.upper()}",
                 fontsize=14, fontweight="bold", y=1.01)

    feat_colors = ["#1565c0", "#d84315", "#43a047", "#ff8f00"]

    for i, feat in enumerate(features):
        feat_idx = i  # feature index within the target list
        if y_true.ndim == 3 and y_pred.ndim == 3:
            # y_true, y_pred: (N, horizon, num_targets) — extract this feature
            y_t = y_true[:, :, feat_idx] if y_true.shape[2] > feat_idx else y_true[:, :, 0]
            y_p = y_pred[:, :, feat_idx] if y_pred.shape[2] > feat_idx else y_pred[:, :, 0]
        else:
            y_t = y_true[i] if isinstance(y_true, (list, tuple)) else y_true
            y_p = y_pred[i] if isinstance(y_pred, (list, tuple)) else y_pred

        if y_t is None or y_p is None:
            for j in range(4):
                axes[i, j].text(0.5, 0.5, f"Khong co du lieu cho {feat}",
                                ha="center", va="center", transform=axes[i, j].transAxes)
                axes[i, j].set_axis_off()
            continue

        residuals = np.array(y_t, dtype=float) - np.array(y_p, dtype=float)
        residuals = residuals[~np.isnan(residuals)]
        y_t_c = np.array(y_t, dtype=float)
        y_p_c = np.array(y_p, dtype=float)
        mask = ~(np.isnan(y_t_c) | np.isnan(y_p_c))
        y_t_c, y_p_c = y_t_c[mask], y_p_c[mask]

        for ax in axes[i]:
            ax.set_facecolor("#ffffff")
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)

        # 1. Histogram
        ax1 = axes[i, 0]
        mu, sigma = float(np.mean(residuals)), float(np.std(residuals))
        n, bins, _ = ax1.hist(residuals, bins=40, color=feat_colors[i % len(feat_colors)],
                              alpha=0.65, edgecolor="white", density=True, label="Phan phoi sai so")
        x_fit = np.linspace(bins[0], bins[-1], 200)
        ax1.plot(x_fit, stats.norm.pdf(x_fit, mu, sigma),
                 color="#d84315", lw=2.2, label=f"Normal (mu={mu:.2f}, s={sigma:.2f})")
        ax1.axvline(0, color="#43a047", lw=1.5, ls="--", alpha=0.9, label="Zero")
        ax1.set_xlabel("Sai so", fontsize=9)
        ax1.set_ylabel("Mat do", fontsize=9)
        ax1.set_title(f"{feat.upper()} - Histogram", fontsize=10, fontweight="bold")
        ax1.legend(fontsize=7.5)
        ax1.grid(ls="--", alpha=0.25)
        skew_v = float(stats.skew(residuals))
        kurt_v = float(stats.kurtosis(residuals))
        _, p_norm = stats.shapiro(residuals[:5000])
        ax1.text(0.98, 0.97, f"Skew:{skew_v:.3f}\nKurt:{kurt_v:.3f}\nShap p:{p_norm:.4f}",
                 transform=ax1.transAxes, fontsize=7.5, va="top", ha="right",
                 bbox=dict(boxstyle="round,pad=0.3", fc="#fffde7", ec="#f9a825", alpha=0.95))

        # 2. QQ Plot
        ax2 = axes[i, 1]
        (osm, osr), (slope, intercept, r) = stats.probplot(residuals, dist="norm")
        ax2.scatter(osm, osr, color=feat_colors[i % len(feat_colors)], s=8, alpha=0.5, label="Quantiles")
        ax2.plot(osm, slope * np.array(osm) + intercept, color="#d84315", lw=2.0, label=f"Normal R={r:.4f}")
        ax2.set_xlabel("Quantile ly thuyet", fontsize=9)
        ax2.set_ylabel("Quantile thuc te", fontsize=9)
        ax2.set_title(f"{feat.upper()} - QQ Plot", fontsize=10, fontweight="bold")
        ax2.legend(fontsize=7.5)
        ax2.grid(ls="--", alpha=0.25)

        # 3. Residual scatter
        ax3 = axes[i, 2]
        idx = np.arange(len(residuals))
        pos_mask = residuals >= 0
        ax3.scatter(idx[pos_mask], residuals[pos_mask], color="#1e88e5", s=6, alpha=0.5, label="Du bao thap hon")
        ax3.scatter(idx[~pos_mask], residuals[~pos_mask], color="#e53935", s=6, alpha=0.5, label="Du bao cao hon")
        ax3.axhline(0, color="#546e7a", lw=1.2, ls="--")
        ax3.axhline(mu + 2*sigma, color="#ff8f00", lw=1.0, ls=":", alpha=0.7, label=f"+2s ({mu+2*sigma:.1f})")
        ax3.axhline(mu - 2*sigma, color="#ff8f00", lw=1.0, ls=":", alpha=0.7)
        ax3.set_xlabel("Chi so mau", fontsize=9)
        ax3.set_ylabel("Sai so", fontsize=9)
        ax3.set_title(f"{feat.upper()} - Residual", fontsize=10, fontweight="bold")
        ax3.legend(fontsize=7.5, ncol=2)
        ax3.grid(ls="--", alpha=0.25)

        # 4. Actual vs Predicted
        ax4 = axes[i, 3]
        ax4.scatter(y_t_c, y_p_c, color=feat_colors[i % len(feat_colors)], s=8, alpha=0.35, label="Diem du bao")
        lims = [min(y_t_c.min(), y_p_c.min()) - 2, max(y_t_c.max(), y_p_c.max()) + 2]
        ax4.plot(lims, lims, color="#d84315", lw=1.8, ls="--", label="Duong ly tuong (y=x)")
        slope_r, intercept_r, r_val, _, _ = stats.linregress(y_t_c, y_p_c)
        x_r = np.linspace(lims[0], lims[1], 100)
        ax4.plot(x_r, slope_r * x_r + intercept_r, color="#43a047", lw=1.8, label=f"Hoi quy R2={r_val**2:.4f}")
        ax4.set_xlim(lims); ax4.set_ylim(lims)
        ax4.set_xlabel("Thuc te", fontsize=9)
        ax4.set_ylabel("Du bao", fontsize=9)
        ax4.set_title(f"{feat.upper()} - Actual vs Pred", fontsize=10, fontweight="bold")
        ax4.legend(fontsize=7.5)
        ax4.grid(ls="--", alpha=0.25)

    plt.tight_layout()
    if save_path:
        plt.savefig(str(save_path), dpi=150, bbox_inches="tight")
        print(f"[INFO] Residual analysis -> {save_path}")
        plt.close(fig)
    else:
        plt.show()


# ─────────────────────────────────────────────────────────────────────────────
# [NEW] Plot 4: Model Comparison Bar Chart
# ─────────────────────────────────────────────────────────────────────────────

def plot_model_comparison(experiment_results, save_path=None):
    """
    So sánh MAE / RMSE / MAPE của tất cả các model trên cùng 1 biểu đồ.
    """
    if not experiment_results:
        return

    df_r = pd.DataFrame(experiment_results)
    metrics_to_plot = [c for c in ["MAE", "RMSE", "MAPE (%)"] if c in df_r.columns]
    if not metrics_to_plot or "Model" not in df_r.columns:
        return

    df_r = df_r.sort_values("RMSE", ignore_index=True)
    models = df_r["Model"].tolist()
    x = np.arange(len(models))
    width = 0.25
    colors = ["#1565c0", "#d84315", "#43a047"]

    fig, ax = plt.subplots(figsize=(max(10, len(models) * 2.5), 6))
    fig.patch.set_facecolor("#f5f5f5")
    ax.set_facecolor("#ffffff")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    for i, (metric, color) in enumerate(zip(metrics_to_plot, colors)):
        vals = df_r[metric].values.astype(float)
        offset = (i - len(metrics_to_plot) / 2 + 0.5) * width
        bars = ax.bar(x + offset, vals, width, label=metric, color=color,
                      alpha=0.82, edgecolor="white", linewidth=0.8, zorder=3)
        for bar, v in zip(bars, vals):
            ax.text(bar.get_x() + bar.get_width() / 2,
                    bar.get_height() + 0.3,
                    f"{v:.2f}", ha="center", va="bottom", fontsize=8.5, fontweight="bold")

    # Đánh dấu model tốt nhất (RMSE thấp nhất)
    best_idx = int(df_r["RMSE"].idxmin())
    ax.axvspan(best_idx - 0.45, best_idx + 0.45,
               color="#fffde7", alpha=0.5, zorder=0, label=f"Best: {models[best_idx]}")

    ax.set_xticks(x)
    ax.set_xticklabels(models, fontsize=11, fontweight="bold")
    ax.set_ylabel("Giá trị metric", fontsize=11)
    ax.set_title("So sánh hiệu năng các Model — MAE / RMSE / MAPE",
                 fontsize=13, fontweight="bold")
    ax.legend(fontsize=10, framealpha=0.9)
    ax.grid(axis="y", ls="--", alpha=0.28)

    plt.tight_layout()
    if save_path:
        plt.savefig(str(save_path), dpi=150, bbox_inches="tight")
        print(f"[INFO] Model comparison → {save_path}")
        plt.close(fig)
    else:
        plt.show()


# ─────────────────────────────────────────────────────────────────────────────
# Original AQI forecast window plot (unchanged)
# ─────────────────────────────────────────────────────────────────────────────

def plot_aqi_forecast(original_df, window_pred_df=None, window_true_df=None,
                      features=None, model_name="Model", metrics=None,
                      save_path=None, freq_str="5min", look_back=0, horizon=1):
    if features is None:
        features = ["pm1_0", "pm2_5", "pm10", "aqi"]
    missing = [f for f in features if f not in original_df.columns]
    if missing:
        print(f"[WARN] Missing columns: {missing}")
        features = [f for f in features if f in original_df.columns]
    if not features:
        print(f"[WARN] No valid features for '{model_name}'.")
        return

    horizon_label = format_horizon_label(horizon, freq_str)
    look_back_label = format_step_label(look_back, freq_str) if look_back > 0 else "khong dung"
    n_features = len(features)
    fig, axes = plt.subplots(n_features, 2, figsize=(18, 4.5 * n_features),
                             gridspec_kw={"width_ratios": [3.7, 2.2], "hspace": 0.35})
    if n_features == 1:
        axes = axes.reshape(1, -1)
    fig.patch.set_facecolor("#f5f5f5")
    fig.suptitle(f"So sanh du bao va thuc te -- {model_name.upper()}", fontsize=14, fontweight="bold", y=1.01)

    for i, feat in enumerate(features):
        ax = axes[i, 0]
        ax_err = axes[i, 1]
        actual = original_df[feat].dropna().sort_index()
        wpred = (window_pred_df[feat].dropna() if window_pred_df is not None and feat in window_pred_df.columns else None)
        wtrue_fb = (window_true_df[feat].dropna() if window_true_df is not None and feat in window_true_df.columns else None)

        if wpred is None or len(wpred) == 0:
            ax.text(0.5, 0.5, f"Khong du du lieu cho '{feat}'", ha="center", va="center", transform=ax.transAxes)
            ax.set_axis_off()
            axes[i, 1].set_axis_off()
            continue

        ts_arr = pd.DatetimeIndex(wpred.index)
        pred_arr = wpred.values.astype(float).reshape(-1)
        wtrue_exact = actual.reindex(ts_arr)
        if wtrue_exact.isna().any() and wtrue_fb is not None:
            wtrue_exact = wtrue_exact.combine_first(wtrue_fb.reindex(ts_arr))
        if wtrue_exact.isna().any():
            print(f"[WARN] Missing actuals for '{feat}': {list(wtrue_exact[wtrue_exact.isna()].index[:3])}")
            axes[i, 1].set_axis_off()
            continue

        true_arr = wtrue_exact.values.astype(float).reshape(-1)
        step_idx = np.arange(1, len(ts_arr) + 1)
        all_vals = list(true_arr) + list(pred_arr)
        y_lo = max(0, float(np.nanmin(all_vals)) - 10)
        y_hi = float(np.nanmax(all_vals)) + 15
        residual = true_arr - pred_arr
        abs_error = np.abs(residual)
        cum_mae = np.cumsum(abs_error) / step_idx

        for a in (ax, ax_err):
            a.set_facecolor("#ffffff")
            a.spines["top"].set_visible(False)
            a.spines["right"].set_visible(False)
            a.tick_params(labelsize=9)
            a.set_axisbelow(True)

        ax.plot(step_idx, true_arr, color="#1565c0", lw=2.8, marker="o", markersize=6,
                markerfacecolor="white", markeredgewidth=1.5, zorder=6, label=f"Thuc te {horizon_label}")
        ax.plot(step_idx, pred_arr, color="#d84315", lw=2.6, ls="--", marker="s", markersize=6,
                markerfacecolor="white", markeredgewidth=1.5, zorder=7, label=f"Du bao {horizon_label}")
        ax.fill_between(step_idx, true_arr, pred_arr, color="#ffccbc", alpha=0.35, zorder=5, label="Sai khac")

        for step, x in enumerate(step_idx, start=1):
            ax.annotate(f"{true_arr[step-1]:.1f}", (x, float(true_arr[step-1])),
                        xytext=(0, 10), textcoords="offset points", ha="center", va="bottom",
                        fontsize=7, color="#1565c0", bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="#bbdefb", alpha=0.92))
            ax.annotate(f"{pred_arr[step-1]:.1f}", (x, float(pred_arr[step-1])),
                        xytext=(0, -16), textcoords="offset points", ha="center", va="top",
                        fontsize=7, color="#d84315", bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="#ffccbc", alpha=0.92))
            ax.annotate(f"T+{step}", (x, max(float(true_arr[step-1]), float(pred_arr[step-1]))),
                        xytext=(0, 28), textcoords="offset points", ha="center", va="bottom", fontsize=7, color="#6d4c41")

        mae_v = float(np.mean(abs_error))
        rmse_v = float(np.sqrt(np.mean(residual**2)))
        mask_m = true_arr != 0
        mape_v = float(np.mean(np.abs(residual[mask_m] / true_arr[mask_m])) * 100) if mask_m.any() else None
        max_err_step = int(np.argmax(abs_error) + 1)
        max_err_val = float(abs_error[max_err_step - 1])

        info_lines = [f"Feature: {feat.upper()}", f"Dau vao: {look_back_label}",
                      f"Du bao: {horizon_label}", f"MAE: {mae_v:.2f}", f"RMSE: {rmse_v:.2f}"]
        if mape_v is not None:
            info_lines.append(f"MAPE: {mape_v:.1f}%")
        info_lines.append(f"Sai max: T+{max_err_step}={max_err_val:.2f}")
        if metrics and feat in metrics:
            overall = metrics[feat]
            if overall.get("mae") is not None:
                info_lines.append(f"MAE backtest: {float(overall['mae']):.2f}")
            if overall.get("rmse") is not None:
                info_lines.append(f"RMSE backtest: {float(overall['rmse']):.2f}")
        ax.text(0.015, 0.985, "\n".join(info_lines), transform=ax.transAxes, fontsize=9,
                va="top", ha="left", bbox=dict(boxstyle="round,pad=0.35", fc="#fffde7", ec="#f9a825", alpha=0.95))

        ax.set_xlim(0.5, len(step_idx) + 0.5)
        ax.set_ylim(y_lo, y_hi)
        ax.set_ylabel(feat.upper(), fontsize=11, fontweight="bold")
        ax.tick_params(labelbottom=False)
        ax.grid(axis="both", which="major", ls="--", alpha=0.28)
        ax.legend(fontsize=8.5, loc="lower left", framealpha=0.92, ncol=2)

        err_colors = np.where(residual >= 0, "#1e88e5", "#e53935")
        ax_err.bar(step_idx, residual, color=err_colors, alpha=0.78, edgecolor="#ffffff", linewidth=0.8, zorder=3,
                   label="Sai so")
        ax_err.plot(step_idx, cum_mae, color="#5d4037", lw=2.2, marker="D", markersize=4.5, zorder=4, label="MAE tich luy")
        ax_err.plot(step_idx, -cum_mae, color="#bcaaa4", lw=1.5, ls=":", zorder=2)
        ax_err.axhline(0, color="#546e7a", lw=1.0, ls="--", alpha=0.9, zorder=1)

        for step, x in enumerate(step_idx, start=1):
            err_val = float(residual[step - 1])
            ax_err.annotate(f"{err_val:+.2f}", (x, err_val), xytext=(0, 0), textcoords="offset points",
                            ha="center", va="bottom" if err_val >= 0 else "top", fontsize=8, color="#263238", fontweight="bold")

        err_y_hi = max(float(np.nanmax(np.abs(residual))), float(np.nanmax(cum_mae))) if len(abs_error) else 1.0
        ax_err.set_ylim(-(err_y_hi * 1.35 if err_y_hi > 0 else 1.0), err_y_hi * 1.35 if err_y_hi > 0 else 1.0)
        ax_err.set_ylabel("Sai so", fontsize=9)
        ax_err.grid(axis="y", which="major", ls="--", alpha=0.25)
        ax_err.legend(fontsize=8, loc="upper right", framealpha=0.92)

        if i == n_features - 1:
            ax_err.set_xlabel("Tung buoc du bao", fontsize=10)
            step_labels = [f"T+{step}\n{pd.Timestamp(ts).strftime('%H:%M')}" for step, ts in zip(step_idx, ts_arr)]
            ax_err.set_xticks(step_idx)
            ax_err.set_xticklabels(step_labels, rotation=0, ha="center", fontsize=8)

    plt.tight_layout()
    if save_path:
        plt.savefig(str(save_path), dpi=150, bbox_inches="tight")
        print(f"[INFO] Da luu -> {save_path}")
        plt.close(fig)
    else:
        plt.show()


# ─────────────────────────────────────────────────────────────────────────────
_SAVE_NAMES = {
    "lstm":     config.MODEL_NAME,
    "gru":      config.MODEL_NAME,
    "bilstm":   "bilstm",
    "arima":    "arima",
    "informer": getattr(config, "INFORMER_MODEL_NAME", "informer"),
}


def main():
    print("[INFO] Loading data …")
    train_data, test_data, df_model = get_data()
    print(f"[INFO] Dataset: {len(df_model)} rows | "
          f"train={len(train_data)} | test={len(test_data)}")

    config.MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    plot_dir = config.MODEL_OUTPUT_DIR / "plot"
    plot_dir.mkdir(parents=True, exist_ok=True)
    drift_dir = config.MODEL_OUTPUT_DIR / "drift"
    drift_dir.mkdir(parents=True, exist_ok=True)
    experiment_results = []

    aqi_col = "aqi"
    if aqi_col not in df_model.columns:
        cands = [c for c in df_model.columns if "aqi" in c.lower()]
        aqi_col = cands[0] if cands else df_model.columns[0]
        print(f"[INFO] Dùng cột '{aqi_col}' làm AQI.")

    for model_name in config.RUN_MODELS:
        model_key = model_name.lower()
        if model_key not in AVAILABLE_MODELS:
            print(f"[WARN] Unknown model '{model_name}', skipping.")
            continue

        print(f"\n{'='*50}\n[INFO] Huấn luyện: {model_name.upper()} …")

        model = AVAILABLE_MODELS[model_key]()
        model.train(train_data, df_model=df_model)
        y_pred, y_true, feat_names = model.predict(train_data, test_data, df_model=df_model)

        metrics    = compute_metrics(y_true, y_pred, feat_names)
        print(f"[RESULT] {model_name}:", json.dumps(metrics, indent=2, default=str))
        save_json(metrics, config.MODEL_OUTPUT_DIR / f"{model_key}_metrics.json")

        horizon   = getattr(model, "horizon",   1)
        look_back = getattr(model, "look_back", 0)
        split_idx = int(len(df_model) * config.TRAIN_SPLIT)

        # Rolling 1-step-ahead backtest
        backtest_df = flatten_preds_to_times(
            df_model.index, y_pred, split_idx, look_back, horizon,
            feat_names, config.RESAMPLE_FREQ or "5min",
        )
        backtest_df.to_csv(config.MODEL_OUTPUT_DIR / f"{model_key}_backtest_pred.csv")

        train_feature_df = df_model.iloc[:split_idx].copy()
        feature_baseline = build_feature_baseline(
            train_feature_df,
            resolve_drift_feature_names(train_feature_df, config.DRIFT_FEATURES),
            model_key=model_key,
            kind="input_features",
            bins=config.DRIFT_NUM_BINS,
        )
        save_drift_json(feature_baseline, drift_dir / f"{model_key}_feature_baseline.json")

        prediction_baseline = build_feature_baseline(
            backtest_df,
            backtest_df.columns.tolist(),
            model_key=model_key,
            kind="predictions",
            bins=config.DRIFT_NUM_BINS,
        )
        save_drift_json(prediction_baseline, drift_dir / f"{model_key}_prediction_baseline.json")

        residual_baseline = None
        if config.TARGET_COLUMN in backtest_df.columns and config.TARGET_COLUMN in df_model.columns:
            actual_target = df_model.loc[backtest_df.index, config.TARGET_COLUMN]
            residual_df = pd.DataFrame(
                {
                    "residual": actual_target.values - backtest_df[config.TARGET_COLUMN].values
                },
                index=backtest_df.index,
            )
            residual_baseline = build_feature_baseline(
                residual_df,
                ["residual"],
                model_key=model_key,
                kind="residuals",
                bins=config.DRIFT_NUM_BINS,
            )
            save_drift_json(residual_baseline, drift_dir / f"{model_key}_residual_baseline.json")

        drift_report = {
            "model": model_key,
            "generated_at": pd.Timestamp.utcnow().isoformat(),
            "train_split": config.TRAIN_SPLIT,
            "feature_baseline_path": str(drift_dir / f"{model_key}_feature_baseline.json"),
            "prediction_baseline_path": str(drift_dir / f"{model_key}_prediction_baseline.json"),
            "residual_baseline_path": (
                str(drift_dir / f"{model_key}_residual_baseline.json")
                if residual_baseline is not None
                else None
            ),
            "reference_window": {
                "train_rows": int(len(train_feature_df)),
                "backtest_rows": int(len(backtest_df)),
            },
        }
        save_drift_json(drift_report, drift_dir / f"{model_key}_training_report.json")

        # Cửa sổ đầu tiên
        window_pred_df, window_true_df = make_window_dfs(
            df_model.index, y_pred, y_true, split_idx, look_back,
            horizon, feat_names, config.RESAMPLE_FREQ or "5min",
        )

        future_df = model.forecast_future(df_model)
        if future_df is not None:
            future_df.to_csv(config.MODEL_OUTPUT_DIR / f"{model_key}_future_forecast.csv")
            print("[INFO] Đã lưu dự báo tương lai.")
            alerts = check_alerts(future_df, config.THRESHOLDS)
            if alerts:
                print("[ALERT] Vượt ngưỡng:")
                for f, hits in alerts.items():
                    print(f"  - {f}: {len(hits)} lần. Ví dụ: {hits[:2]}")

        model.save(out_dir=config.MODEL_OUTPUT_DIR,
                   name=_SAVE_NAMES.get(model_key, model_key))
        print("[INFO] Model saved.")

        # Plot 1: Forecast window for all 4 features
        plot_aqi_forecast(
            original_df=df_model,
            window_pred_df=window_pred_df,
            window_true_df=window_true_df,
            features=["pm1_0", "pm2_5", "pm10", "aqi"],
            model_name=model_name,
            metrics=metrics,
            save_path=plot_dir / f"{model_key}_aqi_plot.png",
            freq_str=config.RESAMPLE_FREQ or "5min",
            look_back=look_back,
            horizon=horizon,
        )

        # ── Biểu đồ 2: [NEW] Loss curve train/val
        # Model cần expose thuộc tính `history` dạng {"train_loss": [...], "val_loss": [...]}
        history = getattr(model, "history", None)
        plot_loss_curve(
            history=history,
            model_name=model_name,
            save_path=plot_dir / f"{model_key}_loss_curve.png",
        )

        # ── Biểu đồ 3: [NEW] Full backtest overview
        plot_full_backtest(
            df_model=df_model,
            backtest_df=backtest_df,
            model_name=model_name,
            split_idx=split_idx,
            features=["pm1_0", "pm2_5", "pm10", "aqi"],
            save_path=plot_dir / f"{model_key}_full_backtest.png",
            freq_str=config.RESAMPLE_FREQ or "5min",
        )

        # ── Biểu đồ 4: [NEW] Residual analysis (4-panel)
        plot_residual_analysis(
            y_true=y_true,
            y_pred=y_pred,
            model_name=model_name,
            features=["pm1_0", "pm2_5", "pm10", "aqi"],
            save_path=plot_dir / f"{model_key}_residual_analysis.png",
        )

        experiment_results.append(model.result_to_summary(metrics, model_name))

    # ── Biểu đồ 5: [NEW] So sánh tất cả model (chạy sau khi train xong hết)
    if experiment_results:
        plot_model_comparison(
            experiment_results=experiment_results,
            save_path=plot_dir / "model_comparison.png",
        )

        df_r = pd.DataFrame(experiment_results)
        cols = [c for c in ["Model", "RMSE", "MAE", "MAPE (%)"] if c in df_r.columns]
        df_r = df_r[cols].sort_values("RMSE", ignore_index=True)
        print("\n=== TỔNG HỢP KẾT QUẢ ===")
        try:
            print(df_r.to_markdown(index=False))
        except ImportError:
            print(df_r.to_string(index=False))


if __name__ == "__main__":
    main()
