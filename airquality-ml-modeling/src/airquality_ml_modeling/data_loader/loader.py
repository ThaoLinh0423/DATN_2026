# data_loader/loader.py
"""
Load raw CSV, clean, resample, engineer time features, and split by time.
Returns both a 1-D array (for ARIMA) and a full DataFrame (for LSTM).
"""
import numpy as np
import pandas as pd
import configs.config as config


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------

def load_air_quality_df(filepath=None, timestamp_col=None, tz_utc=True):
    filepath = filepath or config.CSV_PATH
    timestamp_col = timestamp_col or config.TIMESTAMP_COL
    df = pd.read_csv(filepath)
    if getattr(config, "DATA_MAX_ROWS", 0):
        # Quick-train mode: keep only the newest rows to reduce retraining time.
        df = df.tail(int(config.DATA_MAX_ROWS)).copy()
    df[timestamp_col] = pd.to_datetime(df[timestamp_col], utc=tz_utc)
    df = df.set_index(timestamp_col).sort_index()
    return df


def select_location(df, agg_all=None, longitude=None, latitude=None):
    agg_all = config.AGG_ALL if agg_all is None else agg_all
    if agg_all:
        cols = [c for c in df.columns if c not in ("longitude", "latitude")]
        return df[cols].groupby(df.index).mean()
    longitude = longitude or config.LOCATION_LONG
    latitude = latitude or config.LOCATION_LAT
    if longitude is None or latitude is None:
        raise ValueError("agg_all=False requires longitude and latitude")
    mask = (df["longitude"] == longitude) & (df["latitude"] == latitude)
    df_loc = df[mask]
    if df_loc.empty:
        raise ValueError("No matching location found")
    return df_loc.drop(
        columns=[c for c in ["longitude", "latitude"] if c in df_loc.columns],
        errors="ignore",
    )


def resample_and_fill(df, freq=None, agg="mean", fill_method=None):
    freq = freq or config.RESAMPLE_FREQ
    fill_method = fill_method or config.FILL_METHOD
    if freq:
        agg_fn = {"mean": "mean", "sum": "sum", "median": "median"}.get(agg)
        if agg_fn is None:
            raise ValueError("agg must be 'mean', 'sum', or 'median'")
        df = getattr(df.resample(freq), agg_fn)()
    if fill_method == "interpolate":
        df = df.interpolate(method="time")
    elif fill_method == "ffill":
        df = df.ffill()
    elif fill_method == "bfill":
        df = df.bfill()
    elif fill_method == "drop":
        df = df.dropna()
    else:
        raise ValueError(f"Unknown fill_method: {fill_method}")
    return df


def add_time_features(df):
    """Append cyclical hour/dow sin-cos columns."""
    df = df.copy()
    hours = df.index.hour
    dow = df.index.dayofweek
    df["hour_sin"] = np.sin(2 * np.pi * hours / 24.0)
    df["hour_cos"] = np.cos(2 * np.pi * hours / 24.0)
    df["dow_sin"] = np.sin(2 * np.pi * dow / 7.0)
    df["dow_cos"] = np.cos(2 * np.pi * dow / 7.0)
    return df


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_data():
    """
    Load and preprocess the air-quality CSV.

    Returns
    -------
    train_data : np.ndarray, 1-D  (values of TARGET_COLUMN, training portion)
    test_data  : np.ndarray, 1-D  (values of TARGET_COLUMN, test portion)
    df_model   : pd.DataFrame     (all FEATURES + time cols, full period)
    """
    df_raw = load_air_quality_df()
    df_loc = select_location(df_raw)
    df_rs = resample_and_fill(df_loc)

    features_existing = [f for f in config.FEATURES if f in df_rs.columns]
    if not features_existing:
        raise ValueError("No requested features present after resampling.")

    df_model = df_rs[features_existing].copy()
    df_model = add_time_features(df_model)

    # 1-D split for simple/univariate models (ARIMA)
    if config.TARGET_COLUMN not in df_model.columns:
        raise ValueError(f"TARGET_COLUMN '{config.TARGET_COLUMN}' not in features.")
    series = df_model[config.TARGET_COLUMN].values
    split_idx = int(len(series) * config.TRAIN_SPLIT)
    train_data = series[:split_idx]
    test_data = series[split_idx:]

    return train_data, test_data, df_model
