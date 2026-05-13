# RELEASE NOTES - v2.2.0

## Documentation update after deploy readiness

This documentation update reflects the verified deployed state after retraining and smoke-testing the model artifacts.

- Consolidated the integration contract into `openapi.yaml` for the deployed ML endpoints.
- Added `capability.md` to describe each model, its artifacts, internal inputs, and API outputs.
- Changed inference architecture to request-driven prediction via `POST /forecast/{model_key}`.
- Clarified that forecast input now comes from backend-supplied `points[]`, not from CSV.
- Added deploy-time forecast window controls: `FORECAST_INPUT_POINTS` and `FORECAST_OUTPUT_POINTS`.
- Recorded verified deploy status for `lstm`, `gru`, `bilstm`, `informer`, and `arima`.
- Documented that `Informer` requires `*_informer_meta.joblib` to restore architecture and metadata correctly during load.

Verified by smoke test:

- `deploy._load_model('lstm')` - OK
- `deploy._load_model('gru')` - OK
- `deploy._load_model('bilstm')` - OK
- `deploy._load_model('informer')` - OK
- `deploy._load_model('arima')` - OK
- real `POST /forecast/lstm` smoke test with backend-style payload, `FORECAST_INPUT_POINTS=64`, and `FORECAST_OUTPUT_POINTS=6` - OK
- `tests/test_deploy.py` - `42 passed`

---

## Overview

This release redesigned `deploy.py`, updated `configs/deploy_config.py`, added deployment-layer tests, and introduced fuller API documentation.

---

## File-by-file changes

### `deploy.py` - redesigned deployment layer

Problems in v2.1.0:

| # | Problem |
|---|---|
| 1 | Only imported 3 models: `lstm`, `gru`, `bilstm` |
| 2 | Did not use `deploy_config`; runtime values were effectively hardcoded |
| 3 | No CORS middleware |
| 4 | No bounded cache; plain dict could grow without limit |
| 5 | `ARIMA.load()` is an instance method and was not handled correctly |
| 6 | `Informer.load()` needs `meta.joblib`, but that load path was missing |
| 7 | No warm-up route to preload models |
| 8 | No route to evict a single model from cache |

Changes in v2.2.0:

- Full support for 5 models: `lstm`, `gru`, `bilstm`, `informer`, `arima`
- `_load_model()` now handles model-specific load behavior correctly
- `Informer` and `ARIMA` imports are guarded so the server can still boot when optional dependencies are unavailable
- `_MODEL_CLASSES` only exposes models that are both enabled and importable
- Added `_LRUModelCache` with `MAX_CACHED_MODELS`
- Added CORS configuration via `deploy_config.CORS_ORIGINS`
- Added:
  - `GET /models`
  - `POST /models/{model_key}/load`
  - `DELETE /cache`
  - `DELETE /cache/{model_key}`
- Added `enabled_models` to `HealthResponse`
- Added structured `AlertPoint` response objects

---

### `configs/deploy_config.py` - deployment configuration

- Added `arima` to the supported model list
- Clarified environment-variable driven runtime configuration
- Removed unused `ADMIN_TOKEN`

---

### `tests/test_deploy.py` - new deployment test suite

Coverage summary:

| Group | Tests | Scope |
|---|---:|---|
| `TestGeneralRoutes` | 6 | `/` and `/health` |
| `TestModelsRoutes` | 5 | `/models` and `/models/{key}/load` |
| `TestForecastRoute` | 12 | `/forecast/{key}` including schema and caching |
| `TestCacheRoutes` | 4 | `DELETE /cache` and `DELETE /cache/{key}` |
| `TestLRUModelCache` | 7 | `_LRUModelCache` unit tests |

Run with:

```bash
pytest tests/test_deploy.py -v
```

---

### `openapi.yaml` - initial OpenAPI document

- Added OpenAPI 3.1.0 documentation for the deployed API
- Documented schema fields, responses, and model-specific notes
- Compatible with Swagger UI and ReDoc

---

## Migration from v2.1.0

This is a breaking change for clients that previously used `GET /forecast/{model_key}`.

Clients must now:

1. Call `POST /forecast/{model_key}`
2. Send historical observations in `points[]`

The old `POST /cache/clear` flow should be replaced with `DELETE /cache` to align with the current API semantics.
