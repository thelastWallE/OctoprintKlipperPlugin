# -*- coding: utf-8 -*-
from __future__ import absolute_import, division, print_function, unicode_literals
import glob
import os
import time
import sys
import io
import flask

import octoprint_klipper.utils.logger as logger
import octoprint_klipper.utils.extra as extra

from flask_babel import gettext
from shutil import copyfile

if sys.version_info[0] < 3:
    import StringIO
    import ConfigParser as configparser
else:
    import configparser


def list_config_files(self, path_type):
    """Generate list of config files.

    Args:
        path (str): Path to the config files.

    Returns:
        dict: Status and the list of config files.
    """

    files = []
    if path_type == "backup":
        cfg_path = os.path.join(self.get_plugin_data_folder(), "configs", "*")
    else:
        cfg_path = os.path.expanduser(
            self._settings.get(["configuration", "config_path"])
        )
        cfg_path = os.path.join(cfg_path, "*.cfg")
    cfg_files = glob.glob(cfg_path)
    logger.log_debug(
        self, "list_cfg_files " + path_type + " Path: " + cfg_path, only_logging=False
    )

    for f in cfg_files:
        filesize = os.path.getsize(f)
        filemdate = time.localtime(os.path.getmtime(f))
        if path_type != "backup":
            url = (
                flask.url_for("index")
                + "plugin/klipper/download/configs/"
                + os.path.basename(f)
            )
        else:
            url = (
                flask.url_for("index")
                + "plugin/klipper/download/backup/"
                + os.path.basename(f)
            )
        files.append(
            dict(
                name=os.path.basename(f),
                file=f,
                size=" ({:.1f} KB)".format(filesize / 1000.0),
                mdate=time.strftime("%d.%m.%Y %H:%M", filemdate),
                url=url,
            )
        )
        logger.log_debug(
            self, "list_cfg_files " + str(len(files)) + ": " + f, only_logging=False
        )
    return {"status": "success", "data": {"files": files}}


def get_cfg(self, file):
    """Get the content of a configuration file.

    Args:
        file (str): The name of the file to read

    Returns:
        dict: Status and the content of the file.
    """

    if not file:
        cfg_path = os.path.expanduser(
            self._settings.get(["configuration", "configpath"])
        )
        file = os.path.join(
            cfg_path, self._settings.get(["configuration", "baseconfig"])
        )
    if extra.file_exist(self, file):
        logger.log_debug(self, "get_cfg_files Path: " + file, only_logging=False)
        try:
            with io.open(file, "r", encoding="utf-8") as f:
                file_content = f.read()
        except IOError as Err:
            logger.log_error(
                self,
                gettext("Error: Klipper config file not found at:")
                + " {}".format(file)
                + "\n"
                + gettext("IOError:")
                + " {}".format(Err),
                only_logging=False,
            )
            status = "error"
            error_text = Err
        except UnicodeDecodeError as Err:
            logger.log_error(
                self,
                gettext("Decode Error:")
                + "\n"
                + "{}".format(Err)
                + "\n\n"
                + gettext("Please convert your config files to utf-8!")
                + "\n"
                + gettext(
                    "Or you can also paste your config \ninto the Editor and save it."
                ),
                only_logging=False,
            )
            status = "error"
            error_text = Err
        else:
            status = "success"
    else:
        status = "error"
        error_text = gettext("File not found!")
    if status == "success":
        return dict(status=status, data=dict(body=file_content))
    else:
        return dict(status=status, error=dict(message=error_text))


def save_cfg(self, content, filename):
    """Save the configuration file to given file.

    Args:
        content (str): The content of the configuration.
        filename (str): The filename of the configuration file. Default is "printer.cfg"

    Returns:
        dict: Status and error text.
    """

    logger.log_debug(self, "Save klipper config", only_logging=False)

    configpath = os.path.expanduser(
        self._settings.get(["configuration", "config_path"])
    )
    if filename == "":
        filename = self._settings.get(["configuration", "baseconfig"])
    if filename[-4:] != ".cfg":
        filename += ".cfg"

    filepath = os.path.join(configpath, filename)

    results = extra.create_directory(self, configpath)
    if results["status"] == "error":
        return results

    logger.log_debug(
        self, "Writing Klipper config to {}".format(filepath), only_logging=False
    )
    try:
        with io.open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
    except IOError:
        logger.log_error(
            self,
            "Error: Couldn't open Klipper config file: {}".format(filepath),
            only_logging=False,
        )
        return {
            "status": "error",
            "error": {
                "message": gettext(
                    "Error: Couldn't open Klipper config file: {}".format(filepath)
                )
            },
        }
    else:
        logger.log_debug(
            self, "Written Klipper config to {}".format(filepath), only_logging=False
        )
    finally:
        results = copy_cfg_to_backup(self, filepath)
        if results["status"] == "error":
            return results
    return {
        "status": "success",
        "data": {"body": gettext("Klipper config file saved!")},
    }


def check_config(self, data):
    """Checks the given data on parsing errors.

    Args:
        data (str): Content to be validated.

    Returns:
        dict: Status and if errors also the error message.
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
        parsed_error = parse_error_message(self, error)
        logger.log_debug(self, "check_cfg: NOK!", only_logging=False)
        return {"status": "error", "error": {"message": parsed_error}}
    else:
        result = check_float(self, dataToValidated)
        if result["status"] == "error":
            logger.log_debug(self, "check_cfg: NOK!", only_logging=False)
            return result
        logger.log_debug(self, "check_cfg: OK", only_logging=False)
        return {"status": "success"}


def parse_error_message(self, error):
    error.message = error.message.replace("\\n", "")
    if sys.version_info[0] < 3:
        error.message = error.message.replace("file: u", "Klipper Configuration", 1)
        error.message = error.message.replace("'", "", 2)
        error.message = error.message.replace("u'", "'", 1)
    else:
        error.message = error.message.replace("file:", "Klipper Configuration", 1)
        error.message = error.message.replace("'", "", 2)
    return error.message


def check_float(self, dataToValidated):
    """Checks if the float values in the config file are valid.

    Args:
        dataToValidated (ConfigParser): ConfigParser object with the data to be validated.

    Returns:
        dict: Status and if failed also the error text.
    """

    sections_search_list = ["bltouch", "probe"]
    value_search_list = ["x_offset", "y_offset", "z_offset"]
    error_list = []
    try:
        # cycle through sections and then values
        for y in sections_search_list:
            for x in value_search_list:
                if dataToValidated.has_option(y, x):
                    a_float = dataToValidated.getfloat(y, x)
    except ValueError as error:
        complete_error = "\n"
        +"Invalid Value for <b>" + x + "</b> in Section: <b>" + y + "</b>\n"
        +"{}".format(str(error))
        error_list.append(complete_error)
        """ send_message(
            self,
            type = "PopUp",
            subtype = "warning",
            title = "Invalid Config data\n",
            payload = "\n"
                + "Invalid Value for <b>" + x + "</b> in Section: <b>" + y + "</b>\n"
                + "{}".format(str(error))
        ) """
        pass
    else:
        return {"status": "success"}
    finally:
        if error_list:
            return {"status": "error", "error": {"message": error_list}}


def copy_cfg_to_backup(self, src):
    """Copy the config file to backup directory of OctoKlipper.

    Args:
        src (str): Path to the config file to copy.

    Returns:
        dict: Status of the operation.
    """

    if not os.path.isfile(src):
        logger.log_error(
            self, "Error: Config file not found: {}".format(src), only_logging=False
        )
        return {
            "status": "error",
            "error": {
                "message": gettext("Error: Config file not found: {}".format(src))
            },
        }

    cfg_path = os.path.join(self.get_plugin_data_folder(), "configs", "")
    filename = os.path.basename(src)
    results = extra.create_directory(self, cfg_path)
    if results["status"] == "error":
        return results

    dst = os.path.join(cfg_path, filename)
    logger.log_debug(
        self, "copy_cfg_to_backup:" + src + " to " + dst, only_logging=False
    )
    if src == dst:
        return {
            "status": "error",
            "error": {"message": "Source and destination are the same"},
        }
    try:
        copyfile(src, dst)
    except IOError:
        logger.log_error(
            self,
            "Error: Couldn't copy Klipper config file to {}".format(dst),
            only_logging=False,
        )
        return {
            "status": "error",
            "error": {"message": "Couldn't copy Klipper config file to {}".format(dst)},
        }
    else:
        logger.log_debug(self, "CfgBackup " + dst + " written", only_logging=False)
        return {
            "status": "success",
            "data": {"body": gettext("Klipper config file copied to {}".format(dst))},
        }
