# -*- coding: utf-8 -*-
import os
import datetime
import glob
import io
import re
import sarge
import subprocess
from os import path


from octoprint.util.platform import CLOSE_FDS

from shutil import copy
from flask_babel import gettext

import sys

if sys.version_info[0] < 3:
    import logger
else:
    import octoprint_klipper.utils.logger as logger


class basedict(dict):
    def __missing__(self, key):
        value = self[key] = type(self)()
        return value


def poll_status(self):
    self._printer.commands("STATUS")


def update_status(self, subtype, status):
    send_message(self, type="status", subtype=subtype, payload=status)


def file_exists(self, filepath):
    """
    Returns true if a file exists else false
    """

    if not path.isfile(filepath):
        logger.log_debug(
            self,
            gettext("File")
            + ": <br />"
            + filepath
            + "<br /> "
            + gettext("does not exist!"),
            only_logging=False,
        )
        return False
    else:
        return True


def folder_exists(self, folderpath):
    """
    Returns true if a folder exists else false
    """

    if not path.isdir(folderpath):
        logger.log_debug(
            self,
            gettext("Folder")
            + ": <br />"
            + folderpath
            + "<br /> "
            + gettext("does not exist!"),
            only_logging=False,
        )
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


def send_message(self, type, subtype, title="", payload="", hide=True):
    """
    Send Message over API to FrontEnd
    """

    self._plugin_manager.send_plugin_message(
        self._identifier,
        dict(
            time=datetime.datetime.now().strftime("%H:%M:%S"),
            type=type,
            subtype=subtype,
            title=title,
            payload=payload,
            autohide=hide,
        ),
    )


def execute_command(self, command):
    """Runs a cmd on the shell
    and gives the output back and a status.

    :param command: command to run
    :type command: string
    :return: Output of the command and True if no errors else False
    :rtype: tuple
    """
    logger.log_info(
        self,
        "Command: {}".format(command),
        only_logging=True,
    )

    # we run this with shell=True since we have to trust whatever
    # our admin configured as command and since we want to allow
    # shell-alike handling here...
    env = os.environ.copy()
    # Never let git prompt for credentials (would hang the request)
    env["GIT_TERMINAL_PROMPT"] = "0"
    p = sarge.run(
        command,
        close_fds=CLOSE_FDS,
        shell=True,
        stdout=sarge.Capture(),
        stderr=sarge.Capture(),
        env=env,
    )

    output_text2 = p.stdout.text
    output_error2 = p.stderr.text

    logger.log_info(
        self,
        "output_text2: {}, output_error2: {}".format(output_text2, output_error2),
        only_logging=True,
    )

    # Determine success by the exit code, not by whether something was
    # written to stderr (e.g. git clone writes its progress to stderr).
    if p.returncode != 0:
        logger.log_debug(
            self,
            "Error: {}".format(output_error2 or output_text2),
            only_logging=False,
        )
        return str(output_error2 or output_text2), False

    return str(output_text2), True


def execute_command_stream(self, command, on_line, stdin_data=None):
    """Runs a cmd on the shell and streams the output line by line.

    The command runs in the foreground and each output line (stdout and
    stderr merged) is passed to the ``on_line`` callback as it is produced.

    :param command: command to run
    :type command: string
    :param on_line: callback called with ``(line, stream)`` for each line
    :type on_line: callable
    :param stdin_data: optional data to write to the command's stdin before
        reading its output (e.g. a sudo password for ``sudo -S``)
    :type stdin_data: str or None
    :return: True if the command exited successfully, False otherwise
    :rtype: bool
    """
    logger.log_info(
        self,
        "Command: {}".format(command),
        only_logging=True,
    )

    env = os.environ.copy()
    # Never let git prompt for credentials (would hang the request)
    env["GIT_TERMINAL_PROMPT"] = "0"
    p = subprocess.Popen(
        command,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.PIPE if stdin_data is not None else None,
        universal_newlines=True,
        bufsize=1,
        close_fds=CLOSE_FDS,
        env=env,
    )
    if stdin_data is not None:
        p.stdin.write(stdin_data)
        p.stdin.close()
    for line in p.stdout:
        on_line(line.rstrip("\n"), "stdout")
    p.wait()

    logger.log_info(
        self,
        "Command exit code: {}".format(p.returncode),
        only_logging=True,
    )
    return p.returncode == 0


def is_float(value):
    try:
        float(value)
        return True
    except ValueError:
        return False


def split_filename_path(filename):
    """Split a filename that may contain path separators into ``(path, name)``.

    The filename is treated as a storage-relative path. If it contains ``/`` or
    ``\\``, the last element is the file name and everything before it is the
    path. Otherwise the path is ``""`` and the whole string is the file name.

    Args:
        filename (str): The filename to split.

    Returns:
        tuple: ``(path, name)``
    """
    if "/" in filename or "\\" in filename:
        filename = filename.replace("\\", "/")
        parts = filename.split("/")
        name = parts.pop()
        path = "/".join(parts)
        return path, name
    return "", filename


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
            return return_error(
                self, "Error: File not found at: {}".format(file), Error
            )
        else:
            logger.log_debug(self, "File copied: " + file, only_logging=False)
            return {"status": "success"}
    return return_error(self, "File not found at: {}".format(file))


def save_servicefile(self, content, config_path):
    """Save the service file to the configured path for the configs.

    Args:
        content (str): The content of the servicefile.
        config_path (str): The path to save the servicefile to.

    Returns:
        dict: The result as a dict.
    """

    logger.log_debug(self, "Save klipper servicefile", only_logging=False)

    servicefile_basename = "klipper.service"
    servicefile_path = os.path.join(config_path, servicefile_basename)
    logger.log_debug(
        self,
        "Writing Klipper servicefile to {}".format(servicefile_path),
        only_logging=False,
    )

    if not os.path.exists(config_path):
        try:
            os.mkdir(config_path)
        except OSError as Error:
            return return_error(
                self,
                "Error: Creation of the backup directory {} failed".format(config_path),
                Error,
            )
        else:
            logger.log_debug(
                self, "Directory {} created".format(config_path), only_logging=False
            )

    try:
        with io.open(servicefile_path, "w", encoding="utf-8") as f:
            f.write(content)
    except IOError as Error:
        return return_error(
            self,
            "Error: Couldn't write Klipper servicefile: {}".format(servicefile_path),
            Error,
        )
    else:
        logger.log_debug(
            self,
            "Written Klipper config to {}".format(servicefile_path),
            only_logging=False,
        )
    finally:
        success, error = copy_servicefile_to_backup(self, servicefile_path)

    if not success:
        return return_error(self, error)

    return {"status": "success", "data": {"path": servicefile_path}}


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

    logger.log_debug(self, "Change Klipper servicefile", only_logging=False)

    try:
        with io.open(servicefile_path, "r", encoding="utf-8") as f:
            content = f.read()
    except IOError as error:
        logger.log_error(
            self,
            "Error: Couldn't open Klipper config file: {}".format(servicefile_path),
            only_logging=False,
        )
        return dict(error=dict(message=error))
    else:
        logger.log_debug(
            self,
            "Read Klipper config from {}".format(servicefile_path),
            only_logging=False,
        )
        splitted_content = re.split(r"klippy\.py", content)
        after_configpath = re.split(r"^\s?\S*\s?", splitted_content[1])
        content = (
            splitted_content[0] + "klippy.py " + replace + " " + after_configpath[1]
        )

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

    servicefile_bak_path = os.path.join(
        self.get_plugin_data_folder(), "configs", "servicefile", ""
    )
    results = create_directory(self, servicefile_bak_path)
    if results["status"] == "error":
        return False, results["error"]

    logger.log_debug(
        self,
        "copy_servicefile_to_backup: " + source + " to " + servicefile_bak_path,
        only_logging=False,
    )
    if source == servicefile_bak_path:
        return False, "Source and destination are the same"
    backups_list = glob.glob1(servicefile_bak_path, "Servicefile*")
    if len(backups_list) >= 5:
        logger.log_debug(
            self,
            "deleting oldest backup file: {}".format(backups_list[0]),
            only_logging=False,
        )
        try:
            os.remove(os.path.join(servicefile_bak_path, backups_list[0]))
        except OSError as Error:
            logger.log_error(
                self,
                "Error: Couldn't delete oldest backup file: {}".format(backups_list[0]),
                only_logging=False,
            )
            return False, Error
    results = copy_file(
        self,
        source,
        servicefile_bak_path
        + "Servicefile_"
        + datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        + ".bak",
    )
    if results["status"] == "error":
        logger.log_error(
            self,
            "Error: Couldn't copy file: {}".format(results["error"]),
            only_logging=False,
        )
        return False, results["error"]
    logger.log_debug(
        self,
        "Servicefile Backup " + servicefile_bak_path + " written",
        only_logging=False,
    )
    return True, None


def create_directory(self, path):
    """Create a directory if it not exists.

    Args:
        path (str): The path to the directory.

    Returns:
        dict: The result of the creation as a dict.
    """

    if not os.path.exists(path):
        try:
            os.mkdir(path)
        except OSError as Error:
            logger.log_error(
                self,
                "Error: Creation of the directory {} failed".format(path),
                only_logging=False,
            )
            return {"status": "error", "error": Error}
        else:
            logger.log_debug(
                self, "Directory {} created".format(path), only_logging=False
            )
            return {"status": "success"}
    else:
        return {"status": "success"}


def return_error(self, message, step="", e=None):
    """Returns an error message.

    Args:
        message (str): Error message to be returned.
        step (str, optional): Step where the error occured. Defaults to "".
        e (Exception, optional): Exception to be logged. Defaults to None.

    Returns:
        dict: Status and error message.
    """

    if e:
        logger.log_error(
            self, "Error: {}".format(message) + "\n" + str(e), only_logging=False
        )
    else:
        logger.log_error(
            self,
            "Error: {}".format(message),
            only_logging=False,
        )
    return {
        "status": "error",
        "error": {"message": gettext(message)},
        "step": step,
    }
