# -*- coding: utf-8 -*-
import os
import datetime
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
