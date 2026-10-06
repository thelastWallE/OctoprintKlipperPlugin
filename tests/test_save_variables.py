"""Tests for octoprint_klipper.modules.SaveVariables."""

import os

from octoprint_klipper.modules import SaveVariables


def _write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return str(path)


class TestFindVariablesFilename:
    def test_absolute_filename(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[save_variables]\n"
            "filename: ~/printer_data/config/saved_variables.cfg\n",
        )
        result = SaveVariables.find_variables_filename(cfg)
        assert result == os.path.normpath(
            os.path.expanduser("~/printer_data/config/saved_variables.cfg")
        )

    def test_relative_filename_resolved_against_config_dir(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[save_variables]\nfilename: variables.cfg\n",
        )
        result = SaveVariables.find_variables_filename(cfg)
        assert result == os.path.join(str(tmp_path), "variables.cfg")

    def test_section_missing_returns_none(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[printer]\nkinematics: cartesian\n")
        assert SaveVariables.find_variables_filename(cfg) is None

    def test_section_without_filename_returns_none(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[save_variables]\n# no filename\n")
        assert SaveVariables.find_variables_filename(cfg) is None

    def test_unreadable_baseconfig_returns_none(self, tmp_path):
        missing = str(tmp_path / "nope.cfg")
        assert SaveVariables.find_variables_filename(missing) is None


class TestReadVariables:
    def test_reads_literal_values(self, tmp_path):
        f = _write(
            tmp_path / "variables.cfg",
            "# save_variables\n"
            "cleaning_pos_x = 100.0\n"
            "cleaning_pos_y = 300.0\n"
            "active = 1\n"
            "label = 'my label'\n"
            "on = True\n",
        )
        vars_ = SaveVariables.read_variables(f)
        assert vars_ == {
            "cleaning_pos_x": 100.0,
            "cleaning_pos_y": 300.0,
            "active": 1,
            "label": "my label",
            "on": True,
        }

    def test_missing_file_returns_none(self, tmp_path):
        assert SaveVariables.read_variables(str(tmp_path / "nope.cfg")) is None

    def test_non_literal_value_kept_as_string(self, tmp_path):
        f = _write(tmp_path / "variables.cfg", "weird = nope-{not-a-literal}\n")
        vars_ = SaveVariables.read_variables(f)
        assert vars_ == {"weird": "nope-{not-a-literal}"}

    def test_serialize_round_trip(self, tmp_path):
        data = {"a": 1.5, "b": "x", "on": True, "c": None}
        text = SaveVariables.serialize_variables(data)
        f = tmp_path / "variables.cfg"
        f.write_text(text, encoding="utf-8")
        assert SaveVariables.read_variables(str(f)) == data


class TestExtractVariableNames:
    def test_printer_access(self):
        gcode = (
            "{% set x = printer.save_variables.variables.cleaning_pos_x %}\n"
            "{% set y = printer.save_variables.variables.cleaning_pos_y %}\n"
        )
        assert SaveVariables.extract_variable_names(gcode) == [
            "cleaning_pos_x",
            "cleaning_pos_y",
        ]

    def test_save_variable_command(self):
        gcode = "SAVE_VARIABLE VARIABLE=filament_id VALUE=42\n"
        assert SaveVariables.extract_variable_names(gcode) == ["filament_id"]

    def test_deduplicates_and_sorts(self):
        gcode = (
            "printer.save_variables.variables.b\n"
            "printer.save_variables.variables.a\n"
            "SAVE_VARIABLE VARIABLE=a VALUE=1\n"
            "printer.save_variables.variables.b\n"
        )
        assert SaveVariables.extract_variable_names(gcode) == ["a", "b"]

    def test_empty(self):
        assert SaveVariables.extract_variable_names("M117 hello\n") == []


class TestValidation:
    def test_valid_variable_name(self):
        assert SaveVariables.is_valid_variable_name("cleaning_pos_x") is True
        assert SaveVariables.is_valid_variable_name("x1") is True
        assert SaveVariables.is_valid_variable_name("_foo") is True

    def test_invalid_variable_name(self):
        assert SaveVariables.is_valid_variable_name("CleaningPosX") is False
        assert SaveVariables.is_valid_variable_name("has space") is False
        assert SaveVariables.is_valid_variable_name("") is False

    def test_valid_literal(self):
        assert SaveVariables.is_valid_literal("10") is True
        assert SaveVariables.is_valid_literal("10.5") is True
        assert SaveVariables.is_valid_literal("'text'") is True
        assert SaveVariables.is_valid_literal("True") is True
        assert SaveVariables.is_valid_literal("[1, 2, 3]") is True

    def test_invalid_literal(self):
        assert SaveVariables.is_valid_literal("not a literal") is False
        assert SaveVariables.is_valid_literal("__import__('os')") is False
        assert SaveVariables.is_valid_literal("") is False