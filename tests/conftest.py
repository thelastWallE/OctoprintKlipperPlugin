"""Shared fixtures for OctoKlipper tests."""
import logging
import sys
from pathlib import Path
from unittest import mock

import pytest

# Ensure the plugin package is importable even if not installed editable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture
def plugin_self():
    """A minimal stand-in for the plugin instance passed as ``self`` to helpers."""
    obj = mock.MagicMock()
    obj._octoklipper_logger = logging.getLogger("octoprint.plugins.klipper.test")
    obj._logger = logging.getLogger("octoprint.plugins.klipper.test")
    obj._settings = mock.MagicMock()
    return obj


@pytest.fixture(autouse=True)
def _silence_logging():
    """Keep the plugin's logging helpers quiet during tests."""
    with mock.patch("octoprint_klipper.utils.logger.log_debug"), mock.patch(
        "octoprint_klipper.utils.logger.log_error"
    ), mock.patch("octoprint_klipper.utils.logger.log_info"):
        yield