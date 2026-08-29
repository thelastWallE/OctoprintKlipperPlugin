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

    def test_invalid_syntax_returns_line(self, plugin_self):
        config = "[probe\nx_offset = 0.0\n"
        result = CfgUtils.check_config(plugin_self, config)
        assert result["status"] == "error"
        assert result["line"] == 1

    def test_invalid_float_returns_error(self, plugin_self):
        config = "[probe]\nx_offset = not_a_number\n"
        result = CfgUtils.check_config(plugin_self, config)
        assert result["status"] == "error"

    def test_invalid_float_returns_line(self, plugin_self):
        config = "[probe]\nx_offset = not_a_number\n"
        result = CfgUtils.check_config(plugin_self, config)
        assert result["status"] == "error"
        assert result["line"] == 2


class TestErrorLine:
    def test_missing_section_header(self):
        import configparser

        try:
            configparser.RawConfigParser().read_string("[probe\n")
            assert False, "expected configparser error"
        except configparser.Error as e:
            assert CfgUtils._error_line(e) == 1

    def test_no_line_info(self):
        assert CfgUtils._error_line(ValueError("boom")) is None


class TestFindKeyLine:
    def test_finds_key_in_section(self):
        content = "[probe]\nx_offset = 0.0\n"
        assert CfgUtils._find_key_line(content, "probe", "x_offset") == 2

    def test_ignores_key_outside_section(self):
        content = "x_offset = 0.0\n[probe]\ny_offset = 0.0\n"
        assert CfgUtils._find_key_line(content, "probe", "x_offset") is None

    def test_missing_section(self):
        content = "[probe]\nx_offset = 0.0\n"
        assert CfgUtils._find_key_line(content, "bltouch", "x_offset") is None

    def test_missing_key(self):
        content = "[probe]\nx_offset = 0.0\n"
        assert CfgUtils._find_key_line(content, "probe", "z_offset") is None


class TestGetCfg:
    def test_missing_file_returns_error(self, plugin_self, tmp_path):
        missing = str(tmp_path / "does_not_exist.cfg")
        result = CfgUtils.get_cfg(plugin_self, missing)
        assert result["status"] == "error"

    def test_existing_file_returns_content(self, plugin_self, tmp_path):
        cfg = tmp_path / "printer.cfg"
        cfg.write_text("[probe]\nx_offset = 0.0\n", encoding="utf-8")
        result = CfgUtils.get_cfg(plugin_self, str(cfg))
        assert result["status"] == "success"
        assert result["data"]["body"]["content"] == "[probe]\nx_offset = 0.0\n"
        assert result["data"]["body"]["file"] == str(cfg)