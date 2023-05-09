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

    self.header = OctoPrint.getRequestHeaders({
      "content-type": "application/json",
      "cache-control": "no-cache",
    });

    self.apiUrl = OctoPrint.getSimpleApiUrl("klipper");
    self.Url = OctoPrint.getBlueprintUrl("klipper");

    self.settings = parameters[0];
    self.loginState = parameters[1];
    self.connectionState = parameters[2];
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

    self.log = ko.observableArray([]);
    self.plainLogLines = ko.observableArray([]);

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
      popupTitle ? popupTitle + "<br />" : (popupTitle = "");

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
        FullOptions = Object.assign(options, errorOpts);
        self._showPopUp(FullOptions);
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
          self.settings.settings.plugins.klipper.configuration.restart_host_command()
      );

      $("#klipper-restart-firmware").attr(
        "title",
        gettext("Similar to a host restart, but also clears any error state from the micro-controller") +
          "\n" +
          gettext("You can set this command in the settings.") +
          "\n" +
          gettext("Actual command: ") +
          self.settings.settings.plugins.klipper.configuration.restart_firmware_command()
      );

      $("#klipper-restart-service").attr(
        "title",
        gettext("This will cause the host klipper service to immediately stop and restart!") +
          "\n" +
          gettext("You can set this command in the settings.") +
          "\n" +
          gettext("Actual command: ") +
          self.settings.settings.plugins.klipper.configuration.restart_service_system_command()
      );
    };

    self.checkForKlipperUpdate = function () {
      self.logMessage(null, null, "<b>" + gettext("Checking for Update...") + "</b>");
      OctoPrint.plugins.klipper
        .checkKlipperUpdate()
        .done(function (response) {
          if (response.status == "success") {
            self.host_version(response.data.klipper_version);
            self.host_remote_version(response.data.latest_klipper_remote_tag);
            self.logMessage(null, null, `<b>${gettext("Installed Klipper Host Version:")}</b> ${self.host_version()}`);
            self.logMessage(
              null,
              null,
              `<b>${gettext("Available Klipper Version:")}</b> ${self.host_remote_version()}`
            );
          } else {
            self.showPopUp("error", "Error", response.error.message);
            self.logMessage(null, "error", "<b>" + gettext("Error:") + "</b> " + _.escape(response.error.message));
          }
        })
        .fail(function (response) {
          self.showPopUp("error", "Error", response.responseText);
          self.logMessage(null, "error", "<b>" + gettext("Error:") + "</b> " + _.escape(response.responseText));
        });
    };

    self.checkOctoKlipperUpdate = function () {
      OctoPrint.plugins.softwareupdate
        .check({ entries: ["klipper"], force: false })
        .done(self.fromUpdaterCheck)
        .fail(function (response) {
          self.showPopUp("error", "Error", response.responseText);
        });
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

    self.showGraphDialog = function () {
      var dialog = $("#klipper_graph_dialog");
      dialog.modal({
        show: "true",
        width: "90%",
        minHeight: "500px",
        maxHeight: "600px",
      });
    };

    self.executeMacro = function (macro) {
      var paramObjRegex = /{(.*?)}/g;

      if (!self.hasPerm("MACRO")) return;

      if (macro.macro().match(paramObjRegex) == null) {
        let expanded = macro.macro().split(/\r\n|\r|\n/);
        self.logMessage(null, null, gettext("Execute Macro: ") + macro.name());

        OctoPrint.control.sendGcode(
          // Use .split to create an array of strings which is sent to
          // OctoPrint.control.sendGcode instead of a single string.
          expanded
        );
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

    self.onAfterBinding = function () {
      self.connectionState.selectedPort(self.settings.settings.plugins.klipper.connection.port());
      self.shortStatus(gettext("No Messages"), "");
      self.updateButtonTitles();
      self._fromLocalStorage();
      self.fancyFunctionality(self.settings.settings.plugins.klipper.log.fancy_functionality());
      self.checkForKlipperUpdate();
      self.checkOctoKlipperUpdate();
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
      if (!_.includes(["fontsize", "confirm_reload", "parse_check", "logFilters"], option)) {
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
            "Your system is currently throttled. OctoPrint refuses to run updates while in this state due to possible stability issues."
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
        }
      );
    });

    self.sleep = function (ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    };

    self.onAfterTabChange = function (current, previous) {
      self.tabActive = current === "#tab_plugin_klipper_main";
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
    elements: ["#tab_plugin_klipper_main", "#sidebar_plugin_klipper", "#navbar_plugin_klipper"],
  });
});
