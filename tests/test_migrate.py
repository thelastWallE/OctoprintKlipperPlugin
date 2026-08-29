"""Tests for octoprint_klipper.migration.migrate."""
import pytest

from octoprint_klipper.migration import migrate


class MockSettings:
    """Minimal stand-in for OctoPrint's PluginSettings used by the migrations."""

    def __init__(self, data):
        self.data = data

    def has(self, path):
        d = self.data
        for key in path:
            if not isinstance(d, dict) or key not in d:
                return False
            d = d[key]
        return True

    def get(self, path):
        d = self.data
        for key in path:
            d = d[key]
        return d

    def set(self, path, value):
        d = self.data
        for key in path[:-1]:
            d = d.setdefault(key, {})
        d[path[-1]] = value

    def remove(self, path):
        d = self.data
        for key in path[:-1]:
            d = d[key]
        del d[path[-1]]


class TestMigrateSettings:
    def test_renames_setting(self):
        settings = MockSettings({"serialport": "/tmp/printer"})
        migrate.migrate_settings(None, settings, ["serialport"], ["connection", "port"])
        assert settings.get(["connection", "port"]) == "/tmp/printer"
        assert not settings.has(["serialport"])

    def test_removes_setting_when_no_new_path(self):
        settings = MockSettings({"old_config": "x"})
        migrate.migrate_settings(None, settings, ["old_config"])
        assert not settings.has(["old_config"])

    def test_does_nothing_when_old_setting_missing(self):
        settings = MockSettings({"connection": {"port": "/tmp/printer"}})
        migrate.migrate_settings(None, settings, ["serialport"], ["connection", "port"])
        assert settings.get(["connection", "port"]) == "/tmp/printer"


class TestMigrateSettings7:
    def test_strips_log_extension_from_logpath(self):
        settings = MockSettings({"configuration": {"logpath": "/tmp/klippy.log"}})
        migrate.migrate_settings_7(None, settings)
        assert settings.get(["configuration", "logpath"]) == "/tmp"

    def test_leaves_logpath_without_extension_unchanged(self):
        settings = MockSettings({"configuration": {"logpath": "/tmp/"}})
        migrate.migrate_settings_7(None, settings)
        assert settings.get(["configuration", "logpath"]) == "/tmp/"


class TestMigrater:
    def test_steps_one_version(self):
        settings = MockSettings({"configuration": {"logpath": "/tmp/klippy.log"}})
        current = migrate.migrater(None, 6, settings)
        assert current == 7
        assert settings.get(["configuration", "logpath"]) == "/tmp"

    def test_migrate_settings_3_renames_navbar(self):
        settings = MockSettings({"configuration": {"navbar": True}})
        migrate.migrate_settings_3(None, settings)
        assert settings.get(["configuration", "shortStatus_navbar"]) is True
        assert not settings.has(["configuration", "navbar"])