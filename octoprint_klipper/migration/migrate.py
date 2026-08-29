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


def migrate_settings_3(self, settings):
    migrate_settings(
        self,
        settings,
        ["configuration", "navbar"],
        ["configuration", "shortStatus_navbar"],
    )


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


def migrate_settings_6(self, settings):
    """macros=[
        dict(
            name="E-Stop",
            macro="M112",
            sidebar=True,
            tab=True,
            buttonColor="", <- new
            buttonStyle=""  <- new
        )
    ],"""

    macros = settings.get(["macros"])
    logger.log_info(self, "migrate setting from " + str(macros), only_logging=True)

    for index in range(len(macros)):
        macros[index]["buttonColor"] = ""
        macros[index]["buttonStyle"] = ""

    logger.log_info(self, "migrate setting to " + str(macros), only_logging=True)
    settings.set(["macros"], macros)


def migrate_settings_7(self, settings):
    old_log_path = settings.get(["configuration", "logpath"])
    if old_log_path[-4:] == ".log":
        new_log_path = os.path.dirname(old_log_path)
        logger.log_info(
            self,
            "migrate setting for 'configuration/logpath': "
            + old_log_path
            + " -> "
            + new_log_path,
            only_logging=False,
        )
        settings.set(["configuration", "logpath"], new_log_path)


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


def migrater(self, current, settings):
    """migrate settings to new version

    Args:
        current (int): current version
        settings (any): instance of self._settings

    Returns:
        int: current version
    """
    migrate_functions = {
        "3": migrate_settings_3,
        "4": migrate_settings_4,
        "5": migrate_settings_5,
        "6": migrate_settings_6,
        "7": migrate_settings_7,
    }

    if current is not None:
        try:
            migrate_functions[str(current + 1)](self, settings)
        except Exception as err:
            logger.log_error(self, err, only_logging=False)
            raise
        else:
            current += 1
    return current
