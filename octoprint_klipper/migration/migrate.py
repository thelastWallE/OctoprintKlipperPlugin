# -*- coding: utf-8 -*-
import octoprint_klipper.utils.logger as logger


def migrate_old_settings(settings):
    """
    For Old settings
    """
    migrate_settings(settings, "serialport", "connection", "port")
    migrate_settings(
        settings, "replace_connection_panel", "connection", "replace_connection_panel"
    )
    migrate_settings(settings, "probeHeight", "probe", "height")
    migrate_settings(settings, "probeLift", "probe", "lift")
    migrate_settings(settings, "probeSpeedXy", "probe", "speed_xy")
    migrate_settings(settings, "probeSpeedZ", "probe", "speed_z")
    migrate_settings(settings, "configPath", "configuration", "configpath")

    if settings.has(["probePoints"]):
        points = settings.get(["probePoints"])
        points_new = [dict(name="", x=int(p["x"]), y=int(p["y"]), z=0) for p in points]
        settings.set(["probe", "points"], points_new)
        settings.remove(["probePoints"])


def migrate_settings(self, settings, old, new, new2=""):
    """migrate setting to setting with an additional path

    Args:
        settings (any): instance of self._settings
        old (str): the old setting to migrate
        new (str): group or only new setting if there is no new2
        new2 (str, optional): the new setting to migrate to. Defaults to "".
    """ """"""
    if settings.has(old):
        if new2 != "":
            logger.log_info(
                self,
                "migrate setting for '" + old + "' -> '" + new + "/" + new2 + "'",
                only_logging=False,
            )
            settings.set([new, new2], settings.get(old))
        else:
            logger.log_info(
                self,
                "migrate setting for '" + old + "' -> '" + new + "'",
                only_logging=False,
            )
            settings.set([new], settings.get(old))
        settings.remove(old)


def migrate_settings_configuration(self, settings, new, old):
    """migrate setting in path configuration to new name

    :param settings: the class of the mixin
    :type settings: class
    :param new: new name
    :type new: str
    :param old: the old name
    :type old: str
    """

    if settings.has(["configuration", old]):
        logger.log_info(
            self,
            "migrate setting for 'configuration/"
            + old
            + "' -> 'configuration/"
            + new
            + "'",
            only_logging=False,
        )
        settings.set(["configuration", new], settings.get(["configuration", old]))
        settings.remove(["configuration", old])
