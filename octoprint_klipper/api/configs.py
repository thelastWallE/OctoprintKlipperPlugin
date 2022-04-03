import os

import flask
import octoprint.plugin
from octoprint.access.permissions import Permissions
from octoprint.server import NO_CONTENT
from octoprint.server.util.flask import restricted_access
from octoprint.util import is_hidden_path

import octoprint_klipper.config_tools.CfgUtils as cfg_utils
import octoprint_klipper.utils.extra as extra

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5Mb


# API for Configs
# Get Content of a Configfile
@octoprint.plugin.BlueprintPlugin.route("/config/<filename>", methods=["GET"])
@restricted_access
@Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
def get_config(self, filename):
    cfg_path = os.path.expanduser(self._settings.get(["configuration", "config_path"]))
    full_path = os.path.realpath(os.path.join(cfg_path, filename))
    response = cfg_utils.get_cfg(self, full_path)
    return flask.jsonify(response=response)


# Delete a Configfile
@octoprint.plugin.BlueprintPlugin.route("/config/<filename>", methods=["DELETE"])
@restricted_access
@Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
def delete_config(self, filename):
    cfg_path = os.path.expanduser(self._settings.get(["configuration", "config_path"]))
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
    files = cfg_utils.list_cfg_files(self, "")
    path = os.path.expanduser(self._settings.get(["configuration", "config_path"]))
    return flask.jsonify(files=files, path=path, max_upload_size=MAX_UPLOAD_SIZE)


# check syntax of a given data
@octoprint.plugin.BlueprintPlugin.route("/config/check", methods=["POST"])
@restricted_access
@Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
def check_config(self):
    data = flask.request.json
    data_to_check = data.get("DataToCheck", [])
    response = cfg_utils.check_cfg_ok(self, data_to_check)
    return flask.jsonify(is_syntax_ok=response)


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
    saved = cfg_utils.save_cfg(self, Filecontent, filename)
    if saved:
        extra.send_message(self, type="reload", subtype="configlist")
    return flask.jsonify(saved=saved)
