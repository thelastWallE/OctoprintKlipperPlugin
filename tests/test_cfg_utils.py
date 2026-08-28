"""Tests for octoprint_klipper.config_tools.CfgUtils."""
import pytest

from octoprint_klipper.config_tools import CfgUtils


class TestCheckConfig:
    def test_valid_config_returns_success(self, plugin_self):
        config = "[probe]\nx_offset = 0.0\ny_offset = 0.0\nz_offset = 0.0\n"
        result = CfgUtils.check_config(plugin_self, config)
        assert result == {"status": "success"}

    def test_invalid_syntax_returns_error(self, plugin_self):
        config = "[probe\nx_offset = 0.0\n"
        result = CfgUtils.check_config(plugin_self, config)
        assert result["status"] == "error"

    def test_invalid_float_returns_error(self, plugin_self):
        config = "[probe]\nx_offset = not_a_number\n"
        result = CfgUtils.check_config(plugin_self, config)
        assert result["status"] == "error"