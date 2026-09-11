def log_info(self, message):
    self._octoklipper_logger.info(message)
    send_message(
        self,
        type = "log",
        subtype = "info",
        title = message,
        payload = message
    )

def log_debug(self, message):
    self._octoklipper_logger.debug(message)
    self._logger.info(message)
    send_message(
        self,
        type = "console",
        subtype = "debug",
        title = message,
        payload = message
    )

def log_error(self, error):
    self._octoklipper_logger.error(error)
    self._logger.error(error)
    send_message(
        self,
        type = "log",
        subtype = "error",
        title = error,
        payload = error
    )

def migrate_old_settings(self, settings):
    '''
    For Old settings
    '''
    migrate_settings(settings, "serialport", "connection", "port")
    migrate_settings(settings, "replace_connection_panel", "connection", "replace_connection_panel")
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
    """        ''''''
    if settings.has(old):
        if new2 != "":
            log_info(self, "migrate setting for '" + old + "' -> '" + new + "/" + new2 + "'")
            settings.set([new, new2], settings.get(old))
        else:
            log_info(self, "migrate setting for '" + old + "' -> '" + new + "'")
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
        log_info(self, "migrate setting for 'configuration/" + old + "' -> 'configuration/" + new + "'")
        settings.set(["configuration", new], settings.get(["configuration", old]))
        settings.remove(["configuration", old])

def update_status(self, subtype, status):
    send_message(
        self,
        type = "status",
        subtype = subtype,
        payload = status)

def file_exist(self, filepath):
    '''
    Returns if a file exists and shows PopUp if not
    '''
    from os import path
    if not path.isfile(filepath):
        log_debug(self, "File: <br />" + filepath + "<br /> does not exist!")
        send_message(
            self,
            type = "PopUp",
            subtype = "warning",
            title = "OctoKlipper Settings",
            payload = "File: <br />" + filepath + "<br /> does not exist!")
        return False
    else:
        return True

def key_exist(dict, key1, key2):
    try:
        dict[key1][key2]
    except KeyError:
        return False
    else:
        return True

def send_message(self, type, subtype, title = "", payload = ""):
        """
        Send Message over API to FrontEnd
        """
        import datetime
        self._plugin_manager.send_plugin_message(
            self._identifier,
            dict(
                time = datetime.datetime.now().strftime("%H:%M:%S"),
                type = type,
                subtype = subtype,
                title = title,
                payload = payload
            )
        )
