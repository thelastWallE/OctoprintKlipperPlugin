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
    var changedConfigConfirmationDialogShown = false;
    var minLimitFontSize = 6;
    var maxLimitFontSize = 25;

    self.settings = parameters[0];
    self.klipperViewModel = parameters[1];
    self.klipperFilesViewModel = parameters[2];
    self.loginState = parameters[3];
    self.access = parameters[4];
    self.files = parameters[5];

    self.cfgContent = ko.observable("");
    self.loadedConfigContent = "";
    self.loadedConfigFilename = "";
    self.cfgChangedExtern = false;
    self.configChangedExternallyDialog = $("#klipper_file_changed_ext_dialog");

    self.fontSize = ko.observable("");

    self.saveFontSize = function () {
      saveToLocalStorage("plugin.OctoKlipper.editor.fontSize", self.fontSize());
    };

    self.loadFontSize = function () {
      var fontSize = loadFromLocalStorage("plugin.OctoKlipper.editor.fontSize");
      if (fontSize != undefined && fontSize != null && Number.isInteger(fontSize)) {
        self.fontSize(fontSize);
      } else {
        // get the old setting and save it to the localStorage
        if (ko.isObservable(self.settings.settings.plugins.klipper.configuration.fontsize)) {
          self.fontSize(self.settings.settings.plugins.klipper.configuration.fontsize());
          self.saveFontSize();
        } else {
          self.fontSize(18);
          self.saveFontSize();
        }
      }
    };
    self._fromLocalStorage = function () {
      self.loadFontSize();
    };

    self.fontSize.subscribe(function () {
      self.limitFontsize();

      if (editor) {
        editor.updateOptions({ fontSize: self.fontSize() });
        editor.layout();
      }

      self.saveFontSize();
    });

    self.limitFontsize = function () {
      if (self.fontSize() < minLimitFontSize) {
        self.fontSize(minLimitFontSize);
      }

      if (self.fontSize() > maxLimitFontSize) {
        self.fontSize(maxLimitFontSize);
      }
    };

    $(window).on("resize", function () {
      self.klipperViewModel.sleep(200).then(function () {
        self.setEditorDivSize();
      });
    });

    self.onShown = function () {
      if (self.klipperFilesViewModel.onEditorShown()) {
        // The config path changed, so the previously loaded file may no longer
        // be part of the registered storage. Unload it to avoid errors on reload.
        self.unloadFile();
      }
      self.checkExternChange();
      // Run the linter on open so squiggles are visible immediately for the
      // loaded config (the content may not change when the dialog is shown).
      self._scheduleSyntaxCheck();
      editor.focus();
      self.setEditorDivSize();
    };

    // Clear the currently loaded config file from the editor.
    self.unloadFile = function () {
      self.loadedConfigContent = "";
      self.loadedConfigFilename = "";
      self.klipperViewModel.currentCfgFilename("");
      self.cfgContent("");
      self.cfgChangedExtern = false;
      if (editor) {
        editor.setValue("");
        editor.setPosition({ lineNumber: 1, column: 1 });
      }
    };

    self.close_selection = function (index) {
      switch (index) {
        case 0:
          editordialog.modal("hide");
          break;
        case 1:
          self.editorFocusDelay(1000);
          break;
        case 2:
          self.saveCfg({ closing: true });
          break;
      }
    };

    self.isEditorDirty = function () {
      if (self.loadedConfigContent != self.cfgContent()) {
        return true;
      } else {
        return false;
      }
    };

    self.closeEditor = function () {
      self.cfgContent(editor.getValue());
      if (self.isEditorDirty()) {
        var opts = {
          title: gettext("Closing without saving"),
          message: gettext("Your file seems to have changed.") + "<br />" + gettext("Do you really want to close it?"),
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
        editordialog.modal("hide");
      }
    };

    self.addStyleAttribute = function ($element, styleAttribute) {
      $element.attr("style", styleAttribute);
    };

    self.setEditorDivSize = function () {
      var klipper_modal_body = $("#klipper_editor .modal-body");
      var klipper_config = $("#plugin-klipper-config");

      var height =
        $(window).height() -
        $("#klipper_editor .modal-header").outerHeight() -
        $("#klipper_editor .modal-footer").outerHeight() -
        118;
      self.addStyleAttribute(klipper_modal_body, "height: " + height + "px !important;");
      klipper_config.css("height", height);
      if (editor) {
        editor.layout();
      }
    };

    //initialize the modal window and return done when finished
    self.process = function (config) {
      return new Promise(function (resolve) {
        self.loadedConfigContent = config.content;
        self.klipperViewModel.currentCfgFilename(config.file);
        self.cfgContent(config.content);
        changedConfigConfirmationDialogShown = false;
        self._fromLocalStorage();

        if (editor) {
          editor.setValue(self.cfgContent());
          self.clearSyntaxMarkers();
          self.cfgChangedExtern = false;
          editor.updateOptions({ fontSize: self.fontSize() });
          editor.setPosition({ lineNumber: 1, column: 1 });
          self.klipperViewModel.sleep(500).then(function () {
            self.setEditorDivSize();
            resolve("done");
          });
        }
      });
    };

    self.onDataUpdaterPluginMessage = function (plugin, data) {
      if (plugin == "klipper") {
        if (data.type == "reload" && data.subtype == "config") {
          //receive from backend after a SAVE_CONFIG
          self.klipperViewModel.consoleMessage("debug", "onDataUpdaterPluginMessage klipper reload baseconfig");
          self.configChangedAfterSave_Config();
        }
      }
    };

    //set externally changed config flag
    self.configChangedAfterSave_Config = function () {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      self.cfgChangedExtern = true;
      self.checkExternChange();
    };

    //check if the config was externally changed and ask for a reload
    self.checkExternChange = function () {
      if (!changedConfigConfirmationDialogShown && self.cfgChangedExtern) {
        if (editordialog.is(":visible")) {
          self.cfgChangedExtern = false;
          changedConfigConfirmationDialogShown = true; //prevent another dialog popUp

          var cancel = function () {
            changedConfigConfirmationDialogShown = false;
          };

          var perform = function () {
            changedConfigConfirmationDialogShown = false;
            self.reloadFromFile();
          };

          var html = "<p>" + gettext("Reload Configfile after SAVE_CONFIG?") + "</p>";

          showConfirmationDialog({
            title: gettext("Externally changed config"),
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
        var html = "<h5>" + gettext("Your configuration seems to be faulty.") + "</h5>";

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
          },
        });
      });
    };

    self.setSyntaxMarkers = function (response) {
      if (!editor || !monaco) return;
      var model = editor.getModel();
      if (!model) return;
      var line = response.line || 1;
      var lineCount = model.getLineCount();
      if (line > lineCount) line = lineCount;
      var markers = [
        {
          severity: monaco.MarkerSeverity.Error,
          message: (response.error ? response.error.message : gettext("Syntax error")).replace(/<[^>]*>/g, ""),
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
        },
      ];
      monaco.editor.setModelMarkers(model, "klipper", markers);
    };

    self.clearSyntaxMarkers = function () {
      if (!editor || !monaco) return;
      var model = editor.getModel();
      if (!model) return;
      monaco.editor.setModelMarkers(model, "klipper", []);
    };

    self._syntaxCheckTimer = null;
    self._scheduleSyntaxCheck = function () {
      if (self._syntaxCheckTimer) {
        clearTimeout(self._syntaxCheckTimer);
      }
      self._syntaxCheckTimer = setTimeout(function () {
        self._syntaxCheckTimer = null;
        self._runLinterCheck();
      }, 800);
    };

    // Linter: silently update the squiggle markers while typing. No toasts.
    self._runLinterCheck = function () {
      if (!editor || !self.klipperViewModel.hasPerm("CONFIG")) return;
      if (!editordialog.is(":visible")) return;
      OctoPrint.plugins.klipper
        .checkCfg(editor.getValue())
        .done(function (response) {
          if (response.status == "success") {
            self.clearSyntaxMarkers();
          } else {
            self.setSyntaxMarkers(response);
          }
        });
    };

    self.checkSyntax = function () {
      return new Promise((resolve, reject) => {
        if (editor) {
          self.klipperViewModel.consoleMessage("debug", "checkSyntax started");

          OctoPrint.plugins.klipper
            .checkCfg(editor.getValue())
            .done(function (response) {
              if (response.status == "success") {
                self.clearSyntaxMarkers();
                self.klipperViewModel.showPopUp("success", gettext("SyntaxCheck"), gettext("SyntaxCheck OK"));
                self.editorFocusDelay(1000);
                resolve(true);
              } else {
                self.setSyntaxMarkers(response);
                self.editorFocusDelay(1000);
                self.klipperViewModel.consoleMessage("error", "checkSyntax failed");
                self.klipperViewModel.showPopUp("error", gettext("SyntaxCheck"), response.error.message, true);
                resolve(false);
              }
            })
            .fail(function () {
              reject(false);
            });
        } else {
          reject(false);
        }
      });
    };

    self.saveCfg = function (options) {
      var options = options || {};
      var closing = options.closing || false;

      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      if (self.cfgChangedExtern) {
        let path = self.klipperFilesViewModel.currentPath();
        let filename = self.klipperViewModel.currentCfgFilename();
        // show klipper_file_changed dialog
        OctoPrint.plugins.klipper
          .exists(self.klipperViewModel.storageLocation, path, filename)
          .done(function (response) {
            if (response.exists) {
              $("input", self.configChangedExternallyDialog).val("").prop("placeholder", response.suggestion);
              $("a.file-rename", self.configChangedExternallyDialog)
                .prop("disabled", false)
                .off("click")
                .on("click", function () {
                  var newName = $("input", self.configChangedExternallyDialog).val();
                  if (newName === "") newName = response.suggestion;

                  OctoPrint.plugins.klipper
                    .exists(self.klipperViewModel.storageLocation, path, newName)
                    .done(function (r) {
                      if (r.exists) {
                        $(".control-group", self.configChangedExternallyDialog).addClass("error");
                        $(".help-block", self.configChangedExternallyDialog).show();
                      } else {
                        $(".control-group", self.configChangedExternallyDialog).removeClass("error");
                        $(".help-block", self.configChangedExternallyDialog).hide();
                        self.configChangedExternallyDialog.modal("hide");
                        self.cfgChangedExtern = false;

                        self.klipperViewModel.currentCfgFilename = newName;
                        self.saveCfg(options);
                      }
                    });
                });
              $("a.file-overwrite", self.configChangedExternallyDialog)
                .off("click")
                .on("click", function () {
                  self.configChangedExternallyDialog.modal("hide");
                  self.cfgChangedExtern = false;
                  self.saveCfg(options);
                });
              self.configChangedExternallyDialog.modal("show");
            } else {
              self.cfgChangedExtern = false;
              self.saveCfg(options);
            }
          });
      } else {
        if (
          self.klipperViewModel.currentCfgFilename() != "" &&
          self.klipperViewModel.currentCfgFilename() != "Change Filename"
        ) {
          if (editor) {
            if (self.settings.settings.plugins.klipper.configuration.parse_check() == true) {
              // check Syntax and wait for response
              self.checkSyntax().then((syntaxOK) => {
                if (syntaxOK === false) {
                  // Ask if we should save a faulty config anyway
                  self.askSaveFaulty().then((areWeSaving) => {
                    if (areWeSaving === false) {
                      // Not saving
                      showMessageDialog(gettext("Faulty config not saved!"), {
                        title: gettext("Save Config"),
                        onclose: function () {
                          self.editorFocusDelay(1000);
                        },
                      });
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
          showMessageDialog(gettext("No filename set"), {
            title: gettext("Save Config"),
          });
        }
      }
    };

    self.loadBaseConfig = function () {
      var baseconfig = self.settings.settings.plugins.klipper.configuration.baseconfig();
      self.klipperViewModel.consoleMessage("debug", "loadBaseConfig:" + baseconfig);
      self.openConfig("baseconfig");
    };

    self.loadFile = function (data) {
      if (!self.loginState.hasPermission(self.access.permissions.FILES_SELECT)) return;

      if (!data) {
        return;
      }

      if (self.isEditorDirty() === true) {
        var selection = function (index) {
          switch (index) {
            case 0:
              self.openConfig(data.path);
              break;
            case 1:
              self.editorFocusDelay(1000);
              break;
            case 2:
              self.saveCfg({ closing: false });
              if (!self.isEditorDirty()) {
                self.openConfig(data.path);
              }
              break;
          }
        };

        var opts = {
          title: gettext("Switching without saving"),
          message:
            gettext("Your file seems to have changed.") +
            "<br />" +
            gettext("Do you really want to switch to another file?"),
          selections: [gettext("Switch"), gettext("Do not switch"), gettext("Save & Switch")],
          maycancel: false,
          onselect: function (index) {
            if (index > -1) {
              selection(index);
            }
          },
        };

        showSelectionDialog(opts);
      } else {
        self.openConfig(data.path);
      }
    };

    self.openConfig = function (file) {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;

      OctoPrint.plugins.klipper
        .getCfg(self.klipperViewModel.storageLocation, file)
        .done(function (response) {
          if (response.status == "success") {
            var config = {
              content: response.data.body.content,
              // Use the storage-relative path passed in so reload/save work.
              // The baseconfig is a special virtual file resolved by the
              // backend, keep its resolved path for saving.
              file: file === "baseconfig" ? response.data.body.file : file,
            };
            self.process(config);
            self.loadedConfigFilename = config.file;
            self.klipperFilesViewModel.highlightCurrentFilename();
          } else {
            self.klipperViewModel.consoleMessage("error", "openConfig failed: " + response.error.message);
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "openConfig failed: " + response.responseText);
        });
    };

    self.reloadFromFile = function () {
      if (self.klipperViewModel.currentCfgFilename() != "") {
        self.klipperViewModel.consoleMessage("debug", "Reload " + self.klipperViewModel.currentCfgFilename());
        OctoPrint.plugins.klipper
          .getCfg(self.klipperViewModel.storageLocation, self.klipperViewModel.currentCfgFilename())
          .done(function (response) {
            self.klipperViewModel.consoleMessage("debug", "reloadFromFile done");
            if (response.status == "error") {
              showMessageDialog(response.data.body, {
                title: gettext("Reload File"),
              });
            } else {
              self.klipperViewModel.showPopUp("success", gettext("Reload Config"), gettext("File reloaded."));
              self.cfgChangedExtern = false;
              if (editor) {
                editor.setValue(response.data.body.content);
                self.loadedConfigContent = response.data.body.content;
                self.loadedConfigFilename = self.klipperViewModel.currentCfgFilename();
                editor.setPosition({ lineNumber: 1, column: 1 });
                editor.focus();
              }
            }
          })
          .fail(function (response) {
            showMessageDialog(gettext("Error loading file:") + "<br>" + _.escape(response.responseText), {
              title: gettext("Reload File"),
            });
          });
      } else {
        showMessageDialog(gettext("No filename set"), {
          title: gettext("Reload File"),
        });
      }
    };

    self.newFile = function () {
      if (!self.klipperViewModel.hasPerm("CONFIG")) return;
      var config = {
        content: "",
        file: "Change Filename",
      };

      let switch_selection = -1;

      if (self.isEditorDirty()) {
        var opts = {
          title: gettext("New file without saving"),
          message:
            gettext("Your current file seems to have changed.") +
            "<br />" +
            gettext("Do you really want to switch to a new file?"),
          selections: [gettext("Switch"), gettext("Do not switch"), gettext("Save & Switch")],
          maycancel: false,
          onselect: function (index) {
            if (index > -1) {
              switch_selection = index;
            }
          },
        };

        showSelectionDialog(opts);
      }
      switch (switch_selection) {
        case 0:
          self.process(config);
          break;
        case 1:
          self.editorFocusDelay(1000);
          break;
        case 2:
          self.saveCfg({ closing: false });
          if (!self.isEditorDirty()) {
            self.process(config);
          }
          break;
      }

      self.process(config);
    };

    self.onStartup = function () {
      // OctoPrint core does not dispatch onShown, so bind the editor modal's
      // shown event manually to refresh the file list on every open.
      if (!self._editorShownBound) {
        self._editorShownBound = true;
        editordialog.on("shown", function () {
          self.onShown();
        });
      }
    };

    self.prepareMonacoEditor = function () {
      return new Promise(function (resolve) {
        var init = function () {
          if (editor) {
            resolve();
            return;
          }
          var el = document.getElementById("plugin-klipper-config");
          editor = monaco.editor.create(el, {
            language: "klipper_config",
            theme: "klipper-monokai",
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderWhitespace: "selection",
            fontSize: self.fontSize() || 12,
          });
          // Ensure the language and theme are applied even if the language
          // module finished loading after the editor was created.
          monaco.editor.setModelLanguage(editor.getModel(), "klipper_config");
          editor.updateOptions({ theme: "klipper-monokai" });
          editor.onDidChangeModelContent(function () {
            self.cfgContent(editor.getValue());
            self._scheduleSyntaxCheck();
          });
          // apply any content that was set before the editor was ready
          if (self.cfgContent()) {
            editor.setValue(self.cfgContent());
          }
          resolve();
        };
        if (window.__klipperMonacoPromise) {
          window.__klipperMonacoPromise.then(init);
        } else if (window.__klipperMonacoReady) {
          init();
        } else {
          // Fallback: load Monaco directly (e.g. if the template script
          // hasn't run yet).
          require(["vs/editor/editor.main"], function () {
            if (!window.__klipperMonacoReady) {
              var s = document.createElement("script");
              s.src = "plugin/klipper/static/js/lib/monaco/klipper-config.js";
              s.onload = function () {
                window.__klipperMonacoReady = true;
                init();
              };
              document.head.appendChild(s);
            } else {
              init();
            }
          });
        }
      });
    };

    self.onStartupComplete = function () {
      self._bindSettingsSaving();
      self.prepareMonacoEditor().then(function () {
        self.loadBaseConfig();
      });
    };

    // Persist editor settings when they are toggled in the editor modal.
    self._bindSettingsSaving = function () {
      if (
        !self.settings ||
        !self.settings.settings ||
        !self.settings.settings.plugins ||
        !self.settings.settings.plugins.klipper ||
        !self.settings.settings.plugins.klipper.configuration
      ) {
        return;
      }
      var config = self.settings.settings.plugins.klipper.configuration;
      if (ko.isObservable(config.parse_check)) {
        config.parse_check.subscribe(function (value) {
          self.klipperViewModel.saveOption("configuration", "parse_check", value);
        });
      }
      if (ko.isObservable(config.restart_onsave)) {
        config.restart_onsave.subscribe(function (value) {
          self.klipperViewModel.saveOption("configuration", "restart_onsave", value);
        });
      }
    };

    /**
     * Wait and then focus the editor
     * @param {number} delay Delay in ms
     * @returns {void}
     */
    self.editorFocusDelay = function (delay) {
      self.klipperViewModel.sleep(delay).then(function () {
        editor.focus();
      });
    };

    /**
     * Saves the config
     * @param {boolean} closing Saves and closes the editor
     * @param {boolean} force  Forcing the save
     */
    self.saveRequest = function (closing, force) {
      self.klipperViewModel.consoleMessage("debug", "SaveCfg start");
      let hasNewName = false;
      force = force || false;
      if (self.klipperViewModel.currentCfgFilename() != self.loadedConfigFilename) {
        self.klipperViewModel.consoleMessage(
          "debug",
          "SaveCfg filename changed to " +
            self.klipperViewModel.currentCfgFilename() +
            " from " +
            self.loadedConfigFilename,
        );
        hasNewName = true;
      }
      OctoPrint.plugins.klipper
        .saveCfg(editor.getValue(), self.klipperViewModel.currentCfgFilename(), hasNewName, force)
        .done(function (response) {
          if (response.status == "success") {
            self.klipperViewModel.showPopUp("success", gettext("Save Config"), gettext("File saved."));
            self.loadedConfigContent = editor.getValue(); //set loaded config to current for resetting dirtyEditor
            self.loadedConfigFilename = self.klipperViewModel.currentCfgFilename();
            if (closing) {
              editordialog.modal("hide");
            }
            if (self.settings.settings.plugins.klipper.configuration.restart_onsave() == true) {
              self.klipperViewModel.requestRestart();
            }
          } else if (response.status == "error" && response.message == "File already exists") {
            // show confirmation dialog
            let opts = {
              title: gettext("Overwrite file"),
              message: gettext("The file already exists.") + "<br />" + gettext("Do you really want to overwrite it?"),
              selections: [gettext("Overwrite"), gettext("Do not overwrite")],
              maycancel: false,
              onselect: function (index) {
                if (index > -1) {
                  if (index == 0) {
                    self.saveRequest(closing, true);
                  } else {
                    self.editorFocusDelay(1000);
                  }
                }
              },
            };
            showSelectionDialog(opts);
          } else {
            showMessageDialog(gettext("File not saved!") + "<br>" + response.error["message"], {
              title: gettext("Save Config"),
              onclose: function () {
                self.editorFocusDelay(1000);
              },
            });
          }
        })
        .fail(function (response) {
          showMessageDialog(gettext("File not saved!") + "<br>" + response.responseText, {
            title: gettext("Save Config"),
            onclose: function () {
              self.editorFocusDelay(1000);
            },
          });
        });
    };
  } // end KlipperEditorViewModel

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperEditorViewModel,
    dependencies: [
      "settingsViewModel",
      "klipperViewModel",
      "klipperFilesViewModel",
      "loginStateViewModel",
      "accessViewModel",
      "filesViewModel",
    ],
    elements: [
      "#klipper_editor",
      "#klipper_add_folder_dialog",
      "#klipper_move_file_or_folder_dialog",
      "#klipper_upload_exists_dialog",
    ],
  });
});
