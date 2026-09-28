"""Tests for octoprint_klipper.modules.KlipperMacroParser."""

from octoprint_klipper.modules import KlipperMacroParser


def _write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return str(path)


class TestParseMacros:
    def test_parses_simple_macro(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[gcode_macro START_PRINT]\n"
            "gcode:\n"
            "    M117 Starting print\n"
            "    M140 S60\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert len(macros) == 1
        assert macros[0]["name"] == "START_PRINT"
        assert macros[0]["gcode"] == "M117 Starting print\nM140 S60"
        assert macros[0]["has_params"] is False

    def test_detects_parameter_placeholders(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[gcode_macro PID_CALIBRATE]\n"
            "gcode:\n"
            "    PID_CALIBRATE HEATER={label:Heater, default:extruder, options:extruder|extruder1}\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert len(macros) == 1
        assert macros[0]["name"] == "PID_CALIBRATE"
        assert macros[0]["has_params"] is True

    def test_jinja2_expressions_are_not_params(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[gcode_macro M117_MSG]\n"
            "gcode:\n"
            "    M117 {{ params.MSG|default('hi') }}\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert len(macros) == 1
        assert macros[0]["has_params"] is False

    def test_detects_klipper_runtime_params(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[gcode_macro SET_RETRACTIONLENGTH]\n"
            "gcode:\n"
            "    SET_RETRACTION RETRACT_LENGTH={params.LENGTH|float}\n"
            "    GET_RETRACTION\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert len(macros) == 1
        assert macros[0]["name"] == "SET_RETRACTIONLENGTH"
        assert macros[0]["has_params"] is True

    def test_double_brace_params_are_not_klipper_params(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[gcode_macro FOO]\n"
            "gcode:\n"
            "    M117 {{ params.MSG|default('hi') }}\n"
            "    M118 {params.BAR}\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert len(macros) == 1
        # The single-brace {params.BAR} is a runtime param, the double-brace
        # {{ params.MSG }} is not.
        assert macros[0]["has_params"] is True

    def test_follows_include_directive(self, tmp_path):
        _write(
            tmp_path / "macros.cfg",
            "[gcode_macro BED_LEVEL]\n"
            "gcode:\n"
            "    G28\n"
            "    BED_MESH_CALIBRATE\n",
        )
        cfg = _write(
            tmp_path / "printer.cfg",
            "[include macros.cfg]\n"
            "[gcode_macro START_PRINT]\n"
            "gcode:\n"
            "    M117 Start\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        names = [m["name"] for m in macros]
        assert names == ["BED_LEVEL", "START_PRINT"]
        assert macros[0]["source"].endswith("macros.cfg")
        assert macros[1]["source"].endswith("printer.cfg")

    def test_follows_include_glob(self, tmp_path):
        _write(
            tmp_path / "macros" / "a.cfg",
            "[gcode_macro MACRO_A]\n" "gcode:\n" "    M117 A\n",
        )
        _write(
            tmp_path / "macros" / "b.cfg",
            "[gcode_macro MACRO_B]\n" "gcode:\n" "    M117 B\n",
        )
        cfg = _write(
            tmp_path / "printer.cfg",
            "[include macros/*.cfg]\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        names = [m["name"] for m in macros]
        assert names == ["MACRO_A", "MACRO_B"]

    def test_include_cycle_terminates(self, tmp_path):
        _write(
            tmp_path / "a.cfg",
            "[include b.cfg]\n" "[gcode_macro MACRO_A]\n" "gcode:\n" "    M117 A\n",
        )
        _write(
            tmp_path / "b.cfg",
            "[include a.cfg]\n" "[gcode_macro MACRO_B]\n" "gcode:\n" "    M117 B\n",
        )
        cfg = _write(
            tmp_path / "printer.cfg",
            "[include a.cfg]\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        names = [m["name"] for m in macros]
        # Includes are processed inline at the point they appear, so b.cfg's
        # macro (included at the top of a.cfg) comes before a.cfg's own macro.
        assert names == ["MACRO_B", "MACRO_A"]

    def test_missing_baseconfig_returns_empty(self, tmp_path):
        assert KlipperMacroParser.parse_macros(str(tmp_path / "nope.cfg")) == []

    def test_ignores_non_macro_sections(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[extruder]\n"
            "step_pin: PB4\n"
            "[gcode_macro FOO]\n"
            "gcode:\n"
            "    M117 Foo\n"
            "[heater_bed]\n"
            "heater_pin: PB5\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert [m["name"] for m in macros] == ["FOO"]

    def test_description_after_gcode_not_in_body(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[gcode_macro FOO]\n"
            "gcode:\n"
            "    M117 Foo\n"
            "description: A test macro\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert macros[0]["gcode"] == "M117 Foo"
        assert "description" not in macros[0]["gcode"]

    def test_inline_gcode_value(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[gcode_macro FOO]\n" "gcode: M117 Inline\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert macros[0]["gcode"] == "M117 Inline"

    def test_include_relative_to_including_file(self, tmp_path):
        # An included file in a subfolder includes a sibling relative to itself.
        _write(
            tmp_path / "sub" / "sibling.cfg",
            "[gcode_macro SIBLING]\n" "gcode:\n" "    M117 Sibling\n",
        )
        _write(
            tmp_path / "sub" / "mid.cfg",
            "[include sibling.cfg]\n",
        )
        cfg = _write(
            tmp_path / "printer.cfg",
            "[include sub/mid.cfg]\n",
        )
        macros = KlipperMacroParser.parse_macros(cfg)
        assert [m["name"] for m in macros] == ["SIBLING"]


class TestFindMissingIncludes:
    def test_missing_include_reported_with_columns(self, tmp_path):
        content = "[include macros.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 1
        assert errors[0]["line"] == 1
        assert errors[0]["include"] == "macros.cfg"
        # "[include macros.cfg]" -> filename spans columns 10..20 (1-based)
        assert errors[0]["startColumn"] == 10
        assert errors[0]["endColumn"] == 20

    def test_existing_include_not_reported(self, tmp_path):
        _write(tmp_path / "macros.cfg", "[gcode_macro FOO]\ngcode:\n    M117 Foo\n")
        content = "[include macros.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert errors == []

    def test_missing_glob_include_reported(self, tmp_path):
        content = "[include configs/*.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 1
        assert errors[0]["include"] == "configs/*.cfg"

    def test_existing_glob_include_not_reported(self, tmp_path):
        _write(tmp_path / "configs" / "a.cfg", "[gcode_macro A]\ngcode:\n    M117 A\n")
        content = "[include configs/*.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert errors == []

    def test_empty_include_not_reported(self, tmp_path):
        content = "[include]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert errors == []

    def test_multiple_missing_includes(self, tmp_path):
        content = "[include a.cfg]\n[include b.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 2
        assert [e["line"] for e in errors] == [1, 2]

    def test_comment_after_include_stripped(self, tmp_path):
        content = "[include macros.cfg] # my macros\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 1
        assert errors[0]["include"] == "macros.cfg"

    def test_quoted_include_columns(self, tmp_path):
        content = '[include "my macros.cfg"]\n'
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 1
        assert errors[0]["include"] == "my macros.cfg"
        # quotes are part of the matched span, so columns cover them
        assert errors[0]["startColumn"] == 10
        assert errors[0]["endColumn"] == 25

    def test_absolute_include_path(self, tmp_path):
        missing = str(tmp_path / "nope.cfg")
        content = "[include {}]\n".format(missing)
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 1
        assert errors[0]["include"] == missing

    def test_nested_missing_include_reported_on_root_include_line(self, tmp_path):
        # macros.cfg exists but itself includes a missing file. The marker must
        # point at the "[include macros.cfg]" line in the root content.
        _write(
            tmp_path / "macros.cfg",
            "[include sub/other.cfg]\n",
        )
        content = "[include macros.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 1
        assert errors[0]["include"] == "sub/other.cfg"
        assert errors[0]["line"] == 1
        # columns point at "macros.cfg" in the root line
        assert errors[0]["startColumn"] == 10
        assert errors[0]["endColumn"] == 20
        assert errors[0]["chain"] == ["macros.cfg"]

    def test_deeply_nested_missing_include(self, tmp_path):
        _write(
            tmp_path / "a.cfg",
            "[include b.cfg]\n",
        )
        _write(
            tmp_path / "b.cfg",
            "[include missing.cfg]\n",
        )
        content = "[include a.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 1
        assert errors[0]["include"] == "missing.cfg"
        assert errors[0]["chain"] == ["a.cfg", "b.cfg"]

    def test_nested_include_cycle_terminates(self, tmp_path):
        _write(
            tmp_path / "a.cfg",
            "[include b.cfg]\n",
        )
        _write(
            tmp_path / "b.cfg",
            "[include a.cfg]\n",
        )
        content = "[include a.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert errors == []

    def test_all_nested_includes_exist_not_reported(self, tmp_path):
        _write(
            tmp_path / "a.cfg",
            "[include b.cfg]\n",
        )
        _write(
            tmp_path / "b.cfg",
            "[gcode_macro B]\ngcode:\n    M117 B\n",
        )
        content = "[include a.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert errors == []

    def test_nested_missing_include_in_glob(self, tmp_path):
        # A glob include matches a.cfg, which itself includes a missing file.
        _write(
            tmp_path / "configs" / "a.cfg",
            "[include missing.cfg]\n",
        )
        content = "[include configs/*.cfg]\n"
        errors = KlipperMacroParser.find_missing_includes(content, str(tmp_path))
        assert len(errors) == 1
        assert errors[0]["include"] == "missing.cfg"
        assert errors[0]["chain"] == ["a.cfg"]
