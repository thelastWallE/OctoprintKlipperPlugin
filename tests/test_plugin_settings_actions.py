"""Tests for the plugin's settings writes performed by the setup wizard."""
from unittest import mock

import pytest

from octoprint_klipper import KlipperPlugin


@pytest.fixture
def patched_version():
    with mock.patch(
        "octoprint_klipper.octoprint_version.get_octoprint_version_string"
    ) as version:
        yield version


def _save_kwargs(plugin_self):
    assert plugin_self._settings.save.call_count == 1
    return plugin_self._settings.save.call_args.kwargs


def test_set_error_handling_writes_2_0_path(plugin_self, patched_version):
    patched_version.return_value = "2.0.0rc6"

    KlipperPlugin._set_error_handling(plugin_self, "cancel")

    plugin_self._settings.global_set.assert_called_once_with(
        ["plugins", "serial_connector", "errorHandling"], "cancel"
    )


def test_set_error_handling_notifies_clients_on_2_0(plugin_self, patched_version):
    """Clients cache the settings tree, so they must be told to refresh.

    Without the event OctoPrint's own serial settings keep showing the value
    from before the fix, and a later save from that stale tree can write it
    back.
    """
    patched_version.return_value = "2.0.0rc6"

    KlipperPlugin._set_error_handling(plugin_self, "cancel")

    kwargs = _save_kwargs(plugin_self)
    assert kwargs.get("force") is True
    assert kwargs.get("trigger_event") is True


def test_set_error_handling_writes_1_11_booleans(plugin_self, patched_version):
    patched_version.return_value = "1.11.1"

    KlipperPlugin._set_error_handling(plugin_self, "cancel")

    assert plugin_self._settings.global_set.call_args_list == [
        mock.call(["serial", "disconnectOnErrors"], False),
        mock.call(["serial", "ignoreErrorsFromFirmware"], False),
    ]


def test_set_error_handling_notifies_clients_on_1_11(plugin_self, patched_version):
    patched_version.return_value = "1.11.1"

    KlipperPlugin._set_error_handling(plugin_self, "cancel")

    kwargs = _save_kwargs(plugin_self)
    assert kwargs.get("force") is True
    assert kwargs.get("trigger_event") is True


def test_set_port_notifies_clients(plugin_self, patched_version):
    patched_version.return_value = "2.0.0rc6"
    plugin_self._settings.get.return_value = "/tmp/printer"
    plugin_self._additional_ports_path = lambda: [
        "plugins",
        "serial_connector",
        "additionalPorts",
    ]

    with mock.patch("octoprint_klipper.flask.jsonify") as jsonify:
        jsonify.return_value = "response"
        KlipperPlugin._apply_setup_wizard(
            plugin_self,
            {"action": "setPort", "value": "C:\\Users\\Sven\\printer_data\\comms\\klippy.serial"},
        )

    plugin_self._settings.set.assert_called_once_with(
        ["connection", "port"], "C:\\Users\\Sven\\printer_data\\comms\\klippy.serial"
    )
    kwargs = _save_kwargs(plugin_self)
    assert kwargs.get("force") is True
    assert kwargs.get("trigger_event") is True


def test_add_port_notifies_clients(plugin_self, patched_version):
    patched_version.return_value = "2.0.0rc6"
    plugin_self._settings.get.return_value = "C:\\Users\\Sven\\printer_data\\comms\\klippy.serial"
    plugin_self._settings.global_get.return_value = ["VIRTUAL"]
    plugin_self._additional_ports_path = lambda: [
        "plugins",
        "serial_connector",
        "additionalPorts",
    ]

    with mock.patch("octoprint_klipper.flask.jsonify") as jsonify:
        jsonify.return_value = "response"
        KlipperPlugin._apply_setup_wizard(plugin_self, {"action": "addPort"})

    plugin_self._settings.global_set.assert_called_once_with(
        ["plugins", "serial_connector", "additionalPorts"],
        ["VIRTUAL", "C:\\Users\\Sven\\printer_data\\comms\\klippy.serial"],
    )
    kwargs = _save_kwargs(plugin_self)
    assert kwargs.get("force") is True
    assert kwargs.get("trigger_event") is True


def test_use_detected_port_notifies_clients(plugin_self, patched_version, tmp_path):
    patched_version.return_value = "2.0.0rc6"
    modern_port = tmp_path / "klippy.serial"
    modern_port.touch()
    plugin_self._settings.get.return_value = "/tmp/printer"
    plugin_self._settings.global_get.return_value = ["VIRTUAL", "/tmp/printer"]
    plugin_self._serial_port_candidates = lambda: [str(modern_port)]
    plugin_self._additional_ports_path = lambda: [
        "plugins",
        "serial_connector",
        "additionalPorts",
    ]

    with mock.patch("octoprint_klipper.flask.jsonify") as jsonify:
        jsonify.return_value = "response"
        KlipperPlugin._apply_setup_wizard(
            plugin_self,
            {"action": "useDetectedPort", "value": str(modern_port)},
        )

    kwargs = _save_kwargs(plugin_self)
    assert kwargs.get("force") is True
    assert kwargs.get("trigger_event") is True
