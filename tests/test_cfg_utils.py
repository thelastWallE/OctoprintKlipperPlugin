"""Tests for octoprint_klipper.config_tools.CfgUtils."""

import os

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


class TestCopyCfgToBackup:
    def test_backup_with_trailing_separator_config_path(self, plugin_self, tmp_path):
        # config_path ends with a separator, as in the real settings
        config_dir = tmp_path / "klipper_configs"
        config_dir.mkdir()
        plugin_self._settings.get.return_value = str(config_dir) + os.sep
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        src = config_dir / "printer.cfg"
        src.write_text("[probe]\n", encoding="utf-8")

        result = CfgUtils.copy_cfg_to_backup(plugin_self, str(src))
        assert result["status"] == "success"
        assert (data_dir / "archive" / "printer.cfg").exists()

    def test_backup_file_outside_storage(self, plugin_self, tmp_path):
        config_dir = tmp_path / "klipper_configs"
        config_dir.mkdir()
        plugin_self._settings.get.return_value = str(config_dir) + os.sep
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        # File outside the config storage (e.g. the baseconfig)
        src = tmp_path / "printer.cfg"
        src.write_text("[probe]\n", encoding="utf-8")

        result = CfgUtils.copy_cfg_to_backup(plugin_self, str(src))
        assert result["status"] == "success"
        assert (data_dir / "archive" / "printer.cfg").exists()


class TestCopyCfgToOctoprintBackup:
    def test_backup_goes_to_current_folder(self, plugin_self, tmp_path):
        config_dir = tmp_path / "klipper_configs"
        config_dir.mkdir()
        plugin_self._settings.get.return_value = str(config_dir) + os.sep
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        src = config_dir / "printer.cfg"
        src.write_text("[probe]\n", encoding="utf-8")

        result = CfgUtils.copy_cfg_to_current(plugin_self, str(src))
        assert result["status"] == "success"
        assert (data_dir / "current" / "printer.cfg").exists()

    def test_backup_file_outside_storage(self, plugin_self, tmp_path):
        config_dir = tmp_path / "klipper_configs"
        config_dir.mkdir()
        plugin_self._settings.get.return_value = str(config_dir) + os.sep
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        # File outside the config storage (e.g. the baseconfig)
        src = tmp_path / "printer.cfg"
        src.write_text("[probe]\n", encoding="utf-8")

        result = CfgUtils.copy_cfg_to_current(plugin_self, str(src))
        assert result["status"] == "success"
        assert (data_dir / "current" / "printer.cfg").exists()


class TestSaveCfg:
    def test_save_creates_both_backups(self, plugin_self, tmp_path):
        config_dir = tmp_path / "klipper_configs"
        config_dir.mkdir()
        plugin_self._settings.get.return_value = str(config_dir) + os.sep
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        src = config_dir / "printer.cfg"
        src.write_text("[probe]\n", encoding="utf-8")

        new_content = "[probe]\nx_offset = 0.0\n"
        result = CfgUtils.save_cfg(plugin_self, new_content, "printer.cfg")
        assert result["status"] == "success"
        # archive holds the PREVIOUS content
        assert (data_dir / "archive" / "printer.cfg").read_text(
            encoding="utf-8"
        ) == "[probe]\n"
        # current holds the CURRENT content
        assert (data_dir / "current" / "printer.cfg").read_text(
            encoding="utf-8"
        ) == new_content

    def test_save_new_file_creates_current_duplicate(self, plugin_self, tmp_path):
        config_dir = tmp_path / "klipper_configs"
        config_dir.mkdir()
        plugin_self._settings.get.return_value = str(config_dir) + os.sep
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        new_content = "[probe]\nx_offset = 0.0\n"
        result = CfgUtils.save_cfg(
            plugin_self, new_content, "new.cfg", is_new_file=True
        )
        assert result["status"] == "success"
        # no archive backup for a brand-new file
        assert not (data_dir / "archive" / "new.cfg").exists()
        # current duplicate holds the current content
        assert (data_dir / "current" / "new.cfg").read_text(
            encoding="utf-8"
        ) == new_content


class TestGetBackupType:
    def test_config_paths(self):
        assert CfgUtils.get_backup_type("archive/printer.cfg") == "config"
        assert CfgUtils.get_backup_type("archive/sub/macro.cfg") == "config"
        assert CfgUtils.get_backup_type("current/printer.cfg") == "config"

    def test_servicefile_paths(self):
        assert (
            CfgUtils.get_backup_type(
                "archive/servicefile/Servicefile_2026-01-01_00-00-00.bak"
            )
            == "servicefile"
        )
        assert (
            CfgUtils.get_backup_type("current/servicefile/klipper.service")
            == "servicefile"
        )


class TestListConfigFiles:
    def test_backup_name_has_no_leading_separator(self, plugin_self, tmp_path):
        from unittest import mock

        data_dir = tmp_path / "data"
        archive_dir = data_dir / "archive"
        archive_dir.mkdir(parents=True)
        (archive_dir / "printer.cfg").write_text("[probe]\n", encoding="utf-8")
        (archive_dir / "sub").mkdir()
        (archive_dir / "sub" / "macro.cfg").write_text(
            "[gcode_macro]\n", encoding="utf-8"
        )
        servicefile_dir = archive_dir / "servicefile"
        servicefile_dir.mkdir()
        (servicefile_dir / "Servicefile_2026-01-01_00-00-00.bak").write_text(
            "[Service]\n", encoding="utf-8"
        )
        current_dir = data_dir / "current"
        current_dir.mkdir()
        (current_dir / "printer.cfg").write_text("[probe]\n", encoding="utf-8")
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        with mock.patch("flask.url_for", return_value="/"):
            result = CfgUtils.list_config_files(plugin_self, "backup")

        assert result["status"] == "success"
        names = {f["name"] for f in result["data"]["files"]}
        # both backups and current configs are listed
        assert "archive/printer.cfg" in names
        assert "archive/sub/macro.cfg" in names
        assert "archive/servicefile/Servicefile_2026-01-01_00-00-00.bak" in names
        assert "current/printer.cfg" in names
        # No leading separator that would break <path:filename> route matching
        for name in names:
            assert not name.startswith(("/", "\\"))

    def test_files_are_tagged_with_type(self, plugin_self, tmp_path):
        from unittest import mock

        data_dir = tmp_path / "data"
        archive_dir = data_dir / "archive"
        archive_dir.mkdir(parents=True)
        (archive_dir / "printer.cfg").write_text("[probe]\n", encoding="utf-8")
        servicefile_dir = archive_dir / "servicefile"
        servicefile_dir.mkdir()
        (servicefile_dir / "Servicefile_2026-01-01_00-00-00.bak").write_text(
            "[Service]\n", encoding="utf-8"
        )
        current_dir = data_dir / "current"
        current_dir.mkdir()
        (current_dir / "printer.cfg").write_text("[probe]\n", encoding="utf-8")
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        with mock.patch("flask.url_for", return_value="/"):
            result = CfgUtils.list_config_files(plugin_self, "backup")

        assert result["status"] == "success"
        types = {f["name"]: f["type"] for f in result["data"]["files"]}
        assert types["archive/printer.cfg"] == "config"
        assert types["current/printer.cfg"] == "config"
        assert (
            types["archive/servicefile/Servicefile_2026-01-01_00-00-00.bak"]
            == "servicefile"
        )
