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

    self.shortStatus_navbar = ko.observable();
    self.shortStatus_navbar_hover = ko.observable();
    self.shortStatus_sidebar = ko.observable();
    self.shortStatus_type = ko.observable('');
    self.logMessages = ko.observableArray();

    self.popup = undefined;

    self._showPopup = function (options) {
      self._closePopup();
      self.popup = new PNotify(options);
    };

    self._updatePopup = function (options) {
      if (self.popup === undefined) {
        self._showPopup(options);
      } else {
        self.popup.update(options);
      }
    };

    self._closePopup = function () {
      if (self.popup !== undefined) {
        self.popup.remove();
      }
    };

    self.showPopUp = function (popupType="info", popupTitle, message) {
      popupTitle ? popupTitle + "<br />" : popupTitle="";

      let title = "OctoKlipper: <br />" + popupTitle;
      var options = {
        title: title,
        text: message,
        type: popupType,
        hide: true,
        icon: true
      };

      if (popupType == "error") {
        let errorOpts = {
          mouse_reset: true,
          delay: 5000,
          animation: "none"
        };
        FullOptions = Object.assign(options, errorOpts);
        self._showPopup(FullOptions);
      } else {
        new PNotify(options);
      }
    };

    self.showEditorDialog = function () {
      if (!self.hasRight("CONFIG")) return;
      var editorDialog = $("#klipper_editor");
      editorDialog.modal({
        show: "true",
        width: "90%",
        backdrop: "static",
      });
    }

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

      if (!self.hasRight("MACRO")) return;

      if (macro.macro().match(paramObjRegex) == null) {
        OctoPrint.control.sendGcode(
          // Use .split to create an array of strings which is sent to
          // OctoPrint.control.sendGcode instead of a single string.
          macro.macro().split(/\r\n|\r|\n/)
        );
      } else {
        self.paramMacroViewModel.process(macro);

        var dialog = $("#klipper_macro_dialog");
        dialog.modal({
          show: "true",
          backdrop: "static",
        });
      }
    };

    self.navbarClicked = function () {
      $("#tab_plugin_klipper_main_link").find("a").click();
      self.clearShortStatus();
    };

    self.onGetStatus = function () {
      OctoPrint.control.sendGcode("Status");
    };

    self.onRestartFirmware = function () {
      OctoPrint.control.sendGcode("FIRMWARE_RESTART");
    };

    self.onRestartHost = function () {
      OctoPrint.control.sendGcode("RESTART");
    };

    self.onAfterBinding = function () {
      self.connectionState.selectedPort(
        self.settings.settings.plugins.klipper.connection.port()
      );
      self.shortStatus(gettext("No Messages"), "");
    };

    self.onDataUpdaterPluginMessage = function (plugin, data) {

      if (plugin == "klipper") {
        switch (data.type) {
          case "PopUp":
            self.showPopUp(data.subtype, data.title, data.payload);
            break;
          case "reload":
            break;
          case "console":
            self.consoleMessage(data.subtype, data.payload);
            break;
          case "status":
            self.shortStatus(data.payload, data.subtype);
            break;
          default:
            self.logMessage(data.time, data.subtype, data.payload);
            self.shortStatus(data.payload, data.subtype)
            self.consoleMessage(data.subtype, data.payload);
        }
      }
    };


    self.shortStatus = function(msg, type=null) {

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

    }


    self.logMessage = function (timestamp, type = "info", message) {

      if (!timestamp) {
        let today = new Date();
        timestamp =
          today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
      }

      if (type == "error" && self.settings.settings.plugins.klipper.configuration.hide_error_popups() !== true) {
        self.showPopUp(type, "Error:", message);
      }

      self.logMessages.push({
        time: timestamp,
        type: type,
        msg: message.replace(/\n/gi, "<br />"),
      });
    };

    self.consoleMessage = function (type, message) {
      if (
        self.settings.settings.plugins.klipper.configuration.debug_logging() === true
      ) {
        if (type == "info") {
          console.info('%cOctoKlipper : %c%s', 'background: black; color: green;', '', message);
        } else if (type == "debug") {
          console.debug('%cOctoKlipper : %c%s', 'background: black; color: green;', '', message);
        } else {
          console.error('%cOctoKlipper : %c%s', 'background: black; color: green;', '', message);
        }
      }
      return;
    };

    self.onClearLog = function () {
      self.logMessages.removeAll();
      self.clearShortStatus();
    };

    self.isActive = function () {
      return self.connectionState.isOperational();
    };

    self.hasRight = function (role) {
      return self.loginState.hasPermission(self.access.permissions[`PLUGIN_KLIPPER_${role}`]);
    };

    self.hasRightKo = function (role) {
      return self.loginState.hasPermissionKo(self.access.permissions[`PLUGIN_KLIPPER_${role}`]);
    };

    self.saveOption = function(dir, option, value) {
      if (! (_.includes(["fontsize", "confirm_reload", "parse_check"], option)) ) {
        return;
      }

      if (option && dir) {
        let data = {
          plugins: {
            klipper:{
              [dir]: {
                [option]: value
              }
            }
          }
        };
        OctoPrint.settings
          .save(data);
      } else if (option) {
        let data = {
              plugins: {
                klipper:{
                    [option]: value
                }
              }
          };
        OctoPrint.settings
          .save(data);
      }
    }

    self.requestRestart = function () {
      if (!self.loginState.hasPermission(self.access.permissions.PLUGIN_KLIPPER_CONFIG)) return;

      var request = function (index) {
        OctoPrint.plugins.klipper.restartKlipper().done(function (response) {
          self.consoleMessage("debug", "restartingKlipper");
          self.showPopUp("success", gettext("Restarted Klipper"), "command: " + response.command);
        });
        if (index == 1) {
          self.saveOption("configuration", "confirm_reload", false);
        }
      };

      var html = "<h4>" +
                  gettext("All ongoing Prints will be stopped!") +
                  "</h4>";

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

    // OctoKlipper settings link
    self.openOctoKlipperSettings = function (profile_type) {
      if (!self.hasRight("CONFIG")) return;

      $("a#navbar_show_settings").click();
      $("li#settings_plugin_klipper_link a").click();
      if (profile_type) {
        var query = "#klipper-settings a[data-profile-type='" + profile_type + "']";
        $(query).click();
      }
    };

    // trigger tooltip a first time to "enable"
    $("#klipper-copyToClipboard").tooltip('hide');
    var clipboard = navigator.clipboard;

    // check if clipboard is available and hide icon if not
    if (clipboard == undefined) {
      $("#klipper-copyToClipboard").hide();
    }

    $("#klipper-copyToClipboard").click(function(event) {
      const ele = $(this);
      const Text = $(this).prev();
      const icon = document.getElementById("klipper-copyToClipboard");

      /* Copy the text inside the text field */
      clipboard.writeText(Text[0].value).then(function () {
        ele.attr('data-original-title', gettext("Copied"));
        ele.tooltip('show');
        icon.classList.add("klipper-animate");

        self.sleep(300).then(function () {
          icon.classList.remove("klipper-animate");
          $("#klipper-copyToClipboard").attr('data-original-title', gettext("Copy to Clipboard"));
        });
      }, function (err) {
        $("#klipper-copyToClipboard").attr('data-original-title', gettext("Error:") + err);
        $("#klipper-copyToClipboard").tooltip('show');

        self.sleep(300).then(function () {
          $("#copyToClipboard").attr('data-original-title', gettext("Copy to Clipboard"));
        });
      });
    });

    self.sleep = function (ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
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
    ],
    elements: [
      "#tab_plugin_klipper_main",
      "#sidebar_plugin_klipper",
      "#navbar_plugin_klipper",
    ],
  });
});
