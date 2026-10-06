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

    self.PathToConfigs = ko.observable("");
    self.serverOS = ko.observable("");
    self.macros = ko.observableArray([]);
    self.servicefilePassword = ko.observable("");
    self.servicefilePasswordDialog = undefined;

    // -- Macro group management ---------------------------------------------

    // Read a list setting defensively (settings may not be loaded yet).
    self._groupOrder = function (key) {
      var setting = self.settings.settings.plugins.klipper.configuration[key];
      return setting && typeof setting === "function" ? setting() : [];
    };

    // Editable group lists (each item is { name: ko.observable() }). These
    // mirror the macro_group_order / parsed_macro_group_order settings so the
    // names can be edited inline like the macro names. They are synced back to
    // the settings on save.
    self.macroGroups = ko.observableArray([]);
    self.parsedMacroGroups = ko.observableArray([]);

    self._syncGroupsFromSettings = function () {
      self.macroGroups(
        _.map(self._groupOrder("macro_group_order"), function (name) {
          return { name: ko.observable(name) };
        }),
      );
      self.parsedMacroGroups(
        _.map(self._groupOrder("parsed_macro_group_order"), function (name) {
          return { name: ko.observable(name) };
        }),
      );
    };

    self._syncGroupsToSettings = function () {
      var order = self.settings.settings.plugins.klipper.configuration.macro_group_order;
      var names = [];
      _.each(self.macroGroups(), function (g) {
        var n = String(g.name() || "").trim();
        if (n && names.indexOf(n) === -1) names.push(n);
      });
      order(names);
      var porder = self.settings.settings.plugins.klipper.configuration.parsed_macro_group_order;
      var pnames = [];
      _.each(self.parsedMacroGroups(), function (g) {
        var n = String(g.name() || "").trim();
        if (n && pnames.indexOf(n) === -1) pnames.push(n);
      });
      porder(pnames);
    };

    // Available options for the user-macro Group dropdown: "" (no group) + the
    // configured groups + any legacy groups still used by macros.
    self.macroGroupOptions = ko.pureComputed(function () {
      var options = [""].concat(
        _.map(self.macroGroups(), function (g) {
          return g.name();
        }),
      );
      _.each(self.settings.settings.plugins.klipper.macros(), function (m) {
        var g = m.group ? (typeof m.group === "function" ? m.group() : m.group) : "";
        if (g && options.indexOf(g) === -1) options.push(g);
      });
      return options;
    });

    // Available options for the parsed-macro Group dropdown.
    self.parsedMacroGroupOptions = ko.pureComputed(function () {
      var options = [""].concat(
        _.map(self.parsedMacroGroups(), function (g) {
          return g.name();
        }),
      );
      _.each(self.klipperViewModel.klipperMacros(), function (m) {
        var g = m.group();
        if (g && options.indexOf(g) === -1) options.push(g);
      });
      return options;
    });

    // Add a new group with a unique default name (like the "Add Macro"
    // button). The name is editable inline.
    self.addGroup = function () {
      var base = gettext("Group");
      var names = _.map(self.macroGroups(), function (g) {
        return g.name();
      });
      var name = base;
      var i = 2;
      while (names.indexOf(name) !== -1) {
        name = base + " " + i;
        i++;
      }
      self.macroGroups.push({ name: ko.observable(name) });
    };

    self.removeGroup = function (group) {
      self.macroGroups.remove(group);
    };

    self.moveGroupUp = function (group) {
      self.moveItemUp(self.macroGroups, group);
    };

    self.moveGroupDown = function (group) {
      self.moveItemDown(self.macroGroups, group);
    };

    self.addParsedGroup = function () {
      var base = gettext("Group");
      var names = _.map(self.parsedMacroGroups(), function (g) {
        return g.name();
      });
      var name = base;
      var i = 2;
      while (names.indexOf(name) !== -1) {
        name = base + " " + i;
        i++;
      }
      self.parsedMacroGroups.push({ name: ko.observable(name) });
    };

    self.removeParsedGroup = function (group) {
      self.parsedMacroGroups.remove(group);
    };

    self.moveParsedGroupUp = function (group) {
      self.moveItemUp(self.parsedMacroGroups, group);
    };

    self.moveParsedGroupDown = function (group) {
      self.moveItemDown(self.parsedMacroGroups, group);
    };

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
      self._syncGroupsFromSettings();
      self.servicefilePasswordDialog = $("#klipper_servicefile_password_dialog");
      // Show a hint for the currently configured log path without a click
      self.checkLogPath();
      // Same for the config directory and base config file (reuses the log
      // path check pattern)
      self.checkConfigPath();
      self.checkBaseConfig();
      // Load the parsed printer.cfg macros so the "Klipper Macros" settings
      // tab can show/configure them.
      self.klipperViewModel.loadKlipperMacros();
    };

    // Re-parse the macros from the config files (used by the "Refresh" button
    // on the "Klipper Macros" settings tab).
    self.refreshParsedMacros = function () {
      self.klipperViewModel.loadKlipperMacros();
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
              "getServerInfo response: " + _.escape(response.error.message),
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
      self._modifyServicefile("");
    };

    self._modifyServicefile = function (password) {
      OctoPrint.plugins.klipper
        .modifyServicefile(self.configPath(), password)
        .done(function (response) {
          if (response.status == "password_required") {
            self.servicefilePassword("");
            self.servicefilePasswordDialog.modal("show");
          } else if (response.data) {
            self.klipperViewModel.consoleMessage("debug", "modifyServiceFile done");
            self.klipperViewModel.showPopUp("success", gettext("Modify Servicefile"), gettext("Servicefile modified."));
            // The new servicefile needs a restart to take effect
            self.klipperViewModel.requestRestart();
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

    self.modifyServicefileWithPassword = function () {
      var password = self.servicefilePassword();
      self.servicefilePassword("");
      self.servicefilePasswordDialog.modal("hide");
      self.klipperViewModel.confirmPasswordTransmission().done(function (ok) {
        if (ok) {
          self._modifyServicefile(password);
        }
      });
    };

    self.backupAllConfigs = function () {
      self.klipperViewModel.consoleMessage("debug", "backupAllConfigs");
      OctoPrint.plugins.klipper
        .backupAllConfigs()
        .done(function (response) {
          if (response.status == "success") {
            var copied = response.data.copied.length;
            self.klipperViewModel.showPopUp(
              "success",
              gettext("Backup all configs"),
              _.sprintf(gettext("%(copied)d configs copied."), { copied: copied }),
            );
          } else {
            self.klipperViewModel.showPopUp("error", gettext("Backup all configs"), response.error.message);
          }
        })
        .fail(function (response) {
          self.klipperViewModel.showPopUp("error", gettext("Backup all configs"), response.responseText);
        });
    };

    self.logPathResolved = ko.observable("");
    self.logPathExists = ko.observable(false);
    self.logPathChecking = ko.observable(false);

    // Ask the backend to resolve the path currently in the "Klipper Log File"
    // field and report whether klippy.log exists there. This updates the hint
    // live (no page reload needed) and uses the entered value, not just the
    // saved one.
    self.checkLogPath = function () {
      var logPath = self.settings.settings.plugins.klipper.configuration.logpath();
      self.logPathChecking(true);
      self.klipperViewModel
        .checkKlippyLogPath(logPath)
        .done(function (response) {
          self.logPathResolved(response["path"] || "");
          self.logPathExists(response["exists"] === true);
        })
        .fail(function () {
          self.logPathResolved(logPath);
          self.logPathExists(false);
        })
        .always(function () {
          self.logPathChecking(false);
        });
    };

    // Same pattern for the "Klipper Config Directory" field: resolve the value
    // currently in the field and report whether the directory exists.
    self.configPathResolved = ko.observable("");
    self.configPathExists = ko.observable(false);
    self.configPathChecking = ko.observable(false);
    self.checkConfigPath = function () {
      var configPath = self.configPath();
      self.configPathChecking(true);
      self.klipperViewModel
        .checkKlipperConfigPath(configPath)
        .done(function (response) {
          self.configPathResolved(response["path"] || "");
          self.configPathExists(response["exists"] === true);
        })
        .fail(function () {
          self.configPathResolved(configPath);
          self.configPathExists(false);
        })
        .always(function () {
          self.configPathChecking(false);
        });
    };

    // Same pattern for the "Klipper Base Config Filename" field: resolve the
    // value currently in the field and report whether the file exists.
    self.baseConfigResolved = ko.observable("");
    self.baseConfigExists = ko.observable(false);
    self.baseConfigChecking = ko.observable(false);
    self.checkBaseConfig = function () {
      var baseconfig = self.settings.settings.plugins.klipper.configuration.baseconfig();
      self.baseConfigChecking(true);
      self.klipperViewModel
        .checkKlipperBaseConfig(baseconfig)
        .done(function (response) {
          self.baseConfigResolved(response["path"] || "");
          self.baseConfigExists(response["exists"] === true);
        })
        .fail(function () {
          self.baseConfigResolved(baseconfig);
          self.baseConfigExists(false);
        })
        .always(function () {
          self.baseConfigChecking(false);
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
        sidebar: ko.observable(true),
        tab: ko.observable(true),
        buttonColor: ko.observable(""),
        buttonStyle: ko.observable(""),
        group: ko.observable(""),
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

    // Reorder the parsed macros (from printer.cfg) in the settings table. The
    // order is persisted via each macro's `order` field so it survives a
    // re-parse and a settings save.
    self.moveParsedMacroUp = function (macro) {
      self.moveItemUp(self.klipperViewModel.klipperMacros, macro);
      self._renumberParsedMacroOrder();
    };

    self.moveParsedMacroDown = function (macro) {
      self.moveItemDown(self.klipperViewModel.klipperMacros, macro);
      self._renumberParsedMacroOrder();
    };

    self._renumberParsedMacroOrder = function () {
      _.each(self.klipperViewModel.klipperMacros(), function (m, idx) {
        m.order = idx;
      });
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
      var macros = self.settings.settings.plugins.klipper.macros();
      // Older saved settings may be missing fields that were added in later
      // plugin versions (e.g. `group`). Normalize each macro so the settings
      // template can bind to every field without throwing a ReferenceError.
      _.each(macros, function (m) {
        if (m.name === undefined) m.name = ko.observable("");
        if (m.macro === undefined) m.macro = ko.observable("");
        if (m.sidebar === undefined) m.sidebar = ko.observable(true);
        if (m.tab === undefined) m.tab = ko.observable(true);
        if (m.buttonColor === undefined) m.buttonColor = ko.observable("");
        if (m.buttonStyle === undefined) m.buttonStyle = ko.observable("");
        if (m.group === undefined) m.group = ko.observable("");
      });
      self.macros(macros);
    };

    self.onSettingsBeforeSave = function () {
      self._syncGroupsToSettings();
      self.saveMacroList();
      self.saveParsedMacros();
    };

    self.saveMacroList = function () {
      self.settings.settings.plugins.klipper.macros(self.macros());
    };

    // Persist the per-macro display preferences (group / tab / sidebar) for
    // the macros parsed out of printer.cfg. Stored as a dict keyed by the
    // macro name so the settings survive a page reload.
    self.saveParsedMacros = function () {
      var parsedMacrosSetting = self.settings.settings.plugins.klipper.parsedMacros;
      var macros = self.klipperViewModel.klipperMacros();
      // If the parsed macros haven't loaded yet, don't touch the setting —
      // otherwise we'd wipe any previously saved preferences.
      if (!macros || !macros.length) return;
      var prefs = {};
      _.each(macros, function (m, idx) {
        // Key by UPPERCASE name so prefs survive case changes in printer.cfg
        // (Klipper macro names are case-insensitive).
        prefs[m.name.toUpperCase()] = {
          group: m.group(),
          sidebar: m.sidebar(),
          tab: m.tab(),
          buttonStyle: m.buttonStyle(),
          buttonColor: m.buttonColor(),
          // Persist the display order so reordering survives a re-parse.
          order: m.order !== undefined ? m.order : idx,
        };
      });
      // Keep the settings tree in sync so the normal settings save also
      // carries the dict (if the setting is available).
      if (parsedMacrosSetting && typeof parsedMacrosSetting === "function") {
        parsedMacrosSetting(prefs);
      }
      // Persist directly through the backend route — reliable even when the
      // frontend settings save drops the dict.
      OctoPrint.plugins.klipper.saveParsedMacros(prefs);
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
