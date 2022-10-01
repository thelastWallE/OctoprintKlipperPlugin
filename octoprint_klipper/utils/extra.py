# -*- coding: utf-8 -*-
import platform
import os
import datetime
import glob
import io
import re
import shlex
import subprocess
import sarge
import threading

try:
    from octoprint.util.commandline import CommandlineCaller, CommandlineError
except ImportError:
    pass
from octoprint.util.platform import CLOSE_FDS

from shutil import copy
from flask_babel import gettext

import logger


def poll_status(self):
    self._printer.commands("STATUS")


def update_status(self, subtype, status):
    send_message(self, type="status", subtype=subtype, payload=status)


def file_exist(self, filepath, **kwargs):
    """
    Returns if a file exists and shows default a PopUp if not
    """
    # TODO rework this to a more general function, maybe just use the one from octoprint
    PopUp = kwargs.get("PopUp", True)
    from os import path

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
        if PopUp:
            send_message(
                self,
                type="PopUp",
                subtype="warning",
                title="OctoKlipper Settings",
                payload=gettext("File")
                + ": <br />"
                + filepath
                + "<br /> "
                + gettext("does not exist!"),
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


def send_message(self, type, subtype, title="", payload=""):
    """
    Send Message over API to FrontEnd
    """
    import datetime

    self._plugin_manager.send_plugin_message(
        self._identifier,
        dict(
            time=datetime.datetime.now().strftime("%H:%M:%S"),
            type=type,
            subtype=subtype,
            title=title,
            payload=payload,
        ),
    )


def run(self, cmd):
    """Runs the given command locally and returns the output, err and exit_code."""
    cmd_parts = cmd.split("|") if "|" in cmd else [cmd]
    i = 0
    p = {}
    logger.log_info(self, "Run Command:" + cmd, only_logging=True)

    for cmd_part in cmd_parts:
        logger.log_info(self, "Run Command Part:" + cmd_part, only_logging=True)
        cmd_part = cmd_part.strip()
        prog = shlex.split(cmd_part) if platform.system() == "posix" else cmd_part
        logger.log_info(self, "Run Command Part prog:" + str(prog), only_logging=True)
        try:
            if i == 0:
                p[i] = sarge.run(
                    prog,
                    close_fds=CLOSE_FDS,
                    stdin=None,
                    stdout=sarge.Capture(),
                    stderr=sarge.Capture(),
                    shell=True,
                )
                """ p[i] = subprocess.Popen(
                    prog, stdin=None, stdout=subprocess.PIPE, stderr=subprocess.PIPE
                ) """
            else:
                p[i] = sarge.run(
                    prog,
                    close_fds=CLOSE_FDS,
                    stdin=p[i - 1].stdout,
                    stdout=sarge.Capture(),
                    stderr=sarge.Capture(),
                    shell=True,
                )
                """ p[i] = subprocess.Popen(
                    prog,
                    stdin=p[i - 1].stdout,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                ) """
            if p[i].returncode != 0:
                returncode = p[i].returncode
                stdout_text = p[i].stdout.text
                stderr_text = p[i].stderr.text

                error = "Command part{}:{} failed with return code {}:\nSTDOUT: {}\nSTDERR: {}".format(
                    i, prog, returncode, stdout_text, stderr_text
                )
                logger.log_error(self, error, only_logging=True)
        except Exception as e:
            error = "Command part{}:{} failed: {}".format(i, prog, e)
            logger.log_error(self, error, only_logging=True)
        i += 1
    (output, err) = p[i - 1].communicate()
    exit_code = p[0].wait()
    response = output + "\n" + err if output != "" else output + err
    logger.log_info(
        self,
        "Response: " + response + " exit_code:" + str(exit_code),
        only_logging=True,
    )
    if exit_code == 0:
        return response
    logger.log_error(
        self,
        "<b>"
        + gettext("Failed to run command")
        + ':</b> "'
        + cmd
        + '" <b>'
        + gettext("Output")
        + ":</b> "
        + response,
        only_logging=False,
    )


def execute_command(self, command):

    logger.log_info(
                self,
                "Command: {}".format(command),
                only_logging=True,
            )
    stdout_text=""
    # we run this with shell=True since we have to trust whatever
    # our admin configured as command and since we want to allow
    # shell-alike handling here...
    logger.log_info(
        self,
        "Command Thread: {}".format(command),
        only_logging=True,
    )

    output_text2, output_error2=sarge.get_both(command,
        close_fds=CLOSE_FDS,
        shell=True,)

    logger.log_info(
        self,
        "output_text2: {}, output_error2: {}".format(output_text2, output_error2),
        only_logging=True,
    )

    if output_error2 != "":
        logger.log_info(
        self,
        "output_error2: {}".format(output_error2),
        only_logging=False,
    )

    """ p = sarge.run(
        command,
        close_fds=CLOSE_FDS,
        stdout=sarge.Capture(),
        stderr=sarge.Capture(),
        shell=True,
    )
    while p.returncode is None:
        output = p.stderr.read(timeout=0.5).decode('utf-8')
        if not output:
            p.commands[0].poll()
            continue
        logger.log_info(
            self,
            "p.stderr.read: {}, p.stdout.read: {}".format(output,stdout_text),
            only_logging=True,
        )

    logger.log_info(
        self,
        "Command Out1: {}".format(stdout_text),
        only_logging=True,
    )
    if p.returncode != 0:
        returncode = p.returncode
        stderr_text = p.stderr.text
        error = "Command for OctoKlipper:{} failed with return code {}:\nSTDOUT: {}\nSTDERR: {}".format(
            command, returncode, stdout_text, stderr_text
        )
        logger.log_error(self, error, only_logging=True)
        return error
    else:
        for line in p.stdout:
            stdout_text += line.strip()
        logger.log_info(
            self,
            "return Command Out: {}".format(stdout_text),
            only_logging=True,
        ) """
    return output_text2

    """
    self._caller = CommandlineCaller()
    if not command:
        return False

    try:
        # we run this with shell=True since we have to trust whatever
        # our admin configured as command and since we want to allow
        # shell-alike handling here...
        p = self._caller.non_blocking_call(command, shell=True)

        if p is None:
            raise CommandlineError(None, "", "")

        if p.returncode is not None:
            stdout = p.stdout.text if p is not None and p.stdout is not None else ""
            stderr = p.stderr.text if p is not None and p.stderr is not None else ""
            raise CommandlineError(p.returncode, stdout, stderr)
    except CommandlineError:
        raise
    except Exception:
        self._logger.exception("Error while executing command: " + command)
        raise CommandlineError(None, "", "")

    return True
    """


def is_float(value):
    try:
        float(value)
        return True
    except ValueError:
        return False


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
            logger.log_error(
                self, "Error: File not found at: {}".format(file), only_logging=False
            )
            return {"status": "error", "error": {"message": Error}}
        else:
            logger.log_debug(self, "File copied: " + file, only_logging=False)
            return {"status": "success"}
    return {
        "status": "error",
        "error": {"message": "File not found at: {}".format(file)},
    }


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
            logger.log_error(
                self,
                "Error: Creation of the backup directory {} failed".format(config_path),
                only_logging=False,
            )
            return {"status": "error", "error": {"message": Error}}
        else:
            logger.log_debug(
                self, "Directory {} created".format(config_path), only_logging=False
            )

    try:
        with io.open(servicefile_path, "w", encoding="utf-8") as f:
            f.write(content)
    except IOError as Error:
        logger.log_error(
            self,
            "Error: Couldn't write Klipper servicefile: {}".format(servicefile_path),
            only_logging=False,
        )
        return {"status": "error", "error": {"message": Error}}
    else:
        logger.log_debug(
            self,
            "Written Klipper config to {}".format(servicefile_path),
            only_logging=False,
        )
    finally:
        success, error = copy_servicefile_to_backup(self, servicefile_path)
        if not success:
            return {"status": "error", "error": {"message": error}}
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
    result, error = create_directory(self, servicefile_bak_path)
    if not result:
        return False, error

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
    result, error = copy_file(
        self,
        source,
        servicefile_bak_path
        + "Servicefile_"
        + datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        + ".bak",
    )
    if not result:
        logger.log_error(
            self, "Error: Couldn't copy file: {}".format(error), only_logging=False
        )
        return False, error
    logger.log_debug(
        self,
        "Servicefile Backup " + servicefile_bak_path + " written",
        only_logging=False,
    )
    return True, None


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
