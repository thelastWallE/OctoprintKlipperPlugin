// <Octoprint Klipper Plugin>

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

$(function () {
  $("#klipper-settings a:first").tab("show");
  function KlipperSettingsViewModel(parameters) {
    var self = this;

    self.settings = parameters[0];
    self.klipperViewModel = parameters[1];
    self.klipperEditorViewModel = parameters[2];
    self.klipperBackupViewModel = parameters[3];
    self.access = parameters[4];

    self.header = OctoPrint.getRequestHeaders({
      "content-type": "application/json",
      "cache-control": "no-cache",
    });

    self.markedForFileRemove = ko.observableArray([]);
    self.PathToConfigs = ko.observable("");
    self.serverOS = ko.observable("");

    var changeConfigPath = function () {
      self.settings.settings.plugins.klipper.configuration.config_path(self.configPath());
    };

    self.getConfigPath = function () {
      self.configPath(self.settings.settings.plugins.klipper.configuration.config_path());
    };
    self.configPath = ko.observable("");
    self.configPath.subscribe(changeConfigPath);


    $(document).on('shown.bs.modal', '#klipper_editor', function () {
      self.klipperEditorViewModel.onShown();
    });

    // initialize list helper
    self.configs = new ItemListHelper(
      "klipperCfgFiles",
      {
        name: function (a, b) {
          // sorts ascending
          if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
          if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
          return 0;
        },
        date: function (a, b) {
          // sorts descending
          if (a["date"] > b["date"]) return -1;
          if (a["date"] < b["date"]) return 1;
          return 0;
        },
        size: function (a, b) {
          // sorts descending
          if (a["bytes"] > b["bytes"]) return -1;
          if (a["bytes"] < b["bytes"]) return 1;
          return 0;
        },
      },
      {},
      "name",
      [],
      [],
      15
    );

    self.onStartupComplete = function () {
      self.getConfigPath();
      self.getServerInfo();
      self.listCfgFiles();
      self.loadBaseConfig();
    };

    self.getServerInfo = function () {
      self.klipperViewModel.consoleMessage("debug", "getServerInfo started");
      // version 1 get OS of Server
      OctoPrint.plugins.klipper.getServerInfo()
        .done(function (response) {
          if (response.status == "success") {
            self.klipperViewModel.consoleMessage("debug", "getServerInfo response: " + JSON.stringify(response));
            self.serverOS(response.data.body);
          } else {
            self.klipperViewModel.consoleMessage("error", "getServerInfo response: " + JSON.stringify(response));
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "getServerInfo response: " + JSON.stringify(response));
        });
    };

    self.listCfgFiles = function () {
      self.klipperViewModel.consoleMessage("debug", "listCfgFiles started");

      OctoPrint.plugins.klipper.listCfg()
        .done(function (response) {
          self.klipperViewModel.consoleMessage("debug", "listCfgFiles done");
          self.configs.updateItems(response.data.files);
          self.PathToConfigs(gettext("Path: ") + response.data.path);
          self.configs.resetPage();
        });
    };

    self.loadBaseConfig = function () {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      var baseconfig = self.settings.settings.plugins.klipper.configuration.baseconfig();
      if (baseconfig != "") {
        self.klipperViewModel.consoleMessage("debug", "loadBaseConfig:" + baseconfig);
        OctoPrint.plugins.klipper.getCfg(baseconfig)
          .done(function (response) {
            if (response.status == "success") {
              var config = {
                content: response.data.body,
                file: baseconfig,
              };
              self.klipperEditorViewModel.process(config).then();
            } else {
              self.klipperViewModel.consoleMessage("error", "loadBaseConfig failed: " + response.error.message);
            }
          })
          .fail(function (response) {
            self.klipperViewModel.consoleMessage("error", "loadBaseConfig failed: " + response);
          });
      }
    };

    self.modifyServicefile = function () {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      self.klipperViewModel.consoleMessage("debug", "modifyServiceFile");
      OctoPrint.plugins.klipper.modifyServicefile(self.configPath())
        .done(function (response) {
          if (response.data) {
            self.klipperViewModel.consoleMessage("debug", "modifyServiceFile done");
            self.klipperViewModel.showPopUp("success", gettext("Modify Servicefile"), gettext("Servicefile modified."));
            showMessageDialog(
              gettext("Copy and run these commands in your linux shell to copy the new servicefile for Klipper.")
              + "<br><b>Warning: This will stop ongoing prints!</b>"
              + "<br><br>"
              + "    sudo cp -T -v " + response.data.path + " /etc/default/klipper<br>    sudo systemctl restart klipper<br><br>",
              {
                title: gettext("Manually action needed")
              }
            );
          } else if (response.error) {
            self.klipperViewModel.consoleMessage("error", "modifyServiceFile failed: " + response.error.message);
            self.klipperViewModel.showPopUp("error", gettext("Modify Servicefile"), response.error.message);
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "modifyServiceFile failed: " + response.responseJSON.error);
          self.klipperViewModel.showPopUp("error", gettext("Modify Servicefile"), response.responseJSON.error);
        });
    };

    self.removeCfg = function (config) {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      var perform = function () {
        OctoPrint.plugins.klipper
          .deleteCfg(config)
          .done(function () {
            self.listCfgFiles();
          })
          .fail(function (response) {
            var html = "<p>" + _.sprintf(gettext("Failed to remove config %(name)s.</p><p>Please consult octoprint.log for details.</p>"), { name: _.escape(config) });
            html += pnotifyAdditionalInfo('<pre style="overflow: auto">' + _.escape(response.responseText) + "</pre>");
            new PNotify({
              title: gettext("Could not remove config"),
              text: html,
              type: "error",
              hide: false,
            });
          });
      };

      showConfirmationDialog(
        _.sprintf(gettext('You are about to delete config file "%(name)s".'), {
          name: _.escape(config),
        }),
        perform
      );
    };

    self.markFilesOnPage = function () {
      self.markedForFileRemove(_.uniq(self.markedForFileRemove().concat(_.map(self.configs.paginatedItems(), "file"))));
    };

    self.markAllFiles = function () {
      self.markedForFileRemove(_.map(self.configs.allItems, "file"));
    };

    self.clearMarkedFiles = function () {
      self.markedForFileRemove.removeAll();
    };

    self.removeMarkedFiles = function () {
      var perform = function () {
        self._bulkRemove(self.markedForFileRemove()).done(function () {
          self.markedForFileRemove.removeAll();
        });
      };

      showConfirmationDialog(
        _.sprintf(gettext("You are about to delete %(count)d config files."), {
          count: self.markedForFileRemove().length,
        }),
        perform
      );
    };

    self._bulkRemove = function (files) {
      var title, message, handler;

      title = gettext("Deleting config files");
      message = _.sprintf(gettext("Deleting %(count)d config files..."), {
        count: files.length,
      });

      handler = function (filename) {
        return OctoPrint.plugins.klipper
          .deleteCfg(filename)
          .done(function () {
            deferred.notify(
              _.sprintf(gettext("Deleted %(filename)s..."), {
                filename: _.escape(filename),
              }),
              true
            );
            self.markedForFileRemove.remove(function (item) {
              return item.name == filename;
            });
          })
          .fail(function () {
            deferred.notify(_.sprintf(gettext("Deleting of %(filename)s failed, continuing..."), { filename: _.escape(filename) }), false);
          });
      };

      var deferred = $.Deferred();
      var promise = deferred.promise();
      var options = {
        title: title,
        message: message,
        max: files.length,
        output: true,
      };
      showProgressModal(options, promise);

      var requests = [];
      _.each(files, function (filename) {
        var request = handler(filename);
        requests.push(request);
      });

      $.when.apply($, _.map(requests, wrapPromiseWithAlways)).done(function () {
        deferred.resolve();
        self.listCfgFiles();
      });

      return promise;
    };

    self.showBackupsDialog = function () {
      self.klipperViewModel.consoleMessage("debug", "showBackupsDialog");
      self.klipperBackupViewModel.listBakFiles();
      var dialog = $("#klipper_backups_dialog");
      dialog.modal({
        show: "true",
      });
    };

    self.showEditor = function () {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      var editorDialog = $("#klipper_editor");
      editorDialog.modal({
        show: "true",
        width: "90%",
        backdrop: "static",
      });
    }

    self.newFile = function () {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;
      var config = {
        content: "",
        file: "Change Filename",
      };
      self.klipperEditorViewModel.process(config).then(
        function () { self.showEditor(); }
      );
    };

    self.openConfig = function (file) {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      OctoPrint.plugins.klipper.getCfg(file)
        .done(function (response) {
          if (response.status == "success") {
            var config = {
              content: response.data["body"],
              file: file,
            };
            self.klipperEditorViewModel.process(config).then(
              function () { self.showEditor(); }
            );
          } else {
            self.klipperViewModel.consoleMessage("error", "openConfig failed: " + response.data["body"]);
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "openConfig failed: " + response);
        });
    };

    self.addMacro = function () {
      self.settings.settings.plugins.klipper.macros.push({
        name: "Macro",
        macro: "",
        sidebar: true,
        tab: true,
      });
    };

    self.removeMacro = function (macro) {
      self.settings.settings.plugins.klipper.macros.remove(macro);
    };

    self.moveMacroUp = function (macro) {
      self.moveItemUp(self.settings.settings.plugins.klipper.macros, macro);
    };

    self.moveMacroDown = function (macro) {
      self.moveItemDown(self.settings.settings.plugins.klipper.macros, macro);
    };

    self.addProbePoint = function () {
      self.settings.settings.plugins.klipper.probe.points.push({
        name: "point-#",
        x: 0,
        y: 0,
        z: 0,
      });
    };

    self.removeProbePoint = function (point) {
      self.settings.settings.plugins.klipper.probe.points.remove(point);
    };

    self.moveProbePointUp = function (macro) {
      self.moveItemUp(self.settings.settings.plugins.klipper.probe.points, macro);
    };

    self.moveProbePointDown = function (macro) {
      self.moveItemDown(self.settings.settings.plugins.klipper.probe.points, macro);
    };

    self.moveItemDown = function (list, item) {
      var i = list().indexOf(item);
      if (i < list().length - 1) {
        var rawList = list();
        list.splice(i, 2, rawList[i + 1], rawList[i]);
      }
    };

    self.moveItemUp = function (list, item) {
      var i = list().indexOf(item);
      if (i > 0) {
        var rawList = list();
        list.splice(i - 1, 2, rawList[i], rawList[i - 1]);
      }
    };

    self.onDataUpdaterPluginMessage = function (plugin, data) {
      if (plugin == "klipper" && data.type == "reload" && data.subtype == "configlist") {
        self.klipperViewModel.consoleMessage("debug", "onDataUpdaterPluginMessage klipper reload configlist");
        self.listCfgFiles();
      }
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperSettingsViewModel,
    dependencies: ["settingsViewModel", "klipperViewModel", "klipperEditorViewModel", "klipperBackupViewModel", "accessViewModel"],
    elements: ["#settings_plugin_klipper"],
  });
});
