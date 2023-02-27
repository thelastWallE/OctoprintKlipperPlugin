# -*- coding: utf-8 -*-
import os
import octoprint_klipper.utils.logger as logger


def migrate_old_settings(self, settings):
    """
    For Old settings
    """
    migrate_settings(self, settings, ["serialport"], ["connection", "port"])
    migrate_settings(
        self,
        settings,
        ["replace_connection_panel"],
        ["connection", "replace_connection_panel"],
    )
    migrate_settings(self, settings, ["probeHeight"], ["probe", "height"])
    migrate_settings(self, settings, ["probeLift"], ["probe", "lift"])
    migrate_settings(self, settings, ["probeSpeedXy"], ["probe", "speed_xy"])
    migrate_settings(self, settings, ["probeSpeedZ"], ["probe", "speed_z"])
    migrate_settings(self, settings, ["configPath"], ["configuration", "configpath"])

    if settings.has(["probePoints"]):
        points = settings.get(["probePoints"])
        points_new = [dict(name="", x=int(p["x"]), y=int(p["y"]), z=0) for p in points]
        settings.set(["probe", "points"], points_new)
        settings.remove(["probePoints"])


def migrate_settings_4(self, settings):
    if settings.has(["configuration", "configpath"]):
        cfg_path = settings.get(["configuration", "configpath"])
        new_cfg_path, baseconfig = os.path.split(cfg_path)
        logger.log_info(
            self,
            "migrate setting for 'configuration/config_path': "
            + cfg_path
            + " -> "
            + new_cfg_path,
            only_logging=False,
        )
        logger.log_info(
            self,
            "migrate setting for 'configuration/baseconfig': printer.cfg -> "
            + baseconfig,
            only_logging=False,
        )
        settings.set(["configuration", "config_path"], new_cfg_path)
        settings.set(["configuration", "baseconfig"], baseconfig)
        settings.remove(["configuration", "configpath"])
    if (
        settings.has(["configuration", "reload_command"])
        and settings.get(["configuration", "reload_command"]) == "manually"
    ):
        logger.log_info(
            self,
            "migrate setting for 'configuration/restart_onsave': True -> False",
            only_logging=False,
        )
        settings.set(["configuration", "restart_onsave"], False)
        settings.remove(["configuration", "reload_command"])

    if settings.has(["config"]):
        settings.remove(["config"])

    if settings.has(["configuration", "old_config"]):
        settings.remove(["configuration", "old_config"])


def migrate_settings_5(self, settings):
    migrate_settings(
        self,
        settings,
        ["configuration", "reload_command"],
        ["configuration", "reload_used"],
    )
    migrate_settings(
        self,
        settings,
        ["configuration", "restart_host_command"],
        ["configuration", "restart_service_system_command"],
    )


def migrate_settings(self, settings, old, new=""):
    """migrate a setting to setting with new name and/or position.
    If new is unset only delete the setting

    Args:
        settings (any): instance of self._settings
        old (list): the old setting to migrate
        new (list): the new setting
    """
    if settings.has(old):
        # just like a renaming for the setting
        if new != "":
            logger.log_info(
                self, "migrate setting for '" + str(old) + "' -> '" + str(new) + "'"
            )
            settings.set(new, settings.get(old))
        settings.remove(old)


def migrate_settings_to_new(self, settings, to_version):
    if to_version == 3:
        migrate_settings(
            self,
            settings,
            ["configuration", "navbar"],
            ["configuration", "shortStatus_navbar"],
        )
    elif to_version == 4:
        migrate_settings_4(self, settings)
    elif to_version == 5:
        migrate_settings_5(self, settings)


def migrater(self, current, settings):
    if current is not None:
        try:
            migrate_settings_to_new(self, settings, current + 1)
        except Exception as err:
            logger.log_error(self, err, only_logging=False)
            raise
        else:
            current += 1
    return current
