# models/base_model.py
from abc import ABC, abstractmethod
import pandas as pd


class BaseTimeSeriesModel(ABC):
    """
    Abstract interface every forecasting model must implement.

    Contract
    --------
    train(train_data, df_model)
        Fit the model. df_model is the full feature DataFrame (may be ignored
        by univariate models like ARIMA).

    predict(train_data, test_data, df_model) -> (y_pred, y_true, feature_names)
        Return predictions, ground truth, and feature name list — all in
        original scale. Univariate models return shape (n,) arrays and a
        single-element feature list.

    forecast_future(df_model) -> pd.DataFrame | None
        Forecast beyond the last observed timestamp.
        Return None if the model does not support future forecasting.

    save(out_dir, name)
        Persist model artifacts (weights, scalers, etc.).

    result_to_summary(metrics, model_name) -> dict
        Convert per-model metrics dict into a flat summary row for the
        experiment table.
    """

    @abstractmethod
    def train(self, train_data, df_model=None):
        """Fit the model on training data."""

    @abstractmethod
    def predict(self, train_data, test_data, df_model=None):
        """
        Generate predictions aligned with test_data.

        Returns
        -------
        y_pred        : np.ndarray  (n_samples, horizon, n_features) or 1-D
        y_true        : np.ndarray  same shape as y_pred
        feature_names : list[str]
        """

    def forecast_future(self, df_model) -> "pd.DataFrame | None":
        """
        Forecast horizon steps beyond the last observed timestamp.
        Override in models that support it. Default: not supported.
        """
        return None

    def save(self, out_dir=None, name=None):
        """
        Persist model artifacts. Override in subclasses as needed.
        Default: no-op.
        """

    def result_to_summary(self, metrics: dict, model_name: str) -> dict:
        """
        Convert a metrics dict into a flat summary row.

        Works for both:
          - univariate flat dicts  : {"MAE": ..., "RMSE": ...}
          - per-feature dicts      : {"aqi": {"mae": ..., "rmse": ...}, ...}

        Override in subclasses if needed.
        """
        import configs.config as _config
        target = _config.TARGET_COLUMN

        # per-feature dict (LSTM style)
        if target in metrics and isinstance(metrics[target], dict):
            m = metrics[target]
            return {
                "Model": model_name,
                "RMSE": m.get("rmse"),
                "MAE": m.get("mae"),
                "MAPE (%)": m.get("mape", "N/A"),
            }

        # flat dict (ARIMA style)
        return {
            "Model": model_name,
            "RMSE": metrics.get("RMSE"),
            "MAE": metrics.get("MAE"),
            "MAPE (%)": metrics.get("MAPE (%)", "N/A"),
        }