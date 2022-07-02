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
  function KlipperEditorViewModel(parameters) {
    var self = this;
    var editor = null;
    var editordialog = $("#klipper_editor");
    var reloadConfigLock = false;
    var minLimitFontSize = 6;
    var maxLimitFontSize = 25;

    self.settings = parameters[0];
    self.klipperViewModel = parameters[1];

    self.CfgFilename = ko.observable("");
    self.CfgContent = ko.observable("");
    self.loadedConfig = "";
    self.CfgChangedExtern = false;

    self.fontSize = ko.observable("");

    var optionsLocalStorageKey = "OctoKlipper.options";

    self._toLocalStorage = function () {
      saveToLocalStorage(optionsLocalStorageKey, { fontSize: self.fontSize() });
    };

    self._fromLocalStorage = function () {
      var data = loadFromLocalStorage(optionsLocalStorageKey);
      if (data["fontSize"] != undefined) {
        self.fontSize(data["fontSize"]);
      } else {
        // get the old setting and save it to the localStorage
        if (ko.isObservable(self.settings.settings.plugins.klipper.configuration.fontsize)) {
          self.fontSize(self.settings.settings.plugins.klipper.configuration.fontsize());
          self._toLocalStorage();
        } else {
          self.fontSize(18);
          self._toLocalStorage();
        }
      }
    };

    self.fontSize.subscribe(function () {
      self.limitFontsize();

      if (editor) {
        editor.setFontSize(self.fontSize());
        editor.resize();
      }

      self._toLocalStorage();
    });

    self.limitFontsize = function () {
      if (self.fontSize() < minLimitFontSize) {
        self.fontSize(minLimitFontSize);
      }

      if (self.fontSize() > maxLimitFontSize) {
        self.fontSize(maxLimitFontSize);
      }
    };

    $(window).on('resize', function () {
      self.klipperViewModel.sleep(200).then(
        function () {
          self.setEditorDivSize();
        }
      );
    });

    self.onShown = function () {
      self.checkExternChange();
      editor.focus();
      self.setEditorDivSize();
    };

    self.close_selection = function (index) {
      switch (index) {
        case 0:
          editordialog.modal('hide');
          break;
        case 1:
          self.editorFocusDelay(1000);
          break;
        case 2:
          self.saveCfg({ closing: true });
          break;
      }
    };

    self.closeEditor = function () {
      self.CfgContent(editor.getValue());
      if (self.loadedConfig != self.CfgContent()) {

        var opts = {
          title: gettext("Closing without saving"),
          message: gettext("Your file seems to have changed.")
            + "<br />"
            + gettext("Do you really want to close it?"),
          selections: [gettext("Close"), gettext("Do not close"), gettext("Save & Close")],
          maycancel: false,
          onselect: function (index) {
            if (index > -1) {
              self.close_selection(index);
            }
          },
        };

        showSelectionDialog(opts);
      } else {
        editordialog.modal('hide');
      }
    };

    self.addStyleAttribute = function ($element, styleAttribute) {
      $element.attr('style', styleAttribute);
    };

    self.setEditorDivSize = function () {
      var klipper_modal_body = $('#klipper_editor .modal-body');
      var klipper_config = $('#plugin-klipper-config');

      var height = $(window).height() - $('#klipper_editor .modal-header').outerHeight() - $('#klipper_editor .modal-footer').outerHeight() - 118;
      self.addStyleAttribute(klipper_modal_body, 'height: ' + height + 'px !important;');
      klipper_config.css('height', height);
      if (editor) {
        editor.resize();
      }
    };

    //initialize the modal window and return done when finished
    self.process = function (config) {
      return new Promise(function (resolve) {
        self.loadedConfig = config.content;
        self.CfgFilename(config.file);
        self.CfgContent(config.content);
        reloadConfigLock = false;
        self._fromLocalStorage();

        if (editor) {
          editor.session.setValue(self.CfgContent());
          self.CfgChangedExtern = false;
          editor.setFontSize(self.fontSize());
          editor.clearSelection();
          self.klipperViewModel.sleep(500).then(
            function () {
              self.setEditorDivSize();
              resolve("done");
            }
          );
        }
      });
    };

    self.onDataUpdaterPluginMessage = function (plugin, data) {
      //receive from backend after a SAVE_CONFIG
      if (plugin == "klipper" && data.type == "reload" && data.subtype == "config") {
        self.klipperViewModel.consoleMessage("debug", "onDataUpdaterPluginMessage klipper reload baseconfig");
        self.ConfigChangedAfterSave_Config();
      }
    };

    //set externally changed config flag if the current file is the base config
    self.ConfigChangedAfterSave_Config = function () {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      if (self.CfgFilename() == self.settings.settings.plugins.klipper.configuration.baseconfig()) {
        self.CfgChangedExtern = true;
        self.checkExternChange();
      }
    };

    //check if the config was externally changed and ask for a reload
    self.checkExternChange = function () {
      var baseconfig = self.settings.settings.plugins.klipper.configuration.baseconfig();
      if (self.CfgChangedExtern && self.CfgFilename() == baseconfig && !reloadConfigLock) {

        if (editordialog.is(":visible")) {
          self.CfgChangedExtern = false;
          reloadConfigLock = true; //prevent another dialog popUp

          var cancel = function () {
            reloadConfigLock = false;
          }

          var perform = function () {
            reloadConfigLock = false;
            self.reloadFromFile();
          }

          var html = "<p>" + gettext("Reload Configfile after SAVE_CONFIG?") + "</p>";

          showConfirmationDialog({
            title: gettext("Externally changed config") + " " + baseconfig,
            html: html,
            proceed: gettext("Proceed"),
            onclose: cancel,
            oncancel: cancel,
            onproceed: perform,
          });
        }
      }
    };

    self.askSaveFaulty = function () {
      return new Promise(function (resolve) {
        var html = "<h5>" +
          gettext("Your configuration seems to be faulty.") +
          "</h5>";

        showConfirmationDialog({
          title: gettext("Save faulty Configuration?"),
          html: html,
          cancel: gettext("Do not save!"),
          proceed: [gettext("Save anyway!"), gettext("Save anyway and don't ask this again.")],
          onproceed: function (idx) {
            if (idx == 0) {
              resolve(true);
            } else {
              self.klipperViewModel.saveOption("configuration", "parse_check", false);
              resolve(true);
            }
          },
          oncancel: function () {
            resolve(false);
          }
        });
      });
    };

    self.checkSyntax = function () {
      return new Promise((resolve, reject) => {
        if (editor.session) {
          self.klipperViewModel.consoleMessage("debug", "checkSyntax started");

          OctoPrint.plugins.klipper.checkCfg(editor.session.getValue())
            .done(function (response) {
              if (response.is_syntax_ok == true) {
                self.klipperViewModel.showPopUp("success", gettext("SyntaxCheck"), gettext("SyntaxCheck OK"));
                self.editorFocusDelay(1000);
                resolve(true);
              } else {
                self.editorFocusDelay(1000);
                resolve(false);
              }
            })
            .fail(function () {
              reject(false);
            });
        } else { reject(false); }
      });
    };

    self.saveCfg = function (options) {
      var options = options || {};
      var closing = options.closing || false;

      if (self.CfgFilename() != "" && self.CfgFilename() != "Change Filename") {
        if (editor.session) {
          if (self.settings.settings.plugins.klipper.configuration.parse_check() == true) {

            // check Syntax and wait for response
            self.checkSyntax().then((syntaxOK) => {
              if (syntaxOK === false) {

                // Ask if we should save a faulty config anyway
                self.askSaveFaulty().then((areWeSaving) => {
                  if (areWeSaving === false) {
                    // Not saving
                    showMessageDialog(
                      gettext('Faulty config not saved!'),
                      {
                        title: gettext("Save Config"),
                        onclose: function () { self.editorFocusDelay(1000); }
                      }
                    );
                  } else {
                    // Save anyway
                    self.saveRequest(closing);
                  }
                });
              } else {
                // Syntax is ok
                self.saveRequest(closing);
              }
            });
          } else {
            self.saveRequest(closing);
          }
        }
      } else {
        showMessageDialog(
          gettext("No filename set"),
          {
            title: gettext("Save Config")
          }
        );
      }
    };

    self.reloadFromFile = function () {
      if (self.CfgFilename() != "") {
        self.klipperViewModel.consoleMessage("debug", "Reload " + self.CfgFilename());
        OctoPrint.plugins.klipper.getCfg(self.CfgFilename())
          .done(function (response) {
            self.klipperViewModel.consoleMessage("debug", "reloadFromFile done");
            if (response.status == "error") {
              showMessageDialog(
                response.data["body"],
                {
                  title: gettext("Reload File")
                }
              );
            } else {
              self.klipperViewModel.showPopUp("success", gettext("Reload Config"), gettext("File reloaded."));
              self.CfgChangedExtern = false;
              if (editor) {
                editor.session.setValue(response.data["body"]);
                self.loadedConfig = response.data["body"];
                editor.clearSelection();
                editor.focus();
              }
            }
          })
          .fail(function (response) {
            showMessageDialog(
              gettext("Error loading file:") + "<br>" + response,
              {
                title: gettext("Reload File")
              }
            );
          });
      } else {
        showMessageDialog(
          gettext("No filename set"),
          {
            title: gettext("Reload File")
          }
        );
      }
    };

    self.onStartup = function () {
      ace.config.set("basePath", "plugin/klipper/static/js/lib/ace/");
      editor = ace.edit("plugin-klipper-config");
      editor.setTheme("ace/theme/monokai");
      editor.session.setMode("ace/mode/klipper_config");
      editor.clearSelection();

      editor.setOptions({
        hScrollBarAlwaysVisible: false,
        vScrollBarAlwaysVisible: false,
        autoScrollEditorIntoView: true,
        showPrintMargin: false,
        //maxLines: "Infinity"
      });

      editor.session.on('change', function (delta) {
        self.CfgContent(editor.getValue());
        editor.resize();
      });
    };

    self.editorFocusDelay = function (delay) {
      self.klipperViewModel.sleep(delay).then(
        function () {
          editor.focus();
        }
      );
    };

    self.saveRequest = function (closing) {
      self.klipperViewModel.consoleMessage("debug", "SaveCfg start");

      if (self.CfgFilename() == "Servicefile") {
        self.klipperViewModel.consoleMessage("debug", "Save Servicefile");
        OctoPrint.plugins.klipper.saveServicefile(editor.session.getValue())
          .done(function (response) {
            self.klipperViewModel.consoleMessage("debug", "Save Servicefile done");
            if (response.saved === true) {
              self.klipperViewModel.showPopUp("success", gettext("Save Servicefile"), gettext("Servicefile saved."));
              if (response.hostsystem == "Linux") {
                showMessageDialog(
                  gettext("Run this command in your linux shell to reload the servicefile for klipper.")
                  + "<br><b>Warning: This will stop ongoing prints!</b>"
                  + "<br><br>"
                  + "    sudo cp -T -v " + response.path + " /etc/default/klipper<br>    sudo systemctl restart klipper<br><br>",
                  {
                    title: gettext("Manually action needed")
                  }
                );
              }
              self.loadedConfig = editor.session.getValue(); //set loaded config to current for resetting dirtyEditor
              if (closing) {
                editordialog.modal('hide');
              }
            } else {
              showMessageDialog(
                gettext('File not saved!'),
                {
                  title: gettext("Save Servicefile"),
                  onclose: function () { self.editorFocusDelay(1000); }
                }
              );
            }
          })
          .fail(function (response) {
            showMessageDialog(
              response,
              {
                title: gettext("Save Servicefile")
              }
            );
          });
      } else {

        OctoPrint.plugins.klipper.saveCfg(editor.session.getValue(), self.CfgFilename())
          .done(function (response) {
            if (response.status == "success") {
              self.klipperViewModel.showPopUp("success", gettext("Save Config"), gettext("File saved."));
              self.loadedConfig = editor.session.getValue(); //set loaded config to current for resetting dirtyEditor
              if (closing) {
                editordialog.modal('hide');
              }
              if (self.settings.settings.plugins.klipper.configuration.restart_onsave() == true) {
                self.klipperViewModel.requestRestart();
              }
            } else {
              showMessageDialog(
                gettext('File not saved!')
                + "<br>" + response.error["message"],
                {
                  title: gettext("Save Config"),
                  onclose: function () { self.editorFocusDelay(1000); }
                }
              );
            }
          });
      };
    };

  };// end KlipperEditorViewModel

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperEditorViewModel,
    dependencies: ["settingsViewModel", "klipperViewModel"],
    elements: ["#klipper_editor"],
  });
});
