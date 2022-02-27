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
import platform
import sys
import time

import flask
import octoprint.plugin
import octoprint.plugin.core
from flask_babel import gettext
from octoprint.access.permissions import ADMIN_GROUP, Permissions
from octoprint.server import NO_CONTENT
from octoprint.server.util.flask import restricted_access
from octoprint.util import get_formatted_size, is_hidden_path
from octoprint.util.comm import parse_firmware_line

from octoprint_klipper import cfgUtils
from octoprint_klipper import util

from .modules import KlipperLogAnalyzer

if sys.version_info[0] < 3:
    import StringIO

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5Mb

class KlipperPlugin(
        octoprint.plugin.StartupPlugin,
        octoprint.plugin.TemplatePlugin,
        octoprint.plugin.SettingsPlugin,
        octoprint.plugin.AssetPlugin,
        octoprint.plugin.SimpleApiPlugin,
        octoprint.plugin.EventHandlerPlugin,
        octoprint.plugin.BlueprintPlugin):

    _parsing_response = False
    _parsing_check_response = True
    _message = ""
    _reload_config_lock = False
    _latest_klipper_remote_tag = ""
    _repo_klipper="https://github.com/Klipper3D/klipper.git"

    def __init__(self):
        self._logger = logging.getLogger("octoprint.plugins.klipper")
        self._octoklipper_logger = logging.getLogger("octoprint.plugins.klipper.debug")
        self._get_throttled = lambda: False

    # -- Startup Plugin
    def on_startup(self, host, port):
        from octoprint.logging.handlers import CleaningTimedRotatingFileHandler
        octoklipper_logging_handler = CleaningTimedRotatingFileHandler(
            self._settings.get_plugin_logfile_path(postfix="debug"), when="D", backupCount=3)
        octoklipper_logging_handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s"))
        octoklipper_logging_handler.setLevel(logging.DEBUG)

        self._octoklipper_logger.addHandler(octoklipper_logging_handler)
        self._octoklipper_logger.setLevel(
            logging.DEBUG if self._settings.get_boolean(["configuration", "debug_logging"]) else logging.INFO)
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


    def on_after_startup(self):
        klipper_port = self._settings.get(["connection", "port"])
        additional_ports = self._settings.global_get(
            ["serial", "additionalPorts"])

        if klipper_port not in additional_ports:
            additional_ports.append(klipper_port)
            self._settings.global_set(
                ["serial", "additionalPorts"], additional_ports)
            self._settings.save()
            util.log_info(
                self,
                False,
                "Added klipper serial port {} to list of additional ports.".format(klipper_port)
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
                "roles": ["admin"]
            },
            {
                "key": "MACRO",
                "name": "Use Klipper Macros",
                "description": gettext("Allows to use klipper macros"),
                "default_groups": [ADMIN_GROUP],
                "dangerous": True,
                "roles": ["admin"]
            },
        ]

    def get_settings_defaults(self):
        # TODO #69 put some settings on the localStorage
        return dict(
            connection=dict(
                port="/tmp/printer",
                replace_connection_panel=True,
                hide_editor_button=False
            ),
            macros=[dict(
                name="E-Stop",
                macro="M112",
                sidebar=True,
                tab=True
            )],
            probe=dict(
                height=0,
                lift=5,
                speed_xy=1500,
                speed_z=500,
                points=[dict(
                    name="point-1",
                    x=0,
                    y=0
                )]
            ),
            configuration=dict(
                debug_logging=False,
                ignore_throttled=False,
                klipper_path="~/klipper/",
                config_path="~/",
                baseconfig="printer.cfg",
                logpath="/tmp/klippy.log",
                restart_host_command="sudo service klipper restart",
                reload_command="RESTART",
                restart_onsave=True,
                confirm_reload=True,
                shortStatus_navbar=True,
                shortStatus_sidebar=True,
                parse_check=False,
                fontsize=12,
                hide_error_popups=False
            )
        )

    def on_settings_save(self, data):
        old_debug_logging = self._settings.get_boolean(["configuration", "debug_logging"])

        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)

        new_debug_logging = self._settings.get_boolean(["configuration", "debug_logging"])
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
                ["configuration", "replace_connection_panel"],
                ["configuration", "restart_host_command"]
            ],
            user=[
                ["macros"],
                ["probe"]
            ]
        )

    def get_settings_version(self):
        # Settings_Versionhistory:
        # 3 = add shortstatus on navbar. migrate the navbar setting for this
        # 4 = -change of configpath to config_path with only path without filename
        #     -parse configpath into config_path and baseconfig
        #     -switch setting for 'restart on editor save' to true if it was not set to manually
        #     -remove old_config
        #     -remove config on root settingsdirectory
        return 4

    #migrate Settings
    def on_settings_migrate(self, target, current):
        settings = self._settings
        if current is None:
            util.migrate_old_settings(settings)

        if current is not None and current < 3:
            self.migrate_settings_3(settings)

        if current is not None and current < 4:
            self.migrate_settings_4(settings)

    def migrate_settings_3(self, settings):
        util.migrate_settings_configuration(
            settings,
            "shortStatus_navbar",
            "navbar",
        )

    def migrate_settings_4(self, settings):
        if settings.has(["configuration", "configpath"]):
            cfg_path = settings.get(["configuration", "configpath"])
            new_cfg_path, baseconfig = os.path.split(cfg_path)
            util.log_info(self, False,"migrate setting for 'configuration/config_path': " + cfg_path + " -> " + new_cfg_path)
            util.log_info(self, False, "migrate setting for 'configuration/baseconfig': printer.cfg -> " + baseconfig)
            settings.set(["configuration", "config_path"], new_cfg_path)
            settings.set(["configuration", "baseconfig"], baseconfig)
            settings.remove(["configuration", "configpath"])
        if (
            settings.has(["configuration", "reload_command"])
            and settings.get(["configuration", "reload_command"]) == "manually"
        ):
            util.log_info(self, False, "migrate setting for 'configuration/restart_onsave': True -> False")
            settings.set(["configuration", "restart_onsave"], False)
            settings.remove(["configuration", "reload_command"])

        if settings.has(["config"]):
            util.log_info(self, False, "remove old setting for 'config'")
            settings.remove(["config"])

        if settings.has(["configuration", "old_config"]):
            util.log_info(self, False, "remove old setting for 'configuration/old_config'")
            settings.remove(["configuration", "old_config"])


    # -- Template Plugin
    def get_template_configs(self):
        return [
            dict(type="navbar", custom_bindings=True),
            dict(type="settings", custom_bindings=True),
            dict(
                type="generic",
                name="Assisted Bed Leveling",
                template="klipper_leveling_dialog.jinja2",
                custom_bindings=True
            ),
            dict(
                type="generic",
                name="PID Tuning",
                template="klipper_pid_tuning_dialog.jinja2",
                custom_bindings=True
            ),
            dict(
                type="generic",
                name="Coordinate Offset",
                template="klipper_offset_dialog.jinja2",
                custom_bindings=True
            ),
            dict(
                type="tab",
                name="Klipper",
                template="klipper_tab_main.jinja2",
                suffix="_main",
                custom_bindings=True
            ),
            dict(type="sidebar",
                custom_bindings=True,
                icon="rocket",
                replaces="connection" if self._settings.get_boolean(
                    ["connection", "replace_connection_panel"]) else ""
            ),
            dict(
                type="generic",
                name="Performance Graph",
                template="klipper_graph_dialog.jinja2",
                custom_bindings=True
            ),
            dict(
                type="generic",
                name="Config Backups",
                template="klipper_backups_dialog.jinja2",
                custom_bindings=True
            ),
            dict(
                type="generic",
                name="Config Editor",
                template="klipper_editor.jinja2",
                custom_bindings=True
            ),
            dict(
                type="generic",
                name="Macro Dialog",
                template="klipper_param_macro_dialog.jinja2",
                custom_bindings=True
            )
        ]

    def get_template_vars(self):
        return {
            "max_upload_size": MAX_UPLOAD_SIZE,
            "max_upload_size_str": get_formatted_size(MAX_UPLOAD_SIZE),
        }

    # -- Asset Plugin

    def get_assets(self):
        return dict(
            js=["js/klipper.js",
                "js/klipper_settings.js",
                "js/klipper_leveling.js",
                "js/klipper_pid_tuning.js",
                "js/klipper_offset.js",
                "js/klipper_param_macro.js",
                "js/klipper_graph.js",
                "js/klipper_backup.js",
                "js/klipper_editor.js"
            ],
            clientjs=["clientjs/klipper.js"],
            css=["css/klipper.css"]
        )

    # -- Event Handler Plugin

    def on_event(self, event, payload):
        if event == "UserLoggedIn":
            util.log_info(self, False, "Klipper: Standby")
        if event == "Connecting":
            util.log_info(self, False, "Klipper: Connecting ...")
        elif event == "Connected":
            util.log_info(
                self,
                False,
                "Klipper: Connected to host via {} @{}bps".format(payload["port"], payload["baudrate"]))
        elif event == "Disconnected":
            util.log_info(self, False, "Klipper: Disconnected from host")

        elif event == "Error":
            util.log_error(self, False, payload["error"])
        elif event == "PrinterStateChanged":
            util.log_info(self, False, "Printer: " + payload["state_string"])
        elif event == "PrintStarted":
            util.log_info(self, False, "Klipper: Printing " + payload["name"])
        elif event == "PrintDone":
            util.log_info(self, False, "Klipper: Print finished " + payload["name"])
        elif event == "PrintCancelling":
            util.log_info(self, False, "Klipper: Print cancelling " + payload["name"])
        elif event == "PrintCancelled":
            util.log_info(self, False, "Klipper: Print cancelled " + payload["name"])
        elif event == "PrintPaused":
            util.log_info(self, False, "Klipper: Print paused " + payload["name"])
        elif event == "PrintResumed":
            util.log_info(self, False, "Klipper: Print resumed " + payload["name"])

    def processAtCommand(self, comm_instance, phase, command, parameters, tags=None, *args, **kwargs):
        if command != "SWITCHCONFIG":
            return

        config = parameters
        util.log_info(self, False, "SWITCHCONFIG detected config:{}".format(config))
        return None

    # -- GCODE Hook
    def process_sent_GCODE(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        if cmd == "SAVE_CONFIG":
            self.save_config_caught()

    def on_parse_gcode(self, comm, line, *args, **kwargs):

        if "FIRMWARE_VERSION" in line:
            printerInfo = parse_firmware_line(line)
            if "FIRMWARE_VERSION" in printerInfo:
                util.send_message(self, type = "version", subtype = "firmware", payload = printerInfo["FIRMWARE_VERSION"])
                util.log_info(self, False, "Firmware version: {}".format(
                    printerInfo["FIRMWARE_VERSION"]))
        elif "// probe" in line or "// Failed to verify BLTouch" in line:
            msg = line.strip('/')
            util.log_info(self, False, msg)
            self.write_parsing_response_buffer()
        elif "// SAVE_CONFIG" in line:
            self.save_config_caught()
        elif "//" in line:
            # add lines with // to a buffer
            self._message = self._message + line.strip('/')
            if not self._parsing_response:
                util.update_status(self, "info", self._message)
            self._parsing_response = True
        elif "!!" in line:
            msg = line.strip('!')
            util.log_error(self, False, msg)
            self.write_parsing_response_buffer()
        else:
            self.write_parsing_response_buffer()
        return line

    def write_parsing_response_buffer(self):
        # write buffer with // lines after a gcode response without //
        if self._parsing_response:
            self._parsing_response = False
            util.log_info(self, False, self._message)
            self._message = ""

    def save_config_caught(self):
        util.log_info(self, False, "SAVE_CONFIG detected")
        util.send_message(self, type = "reload", subtype = "config")

    def get_api_commands(self):
        return dict(
            listLogFiles=[],
            getStats=["logFile"]
        )

    def on_api_command(self, command, data):
        if command == "listLogFiles":
            files = []
            logpath = os.path.expanduser(
                self._settings.get(["configuration", "logpath"])
            )
            if util.file_exist(self, logpath):
                for f in glob.glob(self._settings.get(["configuration", "logpath"]) + "*"):
                    filesize = os.path.getsize(f)
                    filemdate = time.strftime("%d.%m.%Y %H:%M",time.localtime(os.path.getctime(f)))
                    files.append(dict(
                        name=os.path.basename(f) + " (" + filemdate + ")",
                        file=f,
                        size=filesize
                    ))
            return flask.jsonify(data=files)
        elif command == "getStats":
            if "logFile" in data:
                log_analyzer = KlipperLogAnalyzer.KlipperLogAnalyzer(
                    data["logFile"])
                return flask.jsonify(log_analyzer.analyze())

    def is_blueprint_protected(self):
        return False

    def route_hook(self, server_routes, *args, **kwargs):
        from octoprint.server.util.tornado import LargeResponseHandler, path_validation_factory
        from octoprint.util import is_hidden_path
        configpath = os.path.expanduser(
                        self._settings.get(["configuration", "config_path"])
                    )
        bak_path = os.path.join(self.get_plugin_data_folder(), "configs", "")

        return [
            (r"/download/configs/(.*)", LargeResponseHandler, dict(path=configpath,
                                                           as_attachment=True,
                                                           path_validation=path_validation_factory(lambda path: not is_hidden_path(path),
                                                                                                   status_code=404))),
            (r"/download/backup/(.*)", LargeResponseHandler, dict(path=bak_path,
                                                           as_attachment=True,
                                                           path_validation=path_validation_factory(lambda path: not is_hidden_path(path),
                                                                                                   status_code=404)))
        ]

#region [rgba(20,40,20,0.5)] APIs
    # Get Content of a Backupconfig
    @octoprint.plugin.BlueprintPlugin.route("/backup/<filename>", methods=["GET"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def get_backup(self, filename):
        data_folder = self.get_plugin_data_folder()
        full_path = os.path.realpath(os.path.join(data_folder, "configs", filename))
        response = cfgUtils.get_cfg(self, full_path)
        return flask.jsonify(response = response)

    # Delete a Backupconfig
    @octoprint.plugin.BlueprintPlugin.route("/backup/<filename>", methods=["DELETE"])
    @restricted_access
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
                self._octoklipper_logger.exception("Could not delete {}".format(filename))
                raise
        return NO_CONTENT

    # Get a list of all backed up configfiles
    @octoprint.plugin.BlueprintPlugin.route("/backup/list", methods=["GET"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def list_backups(self):
        files = cfgUtils.list_cfg_files(self, "backup")
        return flask.jsonify(files = files)

    # restore a backed up configfile
    @octoprint.plugin.BlueprintPlugin.route("/backup/restore/<filename>", methods=["GET"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def restore_backup(self, filename):
        configpath = os.path.expanduser(
                        self._settings.get(["configuration", "config_path"])
                    )
        data_folder = self.get_plugin_data_folder()
        backupfile = os.path.realpath(os.path.join(data_folder, "configs", filename))
        return flask.jsonify(restored = cfgUtils.copy_cfg(self, backupfile, configpath))

# API for Configs
    # Get Content of a Configfile
    @octoprint.plugin.BlueprintPlugin.route("/config/<filename>", methods=["GET"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def get_config(self, filename):
        cfg_path = os.path.expanduser(
            self._settings.get(["configuration", "config_path"])
        )
        full_path = os.path.realpath(os.path.join(cfg_path, filename))
        response = cfgUtils.get_cfg(self, full_path)
        return flask.jsonify(response = response)

    # Delete a Configfile
    @octoprint.plugin.BlueprintPlugin.route("/config/<filename>", methods=["DELETE"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def delete_config(self, filename):
        cfg_path = os.path.expanduser(
            self._settings.get(["configuration", "config_path"])
        )
        full_path = os.path.realpath(os.path.join(cfg_path, filename))
        if (
            full_path.startswith(cfg_path)
            and os.path.exists(full_path)
            and not is_hidden_path(full_path)
        ):
            try:
                os.remove(full_path)
            except Exception:
                self._octoklipper_logger.exception("Could not delete {}".format(filename))
                raise
        return NO_CONTENT

    # Get a list of all configfiles
    @octoprint.plugin.BlueprintPlugin.route("/config/list", methods=["GET"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def list_configs(self):
        files = cfgUtils.list_cfg_files(self, "")
        path = os.path.expanduser(
            self._settings.get(["configuration", "config_path"])
        )
        return flask.jsonify(files = files, path = path, max_upload_size = MAX_UPLOAD_SIZE)

    # check syntax of a given data
    @octoprint.plugin.BlueprintPlugin.route("/config/check", methods=["POST"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def check_config(self):
        data = flask.request.json
        data_to_check = data.get("DataToCheck", [])
        response = cfgUtils.check_cfg_ok(self, data_to_check)
        return flask.jsonify(is_syntax_ok = response)

    # save a configfile
    @octoprint.plugin.BlueprintPlugin.route("/config/save", methods=["POST"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def save_config(self):
        data = flask.request.json
        filename = data.get("filename", [])
        if filename == []:
            flask.abort(
                400,
                description="Invalid request, the filename is not set",
            )
        Filecontent = data.get("DataToSave", [])
        saved = cfgUtils.save_cfg(self, Filecontent, filename)
        if saved == True:
            util.send_message(self, type = "reload", subtype = "configlist")
        return flask.jsonify(saved = saved)

    # restart klipper
    @octoprint.plugin.BlueprintPlugin.route("/restart", methods=["POST"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def restart_klipper(self):
        reload_command = self._settings.get(["configuration", "reload_command"])

        if reload_command != "manually":

            # Restart klippy to reload config
            self._printer.commands(reload_command)
            util.log_info(self, False, "Restarting Klipper.")
        return flask.jsonify(command = reload_command)

    # restart klipper
    @octoprint.plugin.BlueprintPlugin.route("/update", methods=["POST"])
    @restricted_access
    @Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
    def update_klipper(self):

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
            util.log_error(self, False, message)
            flask.abort(
                409,
                description=message,
            )

        if self._printer.is_printing() or self._printer.is_paused():
            # do not update while a print job is running
            flask.abort(409, description="Printer is currently printing or paused")

        return flask.jsonify(
            output=util.update_klipper_host(self, self._latest_klipper_remote_tag),
        )

    # get klipper version
    @octoprint.plugin.BlueprintPlugin.route("/", methods=["GET"])
    @restricted_access
    def get_state(self):
        klipper_version = util.get_software_version(self)
        self._latest_klipper_remote_tag = util.retrieve_remote_git_tag(self, "klipper")
        return flask.jsonify(
            klipper_version=klipper_version,
            klipper_remote_version=self._latest_klipper_remote_tag
        )
#endregion APIs end

    def get_additional_commands(self, *args, **kwargs):
        return [
            {
                "name": gettext('Restart Klipper'),
                "action": "octoklipper_restart",
                "command": self._settings.get(["configuration", "restart_host_command"]),
                "ignore": False,
                "confirm": '<h3><center><b>' + gettext("You are about to restart Klipper!") + '<br>' + gettext("This will stop ongoing prints!") + '</b></center></h3><br>Command = '+ self._settings.get(["configuration", "restart_host_command"])+''
            }
        ]


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
                    name="Stable",
                    branch="master",
                    comittish=["master"]
                ),
                prerelease_branches=[
                    dict(
                        name="Release Candidate",
                        branch="rc",
                        comittish=["rc", "master"]
                    )]
            )
        )

__plugin_name__ = "OctoKlipper"
__plugin_pythoncompat__ = ">=2.7,<4"

def __plugin_load__():
    global __plugin_implementation__
    global __plugin_hooks__
    __plugin_implementation__ = KlipperPlugin()
    __plugin_hooks__ = {
        "octoprint.system.additional_commands": __plugin_implementation__.get_additional_commands,
        "octoprint.server.http.routes": __plugin_implementation__.route_hook,
        "octoprint.access.permissions": __plugin_implementation__.get_additional_permissions,
        "octoprint.comm.protocol.atcommand.sending": __plugin_implementation__.processAtCommand,
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.process_sent_GCODE,
        "octoprint.comm.protocol.gcode.received": __plugin_implementation__.on_parse_gcode,
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
    }
