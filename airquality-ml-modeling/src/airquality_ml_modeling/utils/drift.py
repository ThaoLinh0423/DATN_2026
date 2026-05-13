from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _index_value_to_str(value):
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _clean_numeric(values) -> np.ndarray:
    arr = np.asarray(values, dtype=float).reshape(-1)
    return arr[np.isfinite(arr)]


def resolve_drift_feature_names(
    df: pd.DataFrame,
    configured_features: list[str] | None = None,
) -> list[str]:
    configured = list(configured_features or [])
    usable = [feature for feature in configured if feature in df.columns]
    if usable:
        return usable
    return [
        str(feature)
        for feature in df.columns
        if pd.api.types.is_numeric_dtype(df[feature])
    ]


def _make_histogram_edges(values: np.ndarray, bins: int) -> np.ndarray:
    values = _clean_numeric(values)
    if values.size == 0:
        return np.array([-0.5, 0.5], dtype=float)

    lo = float(np.min(values))
    hi = float(np.max(values))
    if np.isclose(lo, hi):
        delta = max(abs(lo) * 0.05, 1.0)
        return np.array([lo - delta, hi + delta], dtype=float)

    quantiles = np.linspace(0.0, 1.0, max(2, bins + 1))
    edges = np.quantile(values, quantiles)
    edges = np.unique(edges.astype(float))
    if edges.size < 2:
        delta = max(abs(lo) * 0.05, 1.0)
        return np.array([lo - delta, hi + delta], dtype=float)

    span = hi - lo
    edges[0] = lo - max(span * 0.05, 1e-6)
    edges[-1] = hi + max(span * 0.05, 1e-6)
    return edges


def _feature_summary(values, bins: int) -> dict:
    arr = _clean_numeric(values)
    edges = _make_histogram_edges(arr, bins)
    counts, _ = np.histogram(arr, bins=edges)

    if arr.size == 0:
        return {
            "sample_size": 0,
            "mean": None,
            "std": None,
            "min": None,
            "max": None,
            "quantiles": {},
            "bins": edges.tolist(),
            "counts": counts.astype(int).tolist(),
        }

    quantile_levels = [0.05, 0.25, 0.5, 0.75, 0.95]
    quantiles = {str(q): float(np.quantile(arr, q)) for q in quantile_levels}
    return {
        "sample_size": int(arr.size),
        "mean": float(np.mean(arr)),
        "std": float(np.std(arr)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "quantiles": quantiles,
        "bins": edges.tolist(),
        "counts": counts.astype(int).tolist(),
    }


def build_feature_baseline(
    df: pd.DataFrame,
    feature_names: list[str],
    *,
    model_key: str,
    kind: str,
    bins: int = 10,
) -> dict:
    usable = [feature for feature in feature_names if feature in df.columns]
    features = {
        feature: _feature_summary(df[feature].values, bins=bins)
        for feature in usable
    }
    window = {
        "start": _index_value_to_str(df.index.min()) if len(df.index) else None,
        "end": _index_value_to_str(df.index.max()) if len(df.index) else None,
        "sample_size": int(len(df)),
    }
    return {
        "model": model_key,
        "kind": kind,
        "generated_at": utc_now_iso(),
        "features": features,
        "reference_window": window,
    }


def save_json(obj: dict, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, default=str)


def load_json(path: str | Path) -> dict:
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _psi_from_histograms(reference_counts, current_counts, epsilon: float = 1e-6) -> float:
    ref = np.asarray(reference_counts, dtype=float)
    cur = np.asarray(current_counts, dtype=float)
    ref_total = ref.sum()
    cur_total = cur.sum()
    if ref_total <= 0 or cur_total <= 0:
        return 0.0

    ref = ref / ref_total
    cur = cur / cur_total
    ref = np.clip(ref, epsilon, None)
    cur = np.clip(cur, epsilon, None)
    return float(np.sum((cur - ref) * np.log(cur / ref)))


def compute_feature_psi(baseline_feature: dict, current_values) -> dict:
    arr = _clean_numeric(current_values)
    edges = np.asarray(baseline_feature["bins"], dtype=float)
    counts, _ = np.histogram(arr, bins=edges)
    psi = _psi_from_histograms(baseline_feature["counts"], counts)
    return {
        "psi": psi,
        "sample_size": int(arr.size),
        "mean": float(np.mean(arr)) if arr.size else None,
        "std": float(np.std(arr)) if arr.size else None,
        "min": float(np.min(arr)) if arr.size else None,
        "max": float(np.max(arr)) if arr.size else None,
    }


def status_from_psi(psi: float, warning: float, alert: float) -> str:
    if psi >= alert:
        return "drift"
    if psi >= warning:
        return "warning"
    return "stable"


def compute_drift_report(
    baseline: dict,
    current_values: dict[str, list[float]],
    *,
    warning_threshold: float,
    alert_threshold: float,
    min_samples: int = 10,
) -> dict[str, dict]:
    report: dict[str, dict] = {}
    for feature, baseline_feature in baseline.get("features", {}).items():
        values = current_values.get(feature, [])
        stats = compute_feature_psi(baseline_feature, values)
        if stats["sample_size"] == 0:
            report[feature] = {
                **stats,
                "status": "not_available",
            }
            continue

        if stats["sample_size"] < min_samples:
            report[feature] = {
                **stats,
                "status": "insufficient_data",
            }
            continue

        report[feature] = {
            **stats,
            "status": status_from_psi(
                stats["psi"],
                warning=warning_threshold,
                alert=alert_threshold,
            ),
        }
    return report


def flatten_numeric_values(df: pd.DataFrame, feature_names: list[str]) -> dict[str, list[float]]:
    usable = [feature for feature in feature_names if feature in df.columns]
    return {
        feature: _clean_numeric(df[feature].values).astype(float).tolist()
        for feature in usable
    }


def aggregate_event_values(events: list[dict], scope: str) -> dict[str, list[float]]:
    merged: dict[str, list[float]] = {}
    for event in events:
        payload = event.get(scope, {})
        for feature, values in payload.items():
            merged.setdefault(feature, []).extend(values)
    return merged
