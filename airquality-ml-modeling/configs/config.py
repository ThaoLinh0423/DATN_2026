# config.py
import os
from pathlib import Path


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value not in (None, "") else default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value not in (None, "") else default


def _env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def _env_csv(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BASE_DATA_DIR = _env_str("BASE_DATA_DIR", os.path.join(BASE_DIR, "data"))
BASE_OUTPUT_DIR = _env_str("BASE_OUTPUT_DIR", os.path.join(BASE_DIR, "outputs"))

# --- Data & paths ---
CSV_PATH = _env_str("CSV_PATH", os.path.join(BASE_DATA_DIR, "raw", "air_quality_core (2).csv"))
TIMESTAMP_COL = _env_str("TIMESTAMP_COL", "timestamp")
MODEL_OUTPUT_DIR = Path(_env_str("MODEL_OUTPUT_DIR", BASE_OUTPUT_DIR)).resolve()

DATA_MAX_ROWS = _env_int("DATA_MAX_ROWS", 0)

# --- Location selection ---
AGG_ALL = True          # True: aggregate all locations; False: use exact lon/lat
LOCATION_LONG = None
LOCATION_LAT = None

# --- Features ---
FEATURES = ["pm1_0", "pm2_5", "pm10", "aqi"]
TARGET_COLUMN = "aqi"   # primary target column for single-target models (ARIMA)

# --- Resampling ---
RESAMPLE_FREQ = "5min" #"5min"         # '5T', 'H', 'D', ...
FILL_METHOD = _env_str("FILL_METHOD", "interpolate") # 'interpolate' | 'ffill' | 'bfill' | 'drop'

# --- Train/test split ---
TRAIN_SPLIT = _env_float("TRAIN_SPLIT", 0.8)         # fraction of data used for training

# --- LSTM hyperparameters (PyTorch) ---
LOOK_BACK        = _env_int("LOOK_BACK", 48)
HORIZON          = _env_int("HORIZON", 12)
LSTM_HIDDEN_SIZE = _env_int("LSTM_HIDDEN_SIZE", 200)
LSTM_NUM_LAYERS  = _env_int("LSTM_NUM_LAYERS", 4)
LSTM_DROPOUT     = _env_float("LSTM_DROPOUT", 0.2)
EPOCHS           = _env_int("EPOCHS", 500)
BATCH_SIZE       = _env_int("BATCH_SIZE", 32)
PATIENCE         = _env_int("PATIENCE", 30)
MIN_DELTA        = 1e-4

# --- ARIMA hyperparameters ---
ARIMA_ORDER = (1, 1, 1)     # (p, d, q)

# --- Model save ---
MODEL_NAME = _env_str("MODEL_NAME", "lstm_multifeature")
RANDOM_SEED = 42

# --- Forecast mode (LSTM only) ---
FORECAST_MODE = "direct"    # 'direct' | 'iterative'

# --- Alert thresholds ---
THRESHOLDS = {"pm2_5": 50, "aqi": 100}

# --- Drift monitoring / baseline export ---
DRIFT_FEATURES = _env_csv(
    "DRIFT_FEATURES",
    ["pm1_0", "pm2_5", "pm10", "aqi", "temperature", "humidity"],
)
DRIFT_NUM_BINS = _env_int("DRIFT_NUM_BINS", 10)
DRIFT_MIN_SAMPLES = _env_int("DRIFT_MIN_SAMPLES", 10)

# --- Which models to run ---
RUN_MODELS = _env_csv("RUN_MODELS", ["lstm", "gru", "informer"])      # options: ["arima", "lstm", "bilstm", "gru", "informer"]

VERBOSE = 1

# --- GRU hyperparameters (PyTorch) ---
GRU_UNITS    = [_env_int("GRU_UNIT_1", 128), _env_int("GRU_UNIT_2", 32)]
GRU_DROPOUT  = _env_float("GRU_DROPOUT", 0.0)
LR           = _env_float("LR", 1e-3)
LR_PATIENCE  = _env_int("LR_PATIENCE", 10)

# --- BiLSTM hyperparameters (PyTorch) ---
BILSTM_HIDDEN_SIZES = [
    _env_int("BILSTM_HIDDEN_1", 128),
    _env_int("BILSTM_HIDDEN_2", 64),
    _env_int("BILSTM_HIDDEN_3", 32),
]
BILSTM_DROPOUT      = _env_float("BILSTM_DROPOUT", 0.2)

# --- Informer hyperparameters (PyTorch) ---
INFORMER_MODEL_NAME   = _env_str("INFORMER_MODEL_NAME", "informer")
INFORMER_LABEL_LEN    = _env_int("INFORMER_LABEL_LEN", 48)
INFORMER_D_MODEL      = _env_int("INFORMER_D_MODEL", 128)
INFORMER_N_HEADS      = _env_int("INFORMER_N_HEADS", 4)
INFORMER_E_LAYERS     = _env_int("INFORMER_E_LAYERS", 2)
INFORMER_D_LAYERS     = _env_int("INFORMER_D_LAYERS", 1)
INFORMER_D_FF         = _env_int("INFORMER_D_FF", 256)
INFORMER_FACTOR       = _env_int("INFORMER_FACTOR", 3)
INFORMER_DROPOUT      = _env_float("INFORMER_DROPOUT", 0.1)
INFORMER_LR           = _env_float("INFORMER_LR", 1e-4)
INFORMER_WEIGHT_DECAY = _env_float("INFORMER_WEIGHT_DECAY", 1e-5)
