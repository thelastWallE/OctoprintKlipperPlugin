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
  function KlipperViewModel(parameters) {
    var self = this;
    var testLog = undefined;

    self.settings = parameters[0];
    self.loginState = parameters[1];
    self.connectionState = parameters[2];

    // The connection view model's API changed between OctoPrint 1.11 and 2.0:
    // 1.11 exposes printerOptions/selectedPrinter/selectedPort/selectedBaudrate,
    // 2.0 uses profileOptions/currentProfile and a connector-based parameter
    // model. These helpers abstract the difference so the plugin's connection
    // panel works on both versions.
    self.connectionPrinterOptions = ko.pureComputed(function () {
      var cs = self.connectionState;
      if (cs.profileOptions) return cs.profileOptions();
      if (cs.printerOptions) return cs.printerOptions();
      return [];
    });

    self.connectionSelectedPrinter = ko.pureComputed({
      read: function () {
        var cs = self.connectionState;
        if (cs.currentProfile) return cs.currentProfile();
        if (cs.selectedPrinter) return cs.selectedPrinter();
        return undefined;
      },
      write: function (value) {
        var cs = self.connectionState;
        if (cs.currentProfile) cs.currentProfile(value);
        else if (cs.selectedPrinter) cs.selectedPrinter(value);
      },
    });

    // Connect/disconnect using the plugin's configured port. OctoPrint 1.11's
    // stock connect reads selectedPort/selectedBaudrate observables; 2.0's
    // reads the port from the connection form's DOM inputs, which don't exist
    // because this plugin replaces the connection panel — so send the port
    // directly as a connector parameter.
    self.connect = function () {
      var cs = self.connectionState;
      if (cs.isErrorOrClosed()) {
        if (cs.selectedPort) {
          // OctoPrint 1.11: the stock connect uses selectedPort/selectedBaudrate
          cs.connect();
        } else {
          // OctoPrint 2.0: connector-based connect; send the configured port
          var connector = cs.selectedConnector();
          if (!connector) {
            cs.connect();
            return;
          }
          OctoPrint.connection
            .connect({
              connector: connector,
              parameters: { port: self.settings.settings.plugins.klipper.connection.port() },
              printerProfile: cs.currentProfile(),
              autoconnect: false,
            })
            .done(function () {
              cs.settings.requestData();
              cs.settings.printerProfiles.requestData();
            });
        }
      } else {
        cs.connect();
      }
    };

    self.levelingViewModel = parameters[3];
    self.paramMacroViewModel = parameters[4];
    self.access = parameters[5];
    self.printerState = parameters[6];
    // optional
    self.piSupport = parameters[7];

    self.storageLocation = "klipper_configs";

    self.shortStatus_navbar = ko.observable();
    self.shortStatus_navbar_hover = ko.observable();
    self.shortStatus_sidebar = ko.observable();
    self.shortStatus_type = ko.observable("");
    self.currentCfgFilename = ko.observable("");

    self.octoklipperReleasedVersion = ko.observable();
    self.octoklipperReleasedVersionForOctoprint = ko.observable();
    self.octoklipperInstalledVersion = ko.observable();

    self.host_version = ko.observable();
    self.host_remote_version = ko.observable();
    self.host_remote_version_date = ko.observable();
    self.klipperInstalled = ko.observable(true);
    self.checkingUpdate = ko.observable(false);
    self.checkingOctoKlipperUpdate = ko.observable(false);

    self.installWorking = ko.observable(false);
    self.installTitle = ko.observable();
    self.installLoglines = ko.observableArray([]);
    self.installPassword = ko.observable("");
    self.installDialog = undefined;
    self.installOutput = undefined;

    self.log = ko.observableArray([]);
    self.plainLogLines = ko.observableArray([]);

    // Live tail of /tmp/klippy.log (the Klipper log file), rendered in a
    // dedicated tab on the main plugin tab.
    self.klippyLogLines = ko.observableArray([]);
    self.klippyLogEnabled = ko.observable(true);
    self.klippyLogError = ko.observable("");
    self.klippyLogPath = ko.observable("");
    self.klippyLogExists = ko.observable(false);
    self.klippyLogPollInterval = 2000; // ms
    self._klippyLogPollTimer = undefined;

    self.filterRegex = ko.observable();

    self.activeFilters = ko.observableArray([]);
    self.activeFilters.subscribe(function (e) {
      self.updateFilterRegex();
    });

    self.fancyFunctionality = ko.observable(true);
    self.fancyFunctionality.subscribe(function (e) {
      self.settings.settings.plugins.klipper.log.fancy_functionality(self.fancyFunctionality());
    });

    self.plainLogOutput = ko.pureComputed(function () {
      if (self.fancyFunctionality()) {
        return;
      }
      return self.plainLogLines().join("\n");
    });

    self.updateFilterRegex = function () {
      var filterRegexStr = self.activeFilters().join("|").trim();
      if (filterRegexStr === "") {
        self.filterRegex(undefined);
      } else {
        self.filterRegex(new RegExp(filterRegexStr));
      }
      self.updateOutput();
    };

    self.tabActive = false;
    self.previousScroll = undefined;
    self.autoscrollEnabled = ko.observable(true);

    self.throttled = ko.pureComputed(function () {
      return (
        self.piSupport &&
        self.piSupport.currentIssue() &&
        !self.settings.settings.plugins.klipper.configuration.ignore_throttled()
      );
    });

    self.saveAutoscroll = function () {
      saveToLocalStorage("plugin.OctoKlipper.logmessages.autoscroll", self.autoscrollEnabled());
    };

    self.loadAutoscroll = function () {
      var autoscroll = loadFromLocalStorage("plugin.OctoKlipper.logmessages.autoscroll");
      if (autoscroll != undefined || autoscroll != null) {
        self.autoscrollEnabled(autoscroll);
      }
    };

    self._fromLocalStorage = function () {
      self.loadAutoscroll();
    };

    self.autoscrollEnabled.subscribe(function () {
      self.saveAutoscroll();
    });

    self.popup = {};

    self._showPopUp = function (id = "Standard", options) {
      self._closePopUp(id);
      self.popup[id] = new PNotify(options);
    };

    self._updatePopUp = function (id = "Standard", options) {
      if (!Object.hasOwn(self.popup, id)) {
        self._showPopUp(id, options);
      } else {
        self.popup[id].update(options);
      }
    };

    self._closePopUp = function (id = "Standard") {
      if (Object.hasOwn(self.popup, id)) {
        delete self.popup[id];
      }
    };

    self.showPopUp = function (popupType = "info", popupTitle, message, hide = true) {
      popupTitle = popupTitle ? popupTitle + "<br />" : "";

      let title = "OctoKlipper: <br />" + popupTitle;
      var options = {
        title: title,
        text: message,
        type: popupType,
        hide: hide,
        icon: true,
      };

      if (popupType == "error") {
        let errorOpts = {
          mouse_reset: true,
          delay: 5000,
          animation: "none",
        };
        let FullOptions = Object.assign(options, errorOpts);
        self._showPopUp("Standard", FullOptions);
      } else {
        new PNotify(options);
      }
    };

    self.updateButtonTitles = function () {
      $("#klipper-restart-host").attr(
        "title",
        gettext("This will cause the host software to reload its config and perform an internal reset") +
          "\n" +
          gettext("You can set this command in the settings.") +
          "\n" +
          gettext("Actual command: ") +
          self.settings.settings.plugins.klipper.configuration.restart_host_command(),
      );

      $("#klipper-restart-firmware").attr(
        "title",
        gettext("Similar to a host restart, but also clears any error state from the micro-controller") +
          "\n" +
          gettext("You can set this command in the settings.") +
          "\n" +
          gettext("Actual command: ") +
          self.settings.settings.plugins.klipper.configuration.restart_firmware_command(),
      );

      $("#klipper-restart-service").attr(
        "title",
        gettext("This will cause the host klipper service to immediately stop and restart!") +
          "\n" +
          gettext("You can set this command in the settings.") +
          "\n" +
          gettext("Actual command: ") +
          self.settings.settings.plugins.klipper.configuration.restart_service_system_command(),
      );
    };

    self.checkForKlipperUpdate = function () {
      if (self.checkingUpdate()) return;
      if (self.printerState.isPrinting()) {
        self._showPopUp("Check Update", {
          title: gettext("Can't check for updates while printing"),
          text: gettext(
            "A print job is currently in progress. Checking for updates will be prevented until it is done.",
          ),
          type: "error",
        });
        return;
      }
      self.checkingUpdate(true);
      // use the current value from the input field, no need to save first
      var remote = self.settings.settings.plugins.klipper.configuration.remote_host_git();
      self.logMessage(null, null, "<b>" + gettext("Checking for Update...") + "</b>");
      OctoPrint.plugins.klipper
        .checkKlipperUpdate(remote)
        .done(function (response) {
          // Always update the installed state so the install button shows correctly
          if (response.data && response.data.klipper_installed !== undefined) {
            self.klipperInstalled(response.data.klipper_installed);
          }
          if (response.status == "success") {
            self.host_version(response.data.klipper_version);
            self.host_remote_version(response.data.latest_klipper_remote_tag);
            self.host_remote_version_date(response.data.latest_klipper_remote_tag_date);
            self.logMessage(null, null, `<b>${gettext("Installed Klipper Host Version:")}</b> ${self.host_version()}`);
            self.logMessage(
              null,
              null,
              `<b>${gettext("Available Klipper Version:")}</b> ${self.host_remote_version()}`,
            );
          } else {
            // logMessage with type "error" already shows a popup, so we don't
            // call showPopUp here as well (would duplicate the message)
            self.logMessage(null, "error", "<b>" + gettext("Error:") + "</b> " + _.escape(response.error.message));
          }
        })
        .fail(function (response) {
          self.logMessage(null, "error", "<b>" + gettext("Error:") + "</b> " + _.escape(response.responseText));
        })
        .always(function () {
          self.checkingUpdate(false);
        });
    };

    self.checkOctoKlipperUpdate = function () {
      if (self.printerState.isPrinting()) {
        self._showPopUp("Check Update", {
          title: gettext("Can't check for updates while printing"),
          text: gettext(
            "A print job is currently in progress. Checking for updates will be prevented until it is done.",
          ),
          type: "error",
        });
        return;
      }
      self.checkingOctoKlipperUpdate(true);
      self.logMessage(null, null, "<b>" + gettext("Checking for OctoKlipper Update...") + "</b>");
      OctoPrint.plugins.softwareupdate
        .check({ entries: ["klipper"], force: false })
        .done(self.fromUpdaterCheck)
        .fail(function (response) {
          self.showPopUp("error", "Error", response.responseText);
        });
      self.checkingOctoKlipperUpdate(false);
      self.logMessage(null, null, "<b>" + gettext("OctoKlipper Update Check Finished") + "</b>");
    };

    self.fromUpdaterCheck = function (response) {
      const octoklipper = response.information["klipper"];
      self.octoklipperInstalledVersion(!octoklipper || octoklipper.displayVersion);
      self.octoklipperReleasedVersionForOctoprint(!octoklipper || octoklipper.information.remote.value);

      const releasedVersionNotesLink = octoklipper.information.remote.release_notes || "";

      const installedMessage = `<b>
        ${gettext("Installed OctoKlipper Version:")}
        </b> ${self.octoklipperInstalledVersion()}`;

      const availableMessage = `<b>
        ${gettext("Available OctoKlipper Version:")}
        </b> ${self.octoklipperReleasedVersionForOctoprint()}
        <br><a href="${releasedVersionNotesLink}" target="_blank">
        ${gettext("Release Notes")}</a>`;

      self.logMessage(null, null, installedMessage);
      self.logMessage(null, null, availableMessage);
    };

    self.reloadData = function () {
      self.fancyFunctionality(self.settings.settings.plugins.klipper.log.fancy_functionality());
    };

    /* self.onStartup = function () {
      self.checkForKlipperUpdate();
      self.checkOctoKlipperUpdate();
    }; */

    self.onSettingsHidden = function () {
      self.reloadData();
    };

    self.showEditorDialog = function () {
      if (!self.hasPerm("CONFIG")) return;
      var editorDialog = $("#klipper_editor");
      editorDialog.modal({
        show: "true",
        width: "90%",
        backdrop: "static",
      });
    };

    self.showLevelingDialog = function () {
      var dialog = $("#klipper_leveling_dialog");
      dialog.modal({
        show: "true",
        backdrop: "static",
        keyboard: false,
      });
      self.levelingViewModel.initView();
    };

    self.showPidTuningDialog = function () {
      var dialog = $("#klipper_pid_tuning_dialog");
      dialog.modal({
        show: "true",
        backdrop: "static",
        keyboard: false,
      });
    };

    self.showOffsetDialog = function () {
      var dialog = $("#klipper_offset_dialog");
      dialog.modal({
        show: "true",
        backdrop: "static",
      });
    };

    self.showSaveVariablesDialog = function () {
      var dialog = $("#klipper_save_variables_dialog");
      dialog.modal({
        show: "true",
        backdrop: "static",
      });
    };

    self.showGraphDialog = function () {
      var dialog = $("#klipper_graph_dialog");
      dialog.modal({
        show: "true",
        width: "90%",
        minHeight: "500px",
        maxHeight: "600px",
      });
    };

    // Send a macro's gcode to the printer. When the printer is not connected,
    // sending would fail silently, so instead log the commands and show a hint
    // — this lets the macro feature be tested without a connected printer.
    self._sendGcode = function (gcodeLines, macroName) {
      self.logMessage(null, null, gettext("Execute Macro: ") + macroName);
      if (!self.connectionState.isOperational()) {
        _.each(gcodeLines, function (line) {
          self.logMessage(null, null, line);
        });
        self.showPopUp(
          "warning",
          gettext("Printer not connected"),
          gettext("The printer is not connected, so the macro was not sent. The commands were logged below."),
        );
        return;
      }
      OctoPrint.control.sendGcode(gcodeLines);
    };

    self.executeMacro = function (macro) {
      var paramObjRegex = /{(.*?)}/g;

      if (!self.hasPerm("MACRO")) return;

      if (macro.macro().match(paramObjRegex) == null) {
        // Use .split to create an array of strings which is sent to
        // OctoPrint.control.sendGcode instead of a single string.
        self._sendGcode(macro.macro().split(/\r\n|\r|\n/), macro.name());
      } else {
        self.paramMacroViewModel.process(macro, self);

        var dialog = $("#klipper_macro_dialog");
        dialog.modal({
          show: "true",
          backdrop: "static",
        });
      }
    };

    self.buttonColor = function (macro) {
      var cssStyle = "";
      if (macro.buttonColor() != "") {
        cssStyle = `background-color: ${macro.buttonColor()}; background-image: unset !important; text-shadow: none !important;`;
      }
      return cssStyle;
    };

    // -- Macros parsed out of printer.cfg (and its [include]d files) --------

    self.klipperMacros = ko.observableArray([]);
    self.klipperMacrosLoaded = ko.observable(false);

    // Preview of a macro's gcode body: first few lines, with "..." when there
    // are more. Used for the tooltips on the settings tab, sidebar and main
    // tab.
    self._gcodePreview = function (gcode) {
      if (!gcode) return "";
      var lines = gcode.split(/\r\n|\r|\n/);
      var preview = lines.slice(0, 3).join("\n");
      if (lines.length > 3) preview += "\n...";
      return preview;
    };

    // Display name for a macro's source file: a path relative to the config
    // directory when the file lives there (so two files with the same
    // basename in different subfolders stay distinguishable), otherwise just
    // the basename.
    self._sourceDisplayName = function (source) {
      if (!source) return "";
      var configPath = "";
      try {
        configPath = self.settings.settings.plugins.klipper.configuration.config_path();
      } catch (e) {
        configPath = "";
      }
      if (configPath) {
        var normSource = source.replace(/\\/g, "/");
        var normConfig = configPath.replace(/\\/g, "/").replace(/\/+$/, "");
        if (normSource.indexOf(normConfig + "/") === 0) {
          return normSource.slice(normConfig.length + 1);
        }
      }
      return source.split(/[\\/]/).pop();
    };

    // Tooltip for a parsed macro button: the macro's description when set,
    // otherwise a preview of its gcode body.
    self.macroTooltip = function (macro) {
      if (macro && macro.description) return macro.description;
      return macro ? macro.gcodePreview : "";
    };

    self.loadKlipperMacros = function () {
      OctoPrint.plugins.klipper
        .getKlipperMacros()
        .done(function (response) {
          var raw = response.macros || [];
          var merged;
          try {
            // Merge the user's per-macro preferences (group / tab / sidebar)
            // into each parsed macro.
            //
            // The prefs come from the getKlipperMacros API response (the
            // backend reads them straight from the plugin settings). They are
            // NOT read from the frontend settings tree: ko.mapping flattens
            // nested dict values to empty objects, so the tree cannot be
            // trusted for this dict-of-dicts. Each pref value is a plain
            // object {group, sidebar, tab}.
            var prefs = response.parsedMacros || {};
            var prefValue = function (pref, key, defaultValue) {
              if (!pref) return defaultValue;
              var v = pref[key];
              return typeof v === "function" ? v() : v !== undefined ? v : defaultValue;
            };
            // Klipper macro names are case-insensitive, so index both the
            // currently displayed macros and the saved prefs by UPPERCASE name
            // to keep prefs matching across case changes (e.g. "start_print"
            // vs "START_PRINT").
            var current = {};
            _.each(self.klipperMacros(), function (m) {
              current[m.name.toUpperCase()] = m;
            });
            var prefIndex = {};
            _.each(prefs, function (value, key) {
              prefIndex[key.toUpperCase()] = value;
            });
            merged = _.map(raw, function (m) {
              var cur = current[m.name.toUpperCase()];
              var pref = prefIndex[m.name.toUpperCase()];
              return {
                name: m.name,
                gcode: m.gcode,
                description: m.description || "",
                has_params: m.has_params,
                klipper_params: m.klipper_params || [],
                source: m.source,
                // Display info for the settings tab: the file the macro was
                // parsed from (relative to the config dir when possible) and a
                // preview of its gcode.
                sourceName: self._sourceDisplayName(m.source),
                gcodePreview: self._gcodePreview(m.gcode),
                // Display order: keep the current position when the macro is
                // already shown, otherwise the persisted order from prefs.
                order: cur ? cur.order : prefValue(pref, "order", undefined),
                group: ko.observable(cur ? cur.group() : prefValue(pref, "group", "")),
                sidebar: ko.observable(cur ? cur.sidebar() : prefValue(pref, "sidebar", false)),
                tab: ko.observable(cur ? cur.tab() : prefValue(pref, "tab", true)),
                buttonStyle: ko.observable(cur ? cur.buttonStyle() : prefValue(pref, "buttonStyle", "")),
                buttonColor: ko.observable(cur ? cur.buttonColor() : prefValue(pref, "buttonColor", "")),
              };
            });
            // Apply the persisted/current display order (macros without an
            // order keep their parse order).
            merged.sort(function (a, b) {
              var oa = a.order,
                ob = b.order;
              if (oa === undefined && ob === undefined) return 0;
              if (oa === undefined) return 1;
              if (ob === undefined) return -1;
              return oa - ob;
            });
          } catch (e) {
            // If merging the preferences fails for any reason, fall back to
            // the raw macros so parsing still works.
            self.logMessage(null, "error", gettext("Error:") + " " + _.escape(String((e && e.message) || e)));
            merged = _.map(raw, function (m) {
              return {
                name: m.name,
                gcode: m.gcode,
                description: m.description || "",
                has_params: m.has_params,
                klipper_params: m.klipper_params || [],
                source: m.source,
                sourceName: self._sourceDisplayName(m.source),
                gcodePreview: self._gcodePreview(m.gcode),
                order: undefined,
                group: ko.observable(""),
                sidebar: ko.observable(false),
                tab: ko.observable(true),
                buttonStyle: ko.observable(""),
                buttonColor: ko.observable(""),
              };
            });
          }
          self.klipperMacros(merged);
          self.klipperMacrosLoaded(true);
        })
        .fail(function (response) {
          self.klipperMacros([]);
          self.klipperMacrosLoaded(true);
          self.logMessage(null, "error", gettext("Error:") + " " + _.escape(response.responseText));
        });
    };

    self.executeKlipperMacro = function (macro) {
      if (!self.hasPerm("MACRO")) return;

      if (!macro.has_params) {
        self._sendGcode(macro.gcode.split(/\r\n|\r|\n/), macro.name);
      } else {
        self.paramMacroViewModel.processKlipperMacro(macro, self);
        var dialog = $("#klipper_macro_dialog");
        dialog.modal({
          show: "true",
          backdrop: "static",
        });
      }
    };

    // Order groups by the configured group-order list; groups not listed
    // follow alphabetically. When the list is empty, fall back to alphabetical
    // order. The "" group (no header) always sorts first.
    self._orderGroups = function (groups, orderList) {
      var order = orderList || [];
      var byName = {};
      _.each(groups, function (g) {
        byName[g.name] = g;
      });
      var ordered = [];
      _.each(order, function (name) {
        if (byName[name]) {
          ordered.push(byName[name]);
          delete byName[name];
        }
      });
      var rest = _.sortBy(_.values(byName), function (g) {
        return g.name.toLowerCase();
      });
      return ordered.concat(rest);
    };

    // Group the parsed Klipper macros by their (optional) group. Macros
    // without a group go into the "" group which is rendered without a
    // collapsible header.
    self.klipperMacroGroups = ko.pureComputed(function () {
      var groups = {};
      _.each(self.klipperMacros(), function (macro) {
        var groupName = macro.group();
        if (!groups[groupName]) {
          groups[groupName] = { name: groupName, macros: [] };
        }
        groups[groupName].macros.push(macro);
      });
      var orderSetting = self.settings.settings.plugins.klipper.configuration.parsed_macro_group_order;
      var order = orderSetting && typeof orderSetting === "function" ? orderSetting() : [];
      return self._orderGroups(_.values(groups), order);
    });

    // Sidebar-specific grouping of the parsed macros: only macros with
    // sidebar: true are included, and groups with no sidebar-visible macros
    // are omitted. Ordered by the configured group order.
    self.klipperMacroGroupsSidebar = ko.pureComputed(function () {
      var groups = {};
      _.each(self.klipperMacros(), function (macro) {
        if (!macro.sidebar()) return;
        var groupName = macro.group();
        if (!groups[groupName]) {
          groups[groupName] = { name: groupName, macros: [] };
        }
        groups[groupName].macros.push(macro);
      });
      var orderSetting = self.settings.settings.plugins.klipper.configuration.parsed_macro_group_order;
      var order = orderSetting && typeof orderSetting === "function" ? orderSetting() : [];
      return self._orderGroups(_.values(groups), order);
    });

    // Persist/restore the per-location group collapse state in localStorage so
    // it survives a page reload. Wrapped in try/catch because localStorage may
    // be unavailable (e.g. sandboxed iframes / private browsing).
    self._loadCollapsedState = function (key) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    };

    self._saveCollapsedState = function (key, state) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch (e) {
        // ignore — collapse state just won't persist
      }
    };

    // Collapse state for parsed-macro groups, tracked per location
    // ("tab" / "sidebar") like the user-defined macro groups. Persisted to
    // localStorage so it survives a page reload.
    self.klipperMacroGroupsCollapsed = ko.observable(self._loadCollapsedState("klipper.klipperMacroGroupsCollapsed"));

    self.toggleKlipperMacroGroup = function (name, location) {
      var collapsed = _.clone(self.klipperMacroGroupsCollapsed());
      var loc = _.clone(collapsed[location] || {});
      loc[name] = !loc[name];
      collapsed[location] = loc;
      self.klipperMacroGroupsCollapsed(collapsed);
      self._saveCollapsedState("klipper.klipperMacroGroupsCollapsed", collapsed);
    };

    self.klipperMacroGroupCollapsed = function (name, location) {
      var collapsed = self.klipperMacroGroupsCollapsed();
      return !!(collapsed[location] && collapsed[location][name]);
    };

    // -- Collapsible macro groups (#93) -------------------------------------

    // Collapse state is tracked per location ("tab" / "sidebar") so a user
    // can, e.g., expand a group on the sidebar while it stays collapsed on
    // the main tab. Shape: { location: { groupName: bool } }. Persisted to
    // localStorage so it survives a page reload.
    self.macroGroupsCollapsed = ko.observable(self._loadCollapsedState("klipper.macroGroupsCollapsed"));

    self.toggleMacroGroup = function (name, location) {
      // Clone so the observable gets a new reference and notifies subscribers
      // (Knockout compares observable values by reference).
      var collapsed = _.clone(self.macroGroupsCollapsed());
      var loc = _.clone(collapsed[location] || {});
      loc[name] = !loc[name];
      collapsed[location] = loc;
      self.macroGroupsCollapsed(collapsed);
      self._saveCollapsedState("klipper.macroGroupsCollapsed", collapsed);
    };

    self.macroGroupCollapsed = function (name, location) {
      var collapsed = self.macroGroupsCollapsed();
      return !!(collapsed[location] && collapsed[location][name]);
    };

    // Group the user-defined macros by their (optional) group name. Macros
    // without a group go into the "" group which is rendered without a
    // collapsible header.
    self.macroGroups = ko.pureComputed(function () {
      var groups = {};
      _.each(self.settings.settings.plugins.klipper.macros(), function (macro) {
        var groupName = "";
        if (macro.group) {
          groupName = typeof macro.group === "function" ? macro.group() : macro.group;
        }
        if (!groups[groupName]) {
          groups[groupName] = { name: groupName, macros: [] };
        }
        groups[groupName].macros.push(macro);
      });
      var orderSetting = self.settings.settings.plugins.klipper.configuration.macro_group_order;
      var order = orderSetting && typeof orderSetting === "function" ? orderSetting() : [];
      return self._orderGroups(_.values(groups), order);
    });

    // Sidebar-specific grouping of the user-defined macros: only macros with
    // sidebar: true are included, and groups with no sidebar-visible macros
    // are omitted. Ordered by the configured group order.
    self.macroGroupsSidebar = ko.pureComputed(function () {
      var groups = {};
      _.each(self.settings.settings.plugins.klipper.macros(), function (macro) {
        var show = macro.sidebar ? (typeof macro.sidebar === "function" ? macro.sidebar() : macro.sidebar) : false;
        if (!show) return;
        var groupName = "";
        if (macro.group) {
          groupName = typeof macro.group === "function" ? macro.group() : macro.group;
        }
        if (!groups[groupName]) {
          groups[groupName] = { name: groupName, macros: [] };
        }
        groups[groupName].macros.push(macro);
      });
      var orderSetting = self.settings.settings.plugins.klipper.configuration.macro_group_order;
      var order = orderSetting && typeof orderSetting === "function" ? orderSetting() : [];
      return self._orderGroups(_.values(groups), order);
    });

    self.navbarClicked = function () {
      $("#tab_plugin_klipper_main_link").find("a").click();
      self.clearShortStatus();
    };

    self.onGetStatus = function () {
      OctoPrint.control.sendGcode("Status");
    };

    self.onRestartFirmware = function () {
      self.requestRestart("FIRMWARE");
    };

    self.onRestartHost = function () {
      self.requestRestart("HOST");
    };

    self.onRestartKlipperService = function () {
      self.requestRestart("SYSTEMCOMMAND");
    };

    self.onStartup = function () {
      self.installDialog = $("#klipper_install_dialog");
      self.installOutput = $("#klipper_install_dialog_output");
    };

    self._markInstallWorking = function (title, line) {
      self.installWorking(true);
      self.installTitle(title);
      self.installLoglines.removeAll();
      self.installLoglines.push({ line: line, stream: "message" });
      self._scrollInstallOutputToEnd();
      self.installDialog.modal({ keyboard: false, backdrop: "static", show: true });
    };

    self._markInstallDone = function (error) {
      self.installWorking(false);
      if (error) {
        self.installLoglines.push({ line: gettext("Error!"), stream: "error" });
        self.installLoglines.push({ line: error, stream: "error" });
      } else {
        self.installLoglines.push({ line: gettext("Done!"), stream: "message" });
      }
      self._scrollInstallOutputToEnd();
    };

    self._scrollInstallOutputToEnd = function () {
      if (self.installOutput && self.installOutput.length) {
        self.installOutput.scrollTop(self.installOutput[0].scrollHeight - self.installOutput.height());
      }
    };

    self.onAfterBinding = function () {
      // OctoPrint 1.11 exposes a selectedPort observable on the connection view
      // model; 2.0 uses a connector-based model where the port is sent as a
      // connector parameter on connect (handled in self.connect). Only set the
      // observable when it exists.
      if (self.connectionState.selectedPort) {
        self.connectionState.selectedPort(self.settings.settings.plugins.klipper.connection.port());
      }
      self.shortStatus(gettext("No Messages"), "");
      self.updateButtonTitles();
      self._fromLocalStorage();
      self.fancyFunctionality(self.settings.settings.plugins.klipper.log.fancy_functionality());
      self.checkForKlipperUpdate();
      self.checkOctoKlipperUpdate();
      self._loadSettingsDefaults();
      self.loadKlipperMacros();
      self._applyMacrosSidebarVisibility();
      self._applyParsedMacrosSidebarVisibility();
      // Apply the sidebar visibility immediately when the setting changes.
      // (Set up here, not in the constructor, because the settings data is
      // only available after binding.)
      if (!self._macrosSidebarVisibilitySubscribed) {
        self._macrosSidebarVisibilitySubscribed = true;
        self.settings.settings.plugins.klipper.configuration.show_macros_sidebar.subscribe(function () {
          self._applyMacrosSidebarVisibility();
        });
      }
      if (!self._parsedMacrosSidebarVisibilitySubscribed) {
        self._parsedMacrosSidebarVisibilitySubscribed = true;
        self.settings.settings.plugins.klipper.configuration.show_parsed_macros_sidebar.subscribe(function () {
          self._applyParsedMacrosSidebarVisibility();
        });
      }
      // Start the live klippy.log tail. Only poll while the tab is active;
      // onAfterTabChange stops it when the user leaves the tab.
      if (self.klippyLogEnabled()) {
        self._startKlippyLogPolling();
      }
    };

    // Show/hide the dedicated "Macros" sidebar panel based on the
    // "Show Macros on the sidebar" setting. The wrapper div is outside the
    // plugin's binding context, so we toggle it directly via jQuery.
    self._applyMacrosSidebarVisibility = function () {
      var wrapper = $("#sidebar_plugin_klipper_macros_wrapper");
      if (!wrapper.length) return;
      if (self.settings.settings.plugins.klipper.configuration.show_macros_sidebar()) {
        wrapper.show();
      } else {
        wrapper.hide();
      }
    };

    // Show/hide the dedicated "Klipper Macros" sidebar panel based on the
    // "Show Klipper Macros panel on the sidebar" setting. Its content is
    // additionally gated on "Parse macros from printer.cfg" in the template.
    self._applyParsedMacrosSidebarVisibility = function () {
      var wrapper = $("#sidebar_plugin_klipper_parsed_macros_wrapper");
      if (!wrapper.length) return;
      if (self.settings.settings.plugins.klipper.configuration.show_parsed_macros_sidebar()) {
        wrapper.show();
      } else {
        wrapper.hide();
      }
    };

    self.onStartupComplete = function () {
      self._applyConnectionPanelCollapse();
      self._applyMacrosSidebarCollapse();
      self._applyParsedMacrosSidebarCollapse();
      self._applyMacrosSidebarVisibility();
      self._applyParsedMacrosSidebarVisibility();
    };

    self._applyConnectionPanelCollapse = function () {
      if (!self.settings.settings.plugins.klipper.connection.collapsed()) return;
      var connectionTab = $("#sidebar_plugin_klipper");
      if (connectionTab.length && connectionTab.hasClass("in")) {
        connectionTab.collapse("hide");
        connectionTab.closest(".accordion-group").find(".accordion-toggle").addClass("collapsed");
      }
    };

    // Collapse the dedicated "Macros" sidebar panel on page load when the
    // "Collapse Macros panel by default" option is enabled. Mirrors the
    // connection panel collapse.
    self._applyMacrosSidebarCollapse = function () {
      if (!self.settings.settings.plugins.klipper.configuration.macros_sidebar_collapsed()) return;
      var macrosTab = $("#sidebar_plugin_klipper_macros");
      if (macrosTab.length && macrosTab.hasClass("in")) {
        macrosTab.collapse("hide");
        macrosTab.closest(".accordion-group").find(".accordion-toggle").addClass("collapsed");
      }
    };

    // Collapse the dedicated "Klipper Macros" sidebar panel on page load when
    // the "Collapse Klipper Macros panel by default" option is enabled.
    self._applyParsedMacrosSidebarCollapse = function () {
      if (!self.settings.settings.plugins.klipper.configuration.parsed_macros_sidebar_collapsed()) return;
      var macrosTab = $("#sidebar_plugin_klipper_parsed_macros");
      if (macrosTab.length && macrosTab.hasClass("in")) {
        macrosTab.collapse("hide");
        macrosTab.closest(".accordion-group").find(".accordion-toggle").addClass("collapsed");
      }
    };

    self.onDataUpdaterPluginMessage = function (plugin, data) {
      if (plugin == "klipper") {
        hide = data.autohide || true;
        switch (data.type) {
          case "PopUp":
            self.showPopUp(data.subtype, data.title, data.payload, hide);
            break;
          case "reload":
            break;
          case "console":
            self.consoleMessage(data.subtype, data.payload);
            break;
          case "status":
            self.shortStatus(data.payload, data.subtype);
            break;
          case "debug":
            self.consoleMessage(data.subtype, data.payload);
            self.logMessage(data.time, data.subtype, data.payload);
            break;
          case "loglines":
            if (self.installWorking()) {
              _.each(data.loglines, function (line) {
                self.installLoglines.push(line);
                // also write the install output into the OctoKlipper log
                self.logMessage(null, "info", gettext("Install: ") + line.line);
              });
              self._scrollInstallOutputToEnd();
            }
            break;
          case "result":
            if (data.result) {
              self._markInstallDone();
              self.logMessage(null, null, gettext("Klipper installed successfully."));
            } else {
              self._markInstallDone(data.reason);
              self.logMessage(null, "error", gettext("Klipper install failed: ") + data.reason);
            }
            self.checkForKlipperUpdate();
            break;
          default:
            self.logMessage(data.time, data.subtype, data.payload);
            self.shortStatus(data.payload, data.subtype);
            self.consoleMessage(data.subtype, data.payload);
        }
      }
    };

    self.shortStatus = function (msg, type = null) {
      if (msg.length > 36) {
        self.shortStatus_navbar(msg.substring(0, 31) + " [..]");
        self.shortStatus_navbar_hover(msg);
      } else {
        self.shortStatus_navbar(msg);
        self.shortStatus_navbar_hover(gettext("Go to OctoKlipper Tab"));
      }
      message = msg.replace(/\n/gi, "<br />");
      self.shortStatus_sidebar(message);
      self.shortStatus_type(type);
    };

    self.clearShortStatus = function () {
      setTimeout(function () {
        self.shortStatus(gettext("No Messages"), "");
      }, 1000);
    };

    self.testLog = function () {
      if (!testLog) {
        testLog = setInterval(function () {
          self.logMessage(null, "debug", "Test Log Message " + new Date().getTime());
        }, 1000);
      } else {
        clearInterval(testLog);
        testLog = null;
      }
    };

    // -- Live Klippy.log tail (tail -f equivalent) -----------------------

    self.refreshKlippyLog = function () {
      var settings = {
        crossDomain: true,
        url: OctoPrint.getSimpleApiUrl("klipper"),
        method: "POST",
        headers: OctoPrint.getRequestHeaders("POST"),
        contentType: "application/json; charset=UTF-8",
        processData: false,
        dataType: "json",
        data: JSON.stringify({
          command: "getKlipperLogTail",
          numLines: self.klippyLogNumLines(),
        }),
      };

      $.ajax(settings)
        .done(function (response) {
          self.klippyLogError("");
          self.klippyLogPath(response["path"]);
          self.klippyLogExists(response["exists"] === true);
          self.klippyLogLines(response["lines"] || []);
        })
        .fail(function (xhr) {
          var message = gettext("Could not read klippy.log");
          if (xhr && xhr.status) {
            message += " (" + xhr.status + ")";
          }
          self.klippyLogError(message);
        });
    };

    // POST a command to the plugin's simple API and return a deferred
    // promise.
    self._simpleApiCommand = function (command, data) {
      var deferred = $.Deferred();
      var settings = {
        crossDomain: true,
        url: OctoPrint.getSimpleApiUrl("klipper"),
        method: "POST",
        headers: OctoPrint.getRequestHeaders("POST"),
        contentType: "application/json; charset=UTF-8",
        processData: false,
        dataType: "json",
        data: JSON.stringify($.extend({ command: command }, data || {})),
      };

      $.ajax(settings)
        .done(function (response) {
          deferred.resolve(response);
        })
        .fail(function (xhr) {
          deferred.reject(xhr);
        });
      return deferred.promise();
    };

    // Check a given log directory on the server and report the resolved
    // klippy.log path + whether it exists. Used by the settings "Check"
    // button so the hint updates with the value currently in the field
    // (not just the saved value at page load).
    self.checkKlippyLogPath = function (logPath) {
      return self._simpleApiCommand("checkKlipperLogPath", { logPath: logPath || "" });
    };

    // Check a given config directory on the server and report the resolved
    // absolute path + whether it exists (mirrors the klippy log path check).
    self.checkKlipperConfigPath = function (configPath) {
      return self._simpleApiCommand("checkKlipperConfigPath", { configPath: configPath || "" });
    };

    // Check a given base config file on the server and report the resolved
    // absolute path + whether it exists (mirrors the klippy log path check).
    self.checkKlipperBaseConfig = function (baseconfig) {
      return self._simpleApiCommand("checkKlipperBaseConfig", { baseconfig: baseconfig || "" });
    };

    self._startKlippyLogPolling = function () {
      self._stopKlippyLogPolling();
      self.refreshKlippyLog();
      self._klippyLogPollTimer = setInterval(self.refreshKlippyLog, self.klippyLogPollInterval);
    };

    self._stopKlippyLogPolling = function () {
      if (self._klippyLogPollTimer) {
        clearInterval(self._klippyLogPollTimer);
        self._klippyLogPollTimer = undefined;
      }
    };

    self.klippyLogToggleText = ko.pureComputed(function () {
      return self.klippyLogEnabled() ? gettext("Pause") : gettext("Start");
    });

    self.toggleKlippyLog = function () {
      self.klippyLogEnabled(!self.klippyLogEnabled());
      if (self.klippyLogEnabled()) {
        self._startKlippyLogPolling();
      } else {
        self._stopKlippyLogPolling();
      }
    };

    self.klippyLogAutoscroll = ko.observable(true);
    self.klippyLogNumLines = ko.observable(20);
    self.klippyLogAutoscroll.subscribe(function (enabled) {
      if (enabled) {
        self.klippyLogScrollToEnd();
      }
    });
    self.klippyLogLines.subscribe(function (lines) {
      if (self.klippyLogAutoscroll() && lines && lines.length) {
        self.klippyLogScrollToEnd();
      }
    });
    self.klippyLogScrollToEnd = function () {
      _.defer(function () {
        var container = $("#klippy-log");
        if (container.length) {
          container.scrollTop(container[0].scrollHeight);
        }
      });
    };
    self.klippyLogScrolledToEnd = function (data, event) {
      var container = $("#klippy-log");
      var pos = container.scrollTop() + container.innerHeight();
      if (pos >= container[0].scrollHeight - 10) {
        self.klippyLogAutoscroll(true);
      } else {
        self.klippyLogAutoscroll(false);
      }
    };

    self.klippyLogDisplayed = ko.pureComputed(function () {
      var lines = self.klippyLogLines();
      var result = [];
      for (var i = 0; i < lines.length; i++) {
        result.push({ msg: lines[i].replace(/\n/gi, "<br />") });
      }
      return result;
    });

    self.logMessage = function (timestamp, type = "info", message) {
      if (!timestamp) {
        let today = new Date();
        timestamp =
          ("0" + today.getHours()).slice(-2) +
          ":" +
          ("0" + today.getMinutes()).slice(-2) +
          ":" +
          ("0" + today.getSeconds()).slice(-2);
      }

      if (type == "error" && self.settings.settings.plugins.klipper.configuration.hide_error_popups() !== true) {
        self.showPopUp(type, "Error: ", message);
      }

      self.plainLogLines.push(timestamp + " " + type + ": " + message);
      if (self.plainLogLines().length > 200) {
        self.plainLogLines.shift();
      }

      self.log.push({
        time: timestamp,
        type: type,
        msg: message.replace(/\n/gi, "<br />"),
      });
      if (self.log().length > 200) {
        self.log.shift();
      }

      self.updateOutput();
    };

    /* self.autoscrollEnabled.subscribe(function (newValue) {
      if (newValue) {
        self.log(self.log.slice(-self.buffer()));
      }
    }); */
    self.copyLog = function () {
      var lines = [];

      if (self.fancyFunctionality()) {
        for (var i = 0; i < self.log().length; i++) {
          lines.push(self.log()[i].time + " " + self.log()[i].type + ": " + self.log()[i].msg.replace("<br />", "\n"));
        }
      } else {
        lines = self.plainLogLines();
      }

      copyToClipboard(lines.join("\n"));
    };

    self.scrollToEnd = function () {
      var container = $("#octoklipper-log");
      if (container.length) {
        container.scrollTop(container[0].scrollHeight);
      }
    };

    self.updateOutput = function () {
      if (self.tabActive && OctoPrint.coreui.browserTabVisible && self.autoscrollEnabled()) {
        self.scrollToEnd();
      }
    };

    self.toggleAutoscroll = function () {
      self.autoscrollEnabled(!self.autoscrollEnabled());

      if (self.autoscrollEnabled()) {
        self.updateOutput();
      }
    };

    self.displayedLines = ko.pureComputed(function () {
      if (!self.fancyFunctionality()) {
        return self.log();
      }

      var regex = self.filterRegex();
      var lineVisible = function (entry) {
        return regex === undefined || !entry.msg.match(regex);
      };

      var filtered = false;
      var result = [];
      var lines = self.log();
      _.each(lines, function (entry) {
        if (lineVisible(entry)) {
          result.push(entry);
          filtered = false;
        } else if (!filtered) {
          result.push({
            time: "",
            type: "info",
            msg: "[...]",
          });
          filtered = true;
        }
      });

      return result;
    });

    self.lineCount = ko.pureComputed(function () {
      if (!self.fancyFunctionality()) {
        return;
      }

      var regex = self.filterRegex();
      var lineVisible = function (entry) {
        return regex === undefined || !entry.msg.match(regex);
      };

      var lines = self.log();
      var total = lines.length;
      var displayed = _.filter(lines, lineVisible).length;
      var filtered = total - displayed;

      if (filtered > 0) {
        return _.sprintf(gettext("showing %(displayed)d lines (%(filtered)d of %(total)d total lines filtered)"), {
          displayed: displayed,
          total: total,
          filtered: filtered,
        });
      } else {
        return _.sprintf(gettext("showing %(displayed)d lines"), {
          displayed: displayed,
        });
      }
    });

    self.logScrollEvent = _.throttle(function () {
      var container = $("#octoklipper-log");
      var pos = container.scrollTop();
      var scrollingUp = self.previousScroll !== undefined && pos < self.previousScroll;

      if (self.autoscrollEnabled() && scrollingUp) {
        var maxScroll = container[0].scrollHeight - container[0].offsetHeight;

        if (pos <= maxScroll) {
          self.autoscrollEnabled(false);
        }
      }

      self.previousScroll = pos;
    }, 250);

    self.consoleMessage = function (type, message) {
      const logTypes = {
        info: console.info,
        debug: console.debug,
        error: console.error,
      };

      logTypes[type]("%cOctoKlipper : %c%s", "background: black; color: green;", "", message);

      return;
    };

    self.onClearLog = function () {
      self.log.removeAll();
      self.clearShortStatus();
      self.updateOutput();
    };

    self.isActive = function () {
      return self.connectionState.isOperational();
    };

    self.hasPerm = function (role) {
      return self.loginState.hasPermission(self.access.permissions[`PLUGIN_KLIPPER_${role}`]);
    };

    self.hasAllPerms = function (roles) {
      var result = true;
      for (var role in roles) {
        result = result && self.loginState.hasPermission(self.access.permissions[`PLUGIN_KLIPPER_${role}`]);
      }
      return result;
    };

    self.hasPermKo = function (role) {
      return self.loginState.hasPermissionKo(self.access.permissions[`PLUGIN_KLIPPER_${role}`]);
    };

    self.saveOption = function (dir, option, value) {
      if (!_.includes(["fontsize", "confirm_reload", "parse_check", "restart_onsave", "logFilters"], option)) {
        return;
      }

      if (option && dir) {
        let data = {
          plugins: {
            klipper: {
              [dir]: {
                [option]: value,
              },
            },
          },
        };
        OctoPrint.settings.save(data);
      } else if (option) {
        let data = {
          plugins: {
            klipper: {
              [option]: value,
            },
          },
        };
        OctoPrint.settings.save(data);
      }
    };

    self.resetAllSettings = function () {
      if (!self.hasPerm("CONFIG")) return;
      OctoPrint.plugins.klipper
        .resetSettings()
        .done(function () {
          self.settings.requestData();
          self.checkForKlipperUpdate();
          self.showPopUp(
            "success",
            gettext("Settings reset"),
            gettext("All OctoKlipper settings have been reset to their defaults."),
          );
        })
        .fail(function (response) {
          self.showPopUp("error", gettext("Reset failed"), response.responseText);
        });
    };

    self.pluginDefaults = ko.observable();

    self.resetSetting = function (section, key) {
      var defaults = self.pluginDefaults();
      if (!defaults || !defaults[section] || !(key in defaults[section])) return;
      self.settings.settings.plugins.klipper[section][key](defaults[section][key]);
    };

    self._loadSettingsDefaults = function () {
      OctoPrint.plugins.klipper
        .settingsDefaults()
        .done(function (data) {
          self.pluginDefaults(data);
        })
        .fail(function () {
          // ignore, reset buttons just won't work until defaults are loaded
        });
    };

    self.requestRestart = function (restartType = self.settings.settings.plugins.klipper.configuration.reload_used()) {
      if (!self.hasPerm("CONFIG")) return;
      // if (restartType == None) {
      //   restartType = self.settings.settings.plugins.klipper.configuration.reload_used();
      // }
      var request = function (index) {
        if (restartType == "SYSTEMCOMMAND") {
          OctoPrint.plugins.klipper
            .restartKlipper()
            .done(function (response) {
              self.consoleMessage("debug", "restartingKlipper: " + response.status);
              if (response.status == "success") {
                self.showPopUp("success", gettext("Restarted Klipper"), "command: " + response.data.command);
                self.checkForKlipperUpdate();
              } else {
                self.showPopUp("error", gettext("Restarting Klipper failed"), response.error.message);
              }
            })
            .fail(function (response) {
              self.consoleMessage("debug", "restartingKlipper");
              self.showPopUp("error", gettext("Restarting Klipper failed"), response.responseText);
            });
        } else if (restartType == "HOST") {
          OctoPrint.control.sendGcode(self.settings.settings.plugins.klipper.configuration.restart_host_command());
        } else if (restartType == "FIRMWARE") {
          OctoPrint.control.sendGcode(self.settings.settings.plugins.klipper.configuration.restart_firmware_command());
        }
        if (index == 1) {
          self.saveOption("configuration", "confirm_reload", false);
        }
      };

      var html =
        "<h4>" +
        gettext("All ongoing Prints will be stopped!") +
        "</h4><br>" +
        gettext("Command to be used: ") +
        self.settings.settings.plugins.klipper.configuration.restart_service_system_command();

      if (self.settings.settings.plugins.klipper.configuration.confirm_reload() == true) {
        showConfirmationDialog({
          title: gettext("Restart Klipper?"),
          html: html,
          proceed: [gettext("Restart"), gettext("Restart and don't ask this again.")],
          onproceed: function (idx) {
            if (idx > -1) {
              request(idx);
            }
          },
        });
      } else {
        request(0);
      }
    };

    /**
     * Check whether it is safe to transmit the sudo password to the backend.
     *
     * Transmitting over HTTPS or to localhost is fine. On any other (plain
     * HTTP) connection the password would travel unencrypted, so the user is
     * asked to confirm before it is sent.
     *
     * @returns {jQuery.Deferred} Resolves with true when the password may be
     *   sent, false when the user declined.
     */
    self.confirmPasswordTransmission = function () {
      var protocol = window.location.protocol;
      var hostname = window.location.hostname;
      var secure = protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

      if (secure) {
        return $.Deferred().resolve(true).promise();
      }

      var deferred = $.Deferred();
      showConfirmationDialog({
        title: gettext("Unsecured connection"),
        html:
          "<p>" +
          gettext(
            "Your connection to OctoPrint is not encrypted (no HTTPS) and not localhost. The sudo password would be transmitted in plain text.",
          ) +
          "</p>",
        proceed: gettext("Send password anyway"),
        proceedClass: "danger",
        onproceed: function () {
          deferred.resolve(true);
        },
        onclose: function () {
          deferred.resolve(false);
        },
      });
      return deferred.promise();
    };

    /**
     * Show the install dialog. The install itself is started via
     * ``startInstall`` so the user can optionally provide a sudo password.
     */
    self.requestInstall = function () {
      if (!self.hasPerm("CONFIG")) return;

      if (self.printerState.isPrinting()) {
        self._showPopUp("Installer", {
          title: gettext("Can't install while printing"),
          text: gettext("A print job is currently in progress. Installing will be prevented until it is done."),
          type: "error",
        });
        return;
      }

      self.installPassword("");
      self.installLoglines.removeAll();
      self.installTitle(gettext("Install Klipper"));
      self.installWorking(false);
      self.installDialog.modal({ keyboard: false, backdrop: "static", show: true });
    };

    /**
     * Start the Klipper install. Clones the Klipper repository and runs the
     * platform install script. The install runs in the background and streams
     * its output into the install working dialog.
     */
    self.startInstall = function () {
      if (!self.hasPerm("CONFIG")) return;
      if (self._updateClicked) return;
      self._updateClicked = true;

      var password = self.installPassword();
      self.installPassword(""); // clear the password field immediately

      self.confirmPasswordTransmission().done(function (ok) {
        if (!ok) {
          self._updateClicked = false;
          return;
        }

        self._markInstallWorking(
          gettext("Installing Klipper..."),
          gettext("Now installing Klipper, please wait. This can take several minutes."),
        );

        OctoPrint.plugins.klipper
          .installKlipper(password)
          .done(function (response) {
            self._updateClicked = false;
            if (response.status == "error") {
              self._markInstallDone(response.error.message);
            }
            // on success the install runs in the background; log lines and the
            // final result arrive via onDataUpdaterPluginMessage
          })
          .fail(function (response) {
            self._updateClicked = false;
            self._markInstallDone(response.responseText);
          });
      });
    };

    /**
     * Show Confirmation Dialog if enabled and send a request to update klipper.
     * If there are uncommitted changes show a confirmation dialog to ask
     * about stashing the changes and force an update
     */
    self.requestUpdate = function () {
      if (!self.hasPerm("CONFIG")) return;
      if (self._updateClicked) return;
      self._updateClicked = true;

      if (self.printerState.isPrinting()) {
        self._showPopUp("Updater", {
          title: gettext("Can't update while printing"),
          text: gettext("A print job is currently in progress. Updating will be prevented until it is done."),
          type: "error",
        });
        self._updateClicked = false;
        return;
      }

      if (self.throttled()) {
        self._showPopUp("Updater", {
          title: gettext("Can't update while throttled"),
          text: gettext(
            "Your system is currently throttled. OctoPrint refuses to run updates while in this state due to possible stability issues.",
          ),
          type: "error",
        });
        self._updateClicked = false;
        return;
      }

      let request = function () {
        let forced_update = function () {
          OctoPrint.plugins.klipper
            .updateKlipper(true)
            .done(function (response) {
              self.consoleMessage("debug", "forced updatingKlipper:");
              if (response.status == "success") {
                self.consoleMessage("debug", "Response: " + response.data.body);
                self._updatePopUp("Updater", {
                  type: "success",
                  hide: true,
                  title: null,
                  text: "Response: " + response.data.body,
                });
                self.logMessage(null, null, "Update Response: " + response.data.body);
                if (response.data.body != "Already up to date.\n") {
                  self.requestRestart("SYSTEMCOMMAND");
                }
              } else {
                self._updatePopUp("Update", {
                  type: "error",
                  title: null,
                  text: "Response: " + response.error.message,
                });
              }
            })
            .fail(function (response) {
              self._updatePopUp("Updater", {
                type: "error",
                hide: true,
                title: null,
                text: "Response: " + response.responseText,
              });
            });
        };

        self.updateInProgress = true;

        var options = {
          title: gettext("Updating..."),
          text: gettext("Now updating, please wait."),
          icon: "fa fa-cog fa-spin",
          hide: false,
          buttons: {
            closer: false,
            sticker: false,
          },
        };
        self._showPopUp("Updater", options);

        OctoPrint.plugins.klipper
          .updateKlipper()
          .done(function (response) {
            self.consoleMessage("debug", "updatingKlipper:");
            if (response.status == "success") {
              self.consoleMessage("debug", "Response: " + response.data.body);
              self._updatePopUp("Updater", {
                type: "success",
                hide: true,
                title: null,
                text: "Response: " + response.data.body,
              });
              self.logMessage(null, null, "Update Response: " + response.data.body);
              if (response.data.body != "Already up to date.\n") {
                self.requestRestart("SYSTEMCOMMAND");
              }
            } else {
              if (response.error.message == "uncommitted changes") {
                showConfirmationDialog({
                  title: gettext("Klipper Update"),
                  html:
                    "<p>" +
                    gettext("You have uncommitted changes.") +
                    gettext("Would you like to stash them and update?") +
                    "</p>",
                  proceed: [gettext("Stash and Update"), gettext("Cancel")],
                  onproceed: function (idy) {
                    if (idy == 0) {
                      forced_update();
                    }
                  },
                });
              } else {
                self._updatePopUp("Updater", {
                  type: "error",
                  hide: true,
                  title: null,
                  text: "Response: " + response.error.message,
                });
              }
            }
            self._updateClicked = false;
          })
          .fail(function (response) {
            self._updatePopUp("Updater", {
              type: "error",
              hide: true,
              title: null,
              text: "Response: " + response.responseText,
            });
            self._updateClicked = false;
          });
      };

      var html = "<h4>" + gettext("All ongoing Prints will be stopped!") + "</h4>";

      showConfirmationDialog({
        title: gettext("Update Klipper?"),
        html: html,
        proceed: gettext("Update"),
        onproceed: request,
      });
    };

    // OctoKlipper settings link
    self.openOctoKlipperSettings = function (profile_type) {
      if (!self.hasPerm("CONFIG")) return;

      $("a#navbar_show_settings").click();
      $("li#settings_plugin_klipper_link a").click();
      if (profile_type) {
        var query = "#klipper-settings a[data-profile-type='" + profile_type + "']";
        $(query).click();
      }
    };

    // trigger tooltip a first time to "enable"
    $("#klipper-copyToClipboard").tooltip("hide");
    var clipboard = navigator.clipboard;

    if (clipboard == undefined) {
      $("#klipper-copyToClipboard").hide();
    }

    $("#klipper-copyToClipboard").click(function (event) {
      const ele = $(this);
      const Text = $(this).prev();
      const icon = document.getElementById("klipper-copyToClipboard");

      /* Copy the text inside the text field */
      clipboard.writeText(Text[0].value).then(
        function () {
          ele.attr("data-original-title", gettext("Copied"));
          ele.tooltip("show");
          icon.classList.add("klipper-animate");

          self.sleep(300).then(function () {
            icon.classList.remove("klipper-animate");
            $("#klipper-copyToClipboard").attr("data-original-title", gettext("Copy to Clipboard"));
          });
        },
        function (err) {
          $("#klipper-copyToClipboard").attr("data-original-title", gettext("Error:") + err);
          $("#klipper-copyToClipboard").tooltip("show");

          self.sleep(300).then(function () {
            $("#copyToClipboard").attr("data-original-title", gettext("Copy to Clipboard"));
          });
        },
      );
    });

    self.sleep = function (ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    };

    self.onAfterTabChange = function (current, previous) {
      self.tabActive = current === "#tab_plugin_klipper_main";
      if (self.tabActive) {
        if (self.klippyLogEnabled() && !self._klippyLogPollTimer) {
          self._startKlippyLogPolling();
        }
      } else {
        self._stopKlippyLogPolling();
      }
      self.updateOutput();
      $("document").scrollTop(0);
    };

    self.onBrowserTabVisibilityChange = function (status) {
      self.updateOutput();
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperViewModel,
    dependencies: [
      "settingsViewModel",
      "loginStateViewModel",
      "connectionViewModel",
      "klipperLevelingViewModel",
      "klipperMacroDialogViewModel",
      "accessViewModel",
      "printerStateViewModel",
      "piSupportViewModel",
    ],
    optional: ["piSupportViewModel"],
    elements: [
      "#tab_plugin_klipper_main",
      "#sidebar_plugin_klipper",
      "#sidebar_plugin_klipper_macros",
      "#sidebar_plugin_klipper_parsed_macros",
      "#navbar_plugin_klipper",
    ],
  });
});
