# -*- coding: utf-8 -*-
import os
from os import path
import re
import io
import glob
import sys
import datetime
import subprocess, shlex, platform

from shutil import copy
from flask_babel import gettext

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

def poll_status(self):
    self._printer.commands("STATUS")

def update_status(self, subtype, status):
    send_message(
        self,
        type = "status",
        subtype = subtype,
        payload = status)

def file_exist(self, filepath):
    '''
    Returns true if a file exists and returns false and shows PopUp if not
    '''

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


def copy_file(self, file, dst):
    """Copy the file to the destination.

    Args:
        file (str): Filepath of the file to copy.
        dst (str): Path to copy the file to.

    Returns:
        dict: The result as a dict.
    """

    if os.path.isfile(file):
        try:
            copy(file, dst)
        except IOError as Error:
            log_error(
                self,
                "Error: File not found at: {}".format(file)
            )
            return {
                "status": "error",
                "error": {
                    "message":Error
                }
            }
        else:
            log_debug(
                self,
                "File copied: "
                + file
            )
            return {
                "status": "success"
            }
    return {
        'status': 'error',
        'error': {
            'message': 'File not found at: {}'.format(file)
        }
    }

def save_servicefile(self, content, config_path):
    """Save the service file to the configured path for the configs.

    Args:
        content (str): The content of the servicefile.
        config_path (str): The path to save the servicefile to.

    Returns:
        dict: The result as a dict.
    """

    log_debug(
        self,
        "Save klipper servicefile"
    )

    servicefile_basename= "klipper.service"
    servicefile_path = os.path.join(config_path, servicefile_basename)
    log_debug(self, "Writing Klipper servicefile to {}".format(servicefile_path))

    if not os.path.exists(config_path):
        try:
            os.mkdir(config_path)
        except OSError as Error:
            log_error(self, "Error: Creation of the backup directory {} failed".format(config_path))
            return {'status': 'error', 'error': {'message': Error}}
        else:
            log_debug(self, "Directory {} created".format(config_path))

    try:
        with io.open(servicefile_path, "w", encoding='utf-8') as f:
            f.write(content)
    except IOError as Error:
        log_error(self, "Error: Couldn't write Klipper servicefile: {}".format(servicefile_path))
        return {'status': 'error', 'error': {'message': Error}}
    else:
        log_debug(self, "Written Klipper config to {}".format(servicefile_path))
    finally:
        success, error = copy_servicefile_to_backup(self, servicefile_path)
        if not success:
            return {'status': 'error', 'error': {'message': error}}
    return {'status': 'success', 'data': {'path': servicefile_path}}


# open servicefile and change it using regex
def modify_servicefile(self, servicefile_path, replace, config_path):
    """Open the servicefile and change the content using regex.

    Args:
        servicefile_path (str): The path to the servicefile.
        regex (str): The regex to search for.
        replace (str): The replacement string.
        config_path (str): The path to the configs.

    Returns:
        dict: The result as a dict.
    """

    log_debug(
        self,
        "Change Klipper servicefile"
    )

    try:
        with io.open(servicefile_path, "r", encoding='utf-8') as f:
            content = f.read()
    except IOError as error:
        log_error(self, "Error: Couldn't open Klipper config file: {}".format(servicefile_path))
        return dict(error=dict(message=error))
    else:
        log_debug(self, "Read Klipper config from {}".format(servicefile_path))
        splitted_content = re.split(r"klippy\.py", content)
        after_configpath = re.split(r"^\s?\S*\s?", splitted_content[1])
        content = splitted_content[0] + "klippy.py " + replace + " " + after_configpath[1]

        return save_servicefile(self, content, config_path)


def copy_servicefile_to_backup(self, source):
    """Copy the servicefile to backup directory of OctoKlipper.

    Args:
        source (str): Path to the file to copy.

    Returns:
        bool: True if the file was copied successfully. False otherwise.
        str: Message if the file was not copied.
    """

    if not os.path.isfile(source):
        return False, "Couldn't find Klipper servicefile"

    servicefile_bak_path = os.path.join(self.get_plugin_data_folder(), "configs", "servicefile", "")
    result, error = create_directory(self, servicefile_bak_path)
    if not result:
        return False, error

    log_debug(self, "copy_servicefile_to_backup: " + source + " to " + servicefile_bak_path)
    if source == servicefile_bak_path:
        return False, "Source and destination are the same"
    backups_list = glob.glob1(servicefile_bak_path, "Servicefile*")
    if len(backups_list) >= 5:
        log_debug(self, "deleting oldest backup file: {}".format(backups_list[0]))
        try:
            os.remove(os.path.join(servicefile_bak_path, backups_list[0]))
        except OSError as Error:
            log_error(self, "Error: Couldn't delete oldest backup file: {}".format(backups_list[0]))
            return False, Error
    result, error = copy_file(self, source, servicefile_bak_path + "Servicefile_" + datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + ".bak")
    if not result:
        log_error(self, "Error: Couldn't copy file: {}".format(error))
        return False, error
    log_debug(self, "Servicefile Backup " + servicefile_bak_path + " written")
    return True, None


def get_server_os(self):
    """Get the server os and return it as a dict.

    Returns:
        dict: The result as a dict.
    """
    return {'status' : 'success', 'data' : {'body' : platform.system()}}


def create_directory(self, path):
    """Create a directory.

    Args:
        path (str): The path to the directory.

    Returns:
        dict: The result of the creation as a dict.
    """

    if not os.path.exists(path):
        try:
            os.mkdir(path)
        except OSError as Error:
            log_error(self, "Error: Creation of the directory {} failed".format(path))
            return {'status': 'error', 'error': Error}
        else:
            log_debug(self, "Directory {} created".format(path))
            return {'status': 'success'}
