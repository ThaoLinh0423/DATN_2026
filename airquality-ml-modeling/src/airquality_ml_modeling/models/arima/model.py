# models/arima/model.py
"""
Univariate ARIMA wrapper using statsmodels.
Operates on a 1-D numpy array (TARGET_COLUMN values).
"""
import joblib
import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA as StatsARIMA

from ..base_model import BaseTimeSeriesModel
import configs.config as config


class ARIMA(BaseTimeSeriesModel):
    def __init__(self, order=None):
        self.order = order or config.ARIMA_ORDER
        self.model_fit = None
        self.horizon = config.HORIZON
        self.look_back = 0  # no sliding window

    def train(self, train_data, df_model=None):
        # df_model ignored — ARIMA is univariate
        model = StatsARIMA(train_data, order=self.order)
        self.model_fit = model.fit()
        return self

    def predict(self, train_data, test_data, df_model=None):
        """
        Returns
        -------
        y_pred        : np.ndarray 1-D  (n_test,)
        y_true        : np.ndarray 1-D  (n_test,)
        feature_names : list[str]       [TARGET_COLUMN]
        """
        if self.model_fit is None:
            raise RuntimeError("Call train() before predict().")
        y_pred = self.model_fit.forecast(steps=len(test_data))
        return np.array(y_pred), np.array(test_data), [config.TARGET_COLUMN]

    def forecast_future(self, df_model):
        if self.model_fit is None:
            raise RuntimeError("Call train() before forecast_future().")

        last_ts = df_model.index[-1]
        pred = self.model_fit.forecast(steps=self.horizon)
        idx = pd.date_range(
            start=last_ts + pd.tseries.frequencies.to_offset(config.RESAMPLE_FREQ),
            periods=self.horizon,
            freq=config.RESAMPLE_FREQ,
        )
        return pd.DataFrame(
            np.asarray(pred).reshape(-1, 1),
            index=idx,
            columns=[config.TARGET_COLUMN],
        )

    def save(self, out_dir=None, name=None):
        if self.model_fit is None:
            return
        out_dir = out_dir or config.MODEL_OUTPUT_DIR
        name = name or "arima"
        path = str(out_dir / f"{name}_model.joblib")
        joblib.dump(self.model_fit, path)

    def load(self, path):
        self.model_fit = joblib.load(path)
