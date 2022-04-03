import platform
import shlex
import subprocess

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
            False,
            gettext("File")
            + ": <br />"
            + filepath
            + "<br /> "
            + gettext("does not exist!"),
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
    logger.log_info(self, True, "Run Command:" + cmd)
    for cmd_part in cmd_parts:
        cmd_part = cmd_part.strip()
        prog = shlex.split(cmd_part) if platform.system() == "posix" else cmd_part
        if i == 0:
            p[i] = subprocess.Popen(
                prog, stdin=None, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
        else:
            p[i] = subprocess.Popen(
                prog,
                stdin=p[i - 1].stdout,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        i += 1
    (output, err) = p[i - 1].communicate()
    exit_code = p[0].wait()
    response = output + "\n" + err if output != "" else output + err
    logger.log_info(
        self, True, "Response: " + response + " exit_code:" + str(exit_code)
    )
    if exit_code == 0:
        return response
    logger.log_error(
        self,
        False,
        "<b>"
        + gettext("Failed to run command")
        + ':</b> "'
        + cmd
        + '" <b>'
        + gettext("Output")
        + ":</b> "
        + response,
    )


def is_float(value):
    try:
        float(value)
        return True
    except ValueError:
        return False
