from __future__ import annotations

import pytest

from airquality_ml_modeling.utils.drift import _psi_from_histograms


def test_psi_uses_proportions_not_raw_count_units():
    reference_counts = [100, 200, 300, 400]
    current_counts = [1, 2, 3, 4]

    assert _psi_from_histograms(reference_counts, current_counts) == pytest.approx(0.0)


def test_psi_is_not_inflated_by_sample_size_when_bins_are_empty():
    reference_counts = [100, 100, 100, 100]
    current_counts = [1, 1, 0, 0]
    larger_current_counts = [100, 100, 0, 0]

    assert _psi_from_histograms(reference_counts, current_counts) == pytest.approx(
        _psi_from_histograms(reference_counts, larger_current_counts)
    )
