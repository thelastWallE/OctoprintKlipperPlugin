"""Tests for octoprint_klipper.utils.extra."""
from octoprint_klipper.utils import extra


class TestIsFloat:
    def test_valid_floats(self):
        assert extra.is_float("1.5") is True
        assert extra.is_float("-3") is True
        assert extra.is_float("0.0") is True
        assert extra.is_float("1e3") is True

    def test_invalid_floats(self):
        assert extra.is_float("abc") is False
        assert extra.is_float("") is False
        assert extra.is_float("1.2.3") is False


class TestSplitFilenamePath:
    def test_plain_filename(self):
        assert extra.split_filename_path("printer.cfg") == ("", "printer.cfg")

    def test_forward_slash_path(self):
        assert extra.split_filename_path("config/printer.cfg") == (
            "config",
            "printer.cfg",
        )

    def test_nested_forward_slash_path(self):
        assert extra.split_filename_path("config/sub/printer.cfg") == (
            "config/sub",
            "printer.cfg",
        )

    def test_backslash_path(self):
        assert extra.split_filename_path("config\\printer.cfg") == (
            "config",
            "printer.cfg",
        )

    def test_mixed_separators(self):
        assert extra.split_filename_path("config/sub\\printer.cfg") == (
            "config/sub",
            "printer.cfg",
        )

    def test_leading_slash(self):
        assert extra.split_filename_path("/printer.cfg") == ("", "printer.cfg")

    def test_empty_filename(self):
        assert extra.split_filename_path("") == ("", "")


class TestKeyExist:
    def test_key_exists(self):
        assert extra.key_exist({"a": {"b": 1}}, "a", "b") is True

    def test_key_missing(self):
        assert extra.key_exist({"a": {}}, "a", "b") is False
        assert extra.key_exist({}, "a", "b") is False


class TestFileExists:
    def test_existing_file(self, plugin_self, tmp_path):
        path = tmp_path / "printer.cfg"
        path.write_text("[probe]\n")
        assert extra.file_exists(plugin_self, str(path)) is True

    def test_missing_file(self, plugin_self, tmp_path):
        assert extra.file_exists(plugin_self, str(tmp_path / "nope.cfg")) is False


class TestFolderExists:
    def test_existing_folder(self, plugin_self, tmp_path):
        assert extra.folder_exists(plugin_self, str(tmp_path)) is True

    def test_missing_folder(self, plugin_self, tmp_path):
        assert extra.folder_exists(plugin_self, str(tmp_path / "nope")) is False