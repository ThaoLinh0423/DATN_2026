# configs/deploy_config.py
"""
Deployment configuration cho Air Quality Forecast API.

Mọi giá trị đều có thể override qua biến môi trường, giúp cùng một Docker
image hoạt động ở dev / staging / production mà không cần build lại.

Cách dùng
---------
    import configs.deploy_config as dcfg
    host = dcfg.HOST
    port = dcfg.PORT

Biến môi trường
---------------
API_HOST            str     "0.0.0.0"
API_PORT            int     8000
API_WORKERS         int     1        # >1 worker vô hiệu hoá in-process LRU cache
API_RELOAD          bool    false    # Chỉ dùng khi dev
API_LOG_LEVEL       str     "info"   # debug | info | warning | error

ENABLED_MODELS      str     ""       # Danh sách cách nhau dấu phẩy, "" = bật tất cả
                                     # VD: "lstm,gru,bilstm"
MAX_CACHED_MODELS   int     5        # Số model tối đa giữ trong RAM (LRU eviction)

CORS_ORIGINS        str     "*"      # "*" = mở hoàn toàn
                                     # VD: "http://localhost:3000,https://app.example.com"
"""
from __future__ import annotations

import os
from pathlib import Path


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value not in (None, "") else default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value not in (None, "") else default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return value.lower() == "true"

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

HOST:      str  = os.getenv("API_HOST",      "0.0.0.0")
PORT:      int  = int(os.getenv("API_PORT",  "8000"))
WORKERS:   int  = int(os.getenv("API_WORKERS", "1"))
RELOAD:    bool = os.getenv("API_RELOAD", "false").lower() == "true"
LOG_LEVEL: str  = os.getenv("API_LOG_LEVEL", "info")

# ---------------------------------------------------------------------------
# Model selection
# ---------------------------------------------------------------------------

_ALL_SUPPORTED: list[str] = ["lstm", "gru", "bilstm", "informer", "arima"]

_env_models: str = os.getenv("ENABLED_MODELS", "").strip()

if _env_models:
    ENABLED_MODELS: list[str] = [m.strip() for m in _env_models.split(",") if m.strip()]
    _unknown = set(ENABLED_MODELS) - set(_ALL_SUPPORTED)
    if _unknown:
        raise ValueError(
            f"deploy_config: ENABLED_MODELS chứa model không hợp lệ: {_unknown}. "
            f"Các model hợp lệ: {_ALL_SUPPORTED}"
        )
else:
    ENABLED_MODELS = list(_ALL_SUPPORTED)

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

# Số model tối đa được giữ trong RAM. Model ít dùng nhất sẽ bị đẩy ra (LRU).
MAX_CACHED_MODELS: int = _env_int("MAX_CACHED_MODELS", 5)

# 0 = use the full df_model returned by get_data().
FORECAST_INPUT_POINTS: int = _env_int("FORECAST_INPUT_POINTS", 0)

# 0 = return the full horizon produced by the model.
FORECAST_OUTPUT_POINTS: int = _env_int("FORECAST_OUTPUT_POINTS", 0)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

# ---------------------------------------------------------------------------
# Drift monitoring
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
MONITORING_OUTPUT_DIR: Path = Path(
    os.getenv("MONITORING_OUTPUT_DIR", str(BASE_DIR / "outputs" / "monitoring"))
)
DRIFT_BASELINE_DIR: Path = Path(
    os.getenv("DRIFT_BASELINE_DIR", str(BASE_DIR / "outputs" / "drift"))
)
DRIFT_ENABLED: bool = _env_bool("DRIFT_ENABLED", True)
DRIFT_WINDOW_SIZE: int = _env_int("DRIFT_WINDOW_SIZE", 50)
DRIFT_HISTORY_LIMIT: int = _env_int("DRIFT_HISTORY_LIMIT", 200)
DRIFT_RECORD_LIMIT: int = _env_int("DRIFT_RECORD_LIMIT", 50000)
DRIFT_MIN_SAMPLES: int = _env_int("DRIFT_MIN_SAMPLES", 10)
DRIFT_PSI_WARNING: float = _env_float("DRIFT_PSI_WARNING", 5.0)
DRIFT_PSI_ALERT: float = _env_float("DRIFT_PSI_ALERT", 10.0)
