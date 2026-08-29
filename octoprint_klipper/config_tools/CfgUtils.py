# -*- coding: utf-8 -*-
from __future__ import absolute_import, division, print_function, unicode_literals
import glob
import os
import re
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
    data_folder = self.get_plugin_data_folder()
    cfg_path = os.path.join(data_folder, "configs", "**")
    try:
        cfg_files = glob.glob(cfg_path, recursive=True)
    except IOError as e:
        return extra.return_error(
            self, "Could not load configuration files in {}".format(cfg_path), "list", e
        )
    logger.log_debug(
        self,
        "list_backed_cfg_files " + path_type + " Path: " + cfg_path,
        only_logging=False,
    )

    for f in cfg_files:
        if not os.path.isfile(f):
            continue
        # Relative path without a leading separator so it can be used in
        # URLs/routes (a leading "/" or "\\" breaks <path:filename> matching).
        url = os.path.relpath(f, os.path.join(data_folder, "configs")).replace(
            os.sep, "/"
        )
        filesize = os.path.getsize(f)
        filemdate = time.localtime(os.path.getmtime(f))
        download_url = flask.url_for("index") + "plugin/klipper/download/backup/" + url
        files.append(
            dict(
                name=url,
                file=f,
                bytes=filesize,
                mdate=time.strftime("%d.%m.%Y %H:%M", filemdate),
                url=download_url,
                version=_parse_backup_version(url),
            )
        )
        logger.log_debug(
            self, "list_cfg_files " + str(len(files)) + ": " + f, only_logging=False
        )
    return {"status": "success", "data": {"files": files}}


def list_config_versions(self, file):
    """List the backup versions for a specific config file.

    Args:
        file (str): The config path (storage-relative, absolute or "baseconfig").

    Returns:
        dict: Status and the list of versions (newest first).
    """
    rel = _config_relative_path(self, file)
    configs_dir = os.path.join(self.get_plugin_data_folder(), "configs")
    versions = _backup_versions(configs_dir, rel)
    result = []
    for version, path in reversed(versions):
        result.append(
            dict(
                version=version,
                name=os.path.relpath(path, configs_dir).replace(os.sep, "/"),
                timestamp=time.strftime(
                    "%d.%m.%Y %H:%M", time.localtime(os.path.getmtime(path))
                ),
                size=os.path.getsize(path),
            )
        )
    return {"status": "success", "data": {"versions": result}}


def restore_config_version(self, file, version):
    """Restore a specific backup version to the config path.

    Args:
        file (str): The config path (storage-relative, absolute or "baseconfig").
        version (int): The version number to restore.

    Returns:
        dict: Status of the operation.
    """
    rel = _config_relative_path(self, file)
    configs_dir = os.path.join(self.get_plugin_data_folder(), "configs")
    backup_path = os.path.join(configs_dir, "{}.{}".format(rel, version))
    if not os.path.isfile(backup_path):
        return extra.return_error(
            self, "Backup version not found: {}".format(version), "restore"
        )
    try:
        with io.open(backup_path, "r", encoding="utf-8") as f:
            content = f.read()
    except IOError as e:
        return extra.return_error(
            self, "Could not read backup version", "restore", e
        )
    target = _resolve_config_path(self, file)
    try:
        with io.open(target, "w", encoding="utf-8") as f:
            f.write(content)
    except IOError as e:
        return extra.return_error(self, "Could not restore config", "restore", e)
    return {"status": "success", "data": {"body": gettext("Config restored.")}}


def get_cfg(self, file):
    """Get the content of a configuration file.

    Args:
        file (str): The name of the file to read

    Returns:
        dict: Status and the content of the file.
    """
    if extra.file_exists(self, file):
        try:
            with io.open(file, "r", encoding="utf-8") as f:
                file_content = f.read()
        except IOError as Err:
            return extra.return_error(
                self,
                gettext("Error: Klipper config file not found at:")
                + " {}".format(file)
                + "\n"
                + gettext("IOError:")
                + " {}".format(Err),
                "read",
            )
        except UnicodeDecodeError as Err:
            return extra.return_error(
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
                "decode",
            )
    else:
        return extra.return_error(self, gettext("File not found!"))

    return dict(status="success", data=dict(body=dict(content=file_content, file=file)))


def save_cfg(self, content, file, is_new_file=False):
    """Save the configuration file to given file.

    Args:
        content (str): The content of the configuration.
        filename (str): The filename of the configuration file.
        is_new_file (bool): If the file is a new file. Default is False.

    Returns:
        dict: Status and error text.
    """

    logger.log_debug(self, "Save klipper config", only_logging=False)

    configpath = os.path.expanduser(
        self._settings.get(["configuration", "config_path"])
    )

    filepath = os.path.dirname(file)
    if file[-4:] not in (".cfg", ".txt"):
        file += ".cfg"
    filename = os.path.basename(file)
    complete_filepath = os.path.join(configpath, filepath, filename)

    results = extra.create_directory(self, os.path.join(configpath, filepath))
    if results["status"] == "error":
        return results

    logger.log_debug(
        self, "Writing Klipper config to {}".format(filepath), only_logging=False
    )
    if not is_new_file:
        try:
            results = copy_cfg_to_backup(self, complete_filepath)
        except IOError:
            return extra.return_error(
                self,
                "Error: Couldn't open Klipper config file: {}".format(
                    complete_filepath
                ),
                "backup",
            )
        else:
            if results["status"] == "error":
                results["step"] = "backup"
                return results
    try:
        with io.open(complete_filepath, "w", encoding="utf-8") as f:
            f.write(content)
    except IOError:
        return extra.return_error(
            "Error: Couldn't open Klipper config file: {}".format(complete_filepath),
            "save",
        )

    else:
        logger.log_debug(
            self,
            "Written Klipper config to {}".format(complete_filepath),
            only_logging=False,
        )

    return {
        "status": "success",
        "data": {"body": gettext("Klipper config file saved!")},
    }


def _error_line(error):
    """Extract the 1-based line number from a configparser error."""
    lineno = getattr(error, "lineno", None)
    if lineno is None and getattr(error, "errors", None):
        lineno = error.errors[0][0]
    return lineno


def _find_key_line(content, section, key):
    """Find the 1-based line of ``key`` inside ``section`` in ``content``."""
    if not section or not key:
        return None
    pattern = re.compile(r"^\s*" + re.escape(key) + r"\s*[:=]", re.IGNORECASE)
    in_section = False
    for i, line in enumerate(content.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            in_section = stripped[1:-1].strip().lower() == section.lower()
        elif in_section and pattern.match(line):
            return i
    return None


def check_config(self, data):
    """Checks the given data on parsing errors.

    Args:
        data (str): Content to be validated.

    Returns:
        dict: Status and if errors also the error message and line.
    """
    try:
        if sys.version_info[0] < 3:
            dataToValidated = configparser.RawConfigParser()

            buf = StringIO.StringIO(data)
            dataToValidated.readfp(buf)
        else:
            dataToValidated = configparser.RawConfigParser(strict=False)
            dataToValidated.read_string(data)
    except configparser.Error as error:
        parsed_error = parse_error_message(self, error)
        # Log to the log files but don't broadcast a socket message: the
        # frontend linter shows squiggle markers instead of a toast.
        logger.log_error(self, "Error: {}".format(parsed_error), only_logging=True)
        return {
            "status": "error",
            "error": {"message": gettext(parsed_error)},
            "line": _error_line(error),
        }
    else:
        result = check_float(self, dataToValidated)
        if result["status"] == "error":
            logger.log_debug(self, "check_cfg: NOK!", only_logging=False)
            result["line"] = _find_key_line(
                data, result.get("section"), result.get("key")
            )
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
        dict: Status and if failed also the error text, section and key.
    """

    sections_search_list = ["bltouch", "probe"]
    value_search_list = ["x_offset", "y_offset", "z_offset"]
    error_list = []
    last_section = None
    last_key = None
    try:
        # cycle through sections and then values
        for y in sections_search_list:
            for x in value_search_list:
                if dataToValidated.has_option(y, x):
                    a_float = dataToValidated.getfloat(y, x)
                    if a_float:
                        pass
    except ValueError as error:
        last_section = y
        last_key = x
        complete_error = (
            "\n"
            + "Invalid Value for <b>"
            + x
            + "</b> in Section: <b>"
            + y
            + "</b>\n"
            + "{}".format(str(error))
        )
        error_list.append(complete_error)
        pass
    else:
        return {"status": "success"}
    if error_list:
        error_text = "\n".join(error_list)
        logger.log_error(self, "Error: {}".format(error_text), only_logging=True)
        return {
            "status": "error",
            "error": {"message": gettext(error_text)},
            "section": last_section,
            "key": last_key,
        }


def _config_relative_path(self, file):
    """Return the config path relative to the config storage (no leading sep)."""
    cfg_path = os.path.normpath(
        os.path.expanduser(self._settings.get(["configuration", "config_path"]))
    ) + os.sep
    if file == "baseconfig":
        file = os.path.expanduser(self._settings.get(["configuration", "baseconfig"]))
    file_norm = os.path.normpath(os.path.expanduser(file))
    if os.path.isabs(file_norm):
        if file_norm.startswith(cfg_path):
            return file_norm[len(cfg_path):]
        return os.path.basename(file_norm)
    return file_norm.replace(os.sep, "/")


def _resolve_config_path(self, file):
    """Resolve a config identifier to its absolute filesystem path."""
    cfg_path = os.path.expanduser(
        self._settings.get(["configuration", "config_path"])
    )
    if file == "baseconfig":
        file = os.path.expanduser(self._settings.get(["configuration", "baseconfig"]))
    file_norm = os.path.normpath(os.path.expanduser(file))
    if os.path.isabs(file_norm):
        return file_norm
    return os.path.join(cfg_path, file_norm)


def _backup_versions(configs_dir, rel):
    """Return a sorted list of (version, path) for a config's backups."""
    pattern = os.path.join(configs_dir, rel + ".*")
    versions = []
    for f in glob.glob(pattern):
        base = os.path.basename(f)
        suffix = base[len(os.path.basename(rel)):]
        if suffix.startswith(".") and suffix[1:].isdigit():
            versions.append((int(suffix[1:]), f))
    versions.sort(key=lambda x: x[0])
    return versions


def _prune_backups(configs_dir, rel, keep):
    """Delete backup versions beyond the newest ``keep``."""
    if keep <= 0:
        return
    versions = _backup_versions(configs_dir, rel)
    for version, path in versions[:-keep]:
        try:
            os.remove(path)
        except OSError:
            pass


def _parse_backup_version(name):
    """Extract the version number from a backup name like 'file.cfg.3'."""
    base = os.path.basename(name)
    parts = base.rsplit(".", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return int(parts[1])
    return 0


def copy_cfg_to_backup(self, src):
    """Copy the config file to a versioned backup directory of OctoKlipper.

    Args:
        src (str): Path to the config file to copy.

    Returns:
        dict: Status of the operation.
    """

    if not os.path.isfile(src):
        return extra.return_error(
            "Error: Config file not found: {}".format(src),
            "backup",
        )
    rel = _config_relative_path(self, src)
    configs_dir = os.path.join(self.get_plugin_data_folder(), "configs")

    # Migrate a legacy (unversioned) backup to version 1.
    legacy = os.path.join(configs_dir, rel)
    if os.path.isfile(legacy):
        try:
            os.rename(legacy, os.path.join(configs_dir, rel + ".1"))
        except OSError:
            pass

    versions = _backup_versions(configs_dir, rel)
    next_version = versions[-1][0] + 1 if versions else 1
    backup_path = os.path.join(configs_dir, "{}.{}".format(rel, next_version))

    try:
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)
    except OSError as e:
        return extra.return_error(
            "Error: Couldn't create backup directory", "backup", e
        )

    logger.log_debug(
        self, "copy_cfg_to_backup:" + src + " to " + backup_path, only_logging=False
    )
    if os.path.normpath(src) == os.path.normpath(backup_path):
        return extra.return_error(self, "Source and destination are the same", "backup")
    try:
        copyfile(src, backup_path)
    except IOError:
        return extra.return_error(
            "Error: Couldn't copy Klipper config file to {}".format(backup_path),
            "backup",
        )
    else:
        try:
            keep = int(self._settings.get(["configuration", "backup_count"]))
        except (TypeError, ValueError):
            keep = 5
        _prune_backups(configs_dir, rel, keep)
        logger.log_debug(
            self, "CfgBackup " + backup_path + " written", only_logging=False
        )
        return {
            "status": "success",
            "data": {
                "body": gettext(
                    "Klipper config file copied to {}".format(backup_path)
                )
            },
        }
