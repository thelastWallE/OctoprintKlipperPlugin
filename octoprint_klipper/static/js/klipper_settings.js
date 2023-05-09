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

    self.PathToConfigs = ko.observable("");
    self.serverOS = ko.observable("");
    self.macros = ko.observableArray([]);

    var changeConfigPath = function () {
      self.settings.settings.plugins.klipper.configuration.config_path(self.configPath());
    };

    self.getConfigPath = function () {
      self.configPath(self.settings.settings.plugins.klipper.configuration.config_path());
    };
    self.configPath = ko.observable("");
    self.configPath.subscribe(changeConfigPath);

    var subbed = false;
    self.onStartup =
      self.onUserLoggedIn =
      self.onUserLoggedOut =
        function () {
          if (
            self.settings &&
            self.settings.settings &&
            self.settings.settings.plugins &&
            self.settings.settings.plugins.klipper &&
            !subbed
          ) {
            subbed = true;
            self.settings.settings.plugins.klipper.macros.subscribe(function () {
              self.updateMacroList();
            });
          }
        };

    self.onStartupComplete = function () {
      self.getConfigPath();
      self.getServerInfo();
      self.updateMacroList();
    };

    self.getServerInfo = function () {
      self.klipperViewModel.consoleMessage("debug", "getServerInfo started");
      // version 1 get OS of Server
      OctoPrint.plugins.klipper
        .getServerInfo()
        .done(function (response) {
          if (response.status == "success") {
            self.klipperViewModel.consoleMessage("debug", "getServerInfo response: " + _.escape(response.data.body));
            self.serverOS(response.data.body);
          } else {
            self.klipperViewModel.consoleMessage(
              "error",
              "getServerInfo response: " + _.escape(response.error.message)
            );
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "getServerInfo response: " + _.escape(response.responseText));
        });
    };

    self.modifyServicefile = function () {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      self.klipperViewModel.consoleMessage("debug", "modifyServiceFile");
      OctoPrint.plugins.klipper
        .modifyServicefile(self.configPath())
        .done(function (response) {
          if (response.data) {
            self.klipperViewModel.consoleMessage("debug", "modifyServiceFile done");
            self.klipperViewModel.showPopUp("success", gettext("Modify Servicefile"), gettext("Servicefile modified."));
            showMessageDialog(
              gettext("Copy and run these commands in your linux shell to copy the new servicefile for Klipper.") +
                "<br><b>Warning: This will stop ongoing prints!</b>" +
                "<br><br>" +
                "    sudo cp -T -v " +
                response.data.path +
                " /etc/default/klipper<br>    sudo systemctl restart klipper<br><br>",
              {
                title: gettext("Manually action needed"),
              }
            );
          } else if (response.error) {
            self.klipperViewModel.consoleMessage("error", "modifyServiceFile failed: " + response.error.message);
            self.klipperViewModel.showPopUp("error", gettext("Modify Servicefile"), response.error.message);
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "modifyServiceFile failed: " + response.responseText);
          self.klipperViewModel.showPopUp("error", gettext("Modify Servicefile"), response.responseText);
        });
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
    };

    self.addMacro = function () {
      self.settings.settings.plugins.klipper.macros.push({
        name: ko.observable("Macro"),
        macro: ko.observable(""),
        sidebar: true,
        tab: true,
        buttonColor: ko.observable(""),
        buttonStyle: ko.observable(""),
      });
    };

    self.buttonColor = function (macro) {
      var cssStyle = "";
      if (macro.buttonColor() != "") {
        cssStyle = `background-color: ${macro.buttonColor()}; background-image: unset !important; text-shadow: none !important;`;
      }
      return cssStyle;
    };

    self.dummyButtonClick = function () {
      return;
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

    // Start LogFilters
    self.showLogfiltersDialog = function () {
      var dialog = $("#klipper_logfilters_dialog");
      dialog.modal({
        show: "true",
        //width: "70%",
      });
    };

    $(document).on("hidden.bs.modal", "#klipper_logfilters_dialog", function () {
      self.klipperViewModel.showPopUp("info", gettext("Changes"), gettext("Don't forget to save your changes!"));
    });

    self.hideLogfiltersDialog = function () {
      var dialog = $("#klipper_logfilters_dialog");
      dialog.modal("hide");
    };

    self.addLogFilter = function () {
      self.settings.settings.plugins.klipper.log.logFilters.push({
        name: "New",
        regex: "()",
      });
    };

    self.removeLogFilter = function (filter) {
      self.settings.settings.plugins.klipper.log.logFilters.remove(filter);
    };
    // End LogFilters

    self.updateMacroList = function () {
      self.macros(self.settings.settings.plugins.klipper.macros());
    };

    self.onUserSettingsBeforeSave = function () {
      self.saveMacroList();
    };

    self.saveMacroList = function () {
      self.settings.settings.plugins.klipper.macros(self.macros());
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperSettingsViewModel,
    dependencies: [
      "settingsViewModel",
      "klipperViewModel",
      "klipperEditorViewModel",
      "klipperBackupViewModel",
      "accessViewModel",
    ],
    elements: ["#settings_plugin_klipper"],
  });
});
