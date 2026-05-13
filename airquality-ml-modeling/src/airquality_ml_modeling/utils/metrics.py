# utils/metrics.py
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error


def get_timeseries_metrics(y_true, y_pred):
    """Compute MAE, RMSE, MAPE for time-series forecasts."""
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))

    mask = y_true != 0
    mape = (
        np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100
        if mask.any()
        else np.nan
    )

    return {"MAE": mae, "RMSE": rmse, "MAPE (%)": mape}


def evaluate_per_feature(y_true_blocks, y_pred_blocks, feature_names):
    """
    Evaluate multi-feature multi-step predictions.

    Parameters
    ----------
    y_true_blocks, y_pred_blocks : np.ndarray, shape (n_samples, horizon, n_feat)
    feature_names : list[str]

    Returns
    -------
    dict  feature -> {rmse, mae, mape}
    """
    out = {}
    for i, name in enumerate(feature_names):
        true_flat = y_true_blocks[:, :, i].reshape(-1)
        pred_flat = y_pred_blocks[:, :, i].reshape(-1)
        metrics = get_timeseries_metrics(true_flat, pred_flat)
        out[name] = {
            "rmse": metrics["RMSE"],
            "mae":  metrics["MAE"],
            "mape": metrics["MAPE (%)"],   # FIX: thêm mape
        }
    return out