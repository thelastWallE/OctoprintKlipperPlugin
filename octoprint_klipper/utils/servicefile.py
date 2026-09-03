# -*- coding: utf-8 -*-
import datetime
import glob
import io
import os
import re

import octoprint_klipper.utils.logger as logger
import octoprint_klipper.utils.extra as extra

from octoprint_klipper.utils.extra import copy_file, create_directory, return_error


def get_servicefile_archive_path(self):
    """Return the plugin data folder path for archived servicefiles."""
    return os.path.join(self.get_plugin_data_folder(), "archive", "servicefile")


def get_servicefile_current_path(self):
    """Return the plugin data folder path for current servicefile duplicates."""
    return os.path.join(self.get_plugin_data_folder(), "current", "servicefile")


def save_servicefile(self, content, servicefile_path, sudo_password=None):
    """Save the service file and deploy it to the given path.

    The content is written to the plugin data folder (``current``) first and
    then deployed to the real servicefile path (e.g. ``/etc/default/klipper``)
    using sudo. Cached sudo credentials are tried first; if they are not
    cached and no password is given, ``password_required`` is returned so the
    frontend can prompt for one.

    Args:
        content (str): The content of the servicefile.
        servicefile_path (str): The destination path (e.g. /etc/default/klipper).
        sudo_password (str, optional): Sudo password if credentials are not cached.

    Returns:
        dict: The result as a dict.
    """

    logger.log_debug(self, "Save klipper servicefile", only_logging=False)

    current_path = get_servicefile_current_path(self)
    # Ensure the current root exists (created lazily by config backups)
    results = create_directory(self, os.path.dirname(current_path))
    if results["status"] == "error":
        return return_error(
            self, "Error: Couldn't create directory", e=results["error"]
        )
    results = create_directory(self, current_path)
    if results["status"] == "error":
        return return_error(
            self, "Error: Couldn't create directory", e=results["error"]
        )
    current_file = os.path.join(current_path, "klipper.service")

    # Archive the previous servicefile before overwriting it
    if os.path.isfile(current_file):
        success, error = copy_servicefile_to_backup(self, current_file)
        if not success:
            return return_error(self, error)

    try:
        with io.open(current_file, "w", encoding="utf-8") as f:
            f.write(content)
    except IOError as Error:
        return return_error(
            self,
            "Error: Couldn't write Klipper servicefile: {}".format(current_file),
            Error,
        )
    else:
        logger.log_debug(
            self,
            "Written Klipper servicefile to {}".format(current_file),
            only_logging=False,
        )

    # Deploy the current content to the real servicefile path via sudo
    success, error = deploy_servicefile(
        self, current_file, servicefile_path, sudo_password
    )
    if not success:
        if error == "password_required":
            return {"status": "password_required"}
        return return_error(self, error)

    return {"status": "success", "data": {"path": servicefile_path}}


# open servicefile and change it using regex
def modify_servicefile(self, servicefile_path, replace, sudo_password=None):
    """Open the servicefile and change the content using regex.

    Args:
        servicefile_path (str): The path to the servicefile.
        regex (str): The regex to search for.
        replace (str): The replacement string.
        sudo_password (str, optional): Sudo password if credentials are not cached.

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

        return save_servicefile(self, content, servicefile_path, sudo_password)


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

    archive_path = get_servicefile_archive_path(self)
    # Ensure the archive root exists (created lazily by config backups)
    results = create_directory(self, os.path.dirname(archive_path))
    if results["status"] == "error":
        return False, results["error"]
    servicefile_bak_path = os.path.join(archive_path, "")
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


def copy_servicefile_to_current(self, source):
    """Copy the servicefile to the current data directory of OctoKlipper.

    Args:
        source (str): Path to the file to copy.

    Returns:
        bool: True if the file was copied successfully. False otherwise.
        str: Message if the file was not copied.
    """

    if not os.path.isfile(source):
        return False, "Couldn't find Klipper servicefile"

    current_path = get_servicefile_current_path(self)
    # Ensure the current root exists (created lazily by config backups)
    results = create_directory(self, os.path.dirname(current_path))
    if results["status"] == "error":
        return False, results["error"]
    servicefile_current_path = os.path.join(current_path, "")
    results = create_directory(self, servicefile_current_path)
    if results["status"] == "error":
        return False, results["error"]

    logger.log_debug(
        self,
        "copy_servicefile_to_current: " + source + " to " + servicefile_current_path,
        only_logging=False,
    )
    if source == servicefile_current_path:
        return False, "Source and destination are the same"
    results = copy_file(
        self,
        source,
        os.path.join(servicefile_current_path, os.path.basename(source)),
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
        "Servicefile Current " + servicefile_current_path + " written",
        only_logging=False,
    )
    return True, None


def deploy_servicefile(self, source, dest, sudo_password=None):
    """Deploy the servicefile to the real path using sudo.

    Tries cached sudo credentials first (``sudo -n``). If they are not
    cached and a password is provided, caches them with ``sudo -S -v`` and
    retries. Returns ``(False, "password_required")`` when sudo is not
    cached and no password was given.

    Args:
        source (str): Path to the file to deploy.
        dest (str): Destination path (e.g. /etc/default/klipper).
        sudo_password (str, optional): Sudo password if credentials are not cached.

    Returns:
        bool: True if the file was deployed successfully. False otherwise.
        str: Message if the file was not deployed.
    """
    cmd = "sudo -n cp -T " + source + " " + dest
    output, success = extra.execute_command(self, cmd)
    if success:
        return True, None

    if not sudo_password:
        return False, "password_required"

    # Cache the sudo credentials with the provided password
    success = extra.execute_command_stream(
        self, "sudo -S -v", lambda line, stream: None, stdin_data=sudo_password + "\n"
    )
    if not success:
        return False, "Invalid sudo password or sudo not available"

    output, success = extra.execute_command(self, cmd)
    if not success:
        return False, output or "Could not deploy servicefile"
    return True, None
