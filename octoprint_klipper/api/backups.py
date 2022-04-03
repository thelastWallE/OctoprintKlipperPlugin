import os

import flask
import octoprint.plugin
from octoprint.access.permissions import Permissions
from octoprint.server import NO_CONTENT
from octoprint.server.util.flask import restricted_access
from octoprint.util import is_hidden_path

import octoprint_klipper.config_tools.CfgUtils as cfg_utils


# Get Content of a Backupconfig
@octoprint.plugin.BlueprintPlugin.route("/backup/<filename>", methods=["GET"])
@restricted_access
@Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
def get_backup(self, filename):
    data_folder = self.get_plugin_data_folder()
    full_path = os.path.realpath(os.path.join(data_folder, "configs", filename))
    response = cfg_utils.get_cfg(self, full_path)
    return flask.jsonify(response=response)


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
    files = cfg_utils.list_cfg_files(self, "backup")
    return flask.jsonify(files=files)


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
    return flask.jsonify(restored=cfg_utils.copy_cfg(self, backupfile, configpath))
