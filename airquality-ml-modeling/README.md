# airquality-ml-modeling

Time series forecasting for air quality metrics (PM1.0, PM2.5, PM10, AQI, temperature, humidity, heat index) using multiple machine learning models. Exposes a FastAPI inference endpoint and supports retraining via a separate script.
The deployment layer can also track input drift and prediction drift using PSI-based monitoring artifacts for user-facing charts.

---

## Models

| Key      | Architecture              | Framework |
|----------|---------------------------|-----------|
| `lstm`   | Stacked LSTM              | PyTorch   |
| `gru`    | Stacked GRU               | PyTorch   |
| `bilstm` | Bidirectional LSTM        | PyTorch   |
| `arima`  | ARIMA (univariate, AQI)   | statsmodels |

All deep learning models support multi-step, multi-feature, multi-target forecasting for all PM indicators (pm1_0, pm2_5, pm10, aqi). ARIMA targets a single column (`TARGET_COLUMN` in config).

---

## Project structure

```
airquality-ml-modeling/
├── configs/
│   └── config.py          # All hyperparameters and paths
├── data/
│   └── raw/
│       └── air_quality_core.csv   # Input data (not tracked by git)
├── notebooks/
├── outputs/               # Saved models, scalers, metrics, plots (not tracked by git)
├── src/
│   └── airquality_ml_modeling/
│       ├── data_loader/
│       │   └── loader.py
│       ├── models/
│       │   ├── arima/
│       │   ├── lstm/
│       │   ├── gru/
│       │   ├── bilstm/
│       │   ├── base_model.py
│       │   └── __init__.py
│       └── utils/
│           └── metrics.py
├── deploy.py              # FastAPI application
├── retrain.py             # Training orchestrator
├── Dockerfile
├── Dockerfile.retrain
├── docker-compose.yml
├── pyproject.toml
└── uv.lock
```

---

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (recommended)

---

## Installation

### Using uv (recommended)

```bash
uv sync
```

### Using pip

```bash
python -m venv .venv
source .venv/bin/activate      # Linux/macOS
.venv\Scripts\activate         # Windows

pip install -e .
```

---

## Configuration

All settings are in `configs/config.py`. Key parameters:

| Parameter       | Default                         | Description                                |
|-----------------|---------------------------------|--------------------------------------------|
| `CSV_PATH`      | `data/raw/air_quality_core.csv` | Input data path                            |
| `FEATURES`      | pm1_0, pm2_5, ...               | Columns used as model input/output         |
| `TARGET_COLUMN` | `aqi`                           | Target for univariate models (ARIMA)       |
| `RESAMPLE_FREQ` | `h`                             | Resampling frequency                       |
| `TRAIN_SPLIT`   | `0.8`                           | Fraction of data used for training         |
| `LOOK_BACK`     | `24`                            | Sliding window size (steps)                |
| `HORIZON`       | `12`                            | Forecast steps ahead                       |
| `EPOCHS`        | `500`                           | Max training epochs                        |
| `PATIENCE`      | `30`                            | Early stopping patience                    |
| `RUN_MODELS`    | `["lstm"]`                      | Models to train in `retrain.py`            |
| `THRESHOLDS`    | pm2_5: 50, aqi: 100             | Alert thresholds used in API responses     |

---

## Training

Place the input CSV at `data/raw/air_quality_core.csv`, set `RUN_MODELS` in `config.py`, then run:

```bash
uv run python retrain.py
```

Outputs written to `outputs/`:

| File | Description |
|------|-------------|
| `{model}_metrics.json` | Per-feature MAE, RMSE, MAPE |
| `{model}_backtest_pred.csv` | Predictions on the test split |
| `{model}_future_forecast.csv` | Forecast beyond the last observed timestamp |
| `drift/{model}_feature_baseline.json` | Reference distribution for training input features |
| `drift/{model}_prediction_baseline.json` | Reference distribution for backtest predictions |
| `drift/{model}_residual_baseline.json` | Reference residual distribution for later analysis |
| `drift/{model}_training_report.json` | Metadata linking drift baselines to the retrain run |
| `{MODEL_NAME}_lstm.pt` / `_gru.pt` / `bilstm_bilstm.pt` | PyTorch model weights |
| `{name}_scaler_X.joblib` / `_scaler_y.joblib` | Fitted MinMaxScalers |
| `{model}_plot.png` | Backtest + future forecast chart |

---

## API

Start the inference server (requires trained model artifacts in `outputs/`):

```bash
uv run uvicorn deploy:app --host 0.0.0.0 --port 8000
```

### Endpoints

| Method | Path                    | Description                           |
|--------|-------------------------|---------------------------------------|
| GET    | `/health`               | Server status and loaded model list   |
| POST   | `/forecast/{model_key}` | Run forecast from backend-supplied historical points |
| DELETE | `/cache`                | Evict all cached model instances      |

`model_key` accepts: `lstm`, `gru`, `bilstm`.

Example:

```bash
curl -X POST http://localhost:8000/forecast/lstm \
  -H "Content-Type: application/json" \
  -d '{
    "points": [
      {
        "timestamp": "2026-02-26T23:30:00+00:00",
        "pm1_0": 34.2,
        "pm2_5": 58.1,
        "pm10": 76.8,
        "aqi": 118.4
      }
    ]
  }'
```

Response includes `forecast` (list of timestamped predictions for all PM targets: pm1_0, pm2_5, pm10, aqi) and `alerts` (threshold exceedances).

### Drift monitoring

Each forecast call can append monitoring state under `outputs/monitoring/` when matching drift baselines exist in `outputs/drift/`.

Available endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/monitoring/drift/{model_key}/summary` | Latest drift status for input features and predictions |
| GET | `/monitoring/drift/{model_key}/timeseries` | Historical PSI points for chart rendering |
| GET | `/monitoring/drift/{model_key}/features/latest` | Flat latest-feature list for tables or badges |

Default drift semantics:

PSI is a distance score, not a percentage. It can be greater than `1.0`,
especially when comparing a small forecast window against a larger baseline.

| PSI range | Status |
|-----------|--------|
| `< 5.0` | stable |
| `5.0 - <10.0` | warning |
| `>= 10.0` | drift |

Relevant deployment environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DRIFT_ENABLED` | `true` | Enable or disable monitoring writes |
| `DRIFT_WINDOW_SIZE` | `50` | Number of recent forecast events aggregated per snapshot |
| `DRIFT_HISTORY_LIMIT` | `200` | Maximum stored events and snapshots |
| `DRIFT_PSI_WARNING` | `5.0` | Warning threshold |
| `DRIFT_PSI_ALERT` | `10.0` | Drift threshold |
| `MONITORING_OUTPUT_DIR` | `outputs/monitoring` | Drift event and snapshot storage |
| `DRIFT_BASELINE_DIR` | `outputs/drift` | Location of retraining baseline files |

---

## Docker

Both images use a two-layer build strategy: dependencies are installed in a separate layer from source code. Changing only application code rebuilds in seconds without reinstalling libraries.

### Build and run API

```bash
docker compose up api
```

The API will be available at `http://localhost:8000`.

### Retrain inside Docker

```bash
docker compose run retrain
```

Both services share `./data` and `./outputs` via bind mounts, so models trained in the retrain container are immediately available to the API container.

### Reload models after retrain

```bash
curl -X DELETE http://localhost:8000/cache
```

The next forecast request will reload models from disk.

> **Note:** The first build downloads PyTorch CPU wheels (~200 MB). Subsequent builds reuse the uv download cache via `--mount=type=cache`, so only changed packages are re-fetched. BuildKit is required (enabled by default in Docker Desktop 23+).

---

## License

See [LICENSE](LICENSE).
