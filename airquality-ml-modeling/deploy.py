"""
Air Quality Forecast API  —  v2.2.0
=====================================
FastAPI application phục vụ dự báo AQI đa bước từ các mô hình đã huấn luyện.

Thay đổi so với v2.1.0
-----------------------
* Toàn bộ tham số vận hành đọc từ configs/deploy_config.py (CORS, enabled
  models, LRU cache limit) — không cần sửa code khi chuyển môi trường.
* Hỗ trợ đầy đủ 5 model: lstm, gru, bilstm, informer, arima.
  Mỗi model có logic .load() riêng (ARIMA dùng instance method + path;
  Informer cần meta.joblib; các model PyTorch dùng classmethod).
* Cache model bị giới hạn bởi deploy_config.MAX_CACHED_MODELS với LRU eviction.
* CORS middleware áp dụng theo deploy_config.CORS_ORIGINS.
"""
from __future__ import annotations

import collections
from pathlib import Path
import traceback
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import configs.config as cfg
import configs.deploy_config as dcfg
from airquality_ml_modeling.utils.drift import (
    aggregate_event_values,
    build_feature_baseline,
    compute_drift_report,
    flatten_numeric_values,
    load_json,
    resolve_drift_feature_names,
    save_json,
    utc_now_iso,
)

# ---------------------------------------------------------------------------
# Model imports — fail gracefully nếu dependency chưa cài
# ---------------------------------------------------------------------------

from airquality_ml_modeling.models.lstm.model import LSTM
from airquality_ml_modeling.models.gru.model import GRU
from airquality_ml_modeling.models.bilstm.model import BiLSTM

try:
    from airquality_ml_modeling.models.informer.model import Informer as _Informer
except Exception:
    _Informer = None  # type: ignore[assignment,misc]

try:
    from airquality_ml_modeling.models.arima.model import ARIMA as _ARIMA
except Exception:
    _ARIMA = None  # type: ignore[assignment,misc]

# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------

_ALL_MODEL_CLASSES: dict[str, type] = {
    "lstm":   LSTM,
    "gru":    GRU,
    "bilstm": BiLSTM,
}
if _Informer is not None:
    _ALL_MODEL_CLASSES["informer"] = _Informer
if _ARIMA is not None:
    _ALL_MODEL_CLASSES["arima"] = _ARIMA

# Chỉ expose model nằm trong ENABLED_MODELS VÀ đã import thành công
_MODEL_CLASSES: dict[str, type] = {
    k: v
    for k, v in _ALL_MODEL_CLASSES.items()
    if k in dcfg.ENABLED_MODELS
}

ModelKey = Literal["lstm", "gru", "bilstm", "informer", "arima"]

# ---------------------------------------------------------------------------
# LRU Model Cache
# ---------------------------------------------------------------------------

class _LRUModelCache:
    """
    Cache model trong RAM, tự đẩy ra model ít dùng nhất khi đầy.

    Đủ dùng cho single-worker (WORKERS=1). Multi-worker cần shared store.
    """

    def __init__(self, maxsize: int) -> None:
        self._maxsize = max(1, maxsize)
        # OrderedDict giữ thứ tự truy cập: cuối = recently used
        self._store: collections.OrderedDict[str, object] = collections.OrderedDict()

    def get(self, key: str) -> object | None:
        if key not in self._store:
            return None
        self._store.move_to_end(key)          # cập nhật LRU
        return self._store[key]

    def put(self, key: str, model: object) -> None:
        if key in self._store:
            self._store.move_to_end(key)
        self._store[key] = model
        if len(self._store) > self._maxsize:
            evicted, _ = self._store.popitem(last=False)
            print(f"[CACHE] Evicted '{evicted}' (LRU, maxsize={self._maxsize})")

    def delete(self, key: str) -> bool:
        return bool(self._store.pop(key, None) is not None)

    def clear(self) -> None:
        self._store.clear()

    def keys(self) -> list[str]:
        return list(self._store.keys())


_cache = _LRUModelCache(maxsize=dcfg.MAX_CACHED_MODELS)

# ---------------------------------------------------------------------------
# Load logic riêng cho từng model
# ---------------------------------------------------------------------------

def _load_model(model_key: str) -> object:
    """
    Nạp model từ đĩa, xử lý đúng API của từng class:

    - lstm / gru / bilstm : MyClass.load()  — classmethod, không cần tham số
    - informer            : Informer.load() — classmethod, đọc thêm meta.joblib
    - arima               : ARIMA()  rồi  instance.load(path)
    """
    cls = _MODEL_CLASSES[model_key]

    if model_key == "arima":
        # ARIMA.load() là instance method nhận path
        arima_path = cfg.MODEL_OUTPUT_DIR / "arima_model.joblib"
        if not arima_path.exists():
            raise FileNotFoundError(
                f"Không tìm thấy file model ARIMA tại '{arima_path}'. "
                "Vui lòng chạy retrain.py trước."
            )
        instance = cls()
        instance.load(str(arima_path))
        return instance

    # Tất cả model còn lại đều có classmethod load()
    # Informer cần thêm meta.joblib — đã được xử lý bên trong Informer.load()
    return cls.load()  # type: ignore[attr-defined]


def _get_or_load(model_key: str) -> object:
    """Trả về model từ cache; nếu chưa có thì load và cache lại."""
    if model_key not in _MODEL_CLASSES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Model '{model_key}' không được hỗ trợ hoặc chưa được bật. "
                f"Các model khả dụng: {list(_MODEL_CLASSES.keys())}"
            ),
        )

    cached = _cache.get(model_key)
    if cached is not None:
        return cached

    print(f"[INFO] Đang nạp model '{model_key}' từ đĩa …")
    try:
        model = _load_model(model_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi khi khởi tạo model '{model_key}': {exc}",
        ) from exc

    _cache.put(model_key, model)
    print(f"[INFO] Model '{model_key}' đã sẵn sàng. Cache hiện tại: {_cache.keys()}")
    return model

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Air Quality Forecast API",
    version="2.2.0",
    description=(
        "API dự báo chỉ số AQI đa bước sử dụng các mô hình Deep Learning "
        "(LSTM, GRU, BiLSTM, Informer) và thống kê (ARIMA)."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=dcfg.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ForecastPoint(BaseModel):
    timestamp:   str
    aqi:         float | None = None
    pm1_0:       float | None = None
    pm2_5:       float | None = None
    pm10:        float | None = None
    temperature: float | None = None
    humidity:    float | None = None


class ObservationPoint(BaseModel):
    timestamp:   str
    aqi:         float | None = None
    pm1_0:       float | None = None
    pm2_5:       float | None = None
    pm10:        float | None = None
    temperature: float | None = None
    humidity:    float | None = None


class ForecastRequest(BaseModel):
    points: list[ObservationPoint]


class AlertPoint(BaseModel):
    timestamp: str
    value:     float


class ForecastResponse(BaseModel):
    model:         str
    target_columns: list[str]
    horizon:       int
    resample_freq: str
    forecast:      list[ForecastPoint]
    alerts:        dict[str, list[AlertPoint]] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status:          str
    loaded_models:   list[str]
    enabled_models:  list[str]
    device:          str


class ModelInfoResponse(BaseModel):
    model_key:      str
    enabled:        bool
    cached:         bool
    look_back:      int | None = None
    horizon:        int | None = None
    input_features: list[str] | None = None


class DriftFeatureStatus(BaseModel):
    feature: str
    psi: float | None = None
    status: str
    sample_size: int
    mean: float | None = None
    std: float | None = None
    min: float | None = None
    max: float | None = None


class DriftSummaryResponse(BaseModel):
    model: str
    generated_at: str
    overall_status: str
    events_in_window: int
    history_points: int
    input_drift: list[DriftFeatureStatus] = Field(default_factory=list)
    prediction_drift: list[DriftFeatureStatus] = Field(default_factory=list)


class DriftSeriesPoint(BaseModel):
    timestamp: str
    scope: str
    feature: str
    psi: float | None = None
    status: str
    sample_size: int


class DriftSeriesResponse(BaseModel):
    model: str
    generated_at: str
    series: list[DriftSeriesPoint] = Field(default_factory=list)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _build_forecast_response(
    model_key: str,
    future_df: pd.DataFrame,
) -> ForecastResponse:
    """Chuyển DataFrame dự báo thành ForecastResponse (kèm alerts)."""

    # --- Alerts ---
    alerts: dict[str, list[AlertPoint]] = {}
    for feat, thr in cfg.THRESHOLDS.items():
        if feat not in future_df.columns:
            continue
        mask = future_df[feat] > thr
        if mask.any():
            alerts[feat] = [
                AlertPoint(
                    timestamp=str(ts.isoformat()),
                    value=round(float(val), 4),
                )
                for ts, val in zip(future_df.index[mask], future_df[feat][mask])
            ]

    # --- Forecast points ---
    forecast_points: list[ForecastPoint] = []
    for ts, row in future_df.iterrows():
        point: dict = {"timestamp": ts.isoformat()}
        for col in future_df.columns:
            val = row[col]
            point[col] = None if (isinstance(val, float) and np.isnan(val)) else float(val)
        forecast_points.append(ForecastPoint(**point))

    return ForecastResponse(
        model=model_key,
        target_columns=list(future_df.columns),
        horizon=len(forecast_points),
        resample_freq=cfg.RESAMPLE_FREQ,
        forecast=forecast_points,
        alerts=alerts,
    )


def _prepare_forecast_input(model: object, df_model: pd.DataFrame) -> pd.DataFrame:
    """
    Optionally restrict the forecast source window using deploy_config.

    FORECAST_INPUT_POINTS controls how many latest points are exposed to the
    model at inference time. For sequence models, this must still be at least
    the model's trained look_back.
    """
    input_points = int(getattr(dcfg, "FORECAST_INPUT_POINTS", 0) or 0)
    if input_points <= 0:
        return df_model

    limited_df = df_model.tail(input_points).copy()
    model_look_back = int(getattr(model, "look_back", 0) or 0)
    if model_look_back > 0 and len(limited_df) < model_look_back:
        raise HTTPException(
            status_code=400,
            detail=(
                f"FORECAST_INPUT_POINTS={input_points} khong du cho model "
                f"co look_back={model_look_back}. Tang FORECAST_INPUT_POINTS "
                "hoac retrain model voi look_back nho hon."
            ),
        )
    return limited_df


def _limit_forecast_output(model: object, future_df: pd.DataFrame) -> pd.DataFrame:
    """
    Optionally restrict the number of returned forecast points using deploy_config.
    """
    output_points = int(getattr(dcfg, "FORECAST_OUTPUT_POINTS", 0) or 0)
    if output_points <= 0:
        return future_df

    if len(future_df) < output_points:
        model_horizon = int(getattr(model, "horizon", len(future_df)) or len(future_df))
        raise HTTPException(
            status_code=400,
            detail=(
                f"FORECAST_OUTPUT_POINTS={output_points} vuot qua horizon kha dung "
                f"cua model ({model_horizon}). Giam FORECAST_OUTPUT_POINTS hoac "
                "retrain model voi HORIZON lon hon."
            ),
        )
    return future_df.head(output_points).copy()


def _required_request_features(model_key: str) -> list[str]:
    if model_key == "arima":
        return [cfg.TARGET_COLUMN]
    # Multi-target: request all PM features
    TARGET_COLUMNS = ["pm1_0", "pm2_5", "pm10", "aqi"]
    return TARGET_COLUMNS


def _build_request_df(model_key: str, payload: ForecastRequest) -> pd.DataFrame:
    df = _build_observation_df(payload)

    required_features = _required_request_features(model_key)
    missing_features = [feature for feature in required_features if feature not in df.columns]
    if missing_features:
        raise HTTPException(
            status_code=400,
            detail=f"Thieu feature bat buoc trong request: {missing_features}",
        )

    if df[required_features].isna().any().any():
        raise HTTPException(
            status_code=400,
            detail=f"Cac feature bat buoc khong duoc null: {required_features}",
        )

    from airquality_ml_modeling.data_loader.loader import add_time_features

    df_model = df[required_features].copy()
    return add_time_features(df_model)


def _build_observation_df(payload: ForecastRequest) -> pd.DataFrame:
    if not payload.points:
        raise HTTPException(status_code=400, detail="Request points khong duoc rong.")

    rows = [point.model_dump() for point in payload.points]
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    if df["timestamp"].isna().any():
        raise HTTPException(
            status_code=400,
            detail="Tat ca points phai co timestamp hop le theo dinh dang ISO 8601.",
        )

    df = df.set_index("timestamp").sort_index()
    return df


def _monitoring_state_path(model_key: str) -> Path:
    return dcfg.MONITORING_OUTPUT_DIR / f"{model_key}_drift_state.json"


def _baseline_path(model_key: str, kind: str) -> Path:
    return dcfg.DRIFT_BASELINE_DIR / f"{model_key}_{kind}_baseline.json"


def _baseline_fallback_path(model_key: str, kind: str) -> Path:
    return cfg.MODEL_OUTPUT_DIR / "drift" / f"{model_key}_{kind}_baseline.json"


def _load_baseline_if_exists(model_key: str, kind: str) -> dict | None:
    for path in (_baseline_path(model_key, kind), _baseline_fallback_path(model_key, kind)):
        if path.exists():
            return load_json(path)
    return None


def _drift_feature_names(df: pd.DataFrame) -> list[str]:
    configured = list(getattr(cfg, "DRIFT_FEATURES", []) or [])
    return resolve_drift_feature_names(df, configured)


def _numeric_feature_names(df: pd.DataFrame) -> list[str]:
    return resolve_drift_feature_names(df, [])


def _numeric_feature_names(df: pd.DataFrame) -> list[str]:
    return [
        str(feature)
        for feature in df.columns
        if pd.api.types.is_numeric_dtype(df[feature])
    ]


def _ensure_baseline(
    model_key: str,
    kind: str,
    df: pd.DataFrame,
    *,
    baseline_kind: str,
    feature_names: list[str] | None = None,
) -> dict | None:
    baseline = _load_baseline_if_exists(model_key, kind)
    feature_names = feature_names if feature_names is not None else _drift_feature_names(df)
    if baseline is not None:
        baseline.setdefault("features", {})
        missing = [
            feature
            for feature in feature_names
            if feature not in baseline["features"]
        ]
        if missing:
            extension = build_feature_baseline(
                df,
                missing,
                model_key=model_key,
                kind=baseline.get("kind", baseline_kind),
                bins=getattr(cfg, "DRIFT_NUM_BINS", 10),
            )
            baseline["features"].update(extension.get("features", {}))
            baseline["generated_at"] = utc_now_iso()
            save_json(baseline, _baseline_path(model_key, kind))
        return baseline

    if not feature_names:
        return None

    baseline = build_feature_baseline(
        df,
        feature_names,
        model_key=model_key,
        kind=baseline_kind,
        bins=getattr(cfg, "DRIFT_NUM_BINS", 10),
    )
    save_json(baseline, _baseline_path(model_key, kind))
    return baseline


def _load_monitoring_state(model_key: str) -> dict:
    path = _monitoring_state_path(model_key)
    if path.exists():
        state = load_json(path)
    else:
        state = {"model": model_key}
    state.setdefault("events", [])
    state.setdefault("records", [])
    state.setdefault("history", [])
    return state


def _save_monitoring_state(model_key: str, state: dict) -> None:
    save_json(state, _monitoring_state_path(model_key))


def _to_feature_statuses(report: dict[str, dict]) -> list[DriftFeatureStatus]:
    return [
        DriftFeatureStatus(feature=feature, **payload)
        for feature, payload in sorted(report.items())
    ]


def _overall_drift_status(*reports: dict[str, dict]) -> str:
    statuses = [
        metric.get("status", "stable")
        for report in reports
        for metric in report.values()
    ]
    if "drift" in statuses:
        return "drift"
    if "warning" in statuses:
        return "warning"
    if "insufficient_data" in statuses and statuses:
        return "insufficient_data"
    if statuses and all(status == "not_available" for status in statuses):
        return "not_available"
    return "stable"


def _records_from_df(
    model_key: str,
    scope: str,
    df: pd.DataFrame,
    feature_names: list[str],
) -> list[dict]:
    records: list[dict] = []
    for ts, row in df.iterrows():
        timestamp = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        for feature in feature_names:
            value = row.get(feature)
            if pd.isna(value):
                continue
            records.append(
                {
                    "timestamp": timestamp,
                    "model": model_key,
                    "scope": scope,
                    "feature": feature,
                    "value": float(value),
                }
            )
    return records


def _aggregate_record_values(records: list[dict], scope: str) -> dict[str, list[float]]:
    values: dict[str, list[float]] = {}
    for record in records:
        if record.get("scope") != scope:
            continue
        feature = record.get("feature")
        value = record.get("value")
        if feature is None or value is None:
            continue
        values.setdefault(str(feature), []).append(float(value))
    return values


def _window_records(records: list[dict], event_timestamp: str) -> list[dict]:
    timestamp_order = []
    seen = set()
    for record in reversed(records):
        ts = record.get("event_timestamp", record.get("timestamp"))
        if ts in seen:
            continue
        seen.add(ts)
        timestamp_order.append(ts)
        if len(timestamp_order) >= dcfg.DRIFT_WINDOW_SIZE:
            break

    allowed = set(timestamp_order)
    return [
        record
        for record in records
        if record.get("event_timestamp", record.get("timestamp")) in allowed
        or record.get("event_timestamp") == event_timestamp
    ]


def _record_drift_snapshot(
    model_key: str,
    input_df: pd.DataFrame,
    future_df: pd.DataFrame,
) -> None:
    if not dcfg.DRIFT_ENABLED:
        return

    input_features = _drift_feature_names(input_df)
    prediction_features = _numeric_feature_names(future_df)
    feature_baseline = _ensure_baseline(
        model_key,
        "feature",
        input_df,
        baseline_kind="input_features",
        feature_names=input_features,
    )
    prediction_baseline = _ensure_baseline(
        model_key,
        "prediction",
        future_df,
        baseline_kind="predictions",
        feature_names=prediction_features,
    )
    if feature_baseline is None and prediction_baseline is None:
        return

    dcfg.MONITORING_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    state = _load_monitoring_state(model_key)
    event_timestamp = utc_now_iso()
    event = {
        "timestamp": event_timestamp,
        "input": flatten_numeric_values(input_df, input_features),
        "prediction": flatten_numeric_values(future_df, prediction_features),
    }
    state["events"].append(event)
    state["events"] = state["events"][-dcfg.DRIFT_HISTORY_LIMIT :]

    new_records = _records_from_df(model_key, "input", input_df, input_features)
    new_records.extend(_records_from_df(model_key, "prediction", future_df, prediction_features))
    for record in new_records:
        record["event_timestamp"] = event_timestamp
    state["records"].extend(new_records)
    state["records"] = state["records"][-dcfg.DRIFT_RECORD_LIMIT :]

    window_events = state["events"][-dcfg.DRIFT_WINDOW_SIZE :]
    window_records = _window_records(state["records"], event_timestamp)
    input_report: dict[str, dict] = {}
    prediction_report: dict[str, dict] = {}

    if feature_baseline is not None:
        input_report = compute_drift_report(
            feature_baseline,
            _aggregate_record_values(window_records, "input")
            or aggregate_event_values(window_events, "input"),
            warning_threshold=dcfg.DRIFT_PSI_WARNING,
            alert_threshold=dcfg.DRIFT_PSI_ALERT,
            min_samples=dcfg.DRIFT_MIN_SAMPLES,
        )
    if prediction_baseline is not None:
        prediction_report = compute_drift_report(
            prediction_baseline,
            _aggregate_record_values(window_records, "prediction")
            or aggregate_event_values(window_events, "prediction"),
            warning_threshold=dcfg.DRIFT_PSI_WARNING,
            alert_threshold=dcfg.DRIFT_PSI_ALERT,
            min_samples=dcfg.DRIFT_MIN_SAMPLES,
        )

    snapshot = {
        "timestamp": event["timestamp"],
        "events_in_window": len(window_records),
        "overall_status": _overall_drift_status(input_report, prediction_report),
        "input_drift": input_report,
        "prediction_drift": prediction_report,
    }
    state["history"].append(snapshot)
    state["history"] = state["history"][-dcfg.DRIFT_HISTORY_LIMIT :]
    _save_monitoring_state(model_key, state)


def _build_drift_summary(model_key: str) -> DriftSummaryResponse:
    state = _load_monitoring_state(model_key)
    history = state.get("history", [])
    if not history:
        return DriftSummaryResponse(
            model=model_key,
            generated_at=utc_now_iso(),
            overall_status="not_available",
            events_in_window=0,
            history_points=0,
            input_drift=[],
            prediction_drift=[],
        )

    latest = history[-1]
    return DriftSummaryResponse(
        model=model_key,
        generated_at=latest["timestamp"],
        overall_status=latest["overall_status"],
        events_in_window=latest["events_in_window"],
        history_points=len(history),
        input_drift=_to_feature_statuses(latest.get("input_drift", {})),
        prediction_drift=_to_feature_statuses(latest.get("prediction_drift", {})),
    )


def _build_drift_series(model_key: str) -> DriftSeriesResponse:
    state = _load_monitoring_state(model_key)
    series: list[DriftSeriesPoint] = []
    for snapshot in state.get("history", []):
        for scope in ("input_drift", "prediction_drift"):
            scope_name = "input" if scope == "input_drift" else "prediction"
            for feature, payload in snapshot.get(scope, {}).items():
                series.append(
                    DriftSeriesPoint(
                        timestamp=snapshot["timestamp"],
                        scope=scope_name,
                        feature=feature,
                        psi=payload.get("psi"),
                        status=payload.get("status", "stable"),
                        sample_size=payload.get("sample_size", 0),
                    )
                )

    return DriftSeriesResponse(
        model=model_key,
        generated_at=utc_now_iso(),
        series=series,
    )

# ---------------------------------------------------------------------------
# Routes — General
# ---------------------------------------------------------------------------

@app.get("/", tags=["General"], summary="API root")
def index():
    return {
        "message": "Air Quality Forecast API",
        "version": "2.2.0",
        "docs": "/docs",
        "enabled_models": list(_MODEL_CLASSES.keys()),
    }


@app.get("/health", response_model=HealthResponse, tags=["General"], summary="Health check")
def health():
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    return HealthResponse(
        status="ok",
        loaded_models=_cache.keys(),
        enabled_models=list(_MODEL_CLASSES.keys()),
        device=device,
    )


@app.get(
    "/models",
    response_model=list[ModelInfoResponse],
    tags=["Models"],
    summary="Danh sách tất cả model và trạng thái cache",
)
def list_models():
    result = []
    for key in dcfg.ENABLED_MODELS:
        cached_model = _cache.get(key)
        info = ModelInfoResponse(
            model_key=key,
            enabled=key in _MODEL_CLASSES,
            cached=cached_model is not None,
            look_back=getattr(cached_model, "look_back", None) if cached_model else None,
            horizon=getattr(cached_model, "horizon", None) if cached_model else None,
            input_features=getattr(cached_model, "input_features", None) if cached_model else None,
        )
        result.append(info)
    return result


@app.post(
    "/models/{model_key}/load",
    tags=["Models"],
    summary="Pre-load model vào cache",
)
def preload_model(model_key: ModelKey):
    _get_or_load(model_key)
    return {"detail": f"Model '{model_key}' đã được nạp vào cache."}

# ---------------------------------------------------------------------------
# Routes — Forecast
# ---------------------------------------------------------------------------

@app.post(
    "/forecast/{model_key}",
    response_model=ForecastResponse,
    tags=["Forecasting"],
    summary="Dự báo AQI tương lai từ payload backend",
)
async def forecast(model_key: ModelKey, payload: ForecastRequest):
    # 1. Lấy model
    model = _get_or_load(model_key)

    # 2. Dựng dữ liệu đầu vào từ request backend
    input_df = _build_observation_df(payload)
    df_model = _build_request_df(model_key, payload)
    df_model = _prepare_forecast_input(model, df_model)

    # 3. Dự báo
    future_df: pd.DataFrame | None = model.forecast_future(df_model)

    if future_df is None:
        raise HTTPException(
            status_code=501,
            detail=f"Model '{model_key}' không hỗ trợ forecast_future.",
        )

    future_df = _limit_forecast_output(model, future_df)
    _record_drift_snapshot(model_key, input_df, future_df)

    # 4. Trả về
    return _build_forecast_response(model_key, future_df)


@app.get(
    "/monitoring/drift/{model_key}/summary",
    response_model=DriftSummaryResponse,
    tags=["Monitoring"],
    summary="Tóm tắt drift mới nhất",
)
def drift_summary(model_key: ModelKey):
    return _build_drift_summary(model_key)


@app.get(
    "/monitoring/drift/{model_key}/timeseries",
    response_model=DriftSeriesResponse,
    tags=["Monitoring"],
    summary="Chuỗi thời gian drift để vẽ chart",
)
def drift_timeseries(model_key: ModelKey):
    return _build_drift_series(model_key)


@app.get(
    "/monitoring/drift/{model_key}/features/latest",
    response_model=list[DriftFeatureStatus],
    tags=["Monitoring"],
    summary="Drift theo feature ở snapshot mới nhất",
)
def latest_feature_drift(model_key: ModelKey):
    summary = _build_drift_summary(model_key)
    return summary.input_drift + summary.prediction_drift

# ---------------------------------------------------------------------------
# Routes — Admin
# ---------------------------------------------------------------------------

@app.delete(
    "/cache",
    tags=["Admin"],
    summary="Xóa toàn bộ cache model",
)
def clear_cache():
    keys = _cache.keys()
    _cache.clear()
    return {"detail": "Cache đã được xóa.", "evicted": keys}


@app.delete(
    "/cache/{model_key}",
    tags=["Admin"],
    summary="Xóa một model khỏi cache",
)
def evict_model(model_key: ModelKey):
    removed = _cache.delete(model_key)
    if not removed:
        raise HTTPException(
            status_code=404,
            detail=f"Model '{model_key}' không có trong cache.",
        )
    return {"detail": f"Model '{model_key}' đã được xóa khỏi cache."}

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "deploy:app",
        host=dcfg.HOST,
        port=dcfg.PORT,
        workers=dcfg.WORKERS,
        reload=dcfg.RELOAD,
        log_level=dcfg.LOG_LEVEL,
    )
