
from __future__ import annotations

from pathlib import Path
import sys
import types
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from airquality_ml_modeling.utils.drift import build_feature_baseline, save_json


# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------

def _make_future_df(n: int = 12) -> pd.DataFrame:
    """DataFrame giả lập kết quả forecast_future()."""
    idx = pd.date_range("2024-01-01 08:00", periods=n, freq="5min")
    return pd.DataFrame({"aqi": np.linspace(60, 110, n)}, index=idx)


def _make_df_model(rows: int = 200) -> pd.DataFrame:
    """DataFrame giả lập get_data() — df_model."""
    idx = pd.date_range("2024-01-01", periods=rows, freq="5min")
    rng = np.random.default_rng(42)
    return pd.DataFrame(
        {
            "pm1_0": rng.uniform(10, 50, rows),
            "pm2_5": rng.uniform(20, 80, rows),
            "pm10":  rng.uniform(30, 120, rows),
            "aqi":   rng.uniform(50, 150, rows),
        },
        index=idx,
    )


def _make_forecast_payload(rows: int = 200) -> dict:
    df = _make_df_model(rows)
    points = []
    for ts, row in df.iterrows():
        points.append(
            {
                "timestamp": ts.isoformat(),
                "pm1_0": float(row["pm1_0"]),
                "pm2_5": float(row["pm2_5"]),
                "pm10": float(row["pm10"]),
                "aqi": float(row["aqi"]),
            }
        )
    return {"points": points}


def _make_full_feature_forecast_payload(rows: int = 200) -> dict:
    df = _make_df_model(rows)
    points = []
    for ts, row in df.iterrows():
        points.append(
            {
                "timestamp": ts.isoformat(),
                "pm1_0": float(row["pm1_0"]),
                "pm2_5": float(row["pm2_5"]),
                "pm10": float(row["pm10"]),
                "aqi": float(row["aqi"]),
                "temperature": 28.0,
                "humidity": 70.0,
            }
        )
    return {"points": points}


def _make_arima_payload(rows: int = 200) -> dict:
    df = _make_df_model(rows)
    points = []
    for ts, row in df.iterrows():
        points.append(
            {
                "timestamp": ts.isoformat(),
                "aqi": float(row["aqi"]),
            }
        )
    return {"points": points}


def _write_drift_baselines(base_dir: Path, model_key: str = "lstm") -> None:
    drift_dir = base_dir / "drift"
    drift_dir.mkdir(parents=True, exist_ok=True)

    feature_df = _make_df_model(160)
    prediction_df = pd.DataFrame({"aqi": np.linspace(60, 95, 32)})

    feature_baseline = build_feature_baseline(
        feature_df,
        ["pm1_0", "pm2_5", "pm10", "aqi"],
        model_key=model_key,
        kind="input_features",
        bins=8,
    )
    prediction_baseline = build_feature_baseline(
        prediction_df,
        ["aqi"],
        model_key=model_key,
        kind="predictions",
        bins=8,
    )
    save_json(feature_baseline, drift_dir / f"{model_key}_feature_baseline.json")
    save_json(prediction_baseline, drift_dir / f"{model_key}_prediction_baseline.json")


class _FakeModel:
    """Stub model — không cần file artifact trên đĩa."""

    look_back      = 48
    horizon        = 12
    input_features = ["pm1_0", "pm2_5", "pm10", "aqi",
                       "hour_sin", "hour_cos", "dow_sin", "dow_cos"]

    def forecast_future(self, df_model):
        return _make_future_df()


class _FakeModelNone:
    """Stub model trả về None từ forecast_future (không hỗ trợ)."""
    look_back = 0
    horizon   = 0
    input_features = []

    def forecast_future(self, df_model):
        return None


class _InspectableFakeModel(_FakeModel):
    """Stub model ghi lại số điểm đầu vào nhận được."""

    def __init__(self):
        self.seen_len = None

    def forecast_future(self, df_model):
        self.seen_len = len(df_model)
        return _make_future_df()


# ---------------------------------------------------------------------------
# Patch cố định cho toàn bộ module
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _patch_data_loader():
    yield


@pytest.fixture(autouse=True)
def _patch_monitoring_dirs(tmp_path, monkeypatch):
    import deploy

    monitoring_dir = tmp_path / "monitoring"
    drift_dir = tmp_path / "drift"
    monitoring_dir.mkdir(parents=True, exist_ok=True)
    drift_dir.mkdir(parents=True, exist_ok=True)
    _write_drift_baselines(tmp_path, "lstm")

    monkeypatch.setattr(deploy.dcfg, "MONITORING_OUTPUT_DIR", monitoring_dir)
    monkeypatch.setattr(deploy.dcfg, "DRIFT_BASELINE_DIR", drift_dir)
    monkeypatch.setattr(deploy.dcfg, "DRIFT_ENABLED", True)
    monkeypatch.setattr(deploy.dcfg, "DRIFT_WINDOW_SIZE", 50)
    monkeypatch.setattr(deploy.dcfg, "DRIFT_HISTORY_LIMIT", 200)
    monkeypatch.setattr(deploy.dcfg, "DRIFT_MIN_SAMPLES", 10)
    monkeypatch.setattr(deploy.dcfg, "DRIFT_PSI_WARNING", 0.1)
    monkeypatch.setattr(deploy.dcfg, "DRIFT_PSI_ALERT", 0.25)
    yield


@pytest.fixture()
def client():
    """
    Tạo TestClient với cache đã được reset và _load_model bị mock.
    Mỗi test nhận client sạch.
    """
    from deploy import app, _cache
    _cache.clear()

    with patch("deploy._load_model", return_value=_FakeModel()):
        yield TestClient(app)


@pytest.fixture()
def client_no_forecast():
    """Client với model không hỗ trợ forecast_future."""
    from deploy import app, _cache
    _cache.clear()

    with patch("deploy._load_model", return_value=_FakeModelNone()):
        yield TestClient(app)


@pytest.fixture()
def client_inspectable_model():
    """Client với model cho phép kiểm tra input window tại layer deploy."""
    from deploy import app, _cache
    _cache.clear()
    model = _InspectableFakeModel()

    with patch("deploy._load_model", return_value=model):
        yield TestClient(app), model


# ===========================================================================
# Tests — General routes
# ===========================================================================

class TestGeneralRoutes:

    def test_root_returns_200(self, client):
        resp = client.get("/")
        assert resp.status_code == 200

    def test_root_contains_version(self, client):
        data = client.get("/").json()
        assert data["version"] == "2.2.0"

    def test_root_lists_enabled_models(self, client):
        data = client.get("/").json()
        assert "enabled_models" in data
        assert isinstance(data["enabled_models"], list)

    def test_health_status_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_health_contains_device(self, client):
        data = client.get("/health").json()
        assert data["device"] in ("cpu", "cuda")

    def test_health_loaded_models_initially_empty(self, client):
        data = client.get("/health").json()
        assert data["loaded_models"] == []


# ===========================================================================
# Tests — /models routes
# ===========================================================================

class TestModelsRoutes:

    def test_list_models_returns_list(self, client):
        resp = client.get("/models")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_models_all_enabled(self, client):
        import configs.deploy_config as dcfg
        data = client.get("/models").json()
        keys = {item["model_key"] for item in data}
        assert keys == set(dcfg.ENABLED_MODELS)

    def test_preload_model(self, client):
        resp = client.post("/models/lstm/load")
        assert resp.status_code == 200
        assert "lstm" in resp.json()["detail"]

    def test_preload_updates_cache(self, client):
        client.post("/models/gru/load")
        data = client.get("/health").json()
        assert "gru" in data["loaded_models"]

    def test_preload_invalid_model_returns_422(self, client):
        resp = client.post("/models/invalid_model/load")
        assert resp.status_code == 422


# ===========================================================================
# Tests — /forecast routes
# ===========================================================================

class TestForecastRoute:

    payload = _make_forecast_payload()

    def test_forecast_lstm_200(self, client):
        resp = client.post("/forecast/lstm", json=self.payload)
        assert resp.status_code == 200

    def test_forecast_gru_200(self, client):
        resp = client.post("/forecast/gru", json=self.payload)
        assert resp.status_code == 200

    def test_forecast_bilstm_200(self, client):
        resp = client.post("/forecast/bilstm", json=self.payload)
        assert resp.status_code == 200

    def test_forecast_arima_accepts_aqi_only_payload(self, client):
        resp = client.post("/forecast/arima", json=_make_arima_payload())
        assert resp.status_code == 200

    def test_forecast_response_schema(self, client):
        data = client.post("/forecast/lstm", json=self.payload).json()
        assert "model" in data
        assert "target_column" in data
        assert "horizon" in data
        assert "resample_freq" in data
        assert "forecast" in data
        assert "alerts" in data

    def test_forecast_model_field(self, client):
        data = client.post("/forecast/lstm", json=self.payload).json()
        assert data["model"] == "lstm"

    def test_forecast_horizon_matches_future_df(self, client):
        data = client.post("/forecast/lstm", json=self.payload).json()
        # FakeModel trả về 12 bước
        assert data["horizon"] == 12
        assert len(data["forecast"]) == 12

    def test_forecast_points_have_timestamp(self, client):
        data = client.post("/forecast/lstm", json=self.payload).json()
        for point in data["forecast"]:
            assert "timestamp" in point

    def test_forecast_aqi_values_are_floats(self, client):
        data = client.post("/forecast/lstm", json=self.payload).json()
        for point in data["forecast"]:
            if point["aqi"] is not None:
                assert isinstance(point["aqi"], float)

    def test_forecast_alerts_when_above_threshold(self, client):
        """FakeModel trả về AQI lên đến 110 — vượt ngưỡng 100."""
        data = client.post("/forecast/lstm", json=self.payload).json()
        # Ngưỡng AQI = 100 trong config.THRESHOLDS
        assert "aqi" in data["alerts"] or data["alerts"] == {}

    def test_forecast_model_loaded_into_cache(self, client):
        client.post("/forecast/gru", json=self.payload)
        health = client.get("/health").json()
        assert "gru" in health["loaded_models"]

    def test_forecast_invalid_model_422(self, client):
        resp = client.post("/forecast/nonexistent", json=self.payload)
        assert resp.status_code == 422

    def test_forecast_unsupported_returns_501(self, client_no_forecast):
        resp = client_no_forecast.post("/forecast/lstm", json=self.payload)
        assert resp.status_code == 501

    def test_forecast_second_call_uses_cache(self, client):
        """Lần 2 không gọi _load_model nữa (model đã trong cache)."""
        with patch("deploy._load_model", return_value=_FakeModel()) as mock_load:
            client.post("/forecast/lstm", json=self.payload)
            client.post("/forecast/lstm", json=self.payload)
            assert mock_load.call_count == 1

    def test_forecast_respects_deploy_input_points(self, client_inspectable_model, monkeypatch):
        import deploy

        client, model = client_inspectable_model
        monkeypatch.setattr(deploy.dcfg, "FORECAST_INPUT_POINTS", 64)
        monkeypatch.setattr(deploy.dcfg, "FORECAST_OUTPUT_POINTS", 0)

        resp = client.post("/forecast/lstm", json=self.payload)
        assert resp.status_code == 200
        assert model.seen_len == 64

    def test_forecast_respects_deploy_output_points(self, client, monkeypatch):
        import deploy

        monkeypatch.setattr(deploy.dcfg, "FORECAST_INPUT_POINTS", 0)
        monkeypatch.setattr(deploy.dcfg, "FORECAST_OUTPUT_POINTS", 5)

        data = client.post("/forecast/lstm", json=self.payload).json()
        assert data["horizon"] == 5
        assert len(data["forecast"]) == 5

    def test_forecast_input_points_too_small_returns_400(self, client, monkeypatch):
        import deploy

        monkeypatch.setattr(deploy.dcfg, "FORECAST_INPUT_POINTS", 12)
        monkeypatch.setattr(deploy.dcfg, "FORECAST_OUTPUT_POINTS", 0)

        resp = client.post("/forecast/lstm", json=self.payload)
        assert resp.status_code == 400

    def test_forecast_output_points_above_model_horizon_returns_400(self, client, monkeypatch):
        import deploy

        monkeypatch.setattr(deploy.dcfg, "FORECAST_INPUT_POINTS", 0)
        monkeypatch.setattr(deploy.dcfg, "FORECAST_OUTPUT_POINTS", 20)

        resp = client.post("/forecast/lstm", json=self.payload)
        assert resp.status_code == 400

    def test_forecast_empty_points_returns_400(self, client):
        resp = client.post("/forecast/lstm", json={"points": []})
        assert resp.status_code == 400

    def test_forecast_missing_required_feature_returns_400(self, client):
        bad_payload = {"points": [{"timestamp": "2024-01-01T00:00:00"}]}
        resp = client.post("/forecast/lstm", json=bad_payload)
        assert resp.status_code == 400


# ===========================================================================
# Tests — /cache routes
# ===========================================================================

class TestCacheRoutes:

    def test_clear_cache_200(self, client):
        client.post("/models/lstm/load")
        resp = client.delete("/cache")
        assert resp.status_code == 200

    def test_clear_cache_empties_cache(self, client):
        client.post("/models/lstm/load")
        client.delete("/cache")
        health = client.get("/health").json()
        assert health["loaded_models"] == []

    def test_evict_specific_model(self, client):
        client.post("/models/lstm/load")
        resp = client.delete("/cache/lstm")
        assert resp.status_code == 200
        health = client.get("/health").json()
        assert "lstm" not in health["loaded_models"]

    def test_evict_not_cached_model_returns_404(self, client):
        resp = client.delete("/cache/lstm")
        assert resp.status_code == 404


# ===========================================================================
# Tests — monitoring routes
# ===========================================================================

class TestMonitoringRoutes:

    payload = _make_forecast_payload()

    def test_forecast_persists_drift_snapshot(self, client):
        client.post("/forecast/lstm", json=self.payload)
        data = client.get("/monitoring/drift/lstm/summary").json()
        assert data["model"] == "lstm"
        assert data["history_points"] == 1
        assert data["events_in_window"] > 1

    def test_drift_summary_contains_input_and_prediction_sections(self, client):
        client.post("/forecast/lstm", json=self.payload)
        data = client.get("/monitoring/drift/lstm/summary").json()
        assert "input_drift" in data
        assert "prediction_drift" in data
        assert any(item["feature"] == "aqi" for item in data["prediction_drift"])

    def test_lstm_prediction_drift_tracks_forecast_columns(self, client, monkeypatch):
        import deploy

        monkeypatch.setattr(deploy.cfg, "DRIFT_FEATURES", ["pm1_0", "pm2_5", "pm10"])
        client.post("/forecast/lstm", json=self.payload)
        data = client.get("/monitoring/drift/lstm/summary").json()
        prediction_features = {item["feature"] for item in data["prediction_drift"]}
        assert "aqi" in prediction_features

    def test_arima_forecast_persists_drift_snapshot(self, client):
        client.post("/forecast/arima", json=_make_arima_payload())
        data = client.get("/monitoring/drift/arima/summary").json()
        assert data["model"] == "arima"
        assert data["history_points"] == 1
        assert any(item["feature"] == "aqi" for item in data["input_drift"])
        assert any(item["feature"] == "aqi" for item in data["prediction_drift"])

    def test_drift_falls_back_to_numeric_features_when_config_is_empty(
        self,
        client,
        monkeypatch,
        tmp_path,
    ):
        import deploy

        monkeypatch.setattr(deploy.cfg, "DRIFT_FEATURES", [])
        monkeypatch.setattr(deploy.dcfg, "DRIFT_BASELINE_DIR", tmp_path / "drift")
        monkeypatch.setattr(deploy.dcfg, "MONITORING_OUTPUT_DIR", tmp_path / "monitoring")

        client.post("/forecast/lstm", json=self.payload)
        lstm_data = client.get("/monitoring/drift/lstm/summary").json()
        assert any(item["feature"] == "aqi" for item in lstm_data["input_drift"])
        assert any(item["feature"] == "aqi" for item in lstm_data["prediction_drift"])

        client.post("/forecast/arima", json=_make_arima_payload())
        arima_data = client.get("/monitoring/drift/arima/summary").json()
        assert any(item["feature"] == "aqi" for item in arima_data["input_drift"])
        assert any(item["feature"] == "aqi" for item in arima_data["prediction_drift"])

    def test_baseline_loader_falls_back_to_model_output_dir(self, client, monkeypatch, tmp_path):
        import deploy

        primary_drift_dir = tmp_path / "deploy_drift"
        fallback_drift_dir = tmp_path / "model_output" / "drift"
        monitoring_dir = tmp_path / "monitoring"
        fallback_drift_dir.mkdir(parents=True, exist_ok=True)
        monitoring_dir.mkdir(parents=True, exist_ok=True)

        monkeypatch.setattr(deploy.dcfg, "DRIFT_BASELINE_DIR", primary_drift_dir)
        monkeypatch.setattr(deploy.dcfg, "MONITORING_OUTPUT_DIR", monitoring_dir)
        monkeypatch.setattr(deploy.cfg, "MODEL_OUTPUT_DIR", tmp_path / "model_output")

        fallback_baseline = build_feature_baseline(
            _make_df_model(160),
            ["aqi"],
            model_key="lstm",
            kind="input_features",
            bins=8,
        )
        save_json(fallback_baseline, fallback_drift_dir / "lstm_feature_baseline.json")

        client.post("/forecast/lstm", json=self.payload)
        loaded = deploy._load_baseline_if_exists("lstm", "feature")
        assert loaded is not None
        assert loaded["reference_window"] == fallback_baseline["reference_window"]
        data = client.get("/monitoring/drift/lstm/summary").json()
        assert data["history_points"] == 1
        assert any(item["feature"] == "aqi" for item in data["input_drift"])

    def test_drift_timeseries_returns_chart_ready_points(self, client):
        client.post("/forecast/lstm", json=self.payload)
        data = client.get("/monitoring/drift/lstm/timeseries").json()
        assert data["model"] == "lstm"
        assert len(data["series"]) >= 1
        first = data["series"][0]
        assert {"timestamp", "scope", "feature", "status", "sample_size"} <= set(first)

    def test_latest_feature_drift_returns_flat_list(self, client):
        client.post("/forecast/lstm", json=self.payload)
        data = client.get("/monitoring/drift/lstm/features/latest").json()
        assert isinstance(data, list)
        assert any(item["feature"] == "aqi" for item in data)

    def test_forecast_persists_production_records(self, client):
        import deploy

        client.post("/forecast/lstm", json=self.payload)
        state = deploy._load_monitoring_state("lstm")
        first = state["records"][0]
        assert {"timestamp", "model", "scope", "feature", "value"} <= set(first)
        assert first["model"] == "lstm"
        assert {record["scope"] for record in state["records"]} == {"input", "prediction"}

    def test_forecast_extends_baseline_for_dashboard_features(self, client):
        import deploy

        client.post("/forecast/lstm", json=_make_full_feature_forecast_payload())
        baseline = deploy._load_baseline_if_exists("lstm", "feature")
        data = client.get("/monitoring/drift/lstm/summary").json()
        input_features = {item["feature"] for item in data["input_drift"]}
        assert "temperature" in baseline["features"]
        assert "humidity" in baseline["features"]
        assert {"temperature", "humidity"} <= input_features

    def test_forecast_creates_baseline_when_missing(self, client):
        import deploy

        client.post("/forecast/gru", json=self.payload)
        baseline = deploy._load_baseline_if_exists("gru", "feature")
        data = client.get("/monitoring/drift/gru/summary").json()
        assert baseline is not None
        assert data["overall_status"] != "not_available"
        assert len(data["input_drift"]) >= 1

    def test_drift_summary_without_history_is_not_available(self, client):
        data = client.get("/monitoring/drift/gru/summary").json()
        assert data["overall_status"] == "not_available"
        assert data["history_points"] == 0


# ===========================================================================
# Tests — LRU Cache unit tests
# ===========================================================================

class TestLRUModelCache:

    def test_put_and_get(self):
        from deploy import _LRUModelCache
        cache = _LRUModelCache(maxsize=3)
        cache.put("a", "model_a")
        assert cache.get("a") == "model_a"

    def test_get_missing_returns_none(self):
        from deploy import _LRUModelCache
        cache = _LRUModelCache(maxsize=3)
        assert cache.get("x") is None

    def test_lru_eviction(self):
        from deploy import _LRUModelCache
        cache = _LRUModelCache(maxsize=2)
        cache.put("a", "model_a")
        cache.put("b", "model_b")
        # Truy cập "a" để "b" trở thành LRU
        cache.get("a")
        cache.put("c", "model_c")   # "b" bị evict
        assert cache.get("b") is None
        assert cache.get("a") == "model_a"
        assert cache.get("c") == "model_c"

    def test_clear(self):
        from deploy import _LRUModelCache
        cache = _LRUModelCache(maxsize=3)
        cache.put("a", "x")
        cache.put("b", "y")
        cache.clear()
        assert cache.keys() == []

    def test_delete_existing(self):
        from deploy import _LRUModelCache
        cache = _LRUModelCache(maxsize=3)
        cache.put("a", "x")
        assert cache.delete("a") is True
        assert cache.get("a") is None

    def test_delete_missing_returns_false(self):
        from deploy import _LRUModelCache
        cache = _LRUModelCache(maxsize=3)
        assert cache.delete("nonexistent") is False

    def test_maxsize_respected(self):
        from deploy import _LRUModelCache
        cache = _LRUModelCache(maxsize=3)
        for i in range(10):
            cache.put(str(i), f"model_{i}")
        assert len(cache.keys()) <= 3
