from __future__ import absolute_import, division, print_function, unicode_literals

import glob
import io
import os
import sys
import time
from shutil import copy, copyfile

import flask
from flask_babel import gettext

from octoprint_klipper.util import file_exist, log_debug, log_error, send_message

try:
    import configparser
except ImportError:
    import ConfigParser as configparser

if sys.version_info[0] < 3:
    import StringIO


def list_cfg_files(self, path):
    """Generate list of config files.

    Args:
        path (str): Path to the config files.

    Returns:
        list: for every file a dict with keys for name, file, size, mdate, url.
    """

    files = []
    if path=="backup":
        cfg_path = os.path.join(self.get_plugin_data_folder(), "configs", "*")
    else:
        cfg_path = os.path.expanduser(
            self._settings.get(["configuration", "config_path"])
        )
        cfg_path = os.path.join(cfg_path, "*.cfg")
    cfg_files = glob.glob(cfg_path)
    log_debug(self, "list_cfg_files Path: " + cfg_path)

    for f in cfg_files:
        filesize = os.path.getsize(f)
        filemdate = time.localtime(os.path.getmtime(f))
        if path != "backup":
            url = flask.url_for("index") + "plugin/klipper/download/configs/" + os.path.basename(f)
        else:
            url = flask.url_for("index") + "plugin/klipper/download/backup/" + os.path.basename(f)
        files.append(dict(
            name= os.path.basename(f),
            file= f,
            size= " ({:.1f} KB)".format(filesize / 1000.0),
            mdate= time.strftime("%d.%m.%Y %H:%M", filemdate),
            url= url,
        ))
        log_debug(self, "list_cfg_files " + str(len(files)) + ": " + f)
    return files


def get_cfg(self, file):
    """Get the content of a configuration file.

    Args:
        file (str): The name of the file to read

    Returns:
        dict:
            config (str): The configuration of the file
            text (str): The text of the error
    """

    response = {"config":"",
                "text": ""}
    if not file:
        cfg_path = os.path.expanduser(
            self._settings.get(["configuration", "configpath"])
        )
        file = os.path.join(cfg_path, self._settings.get(["configuration", "baseconfig"]))
    if file_exist(self, file):
        log_debug(self, "get_cfg_files Path: " + file)
        try:
            with io.open(file, "r", encoding='utf-8') as f:
                response['config'] = f.read()
        except IOError as Err:
            log_error(
                self,
                gettext("Error: Klipper config file not found at:")
                + " {}".format(file)
                + "\n"
                + gettext("IOError:") + " {}".format(Err)
            )
            response['text'] = Err
            return response
        except UnicodeDecodeError as Err:
            log_error(
                self,
                gettext("Decode Error:")
                +"\n"
                + "{}".format(Err)
                + "\n\n"
                + gettext("Please convert your config files to utf-8!")
                + "\n"
                + gettext("Or you can also paste your config \ninto the Editor and save it.")
            )
            response['text'] = Err
            return response
        else:
            return response
    else:
        response['text'] = gettext("File not found!")
        return response


def save_cfg(self, content, filename):
    """Save the configuration file to given file.

    Args:
        content (str): The content of the configuration.
        filename (str): The filename of the configuration file. Default is "printer.cfg"

    Returns:
        bool: True if the configuration file was saved successfully. Otherwise False
    """

    log_debug(
        self,
        "Save klipper config"
    )


    configpath = os.path.expanduser(self._settings.get(["configuration", "config_path"]))
    if filename == "":
        filename = self._settings.get(["configuration", "baseconfig"])
    if filename[-4:] != ".cfg":
        filename += ".cfg"

    filepath = os.path.join(configpath, filename)

    log_debug(self, "Writing Klipper config to {}".format(filepath))
    try:
        with io.open(filepath, "w", encoding='utf-8') as f:
            f.write(content)
    except IOError:
        log_error(self, "Error: Couldn't open Klipper config file: {}".format(filepath))
        return False
    else:
        log_debug(self, "Written Klipper config to {}".format(filepath))
        return True
    finally:
        copy_cfg_to_backup(self, filepath)


def check_cfg_ok(self, data):
    """Checks the given data on parsing errors.

    Args:
        data (str): Content to be validated.

    Returns:
        bool: True if the data is valid. False if it is not.
    """
    try:
        dataToValidated = configparser.RawConfigParser(strict=False)
        if sys.version_info[0] < 3:
            import StringIO
            buf = StringIO.StringIO(data)
            dataToValidated.readfp(buf)
        else:
            dataToValidated.read_string(data)
    except configparser.Error as error:
        show_error_message(self, error)
        log_debug(self, 'check_cfg: NOK!')
        return False
    else:
        if not is_float_ok(self, dataToValidated):
            log_debug(self, "check_cfg: NOK!")
            return False
        log_debug(self, "check_cfg: OK")
        return True


def show_error_message(self, error):
    error.message = error.message.replace('\\n', '')
    if sys.version_info[0] < 3:
        error.message = error.message.replace('file: u', 'Klipper Configuration', 1)
        error.message = error.message.replace("'", '', 2)
        error.message = error.message.replace("u'", "'", 1)
    else:
        error.message = error.message.replace('file:', 'Klipper Configuration', 1)
        error.message = error.message.replace("'", '', 2)
    log_error(
        self,
        ('Error: Invalid Klipper config file:\n' + '{}'.format(str(error))),
    )


def is_float_ok(self, dataToValidated):

    sections_search_list = [
        "bltouch",
        "probe"
    ]
    value_search_list = [
        "x_offset",
        "y_offset",
        "z_offset"
    ]
    try:
        # cycle through sections and then values
        for y in sections_search_list:
            for x in value_search_list:
                if dataToValidated.has_option(y, x):
                    dataToValidated.getfloat(y, x)
    except ValueError as error:
        log_error(
            self,
            "Error: Invalid Value for <b>" + x + "</b> in Section: <b>" + y + "</b>\n"
            + "{}".format(str(error))
        )
        send_message(
            self,
            type = "PopUp",
            subtype = "warning",
            title = "Invalid Config data\n",
            payload = "\n"
                + "Invalid Value for <b>" + x + "</b> in Section: <b>" + y + "</b>\n"
                + "{}".format(str(error))
        )
        return False
    else:
        return True


def copy_cfg(self, file, dst):
    """Copy the config file to the destination.

    Args:
        file (str): Filepath of the config file to copy.
        dst (str): Path to copy the config file to.

    Returns:
        bool: True if the copy succeeded, False otherwise.
    """

    if os.path.isfile(file):
        try:
            copy(file, dst)
        except IOError:
            log_error(
                self,
                "Error: Klipper config file not found at: {}".format(file)
            )
            return False
        else:
            log_debug(
                self,
                "File copied: "
                + file
            )
            return True
    return False


def copy_cfg_to_backup(self, src):
    """Copy the config file to backup directory of OctoKlipper.

    Args:
        src (str): Path to the config file to copy.

    Returns:
        bool: True if the config file was copied successfully. False otherwise.
    """

    if not os.path.isfile(src):
        return False

    cfg_path = os.path.join(self.get_plugin_data_folder(), "configs", "")
    filename = os.path.basename(src)
    if not os.path.exists(cfg_path):
        try:
            os.mkdir(cfg_path)
        except OSError:
            log_error(self, "Error: Creation of the backup directory {} failed".format(cfg_path))
            return False
        else:
            log_debug(self, "Directory {} created".format(cfg_path))

    dst = os.path.join(cfg_path, filename)
    log_debug(self, "copy_cfg_to_backup:" + src + " to " + dst)
    if src == dst:
        return False
    try:
        copyfile(src, dst)
    except IOError:
        log_error(
            self,
            "Error: Couldn't copy Klipper config file to {}".format(dst)
        )
        return False
    else:
        log_debug(self, "CfgBackup " + dst + " written")
        return True
