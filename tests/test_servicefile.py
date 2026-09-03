"""Tests for octoprint_klipper.utils.servicefile."""

from octoprint_klipper.utils import servicefile


class TestSaveServicefile:
    def test_save_writes_current_and_deploys(self, plugin_self, tmp_path):
        from unittest import mock

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        dest = tmp_path / "etc" / "default" / "klipper"
        dest.parent.mkdir(parents=True)
        dest.write_text("[Service]\nExecStart=old\n", encoding="utf-8")

        new_content = "[Service]\nExecStart=new\n"
        with mock.patch(
            "octoprint_klipper.utils.extra.execute_command",
            return_value=("", True),
        ) as mock_exec:
            result = servicefile.save_servicefile(plugin_self, new_content, str(dest))
        assert result["status"] == "success"
        # current holds the CURRENT content
        assert (data_dir / "current" / "servicefile" / "klipper.service").read_text(
            encoding="utf-8"
        ) == new_content
        # deploy was attempted via sudo
        assert mock_exec.call_count >= 1
        deploy_cmd = mock_exec.call_args[0][1]
        assert "sudo -n cp -T" in deploy_cmd

    def test_save_archives_previous_on_second_save(self, plugin_self, tmp_path):
        from unittest import mock

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        dest = tmp_path / "etc" / "default" / "klipper"
        dest.parent.mkdir(parents=True)
        dest.write_text("[Service]\nExecStart=old\n", encoding="utf-8")

        with mock.patch(
            "octoprint_klipper.utils.extra.execute_command",
            return_value=("", True),
        ):
            servicefile.save_servicefile(
                plugin_self, "[Service]\nExecStart=first\n", str(dest)
            )
            result = servicefile.save_servicefile(
                plugin_self, "[Service]\nExecStart=second\n", str(dest)
            )
        assert result["status"] == "success"
        # archive holds the FIRST content (previous version)
        archive_files = list(
            (data_dir / "archive" / "servicefile").glob("Servicefile_*.bak")
        )
        assert len(archive_files) == 1
        assert (
            archive_files[0].read_text(encoding="utf-8")
            == "[Service]\nExecStart=first\n"
        )
        # current holds the SECOND content
        assert (data_dir / "current" / "servicefile" / "klipper.service").read_text(
            encoding="utf-8"
        ) == "[Service]\nExecStart=second\n"

    def test_save_returns_password_required_when_not_cached(
        self, plugin_self, tmp_path
    ):
        from unittest import mock

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        dest = tmp_path / "etc" / "default" / "klipper"
        dest.parent.mkdir(parents=True)
        dest.write_text("[Service]\nExecStart=old\n", encoding="utf-8")

        with mock.patch(
            "octoprint_klipper.utils.extra.execute_command",
            return_value=("sudo: a password is required", False),
        ):
            result = servicefile.save_servicefile(
                plugin_self, "[Service]\nExecStart=new\n", str(dest)
            )
        assert result["status"] == "password_required"

    def test_save_deploys_with_password_when_not_cached(self, plugin_self, tmp_path):
        from unittest import mock

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        dest = tmp_path / "etc" / "default" / "klipper"
        dest.parent.mkdir(parents=True)
        dest.write_text("[Service]\nExecStart=old\n", encoding="utf-8")

        # first sudo -n cp fails (not cached), then sudo -S -v caches, then retry succeeds
        with mock.patch(
            "octoprint_klipper.utils.extra.execute_command",
            side_effect=[("sudo: a password is required", False), ("", True)],
        ), mock.patch(
            "octoprint_klipper.utils.extra.execute_command_stream",
            return_value=True,
        ) as mock_stream:
            result = servicefile.save_servicefile(
                plugin_self,
                "[Service]\nExecStart=new\n",
                str(dest),
                sudo_password="secret",
            )
        assert result["status"] == "success"
        # sudo -S -v was called with the password on stdin
        assert mock_stream.call_count == 1
        assert mock_stream.call_args[1]["stdin_data"] == "secret\n"


class TestCopyServicefileToBackup:
    def test_backup_goes_to_archive(self, plugin_self, tmp_path):
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        source = tmp_path / "klipper.service"
        source.write_text("[Service]\n", encoding="utf-8")

        success, error = servicefile.copy_servicefile_to_backup(
            plugin_self, str(source)
        )
        assert success is True
        assert error is None
        backups = list((data_dir / "archive" / "servicefile").glob("Servicefile_*.bak"))
        assert len(backups) == 1
        assert backups[0].read_text(encoding="utf-8") == "[Service]\n"


class TestCopyServicefileToCurrent:
    def test_current_goes_to_current_folder(self, plugin_self, tmp_path):
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        source = tmp_path / "klipper.service"
        source.write_text("[Service]\n", encoding="utf-8")

        success, error = servicefile.copy_servicefile_to_current(
            plugin_self, str(source)
        )
        assert success is True
        assert error is None
        assert (data_dir / "current" / "servicefile" / "klipper.service").read_text(
            encoding="utf-8"
        ) == "[Service]\n"


class TestRestoreServicefile:
    def test_restore_deploys_backup(self, plugin_self, tmp_path):
        from unittest import mock

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        source = tmp_path / "Servicefile_2026-01-01_00-00-00.bak"
        source.write_text("[Service]\nExecStart=restored\n", encoding="utf-8")

        with mock.patch(
            "octoprint_klipper.utils.extra.execute_command",
            return_value=("", True),
        ) as mock_exec:
            result = servicefile.restore_servicefile(plugin_self, str(source))
        assert result["status"] == "success"
        # current holds the restored content
        assert (data_dir / "current" / "servicefile" / "klipper.service").read_text(
            encoding="utf-8"
        ) == "[Service]\nExecStart=restored\n"
        # deploy was attempted via sudo
        assert mock_exec.call_count >= 1
        deploy_cmd = mock_exec.call_args[0][1]
        assert "sudo -n cp -T" in deploy_cmd

    def test_restore_returns_password_required_when_not_cached(
        self, plugin_self, tmp_path
    ):
        from unittest import mock

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        source = tmp_path / "Servicefile_2026-01-01_00-00-00.bak"
        source.write_text("[Service]\nExecStart=restored\n", encoding="utf-8")

        with mock.patch(
            "octoprint_klipper.utils.extra.execute_command",
            return_value=("sudo: a password is required", False),
        ):
            result = servicefile.restore_servicefile(plugin_self, str(source))
        assert result["status"] == "password_required"

    def test_restore_deploys_with_password_when_not_cached(self, plugin_self, tmp_path):
        from unittest import mock

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        plugin_self.get_plugin_data_folder.return_value = str(data_dir)

        source = tmp_path / "Servicefile_2026-01-01_00-00-00.bak"
        source.write_text("[Service]\nExecStart=restored\n", encoding="utf-8")

        with mock.patch(
            "octoprint_klipper.utils.extra.execute_command",
            side_effect=[("sudo: a password is required", False), ("", True)],
        ), mock.patch(
            "octoprint_klipper.utils.extra.execute_command_stream",
            return_value=True,
        ) as mock_stream:
            result = servicefile.restore_servicefile(
                plugin_self, str(source), sudo_password="secret"
            )
        assert result["status"] == "success"
        # sudo -S -v was called with the password on stdin
        assert mock_stream.call_count == 1
        assert mock_stream.call_args[1]["stdin_data"] == "secret\n"

    def test_restore_missing_file_returns_error(self, plugin_self, tmp_path):
        source = tmp_path / "missing.bak"
        result = servicefile.restore_servicefile(plugin_self, str(source))
        assert result["status"] == "error"
