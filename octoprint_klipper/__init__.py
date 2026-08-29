# -*- coding: utf-8 -*-
# <Octoprint Klipper Plugin>

# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.

# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

from __future__ import absolute_import, division, print_function, unicode_literals
import glob
import logging
import os
import threading
import re
import platform
import psutil
import time

import flask
import octoprint.filemanager
import octoprint.filemanager.storage
import octoprint.filemanager.util
import octoprint.plugin
import octoprint.plugin.core

from flask_babel import gettext
from octoprint.access.permissions import ADMIN_GROUP, Permissions
from octoprint.server.util.flask import get_json_command_from_request
from octoprint.server import NO_CONTENT
from octoprint.settings import valid_boolean_trues
from octoprint.util import get_formatted_size, is_hidden_path, time_this

try:
    from octoprint.plugins.serial_connector.serial_comm import parse_firmware_line
except ImportError:
    from octoprint.util.comm import parse_firmware_line
from octoprint.filemanager.storage import LocalFileStorage

try:
    from urllib.parse import quote as urlquote
except ImportError:
    from urllib import quote as urlquote  # noqa: F401

import octoprint_klipper.utils.logger as logger
import octoprint_klipper.migration.migrate as migration
import octoprint_klipper.utils.extra as extra
import octoprint_klipper.utils.repo_handler as repo_handler
import octoprint_klipper.config_tools.CfgUtils as config_tools

from .modules import KlipperLogAnalyzer

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5Mb
_FILE_DESTINATION = "klipper_configs"

# Set here the actual settings version
# The automatic migration process needs this
SETTINGS_VERSION = 7


class KlipperPlugin(
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.SettingsPlugin,
    octoprint.plugin.AssetPlugin,
    octoprint.plugin.SimpleApiPlugin,
    octoprint.plugin.EventHandlerPlugin,
    octoprint.plugin.BlueprintPlugin,
):
    _message = ""
    _reload_config_lock = False
    _latest_klipper_remote_tag = ""
    _latest_octoklipper_remote_tag = ""
    _git_version = ""
    _get_next_receive = False

    _file_cache = {}
    _file_cache_mutex = threading.RLock()

    def __init__(self):
        self._logger = logging.getLogger("octoprint.plugins.klipper")
        self._octoklipper_logger = logging.getLogger("octoprint.plugins.klipper.debug")
        self._get_throttled = lambda: False

    # -- Startup Plugin
    def on_startup(self, host, port):
        from octoprint.logging.handlers import CleaningTimedRotatingFileHandler

        octoklipper_logging_handler = CleaningTimedRotatingFileHandler(
            self._settings.get_plugin_logfile_path(postfix="debug"),
            when="D",
            backupCount=3,
        )
        octoklipper_logging_handler.setFormatter(
            logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s")
        )
        octoklipper_logging_handler.setLevel(logging.DEBUG)

        self._octoklipper_logger.addHandler(octoklipper_logging_handler)
        self._octoklipper_logger.setLevel(
            logging.DEBUG
            if self._settings.get_boolean(["configuration", "debug_logging"])
            else logging.INFO
        )
        self._octoklipper_logger.propagate = False

        helpers = self._plugin_manager.get_helpers("pi_support", "get_throttled")
        if helpers and "get_throttled" in helpers:
            self._get_throttled = helpers["get_throttled"]
            if self._settings.get_boolean(["configuration", "ignore_throttled"]):
                self._logger.warning(
                    "!!! THROTTLE STATE IGNORED !!! You have configured the OctoKlipper plugin to ignore an active throttle state of the underlying system. You might run into stability issues or outright corrupt your install. Consider fixing the throttling issue instead of suppressing it."
                )
                self._octoklipper_logger.warning(
                    "!!! THROTTLE STATE IGNORED !!! You have configured the OctoKlipper plugin to ignore an active throttle state of the underlying system. You might run into stability issues or outright corrupt your install. Consider fixing the throttling issue instead of suppressing it."
                )

        self.storage = LocalFileStorage(
            os.path.expanduser(self._settings.get(["configuration", "config_path"])),
            create=True,
            really_universal=True,
        )
        self._file_manager.add_storage(_FILE_DESTINATION, self.storage)

    def on_after_startup(self):
        klipper_port = self._settings.get(["connection", "port"])
        additional_ports = self._settings.global_get(["serial", "additionalPorts"])
        self._octoklipper_debug = self._settings.get_boolean(
            ["configuration", "debug_logging"]
        )

        if klipper_port not in additional_ports:
            additional_ports.append(klipper_port)
            self._settings.global_set(["serial", "additionalPorts"], additional_ports)
            self._settings.save()
            logger.log_info(
                self,
                "Added klipper serial port {} to list of additional ports.".format(
                    klipper_port
                ),
                only_logging=False,
            )

    # -- Settings Plugin

    def get_additional_permissions(self, *args, **kwargs):
        return [
            {
                "key": "CONFIG",
                "name": "Config Klipper",
                "description": gettext("Allows to config klipper"),
                "default_groups": [ADMIN_GROUP],
                "dangerous": True,
                "roles": ["admin"],
            },
            {
                "key": "FILES_LIST",
                "name": "List Klipper Files",
                "description": gettext("Allows to list klipper files"),
                "default_groups": [ADMIN_GROUP],
                "dangerous": False,
                "roles": ["admin"],
            },
            {
                "key": "MACRO",
                "name": "Use Klipper Macros",
                "description": gettext("Allows to use klipper macros"),
                "default_groups": [ADMIN_GROUP],
                "dangerous": True,
                "roles": ["admin"],
            },
        ]

    def get_settings_defaults(self):
        # TODO #69 put some settings on the localStorage
        return dict(
            connection=dict(
                port="/tmp/printer",
                replace_connection_panel=True,
                hide_editor_button=False,
                hide_config_button=False,
            ),
            macros=[
                dict(
                    name="E-Stop",
                    macro="M112",
                    sidebar=True,
                    tab=True,
                    buttonColor="",
                    buttonStyle="",
                )
            ],
            probe=dict(
                height=0,
                lift=5,
                speed_xy=1500,
                speed_z=500,
                points=[dict(name="point-1", x=0, y=0)],
            ),
            log=dict(
                fancy_functionality=True,
                logFilters=[
                    dict(
                        name="Suppress temperature messages",
                        regex=r"(Send: (N\d+\s+)?M105)",
                    )
                ],
            ),
            configuration=dict(
                debug_logging=False,
                debugging=False,
                ignore_throttled=False,
                klipper_path="~/klipper/",
                config_path="~/klipper_configs",
                baseconfig="~/printer.cfg",
                logpath="/tmp/",
                restart_service_system_command="sudo service klipper restart",
                restart_host_command="RESTART",
                restart_firmware_command="FIRMWARE_RESTART",
                reload_used="HOST",  # What command is used for a restart request
                restart_onsave=True,
                confirm_reload=True,
                shortStatus_navbar=True,
                shortStatus_sidebar=True,
                parse_check=False,
                fontsize=12,
                hide_error_popups=False,
                backup_count=5,
                remote_host_git="https://github.com/Klipper3D/klipper.git",
                remote_octoklipper_git="https://github.com/thelastWallE/OctoprintKlipperPlugin.git",
            ),
        )

    def on_settings_save(self, data):
        old_config_path = self._settings.get(["configuration", "config_path"])
        old_debug_logging = self._settings.get_boolean(
            ["configuration", "debug_logging"]
        )

        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)

        new_config_path = self._settings.get(["configuration", "config_path"])
        if old_config_path != new_config_path:
            # The storage is created once at startup; recreate it so the file
            # browser reflects the new config path without a restart.
            self._file_manager.remove_storage(_FILE_DESTINATION)
            self.storage = LocalFileStorage(
                os.path.expanduser(new_config_path),
                create=True,
                really_universal=True,
            )
            self._file_manager.add_storage(_FILE_DESTINATION, self.storage)

        new_debug_logging = self._settings.get_boolean(
            ["configuration", "debug_logging"]
        )
        if old_debug_logging != new_debug_logging:
            if new_debug_logging:
                self._octoklipper_logger.setLevel(logging.DEBUG)
            else:
                self._octoklipper_logger.setLevel(logging.INFO)

    def get_settings_restricted_paths(self):
        return dict(
            admin=[
                ["connection", "port"],
                ["configuration", "config_path"],
                ["configuration", "restart_service_system_command"],
            ],
            user=[["macros"], ["probe"]],
        )

    def get_settings_version(self):
        # Settings_Versionhistory:
        # 3 = add shortstatus on navbar. migrate the navbar setting for this
        # 4 = -change of configpath to config_path with only path without filename
        #     -parse configpath into config_path and baseconfig
        #     -switch setting for 'restart on editor save' to true if it was not set to manually
        #     -remove old_config
        #     -remove config on root settingsdirectory
        # 5 = -changed restart command to be setable in the settings
        # 6 = -button colors for macros
        return SETTINGS_VERSION

    # migrate Settings
    def on_settings_migrate(self, target, current):
        settings = self._settings
        if current is None:
            try:
                migration.migrate_old_settings(self, settings)
            except Exception as err:
                logger.log_error(self, err, only_logging=False)
                raise
            else:
                current = 2
        else:
            # step versions one step at a time higher
            try:
                while current < target:
                    current = migration.migrater(self, current, settings)
                    logger.log_info(
                        self, "Migration Step: " + str(current), only_logging=True
                    )
            except Exception:
                logger.log_error(
                    self,
                    "Error on migration to new settings version",
                    only_logging=False,
                )
                raise
            else:
                logger.log_info(
                    self, "Migration to new settings version done", only_logging=True
                )

    # -- Template Plugin
    def is_template_autoescaped(self):
        return True

    def get_template_configs(self):
        return [
            dict(type="navbar", custom_bindings=True),
            dict(type="settings", custom_bindings=True),
            dict(
                type="generic",
                name="Assisted Bed Leveling",
                template="klipper_leveling_dialog.jinja2",
                custom_bindings=True,
            ),
            dict(
                type="generic",
                name="PID Tuning",
                template="klipper_pid_tuning_dialog.jinja2",
                custom_bindings=True,
            ),
            dict(
                type="generic",
                name="Coordinate Offset",
                template="klipper_offset_dialog.jinja2",
                custom_bindings=True,
            ),
            dict(
                type="tab",
                name="Klipper",
                template="klipper_tab_main.jinja2",
                suffix="_main",
                custom_bindings=True,
            ),
            dict(
                type="sidebar",
                custom_bindings=True,
                icon="rocket",
                replaces=(
                    "connection"
                    if self._settings.get_boolean(
                        ["connection", "replace_connection_panel"]
                    )
                    else ""
                ),
            ),
            dict(
                type="generic",
                name="Performance Graph",
                template="klipper_graph_dialog.jinja2",
                custom_bindings=True,
            ),
            dict(
                type="generic",
                name="Config Backups",
                template="klipper_backups_dialog.jinja2",
                custom_bindings=True,
            ),
            dict(
                type="generic",
                name="Config Editor",
                template="klipper_editor.jinja2",
                custom_bindings=True,
            ),
            dict(
                type="generic",
                name="Macro Dialog",
                template="klipper_param_macro_dialog.jinja2",
                custom_bindings=True,
            ),
        ]

    def get_template_vars(self):
        return {
            "max_upload_size": MAX_UPLOAD_SIZE,
            "max_upload_size_str": get_formatted_size(MAX_UPLOAD_SIZE),
        }

    # -- Asset Plugin

    def get_assets(self):
        return dict(
            js=[
                "js/klipper.js",
                "js/klipper_settings.js",
                "js/klipper_leveling.js",
                "js/klipper_pid_tuning.js",
                "js/klipper_offset.js",
                "js/klipper_param_macro.js",
                "js/klipper_graph.js",
                "js/klipper_backup.js",
                "js/klipper_editor.js",
                "js/klipper_files.js",
            ],
            clientjs=["clientjs/klipper.js"],
            css=["css/klipper.css"],
        )

    # -- Event Handler Plugin

    def on_event(self, event, payload):
        if event == "UserLoggedIn":
            logger.log_info(self, "Klipper: Standby", only_logging=False)
        if event == "Connecting":
            logger.log_info(self, "Klipper: Connecting ...", only_logging=False)
        elif event == "Connected":
            logger.log_info(
                self,
                "Klipper: Connected to host via {} @{}bps".format(
                    payload["port"], payload["baudrate"]
                ),
                only_logging=False,
            )
        elif event == "Disconnected":
            logger.log_info(self, "Klipper: Disconnected from host", only_logging=False)

        elif event == "Error":
            logger.log_error(self, payload["error"], only_logging=False)
        elif event == "PrinterStateChanged":
            logger.log_info(
                self, "Printer: " + payload["state_string"], only_logging=False
            )
        elif event == "PrintStarted":
            logger.log_info(
                self, "Klipper: Printing " + payload["name"], only_logging=False
            )
        elif event == "PrintDone":
            logger.log_info(
                self, "Klipper: Print finished " + payload["name"], only_logging=False
            )
        elif event == "PrintCancelling":
            logger.log_info(
                self, "Klipper: Print cancelling " + payload["name"], only_logging=False
            )
        elif event == "PrintCancelled":
            logger.log_info(
                self, "Klipper: Print cancelled " + payload["name"], only_logging=False
            )
        elif event == "PrintPaused":
            logger.log_info(
                self, "Klipper: Print paused " + payload["name"], only_logging=False
            )
        elif event == "PrintResumed":
            logger.log_info(
                self, "Klipper: Print resumed " + payload["name"], only_logging=False
            )

    def process_at_command(
        self, comm_instance, phase, command, parameters, tags=None, *args, **kwargs
    ):
        if command != "SWITCHCONFIG":
            return

        config = parameters
        logger.log_info(
            self, "SWITCHCONFIG detected config:{}".format(config), only_logging=False
        )
        return None

    # -- GCODE Hook
    def process_sent_gcode(
        self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs
    ):
        if cmd == "SAVE_CONFIG":
            self.save_config_caught()

    def on_parse_gcode(self, comm, line, *args, **kwargs):
        if "FIRMWARE_VERSION" in line:
            printerInfo = parse_firmware_line(line)
            if "FIRMWARE_VERSION" in printerInfo:
                extra.send_message(
                    self,
                    type="version",
                    subtype="firmware",
                    payload=printerInfo["FIRMWARE_VERSION"],
                )
                logger.log_info(
                    self,
                    "Firmware version: {}".format(printerInfo["FIRMWARE_VERSION"]),
                    only_logging=False,
                )
        elif "// probe" in line or "// Failed to verify BLTouch" in line:
            msg = line.strip("/")
            logger.log_info(self, msg, only_logging=False)
            self.write_parsing_response_buffer()
        elif "// SAVE_CONFIG" in line:
            self.save_config_caught()
        elif "// mcu 'mcu': Unable to connect" in line:
            self.klipper_mcu_error_found(line)
        elif "//" in line:
            # add lines with // to a buffer
            self._message = self._message + line.strip("/")
        elif "!!" in line:
            msg = line.strip("!")
            logger.log_error(self, msg, only_logging=False)
            self.write_parsing_response_buffer()
        else:
            self.write_parsing_response_buffer()

            # send normal receive to the octoklipper log if needed
            if self._get_next_receive:
                logger.log_info(self, line, only_logging=False)
                self._get_next_receive = False
        return line

    def write_parsing_response_buffer(self):
        # write buffer with // lines after a gcode response without //
        if not self._message == "":
            logger.log_info(self, self._message, only_logging=False)
            self._message = ""

    def klipper_mcu_error_found(self, line):
        if "// mcu 'mcu': Unable to connect" in line:
            extra.send_message(
                self,
                "PopUp",
                "Error",
                "Klipper",
                gettext(
                    (
                        "Klipper can't connect to the firmware on the printer.<br>"
                        "Make sure that the printer is connected."
                    )
                )
                + "<br>"
                + (
                    "<a href='"
                    "https://www.klipper3d.org/Installation.html#configuring-octoprint-to-use-klipper'"
                    " target='_blank'>"
                )
                + gettext("Help for configuring OctoPrint to use Klipper")
                + "</a>",
                False,
            )

    def save_config_caught(self):
        logger.log_info(self, "SAVE_CONFIG detected", only_logging=False)
        extra.send_message(self, type="reload", subtype="config")

    def is_api_protected(self):
        return True

    def get_api_commands(self):
        return dict(listLogFiles=[], getStats=["logFile"])

    def on_api_command(self, command, data):
        if command == "listLogFiles":
            files = []
            logpath = os.path.dirname(
                os.path.expanduser(self._settings.get(["configuration", "logpath"]))
            )
            if extra.folder_exists(self, logpath):
                for f in glob.glob(os.path.join(logpath, "klippy*.log")):
                    filesize = os.path.getsize(f)
                    filemdate = time.strftime(
                        "%d.%m.%Y %H:%M", time.localtime(os.path.getctime(f))
                    )
                    files.append(
                        dict(
                            name=os.path.basename(f) + " (" + filemdate + ")",
                            file=f,
                            size=filesize,
                        )
                    )
            return flask.jsonify(data=files)
        elif command == "getStats":
            if "logFile" in data:
                log_analyzer = KlipperLogAnalyzer.KlipperLogAnalyzer(data["logFile"])
                return flask.jsonify(log_analyzer.analyze())

    def is_blueprint_protected(self):
        return True

    def is_blueprint_csrf_protected(self):
        return True

    def route_hook(self, server_routes, *args, **kwargs):
        from octoprint.server import app
        from octoprint.server.util.flask import permission_validator
        from octoprint.server.util.tornado import (
            LargeResponseHandler,
            access_validation_factory,
            path_validation_factory,
        )
        from octoprint.util import is_hidden_path

        configpath = os.path.expanduser(
            self._settings.get(["configuration", "config_path"])
        )
        bak_path = os.path.join(self.get_plugin_data_folder(), "configs", "")
        config_download_access = access_validation_factory(
            app,
            permission_validator,
            Permissions.PLUGIN_KLIPPER_CONFIG,
        )

        return [
            (
                r"/download/configs/klipper_configs/(.*)",
                LargeResponseHandler,
                dict(
                    path=configpath,
                    as_attachment=True,
                    access_validation=config_download_access,
                    path_validation=path_validation_factory(
                        lambda path: not is_hidden_path(path), status_code=404
                    ),
                ),
            ),
            (
                r"/download/backup/(.*)",
                LargeResponseHandler,
                dict(
                    path=bak_path,
                    as_attachment=True,
                    access_validation=config_download_access,
                    path_validation=path_validation_factory(
                        lambda path: not is_hidden_path(path), status_code=404
                    ),
                ),
            ),
        ]

    ##~~ BlueprintPlugin

    # region [rgba(20,40,20,0.5)] APIs
    # Get Content of a backed up config
    @octoprint.plugin.BlueprintPlugin.route("/backup/<path:filename>", methods=["GET"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def get_backup(self, filename):
        data_folder = self.get_plugin_data_folder()
        full_path = os.path.realpath(os.path.join(data_folder, "configs", filename))

        return flask.jsonify(config_tools.get_cfg(self, full_path))

    # Delete a backed up config
    @octoprint.plugin.BlueprintPlugin.route(
        "/backup/<path:filename>", methods=["DELETE"]
    )
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def delete_backup(self, filename):
        data_folder = self.get_plugin_data_folder()
        full_path = os.path.realpath(os.path.join(data_folder, "configs", filename))
        if (
            full_path.startswith(data_folder)
            and os.path.exists(full_path)
            and not is_hidden_path(full_path)
        ):
            try:
                os.remove(full_path)
            except Exception:
                self._octoklipper_logger.exception(
                    "Could not delete {}".format(filename)
                )
                return flask.jsonify(
                    status="error",
                    data=dict(message="Could not delete {}".format(filename)),
                )
        return flask.jsonify(status="success")

    # Get a list of all backed up configfiles
    @octoprint.plugin.BlueprintPlugin.route("/backup/list", methods=["GET"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def list_backups(self):
        return flask.jsonify(config_tools.list_config_files(self, "backup"))

    # restore a backed up configfile
    @octoprint.plugin.BlueprintPlugin.route(
        "/backup/restore/<path:filename>", methods=["POST"]
    )
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def restore_backup(self, filename):
        config_path = os.path.expanduser(
            self._settings.get(["configuration", "config_path"])
        )
        data_folder = self.get_plugin_data_folder()
        backupfile = os.path.realpath(os.path.join(data_folder, "configs", filename))

        return flask.jsonify(extra.copy_file(self, backupfile, config_path))

    # List the backup versions of a specific config (for the editor revert dialog)
    @octoprint.plugin.BlueprintPlugin.route("/configversions", methods=["GET"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def list_config_versions(self):
        file = flask.request.values.get("file", "")
        return flask.jsonify(config_tools.list_config_versions(self, file))

    # Restore a specific backup version to the config path
    @octoprint.plugin.BlueprintPlugin.route("/configrestore", methods=["POST"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def restore_config_version(self):
        data = flask.request.json
        file = data.get("file", "")
        version = data.get("version")
        return flask.jsonify(config_tools.restore_config_version(self, file, version))

    # ------------------ API for Configs ---------------------------------------------
    # Get Content of a Configfile
    @octoprint.plugin.BlueprintPlugin.route(
        "/<string:target>/<path:file>", methods=["GET"]
    )
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def read_config_file(self, target, file):
        """
        Get the content of a configfile
        :param target: the LocalStorage to get the config from
        :param file: the file to get the content from
        :return: the content of the file and the status in the form of a json
        """
        if target not in [_FILE_DESTINATION]:
            flask.abort(400, description="target is invalid")

        cfg_path = os.path.expanduser(
            self._settings.get(["configuration", "config_path"])
        )
        if file == "baseconfig":
            file = os.path.expanduser(
                self._settings.get(["configuration", "baseconfig"])
            )

        # The baseconfig resolves to an absolute filesystem path (it may live
        # outside the config storage). Resolve it directly; storage-relative
        # paths go through the normal validation.
        if os.path.isabs(file):
            baseconfig_path = os.path.realpath(
                os.path.expanduser(
                    self._settings.get(["configuration", "baseconfig"])
                )
            )
            full_path = os.path.realpath(file)
            if full_path != baseconfig_path:
                flask.abort(404)
        else:
            if not self._validate(target, file):
                flask.abort(404)
            file_path = os.path.dirname(os.path.expanduser(file)).replace(
                cfg_path, ""
            )
            filename = os.path.basename(file)
            full_path = os.path.realpath(
                os.path.join(cfg_path, file_path, filename)
            )
        logger.log_debug(self, "read_config_file " + full_path, only_logging=False)
        return flask.jsonify(config_tools.get_cfg(self, full_path))

    # Delete a Configfile
    @octoprint.plugin.BlueprintPlugin.route(
        "/<string:target>/<path:filename>", methods=["DELETE"]
    )
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def delete_config(self, target, filename):
        if not self._validate(target, filename):
            flask.abort(404)
        if target not in [_FILE_DESTINATION]:
            flask.abort(400, description="target is invalid")
        if not self._verifyFileExists(
            target, filename
        ) and not self._verifyFolderExists(target, filename):
            flask.abort(404)

        if self._verifyFileExists(target, filename):
            logger.log_debug(self, "delete_config File " + filename, only_logging=False)
            self._file_manager.remove_file(target, filename)
        elif self._verifyFolderExists(target, filename):
            logger.log_debug(
                self, "delete_config Folder " + filename, only_logging=False
            )
            self._file_manager.remove_folder(target, filename)

        return flask.jsonify(status="success")

    # Get a list of all configfiles
    @octoprint.plugin.BlueprintPlugin.route("/", methods=["GET"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def list_config_files(self):
        filter = flask.request.values.get("filter", False)
        recursive = (
            flask.request.values.get("recursive", "false") in valid_boolean_trues
        )
        force = flask.request.values.get("force", "false") in valid_boolean_trues
        logger.log_debug(
            self,
            "list_config_files filter: "
            + str(filter)
            + " recursive: "
            + str(recursive)
            + " force: "
            + str(force),
            only_logging=False,
        )
        try:
            files = self._get_file_list(
                _FILE_DESTINATION,
                filter=filter,
                recursive=recursive,
                allow_from_cache=not force,
            )
        except Exception as e:
            self._octoklipper_logger.exception("Could not read configfiles")
            return flask.jsonify(
                status="error",
                error=dict(message="Could not read configfiles", exception=e),
            )

        try:
            usage = psutil.disk_usage(
                os.path.expanduser(self._settings.get(["configuration", "config_path"]))
            )
        except Exception as e:
            self._octoklipper_logger.exception("Could not read disk usage")
            return flask.jsonify(
                status="error",
                error=dict(message="Could not read disk usage", exception=e),
            )

        data = dict(files=files, free=usage.free, total=usage.total)
        response = dict()
        response["status"] = "success"
        response["data"] = data
        return flask.jsonify(response)

    @octoprint.plugin.BlueprintPlugin.route("/test", methods=["POST"])
    @Permissions.FILES_LIST.require(403)
    def runFilesTest(self):
        valid_commands = {
            "sanitize": ["storage", "path", "filename"],
            "exists": ["storage", "path", "filename"],
        }

        command, data, response = get_json_command_from_request(
            flask.request, valid_commands
        )
        if response is not None:
            return response

        def sanitize(storage, path, filename):
            # The filename may be a full storage-relative path (e.g.
            # "config/printer.cfg"). Split it into path + name so
            # sanitize_name doesn't raise ValueError on "/" or "\\".
            subpath, filename = extra.split_filename_path(filename)
            if subpath:
                path = subpath
            sanitized_path = self._file_manager.sanitize_path(storage, path)
            sanitized_name = self._file_manager.sanitize_name(storage, filename)
            joined = self._file_manager.join_path(
                storage, sanitized_path, sanitized_name
            )
            return sanitized_path, sanitized_name, joined

        if command == "sanitize":
            _, _, sanitized = sanitize(data["storage"], data["path"], data["filename"])
            return flask.jsonify(sanitized=sanitized)
        elif command == "exists":
            storage = data["storage"]
            path = data["path"]
            filename = data["filename"]

            sanitized_path, sanitized_name, sanitized = sanitize(
                storage, path, filename
            )

            exists = self._file_manager.file_exists(storage, sanitized)
            if exists:
                # Base the suggestion on the sanitized name so it never
                # contains "/" or "\\" (sanitize_name raises ValueError).
                suggestion = sanitized_name
                name, ext = os.path.splitext(sanitized_name)
                counter = 0
                while self._file_manager.file_exists(
                    storage,
                    self._file_manager.join_path(
                        storage,
                        sanitized_path,
                        self._file_manager.sanitize_name(storage, suggestion),
                    ),
                ):
                    counter += 1
                    suggestion = name + "_{}".format(counter) + ext
                return flask.jsonify(exists=True, suggestion=suggestion)
            else:
                return flask.jsonify(exists=False)

    #
    @octoprint.plugin.BlueprintPlugin.route(
        "/<string:target>/<path:filename>", methods=["POST"]
    )
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def klipperFileCommand(self, target, filename):
        if target not in [_FILE_DESTINATION]:
            flask.abort(400, description="Unsupported target for storage")

        if not self._validate(target, filename):
            flask.abort(404)

        # valid file commands, dict mapping command name to mandatory parameters
        # force is actually not supported on OctoPrints side
        valid_commands = {
            "select": [],
            "unselect": [],
            "copy": ["destination"],
            "move": ["destination", "force"],
        }

        command, data, response = get_json_command_from_request(
            flask.request, valid_commands
        )
        if response is not None:
            return response

        if command == "copy" or command == "move":
            with Permissions.FILES_UPLOAD.require(403):
                if not self._verifyFileExists(
                    target, filename
                ) and not self._verifyFolderExists(target, filename):
                    flask.abort(404)

                is_file = self._file_manager.file_exists(target, filename)
                is_folder = self._file_manager.folder_exists(target, filename)
                if not (is_file or is_folder):
                    flask.abort(
                        400,
                        description="Neither file nor folder, can't {}".format(command),
                    )

                path, name = self._file_manager.split_path(target, filename)

                destination = data["destination"]
                dst_path, dst_name = self._file_manager.split_path(target, destination)
                sanitized_destination = self._file_manager.join_path(
                    target, dst_path, self._file_manager.sanitize_name(target, dst_name)
                )

                # Check for exception thrown by _verifyFolderExists,
                # if outside the root directory
                try:
                    if (
                        self._verifyFolderExists(target, destination)
                        and sanitized_destination != filename
                    ):
                        # destination is an existing folder and not ourselves (= display rename),
                        # we'll assume we are supposed
                        # to move filename to this folder under the same name
                        destination = self._file_manager.join_path(
                            target, destination, name
                        )

                except Exception:
                    flask.abort(
                        409,
                        description="Exception thrown by storage, bad folder/file name?",
                    )

                if self._verifyFileExists(target, destination):
                    flask.abort(409, description="File does already exist")
                if self._verifyFolderExists(target, destination):
                    flask.abort(409, description="Folder does already exist")

                if command == "copy":
                    if is_file:
                        self._file_manager.copy_file(target, filename, destination)
                    else:
                        self._file_manager.copy_folder(target, filename, destination)

                elif command == "move":
                    with Permissions.FILES_DELETE.require(403):
                        # destination already there AND not ourselves (= display rename)? error...
                        if (
                            self._verifyFolderExists(target, destination)
                        ) and sanitized_destination != filename:
                            flask.abort(409, description="Folder does already exist")

                        if is_file:
                            self.storage.move_file(filename, destination)
                        else:
                            self.storage.move_folder(filename, destination)

                location = flask.url_for(
                    ".read_config_file",
                    target=target,
                    file=destination,
                    _external=True,
                )
                result = {
                    "name": name,
                    "path": destination,
                    "origin": _FILE_DESTINATION,
                    "refs": {"resource": location},
                }
                if is_file:
                    result["refs"]["download"] = (
                        flask.url_for(".list_config_files", _external=True)
                        + "downloads/files/"
                        + target
                        + "/"
                        + urlquote(destination)
                    )

                r = flask.make_response(flask.jsonify(result), 201)
                r.headers["Location"] = location
                return r

        return NO_CONTENT

    # file upload and add folder
    @octoprint.plugin.BlueprintPlugin.route("/<string:target>", methods=["POST"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def upload_config_file(self, target):
        # return self._file_manager.add_folder(
        # _FILE_DESTINATION, path, ignore_existing=ignore_existing, display=display
        # )
        input_name = "file"
        input_upload_name = input_name + ".name"
        input_upload_path = input_name + ".path"
        if (
            input_upload_name in flask.request.values
            and input_upload_path in flask.request.values
        ):
            if target not in [_FILE_DESTINATION]:
                flask.abort(404)

            upload = octoprint.filemanager.util.DiskFileWrapper(
                flask.request.values[input_upload_name],
                flask.request.values[input_upload_path],
            )

            # Store any additional user data the caller may have passed.
            userdata = None
            if "userdata" in flask.request.values:
                import json

                try:
                    userdata = json.loads(flask.request.values["userdata"])
                except Exception:
                    flask.abort(400, description="userdata contains invalid JSON")

            # determine future filename of file to be uploaded, abort if it can't be uploaded
            try:
                canonPath, canonFilename = self._file_manager.canonicalize(
                    _FILE_DESTINATION, upload.filename
                )
                if flask.request.values.get("path"):
                    canonPath = flask.request.values.get("path")
                if flask.request.values.get("filename"):
                    canonFilename = flask.request.values.get("filename")

                futurePath = self._file_manager.sanitize_path(
                    _FILE_DESTINATION, canonPath
                )
                futureFilename = self._file_manager.sanitize_name(
                    _FILE_DESTINATION, canonFilename
                )
            except Exception:
                canonFilename = None
                futurePath = None
                futureFilename = None

            if futureFilename is None:
                flask.abort(415, description="Can not upload file, wrong format?")

            # prohibit overwriting currently selected file while it's being printed
            futureFullPath = self._file_manager.join_path(
                _FILE_DESTINATION, futurePath, futureFilename
            )
            futureFullPathInStorage = self._file_manager.path_in_storage(
                _FILE_DESTINATION, futureFullPath
            )

            if (
                self._file_manager.file_exists(
                    _FILE_DESTINATION, futureFullPathInStorage
                )
                and flask.request.values.get("noOverwrite") in valid_boolean_trues
            ):
                flask.abort(
                    409, description="File already exists and noOverwrite was set"
                )

            try:
                added_file = self._file_manager.add_file(
                    _FILE_DESTINATION,
                    futureFullPathInStorage,
                    upload,
                    allow_overwrite=True,
                    display=canonFilename,
                )
            except octoprint.filemanager.storage.StorageError as e:
                if e.code == octoprint.filemanager.storage.StorageError.INVALID_FILE:
                    flask.abort(400, description="Could not upload file, invalid type")
                else:
                    flask.abort(500, description="Could not upload file")
            else:
                done = True

            if userdata is not None:
                # upload included userdata, add this now to the metadata
                self._file_manager.set_additional_metadata(
                    _FILE_DESTINATION, added_file, "userdata", userdata
                )

            files = {}
            location = flask.url_for(
                ".read_config_file",
                target=_FILE_DESTINATION,
                file=added_file,
                _external=True,
            )

            files.update(
                {
                    _FILE_DESTINATION: {
                        "name": futureFilename,
                        "path": added_file,
                        "origin": _FILE_DESTINATION,
                        "refs": {
                            "resource": location,
                            "download": flask.url_for(
                                ".list_config_files", _external=True
                            )
                            + "download/configs/"
                            + _FILE_DESTINATION
                            + "/"
                            + urlquote(added_file),
                        },
                    }
                }
            )

            r = flask.make_response(flask.jsonify(files=files, done=done), 201)
            r.headers["Location"] = location
            return r

        elif "foldername" in flask.request.values:
            foldername = flask.request.values["foldername"]

            if target not in [_FILE_DESTINATION]:
                flask.abort(400, description="target is invalid")

            canonPath, canonName = self._file_manager.canonicalize(target, foldername)
            futurePath = self._file_manager.sanitize_path(target, canonPath)
            futureName = self._file_manager.sanitize_name(target, canonName)
            if not futureName or not futurePath:
                flask.abort(400, description="folder name is empty")

            if "path" in flask.request.values and flask.request.values["path"]:
                futurePath = self._file_manager.sanitize_path(
                    _FILE_DESTINATION, flask.request.values["path"]
                )

            futureFullPath = self._file_manager.join_path(
                target, futurePath, futureName
            )
            if octoprint.filemanager.valid_file_type(futureName):
                flask.abort(
                    409, description="Can't create folder, please try another name"
                )

            try:
                added_folder = self._file_manager.add_folder(
                    target, futureFullPath, display=canonName
                )
            except octoprint.filemanager.storage.StorageError as e:
                if (
                    e.code
                    == octoprint.filemanager.storage.StorageError.INVALID_DIRECTORY
                ):
                    flask.abort(
                        400, description="Could not create folder, invalid directory"
                    )
                else:
                    flask.abort(500, description="Could not create folder")

            location = flask.url_for(
                ".read_config_file",
                target=_FILE_DESTINATION,
                file=added_folder,
                _external=True,
            )
            folder = {
                "name": futureName,
                "path": added_folder,
                "origin": target,
                "refs": {"resource": location},
            }

            r = flask.make_response(flask.jsonify(folder=folder, done=True), 201)
            r.headers["Location"] = location
            return r
        else:
            flask.abort(400, description="No file to upload and no folder to create")

    # check syntax of a given data
    @octoprint.plugin.BlueprintPlugin.route("/config/check", methods=["POST"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def check_config(self):
        data = flask.request.json
        data_to_check = data.get("DataToCheck", [])

        return flask.jsonify(config_tools.check_config(self, data_to_check))

    # save a configfile
    @octoprint.plugin.BlueprintPlugin.route("/config/save", methods=["POST"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def save_config(self):
        """
        Save a configfile

        :param in json filename: name of the file to save
        :param in json DataToSave: data to save
        :param in json hasNewName: if the file has a new name
        :param in json force: if the file should be overwritten
        :return: status and message
        """
        data = flask.request.json
        file = data.get("filename", [])
        if file == []:
            flask.abort(
                400,
                description="Invalid request, the filename is not set",
            )
        has_new_name = data.get("hasNewName", False)
        force = data.get("force", False)
        file_exist = self._file_manager.file_exists(_FILE_DESTINATION, file)
        if not force and file_exist and has_new_name:
            results = {"status": "error", "error": {"message": "File already exists"}}
            return flask.jsonify(results)

        filecontent = data.get("DataToSave", [])
        is_new_file = True if not file_exist else False

        results = config_tools.save_cfg(self, filecontent, file, is_new_file)
        if results["status"] == "success":
            extra.send_message(self, type="reload", subtype="configlist")
        return flask.jsonify(results)

    @octoprint.plugin.BlueprintPlugin.route("/servicefile/modify", methods=["POST"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def modify_service_file(self):
        if platform.system() == "Linux":
            # service_path = "/etc/systemd/system"
            servicefile_path = os.path.realpath(
                os.path.join("/etc", "default", "klipper")
            )
        else:
            flask.abort(
                400,
                description="Invalid request, not on Unix",
            )
        data = flask.request.json
        path_to_configs = data.get("PathToConfigs", [])
        if path_to_configs == []:
            flask.abort(
                400,
                description="Invalid request, the path to servicefiles is not set",
            )

        config_path = os.path.expanduser(path_to_configs)
        baseconfig = self._settings.get(["configuration", "baseconfig"])
        replace_path = os.path.join(config_path, baseconfig)

        results = extra.modify_servicefile(
            self, servicefile_path, replace_path, config_path
        )

        return flask.jsonify(results)

    # API for other stuff
    # restart klipper
    @octoprint.plugin.BlueprintPlugin.route("/restart", methods=["POST"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def restart_klipper(self):
        restart_service_system_command = self._settings.get(
            ["configuration", "restart_service_system_command"]
        )
        if restart_service_system_command == "":
            return flask.jsonify(
                dict(
                    status="error",
                    error=dict(
                        message="Restart Command for Klipper not set.",
                        command=restart_service_system_command,
                    ),
                )
            )

        # Restart klippy to reload config
        output, success = extra.execute_command(self, restart_service_system_command)
        if success:
            logger.log_info(self, "Restarting Klipper.", only_logging=False)
            return flask.jsonify(
                dict(
                    status="success",
                    data=dict(
                        message="Klipper service restarted",
                        command=restart_service_system_command,
                    ),
                )
            )
        else:
            return flask.jsonify(
                dict(
                    status="error",
                    error=dict(
                        message="Could not restart Klipper\n" + output,
                        command=restart_service_system_command,
                    ),
                )
            )

    # get server OS and return a json
    @octoprint.plugin.BlueprintPlugin.route("/serverinfo", methods=["GET"])
    def get_server_info(self):
        return flask.jsonify(status="success", data={"body": platform.system()})

    # APIs end

    # update klipper
    @octoprint.plugin.BlueprintPlugin.route("/update", methods=["POST"])
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def update_klipper(self):
        data = flask.request.json
        force = bool(data.get("forced", False))

        throttled = self._get_throttled()
        if (
            throttled
            and isinstance(throttled, dict)
            and throttled.get("current_issue", False)
            and not self._settings.get_boolean(["configuration", "ignore_throttled"])
        ):
            # currently throttled, we refuse to run
            message = (
                "System is currently throttled, refusing to update "
                "anything due to possible stability issues"
            )
            logger.log_error(self, message, only_logging=False)
            flask.abort(
                409,
                description=message,
            )

        if self._printer.is_printing() or self._printer.is_paused():
            # do not update while a print job is running
            flask.abort(409, description="Printer is currently printing or paused")
        response = extra.basedict()
        response["status"] = "success"
        [output, success] = repo_handler.update_klipper_host(
            self, self._latest_klipper_remote_tag, force
        )
        logger.log_debug(self, output, only_logging=True)
        if success:
            for m in re.finditer(r"HEAD is now at \S*", output):
                output_multiline = output[: m.end()] + "\n" + output[m.end() :]
                break
            else:
                output_multiline = output
            response["data"]["body"] = output_multiline
        else:
            response["status"] = "error"
            response["error"]["message"] = output

        return flask.jsonify(response)

    # get klipper version
    @octoprint.plugin.BlueprintPlugin.route("/checkKlipperUpdate", methods=["GET"])
    def check_Klipper_Update(self):
        response = extra.basedict()
        response["status"] = "success"

        (
            output_klipper_version,
            success_klipper_version,
        ) = repo_handler.get_software_version(self)
        if not success_klipper_version:
            response["error"]["message"] = output_klipper_version
            response["status"] = "error"
        else:
            response["data"]["klipper_version"] = output_klipper_version

        (
            self._latest_klipper_remote_tag,
            success_remote_tag,
        ) = repo_handler.retrieve_remote_git_tag(
            self, self._settings.get(["configuration", "remote_host_git"])
        )
        if not success_remote_tag:
            response["error"]["message"] = self._latest_klipper_remote_tag
            response["status"] = "error"
        else:
            response["data"][
                "latest_klipper_remote_tag"
            ] = self._latest_klipper_remote_tag

        return flask.jsonify(response)

    # get octoklipper version
    @octoprint.plugin.BlueprintPlugin.route("/checkOctoKlipperUpdate", methods=["GET"])
    def check_OctoKlipper_Update(self):
        response = extra.basedict()
        response["status"] = "success"

        (
            self._latest_octoklipper_remote_tag,
            success,
        ) = repo_handler.retrieve_remote_git_tag(
            self, self._settings.get(["configuration", "remote_octoklipper_git"])
        )
        if not success:
            response["error"]["message"] = self._latest_octoklipper_remote_tag
            response["status"] = "error"
        else:
            response["data"][
                "latest_octoklipper_remote_tag"
            ] = self._latest_octoklipper_remote_tag
        return flask.jsonify(response)

    # endregion APIs end

    @time_this(
        logtarget=__name__ + ".timings",
        message="{func}({func_args},{func_kwargs}) took {timing:.2f}ms",
        incl_func_args=True,
        log_enter=True,
        message_enter="Entering {func}({func_args},{func_kwargs})...",
    )
    def _get_file_list(
        self,
        origin,
        path=None,
        filter=None,
        recursive=False,
        level=0,
        allow_from_cache=True,
    ):
        filter_func = None
        if filter:
            filter_func = (
                lambda entry, entry_data: octoprint.filemanager.valid_file_type(
                    entry, type=filter
                )
            )

        with self._file_cache_mutex:
            cache_key = "{}:{}:{}:{}".format(origin, path, recursive, filter)
            files, lastmodified = self._file_cache.get(cache_key, ([], None))
            if (
                not allow_from_cache
                or lastmodified is None
                or lastmodified
                < self._file_manager.last_modified(origin, path=path, recursive=True)
            ):
                files = list(
                    self._file_manager.list_files(
                        origin,
                        path=path,
                        filter=filter_func,
                        recursive=recursive,
                        level=level,
                        force_refresh=not allow_from_cache,
                    )[origin].values()
                )
                lastmodified = self._file_manager.last_modified(
                    origin, path=path, recursive=True
                )
                self._file_cache[cache_key] = (files, lastmodified)

        def analyse_recursively(files, path=None):
            if path is None:
                path = ""

            result = []
            for file_or_folder in files:
                # make a shallow copy in order to not accidentally modify the cached data
                file_or_folder = dict(file_or_folder)

                file_or_folder["origin"] = _FILE_DESTINATION

                if file_or_folder["type"] == "folder":
                    if "children" in file_or_folder:
                        file_or_folder["children"] = analyse_recursively(
                            file_or_folder["children"].values(),
                            path + file_or_folder["name"] + "/",
                        )

                    file_or_folder["refs"] = {
                        "resource": flask.url_for(
                            ".read_config_file",
                            target=_FILE_DESTINATION,
                            file=path + file_or_folder["name"],
                            _external=True,
                        )
                    }
                else:
                    file_or_folder["refs"] = {
                        "resource": flask.url_for(
                            ".read_config_file",
                            target=_FILE_DESTINATION,
                            file=file_or_folder["path"],
                            _external=True,
                        ),
                        "download": flask.url_for(".list_config_files", _external=True)
                        + "download/configs/"
                        + _FILE_DESTINATION
                        + "/"
                        + urlquote(file_or_folder["path"]),
                    }

                result.append(file_or_folder)

            return result

        files = analyse_recursively(files)

        return files

    def _getFileDetails(self, origin, path, recursive=True):
        parent, path = os.path.split(path)
        files = self._get_file_list(origin, path=parent, recursive=recursive, level=1)

        for f in files:
            if f["name"] == path:
                return f
        else:
            return None

    def _validate(self, target, filename):
        try:
            return filename == "/".join(
                map(
                    lambda x: self._file_manager.sanitize_name(target, x),
                    filename.split("/"),
                )
            )
        except ValueError:
            # sanitize_name rejects names containing "/" or "\\"; such a
            # filename is not a valid storage path.
            return False

    def _verifyFileExists(self, origin, filename):
        return self._file_manager.file_exists(origin, filename)

    def _verifyFolderExists(self, origin, foldername):
        return self._file_manager.folder_exists(origin, foldername)

    def get_additional_commands(self, *args, **kwargs):
        return [
            {
                "name": gettext("Restart Klipper"),
                "action": "octoklipper_restart",
                "command": self._settings.get(
                    ["configuration", "restart_host_command"]
                ),
                "ignore": False,
                "confirm": "<h3><center><b>"
                + gettext("You are about to restart Klipper!")
                + "<br>"
                + gettext("This will stop ongoing prints!")
                + "</b></center></h3><br>Command = "
                + self._settings.get(["configuration", "restart_host_command"])
                + "",
            }
        ]

    def support_cfg_klipperfiles(self, *args, **kwargs):
        return dict(config=dict(cfg=["cfg", "config"]))

    def get_update_information(self):
        return dict(
            klipper=dict(
                displayName=self._plugin_name,
                displayVersion=self._plugin_version,
                type="github_release",
                current=self._plugin_version,
                user="thelastWallE",
                repo="OctoprintKlipperPlugin",
                pip="https://github.com/thelastWallE/OctoprintKlipperPlugin/archive/{target_version}.zip",
                stable_branch=dict(
                    name="Stable", branch="master", comittish=["master"]
                ),
                prerelease_branches=[
                    dict(
                        name="Release Candidate",
                        branch="rc",
                        comittish=["rc", "master"],
                    )
                ],
            )
        )


__plugin_name__ = "OctoKlipper"
__plugin_pythoncompat__ = ">=3.10,<4"


def __plugin_load__():
    global __plugin_implementation__
    global __plugin_hooks__
    __plugin_implementation__ = KlipperPlugin()
    __plugin_hooks__ = {
        "octoprint.system.additional_commands": __plugin_implementation__.get_additional_commands,
        "octoprint.server.http.routes": __plugin_implementation__.route_hook,
        "octoprint.access.permissions": __plugin_implementation__.get_additional_permissions,
        "octoprint.filemanager.extension_tree": __plugin_implementation__.support_cfg_klipperfiles,
        "octoprint.comm.protocol.atcommand.sending": __plugin_implementation__.process_at_command,
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.process_sent_gcode,
        "octoprint.comm.protocol.gcode.received": __plugin_implementation__.on_parse_gcode,
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information,
    }
