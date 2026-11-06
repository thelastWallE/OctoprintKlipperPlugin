"""Tests for octoprint_klipper.modules.SetupWizard.

The module is pure logic (no OctoPrint imports) so the wizard's diagnostics can
be unit tested directly, matching KlipperMacroParser / KlipperLogAnalyzer.
"""

import os

from octoprint_klipper.modules import SetupWizard


def _write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return str(path)


class TestIterConfigTree:
    def test_baseconfig_only(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[mcu]\nserial: /dev/ttyUSB0\n")
        tree = list(SetupWizard.iter_config_tree(cfg))
        assert len(tree) == 1
        assert tree[0][0] == cfg
        assert "[mcu]" in tree[0][1]

    def test_follows_include(self, tmp_path):
        _write(tmp_path / "mcu.cfg", "[mcu]\nserial: /dev/ttyUSB0\n")
        cfg = _write(tmp_path / "printer.cfg", "[include mcu.cfg]\n")
        tree = list(SetupWizard.iter_config_tree(cfg))
        assert len(tree) == 2
        assert tree[0][0] == cfg
        assert tree[1][0].endswith("mcu.cfg")

    def test_follows_nested_include(self, tmp_path):
        _write(tmp_path / "sub" / "deep.cfg", "[printer]\nkinematics: corexy\n")
        _write(tmp_path / "mid.cfg", "[include sub/deep.cfg]\n")
        cfg = _write(tmp_path / "printer.cfg", "[include mid.cfg]\n")
        tree = list(SetupWizard.iter_config_tree(cfg))
        names = [p.replace("\\", "/").split("/")[-1] for p, _ in tree]
        assert names == ["printer.cfg", "mid.cfg", "deep.cfg"]

    def test_include_resolved_relative_to_including_file(self, tmp_path):
        # Klipper resolves includes relative to the file containing the
        # directive, not the base config.
        _write(tmp_path / "sub" / "inner.cfg", "[mcu]\nserial: /dev/ttyUSB0\n")
        _write(tmp_path / "sub" / "outer.cfg", "[include inner.cfg]\n")
        cfg = _write(tmp_path / "printer.cfg", "[include sub/outer.cfg]\n")
        tree = list(SetupWizard.iter_config_tree(cfg))
        names = [p.replace("\\", "/").split("/")[-1] for p, _ in tree]
        assert names == ["printer.cfg", "outer.cfg", "inner.cfg"]

    def test_wildcard_include(self, tmp_path):
        _write(tmp_path / "configs" / "a.cfg", "[mcu]\n")
        _write(tmp_path / "configs" / "b.cfg", "[printer]\n")
        cfg = _write(tmp_path / "printer.cfg", "[include configs/*.cfg]\n")
        tree = list(SetupWizard.iter_config_tree(cfg))
        names = sorted(p.replace("\\", "/").split("/")[-1] for p, _ in tree)
        assert names == ["a.cfg", "b.cfg", "printer.cfg"]

    def test_cycle_is_protected(self, tmp_path):
        _write(tmp_path / "a.cfg", "[include b.cfg]\n")
        _write(tmp_path / "b.cfg", "[include a.cfg]\n")
        cfg = _write(tmp_path / "printer.cfg", "[include a.cfg]\n")
        tree = list(SetupWizard.iter_config_tree(cfg))
        # printer.cfg -> a.cfg -> b.cfg -> (a.cfg already seen, stop)
        assert len(tree) == 3

    def test_self_include_is_protected(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[include printer.cfg]\n")
        tree = list(SetupWizard.iter_config_tree(cfg))
        assert len(tree) == 1

    def test_missing_baseconfig_yields_nothing(self, tmp_path):
        assert list(SetupWizard.iter_config_tree(str(tmp_path / "nope.cfg"))) == []

    def test_empty_path_yields_nothing(self):
        assert list(SetupWizard.iter_config_tree("")) == []

    def test_missing_include_is_skipped(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[include gone.cfg]\n")
        tree = list(SetupWizard.iter_config_tree(cfg))
        assert len(tree) == 1


class TestCollectSections:
    def test_section_in_baseconfig(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[mcu]\nserial: /dev/ttyUSB0\n")
        sections = SetupWizard.collect_sections(cfg)
        assert "mcu" in sections
        assert sections["mcu"] == cfg

    def test_section_in_included_file(self, tmp_path):
        inc = _write(tmp_path / "mcu.cfg", "[mcu]\nserial: /dev/ttyUSB0\n")
        cfg = _write(tmp_path / "printer.cfg", "[include mcu.cfg]\n")
        sections = SetupWizard.collect_sections(cfg)
        assert "mcu" in sections
        assert sections["mcu"] == inc

    def test_first_definition_wins(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[mcu]\n[include mcu.cfg]\n")
        _write(tmp_path / "mcu.cfg", "[mcu]\nserial: /dev/ttyUSB0\n")
        sections = SetupWizard.collect_sections(cfg)
        assert sections["mcu"] == cfg

    def test_section_names_are_lowercased(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[GCODE_MACRO START_PRINT]\ngcode:\n")
        sections = SetupWizard.collect_sections(cfg)
        assert "gcode_macro start_print" in sections

    def test_include_directive_is_not_a_section(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[include mcu.cfg]\n")
        sections = SetupWizard.collect_sections(cfg)
        assert not any("include" in s for s in sections)

    def test_missing_baseconfig_returns_empty(self, tmp_path):
        assert SetupWizard.collect_sections(str(tmp_path / "nope.cfg")) == {}


class TestCheckRequiredSections:
    def _sections(self, *names):
        return {n: "printer.cfg" for n in names}

    def test_mcu_missing_is_error(self):
        result = SetupWizard.check_required_sections(self._sections("printer"))
        entry = next(e for e in result if e["section"] == "mcu")
        assert entry["present"] is False
        assert entry["severity"] == "error"

    def test_printer_missing_is_error(self):
        result = SetupWizard.check_required_sections(self._sections("mcu"))
        entry = next(e for e in result if e["section"] == "printer")
        assert entry["present"] is False
        assert entry["severity"] == "error"

    def test_virtual_sdcard_missing_is_warning(self):
        result = SetupWizard.check_required_sections(self._sections("mcu", "printer"))
        entry = next(e for e in result if e["section"] == "virtual_sdcard")
        assert entry["present"] is False
        assert entry["severity"] == "warning"

    def test_pause_resume_missing_is_warning(self):
        result = SetupWizard.check_required_sections(self._sections("mcu", "printer"))
        entry = next(e for e in result if e["section"] == "pause_resume")
        assert entry["present"] is False
        assert entry["severity"] == "warning"

    def test_present_section_is_marked_present(self):
        result = SetupWizard.check_required_sections(
            self._sections("mcu", "printer", "virtual_sdcard", "pause_resume")
        )
        present = {e["section"] for e in result if e["present"]}
        assert present == {"mcu", "printer", "virtual_sdcard", "pause_resume"}

    def test_every_entry_has_reason_and_docs(self):
        result = SetupWizard.check_required_sections({})
        assert result
        for entry in result:
            assert entry["reason"]
            assert entry["docs"].startswith("https://")

    def test_errors_sort_before_warnings(self):
        result = SetupWizard.check_required_sections({})
        severities = [e["severity"] for e in result]
        assert severities == sorted(
            severities, key=lambda s: {"error": 0, "warning": 1, "info": 2}[s]
        )

    def test_empty_sections_reports_all_missing(self):
        result = SetupWizard.check_required_sections({})
        assert all(e["present"] is False for e in result)
        assert len(result) >= 4

    def test_accepts_a_baseconfig_path(self, tmp_path):
        cfg = _write(
            tmp_path / "printer.cfg",
            "[mcu]\nserial: /dev/ttyUSB0\n"
            "[printer]\nkinematics: corexy\n"
            "[virtual_sdcard]\npath: ~/.octoprint/uploads\n"
            "[pause_resume]\n",
        )
        result = SetupWizard.check_required_sections(cfg)
        present = {e["section"] for e in result if e["present"]}
        assert present == {"mcu", "printer", "virtual_sdcard", "pause_resume"}

    def test_section_in_included_file_counts_as_present(self, tmp_path):
        _write(tmp_path / "mcu.cfg", "[mcu]\nserial: /dev/ttyUSB0\n")
        cfg = _write(
            tmp_path / "printer.cfg",
            "[include mcu.cfg]\n"
            "[printer]\nkinematics: corexy\n"
            "[virtual_sdcard]\npath: ~/.octoprint/uploads\n"
            "[pause_resume]\n",
        )
        result = SetupWizard.check_required_sections(cfg)
        entry = next(e for e in result if e["section"] == "mcu")
        assert entry["present"] is True


class TestCheckSerialPort:
    def test_registered_and_present_is_ok(self):
        result = SetupWizard.check_serial_port(
            "/tmp/printer", ["/tmp/printer"], port_exists=True
        )
        assert result["ok"] is True
        assert result["registered"] is True
        assert result["port_exists"] is True

    def test_not_registered_is_not_ok(self):
        result = SetupWizard.check_serial_port(
            "/tmp/printer", [], port_exists=True
        )
        assert result["ok"] is False
        assert result["registered"] is False

    def test_registered_but_missing_file_is_not_ok(self):
        result = SetupWizard.check_serial_port(
            "/tmp/printer", ["/tmp/printer"], port_exists=False
        )
        assert result["ok"] is False
        assert result["port_exists"] is False

    def test_suggests_modern_path_when_available(self):
        result = SetupWizard.check_serial_port(
            "/tmp/printer",
            [],
            port_exists=False,
            candidates=["~/printer_data/comms/klippy.serial"],
        )
        assert result["suggestion"] == "~/printer_data/comms/klippy.serial"

    def test_no_suggestion_when_already_using_modern_path(self):
        result = SetupWizard.check_serial_port(
            "~/printer_data/comms/klippy.serial",
            ["~/printer_data/comms/klippy.serial"],
            port_exists=True,
            candidates=["~/printer_data/comms/klippy.serial"],
        )
        assert result["suggestion"] is None

    def test_echoes_the_port(self):
        result = SetupWizard.check_serial_port("/tmp/printer", [], port_exists=False)
        assert result["port"] == "/tmp/printer"


class TestCheckErrorHandling:
    def test_cancel_is_ok(self):
        result = SetupWizard.check_error_handling("cancel")
        assert result["ok"] is True
        assert result["current"] == "cancel"
        assert result["expected"] == "cancel"

    def test_disconnect_is_not_ok(self):
        result = SetupWizard.check_error_handling("disconnect")
        assert result["ok"] is False
        assert result["current"] == "disconnect"

    def test_ignore_is_not_ok(self):
        result = SetupWizard.check_error_handling("ignore")
        assert result["ok"] is False

    def test_none_is_not_ok(self):
        result = SetupWizard.check_error_handling(None)
        assert result["ok"] is False


class TestErrorHandlingSettings:
    """OctoPrint 1.11 has no ``serial.errorHandling`` enum.

    Error handling is stored there as two booleans instead, so the wizard has to
    translate between them and the 2.0 enum. The mapping mirrors OctoPrint 2.0's
    own serial compatibility overlay.
    """

    def test_cancel_maps_to_neither_boolean(self):
        assert SetupWizard.error_handling_to_settings("cancel") == {
            "disconnectOnErrors": False,
            "ignoreErrorsFromFirmware": False,
        }

    def test_disconnect_maps_to_disconnect_on_errors(self):
        assert SetupWizard.error_handling_to_settings("disconnect") == {
            "disconnectOnErrors": True,
            "ignoreErrorsFromFirmware": False,
        }

    def test_ignore_maps_to_ignore_errors_from_firmware(self):
        assert SetupWizard.error_handling_to_settings("ignore") == {
            "disconnectOnErrors": False,
            "ignoreErrorsFromFirmware": True,
        }

    def test_unknown_value_returns_empty(self):
        assert SetupWizard.error_handling_to_settings("nonsense") == {}

    def test_none_returns_empty(self):
        assert SetupWizard.error_handling_to_settings(None) == {}

    def test_from_settings_cancel(self):
        assert (
            SetupWizard.error_handling_from_settings(False, False) == "cancel"
        )

    def test_from_settings_disconnect(self):
        assert (
            SetupWizard.error_handling_from_settings(True, False) == "disconnect"
        )

    def test_from_settings_ignore(self):
        assert (
            SetupWizard.error_handling_from_settings(False, True) == "ignore"
        )

    def test_from_settings_none_is_treated_as_disconnect_default(self):
        # OctoPrint 1.11 defaults are disconnectOnErrors=True,
        # ignoreErrorsFromFirmware=False.
        assert SetupWizard.error_handling_from_settings(None, None) == "disconnect"

    def test_roundtrip_all_values(self):
        for value in ("cancel", "disconnect", "ignore"):
            settings = SetupWizard.error_handling_to_settings(value)
            back = SetupWizard.error_handling_from_settings(
                settings["disconnectOnErrors"],
                settings["ignoreErrorsFromFirmware"],
            )
            assert back == value

    def test_ignore_takes_precedence_when_both_set(self):
        # Cannot happen via the wizard, but must not be ambiguous.
        assert SetupWizard.error_handling_from_settings(True, True) == "ignore"


class TestParseServiceName:
    def test_sysv_style_command(self):
        assert SetupWizard.parse_service_name("sudo service klipper restart") == "klipper"

    def test_systemctl_style_command(self):
        assert (
            SetupWizard.parse_service_name("sudo systemctl restart klipper") == "klipper"
        )

    def test_systemctl_with_unit_suffix(self):
        assert (
            SetupWizard.parse_service_name("sudo systemctl restart klipper.service")
            == "klipper"
        )

    def test_absolute_paths_are_stripped(self):
        assert (
            SetupWizard.parse_service_name("/usr/bin/sudo /bin/systemctl restart klipper")
            == "klipper"
        )

    def test_stop_verb(self):
        assert SetupWizard.parse_service_name("sudo service klipper stop") == "klipper"

    def test_custom_service_name(self):
        assert SetupWizard.parse_service_name("sudo service myklipper restart") == "myklipper"

    def test_flags_are_ignored(self):
        assert (
            SetupWizard.parse_service_name("sudo systemctl --user restart klipper")
            == "klipper"
        )

    def test_empty_returns_none(self):
        assert SetupWizard.parse_service_name("") is None
        assert SetupWizard.parse_service_name(None) is None

    def test_no_recognisable_name_returns_none(self):
        assert SetupWizard.parse_service_name("sudo service restart") is None

    def test_quoted_token_is_unwrapped(self):
        assert SetupWizard.parse_service_name("sudo service 'klipper' restart") == "klipper"


class TestInterpretServiceState:
    def test_active_is_running(self):
        assert SetupWizard.interpret_service_state("active\n") == "running"

    def test_activating_is_running(self):
        assert SetupWizard.interpret_service_state("activating") == "running"

    def test_inactive_is_stopped(self):
        assert SetupWizard.interpret_service_state("inactive") == "stopped"

    def test_dead_is_stopped(self):
        assert SetupWizard.interpret_service_state("dead") == "stopped"

    def test_failed_is_failed(self):
        assert SetupWizard.interpret_service_state("failed") == "failed"

    def test_unknown_text_is_unknown(self):
        assert SetupWizard.interpret_service_state("whatever") == "unknown"

    def test_empty_is_unknown(self):
        assert SetupWizard.interpret_service_state("") == "unknown"
        assert SetupWizard.interpret_service_state(None) == "unknown"


class TestCheckKlipperHost:
    """Klipper's host software only runs on Linux.

    A `~/klipper` directory on Windows is just a source checkout that was
    cloned successfully (git works fine there) — it can never actually run, so
    reporting a green "Klipper found" would be misleading.
    """

    def test_windows_is_flagged_unsupported(self):
        result = SetupWizard.check_klipper_host("Windows", "C:/Users/x/klipper", True, "unknown")
        assert result["supported"] is False
        assert result["status"] == "warning"

    def test_windows_reason_mentions_linux(self):
        result = SetupWizard.check_klipper_host("Windows", "C:/klipper", True, "unknown")
        assert "Linux" in result["reason"]

    def test_windows_reason_mentions_the_platform(self):
        result = SetupWizard.check_klipper_host("Windows", "C:/klipper", True, "unknown")
        assert "Windows" in result["reason"]

    def test_darwin_is_flagged_unsupported(self):
        result = SetupWizard.check_klipper_host("Darwin", "/Users/x/klipper", True, "unknown")
        assert result["supported"] is False

    def test_linux_missing_path_is_warning(self):
        result = SetupWizard.check_klipper_host("Linux", "/home/pi/klipper", False, "unknown")
        assert result["supported"] is True
        assert result["status"] == "warning"

    def test_linux_running_is_ok(self):
        result = SetupWizard.check_klipper_host("Linux", "/home/pi/klipper", True, "running")
        assert result["status"] == "ok"

    def test_linux_stopped_is_warning(self):
        result = SetupWizard.check_klipper_host("Linux", "/home/pi/klipper", True, "stopped")
        assert result["status"] == "warning"

    def test_linux_failed_is_error(self):
        result = SetupWizard.check_klipper_host("Linux", "/home/pi/klipper", True, "failed")
        assert result["status"] == "error"

    def test_linux_unknown_service_is_info(self):
        result = SetupWizard.check_klipper_host("Linux", "/home/pi/klipper", True, "unknown")
        assert result["status"] == "info"

    def test_always_carries_a_reason_and_docs(self):
        for platform_name, exists, svc in (
            ("Windows", True, "unknown"),
            ("Linux", False, "unknown"),
            ("Linux", True, "running"),
            ("Linux", True, "stopped"),
            ("Linux", True, "failed"),
        ):
            result = SetupWizard.check_klipper_host(platform_name, "/k", exists, svc)
            assert result["reason"]
            assert result["docs"].startswith("https://")

    def test_echoes_inputs(self):
        result = SetupWizard.check_klipper_host("Linux", "/home/pi/klipper", True, "running")
        assert result["path"] == "/home/pi/klipper"
        assert result["path_exists"] is True
        assert result["service_state"] == "running"


class TestCheckMoonraker:
    def test_not_installed(self):
        result = SetupWizard.check_moonraker(None)
        assert result["installed"] is False
        assert result["version"] is None

    def test_installed_reports_version(self):
        result = SetupWizard.check_moonraker({"version": "0.1.0"})
        assert result["installed"] is True
        assert result["version"] == "0.1.0"

    def test_always_flagged_experimental(self):
        assert SetupWizard.check_moonraker(None)["experimental"] is True
        assert SetupWizard.check_moonraker({"version": "0.1.0"})["experimental"] is True

    def test_warning_is_always_present(self):
        assert SetupWizard.check_moonraker(None)["warning"]
        assert SetupWizard.check_moonraker({"version": "0.1.0"})["warning"]

    def test_default_port_is_7125(self):
        assert SetupWizard.check_moonraker(None)["port"] == 7125


class TestResolvePath:
    def test_expands_tilde(self):
        resolved = SetupWizard.resolve_path("~/klipper09/klipper")
        assert "~" not in resolved
        assert resolved.endswith(os.path.join("klipper09", "klipper"))

    def test_expands_environment_variables(self, monkeypatch):
        monkeypatch.setenv("KLIPPER_TEST_DIR", os.path.join("srv", "klipper"))
        resolved = SetupWizard.resolve_path("$KLIPPER_TEST_DIR")
        assert resolved.endswith(os.path.join("srv", "klipper"))

    def test_normalizes_separators(self):
        resolved = SetupWizard.resolve_path("~/klipper09//klipper/")
        assert "//" not in resolved
        assert not resolved.endswith(os.sep)

    def test_absolute_path_is_kept(self):
        resolved = SetupWizard.resolve_path("/opt/klipper")
        assert resolved == os.path.normpath("/opt/klipper")

    def test_empty_value_returns_empty(self):
        assert SetupWizard.resolve_path("") == ""
        assert SetupWizard.resolve_path(None) == ""


class TestIsOctoprint2:
    def test_rc_is_treated_as_2(self):
        assert SetupWizard.is_octoprint_2("2.0.0rc6") is True

    def test_final_release_is_2(self):
        assert SetupWizard.is_octoprint_2("2.0.0") is True

    def test_newer_major_is_2(self):
        assert SetupWizard.is_octoprint_2("3.1.0") is True

    def test_1_11_is_not_2(self):
        assert SetupWizard.is_octoprint_2("1.11.0") is False

    def test_garbage_is_not_2(self):
        assert SetupWizard.is_octoprint_2("") is False
        assert SetupWizard.is_octoprint_2(None) is False
        assert SetupWizard.is_octoprint_2("not-a-version") is False


class TestFindMissingIncludes:
    def test_reports_missing_include(self, tmp_path):
        cfg = _write(tmp_path / "printer.cfg", "[include gone.cfg]\n")
        result = SetupWizard.find_missing_includes(cfg)
        assert len(result) == 1
        assert result[0]["include"] == "gone.cfg"

    def test_reports_nested_missing_include(self, tmp_path):
        _write(tmp_path / "mid.cfg", "[include gone.cfg]\n")
        cfg = _write(tmp_path / "printer.cfg", "[include mid.cfg]\n")
        result = SetupWizard.find_missing_includes(cfg)
        assert len(result) == 1
        assert result[0]["include"] == "gone.cfg"

    def test_no_errors_when_all_present(self, tmp_path):
        _write(tmp_path / "mcu.cfg", "[mcu]\n")
        cfg = _write(tmp_path / "printer.cfg", "[include mcu.cfg]\n")
        assert SetupWizard.find_missing_includes(cfg) == []

    def test_missing_baseconfig_returns_empty(self, tmp_path):
        assert SetupWizard.find_missing_includes(str(tmp_path / "nope.cfg")) == []


class TestAdditionalPortsPath:
    def test_octoprint_2_uses_serial_connector_path(self):
        assert SetupWizard.additional_ports_path("2.0.0rc6") == [
            "plugins",
            "serial_connector",
            "additionalPorts",
        ]

    def test_octoprint_2_final_uses_serial_connector_path(self):
        assert SetupWizard.additional_ports_path("2.0.0") == [
            "plugins",
            "serial_connector",
            "additionalPorts",
        ]

    def test_octoprint_1_11_uses_legacy_path(self):
        assert SetupWizard.additional_ports_path("1.11.0") == [
            "serial",
            "additionalPorts",
        ]

    def test_octoprint_1_10_uses_legacy_path(self):
        assert SetupWizard.additional_ports_path("1.10.3") == [
            "serial",
            "additionalPorts",
        ]

    def test_unknown_version_falls_back_to_legacy_path(self):
        assert SetupWizard.additional_ports_path("") == ["serial", "additionalPorts"]
        assert SetupWizard.additional_ports_path(None) == [
            "serial",
            "additionalPorts",
        ]


class TestPreferredSerialPort:
    """A modern ``printer_data`` install should stop defaulting to /tmp/printer."""

    def test_upgrades_the_legacy_default(self):
        assert SetupWizard.preferred_serial_port(
            "/tmp/printer", modern_exists=True
        ) == os.path.expanduser(SetupWizard.MODERN_SERIAL_PORT)

    def test_upgrades_an_empty_port(self):
        assert SetupWizard.preferred_serial_port(
            "", modern_exists=True
        ) == os.path.expanduser(SetupWizard.MODERN_SERIAL_PORT)

    def test_keeps_the_legacy_port_when_the_modern_one_is_missing(self):
        assert (
            SetupWizard.preferred_serial_port("/tmp/printer", modern_exists=False)
            is None
        )

    def test_keeps_a_user_chosen_port(self):
        assert (
            SetupWizard.preferred_serial_port("/dev/ttyUSB0", modern_exists=True)
            is None
        )

    def test_keeps_the_modern_port_it_is_already_using(self):
        modern = os.path.expanduser(SetupWizard.MODERN_SERIAL_PORT)
        assert SetupWizard.preferred_serial_port(modern, modern_exists=True) is None


class TestWithSerialPort:
    """The additional-ports list must lose the old entry, not accumulate both."""

    def test_replaces_the_old_port_and_keeps_the_others(self):
        assert SetupWizard.with_serial_port(
            ["/tmp/printer", "/dev/ttyACM0"], "/home/pi/klippy.serial", "/tmp/printer"
        ) == ["/dev/ttyACM0", "/home/pi/klippy.serial"]

    def test_appends_when_the_port_is_missing(self):
        assert SetupWizard.with_serial_port(
            ["/dev/ttyACM0"], "/home/pi/klippy.serial"
        ) == ["/dev/ttyACM0", "/home/pi/klippy.serial"]

    def test_does_not_duplicate_an_entry(self):
        assert SetupWizard.with_serial_port(["/home/pi/klippy.serial"], "/home/pi/klippy.serial") == [
            "/home/pi/klippy.serial"
        ]

    def test_ignores_an_empty_port(self):
        assert SetupWizard.with_serial_port(["/dev/ttyACM0"], "") == ["/dev/ttyACM0"]
        assert SetupWizard.with_serial_port(None, "") == []


class TestValidateDetectedPort:
    """Only a real, existing serial-port file from the candidate list is accepted."""

    def test_accepts_a_candidate_that_exists(self, tmp_path):
        port = tmp_path / "klippy.serial"
        port.write_text("", encoding="utf-8")
        assert SetupWizard.validate_detected_port(str(port), [str(port)]) == str(port)

    def test_rejects_a_path_that_is_not_a_candidate(self, tmp_path):
        port = tmp_path / "klippy.serial"
        port.write_text("", encoding="utf-8")
        assert SetupWizard.validate_detected_port(str(port), ["/tmp/printer"]) is None

    def test_rejects_a_candidate_that_does_not_exist(self, tmp_path):
        port = str(tmp_path / "klippy.serial")
        assert SetupWizard.validate_detected_port(port, [port]) is None

    def test_rejects_a_relative_path(self):
        assert SetupWizard.validate_detected_port("klippy.serial", ["klippy.serial"]) is None

    def test_rejects_an_empty_value(self):
        assert SetupWizard.validate_detected_port("", []) is None
        assert SetupWizard.validate_detected_port(None, []) is None
