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
  function KlipperFilesViewModel(parameters) {
    var self = this;

    self.settings = parameters[0];
    self.klipperViewModel = parameters[1];
    self.access = parameters[2];
    self.loginState = parameters[3];
    self.printerState = parameters[4];

    self.markedForFileRemove = ko.observableArray([]);
    self.PathToConfigs = ko.observable("");
    self.allItems = ko.observable(undefined);

    self.listElement = undefined;

    self.ignoreUpdatedFilesEvent = false;

    self.addingFolder = ko.observable(false);
    self.activeRemovals = ko.observableArray([]);

    self.movingFileOrFolder = ko.observable(false);
    self.uploadingFile = ko.observable(false);
    self.moveEntry = ko.observable({ name: "", display: "", path: "" }); // is there a better way to do this?
    self.moveSource = ko.observable(undefined);
    self.moveDestination = ko.observable(undefined);
    self.moveSourceFilename = ko.observable(undefined);
    self.moveDestinationFilename = ko.observable(undefined);
    self.moveDestinationFullpath = ko.pureComputed(function () {
      // Join the paths for renaming
      if (self.moveSourceFilename() != self.moveDestinationFilename()) {
        if (self.moveDestination() === "/") {
          return self.moveDestination() + self.moveDestinationFilename();
        } else {
          return self.moveDestination() + "/" + self.moveDestinationFilename();
        }
      } else {
        return self.moveDestination();
      }
    });
    self.moveError = ko.observable("");

    self.folderList = ko.observableArray(["/"]);
    self.addFolderDialog = undefined;
    self.addFolderName = ko.observable(undefined);
    self.enableAddFolder = ko.pureComputed(function () {
      return (
        self.loginState.hasPermission(self.access.permissions.FILES_UPLOAD) &&
        self.addFolderName() &&
        self.addFolderName().trim() !== "" &&
        !self.addingFolder()
      );
    });

    self.isLoading = ko.observable(false);

    self.isLoadActionPossible = ko.pureComputed(function () {
      return self.klipperViewModel.hasPerm("CONFIG") && !self.isLoading();
    });

    self.enableSelect = function (data) {
      return self.isLoadActionPossible() && !self.configs.isSelected(data);
    };

    self.uploadExistsDialog = undefined;
    self.uploadFilename = ko.observable(undefined);
    self.acceptedFiletypes = [".cfg", ".config"];

    self.currentPath = ko.observable("");
    self.uploadProgressText = ko.observable();
    self.uploadProgressPercentage = ko.observable();

    self._otherRequestInProgress = undefined;
    self._focus = undefined;
    self._switchToPath = undefined;

    self.searchQuery = ko.observable(undefined);
    self.searchQuery.subscribe(function () {
      self.performSearch();
    });

    // list style incl. persistence
    var listStyleStorageKey = "plugin.OctoKlipper.currentListStyle";
    var defaultListStyle = "folders_files";

    self.saveListStyleToLocalStorage = function () {
      saveToLocalStorage(listStyleStorageKey, self.listStyle());
    };

    self.loadListStyleFromLocalStorage = function () {
      var listStyle = loadFromLocalStorage(listStyleStorageKey);
      if (listStyle.length > 0) {
        self.listStyle(listStyle);
      } else {
        self.listStyle(defaultListStyle);
      }
    };

    self.listStyle = ko.observable(defaultListStyle);

    self.listStyle.subscribe(self.saveListStyleToLocalStorage());

    self._fromLocalStorage = function () {
      self.loadListStyleFromLocalStorage();
    };

    // initialize list helper
    var listHelperFilters = {
      local: function (data) {
        return !(data["origin"] && data["origin"] === "sdcard");
      },
    };

    var listHelperExclusiveFilters = [["local"]];

    var SUPPORTED_FILETYPES = {
      config: {
        config: { extensions: ["cfg", ".config"], content_type: "text/plain" },
      },
    };

    if (SUPPORTED_FILETYPES.length > 1) {
      _.each(SUPPORTED_FILETYPES, function (filetype) {
        listHelperFilters[filetype] = function (data) {
          return data["type"] && (data["type"] === filetype || data["type"] === "folder");
        };
      });
      listHelperExclusiveFilters.push(SUPPORTED_FILETYPES);
    }

    var sortByName = function (a, b) {
      // sorts ascending
      if (a["display"].toLowerCase() < b["display"].toLowerCase()) return -1;
      if (a["display"].toLowerCase() > b["display"].toLowerCase()) return 1;
      return 0;
    };

    // initialize list helper
    self.configs = new ItemListHelper(
      "plugin.OctoKlipper.klipperCfgFiles",
      {
        name: sortByName,
        date: function (a, b) {
          // sorts descending
          if (a["date"] > b["date"]) return -1;
          if (a["date"] < b["date"]) return 1;
          return 0;
        },
        upload: function (a, b) {
          // sorts descending
          if (a["date"] === undefined && b["date"] === undefined) {
            return sortByName(a, b);
          }
          if (b["date"] === undefined || a["date"] > b["date"]) return -1;
          if (a["date"] === undefined || a["date"] < b["date"]) return 1;
          return 0;
        },
        size: function (a, b) {
          // sorts descending
          if (a["bytes"] > b["bytes"]) return -1;
          if (a["bytes"] < b["bytes"]) return 1;
          return 0;
        },
      },
      listHelperFilters,
      "name",
      [],
      listHelperExclusiveFilters,
      0,
    );

    self.availableFiletypes = ko.pureComputed(function () {
      var mapping = {
        config: gettext("Only show config files"),
      };

      var result = [];
      _.each(SUPPORTED_FILETYPES, function (filetype) {
        if (mapping[filetype]) {
          result.push({ key: filetype, text: mapping[filetype] });
        } else {
          result.push({
            key: filetype,
            text: _.sprintf(gettext("Only show %(type)s files"), {
              type: _.escape(filetype),
            }),
          });
        }
      });

      return result;
    });

    self.folderDestinations = ko.pureComputed(function () {
      if (self.allItems()) {
        return ko.utils.arrayFilter(self.allItems(), function (item) {
          return item.type === "folder";
        });
      }
    });

    self.foldersOnlyList = ko.dependentObservable(function () {
      var filter = function (data) {
        return data["type"] && data["type"] === "folder";
      };
      return _.filter(self.configs.paginatedItems(), filter);
    });

    self.filesOnlyList = ko.dependentObservable(function () {
      var filter = function (data) {
        return data["type"] && data["type"] !== "folder";
      };
      return _.filter(self.configs.paginatedItems(), filter);
    });

    self.filesAndFolders = ko.dependentObservable(function () {
      var style = self.listStyle();
      if (style === "folders_files" || style === "files_folders") {
        var files = self.filesOnlyList();
        var folders = self.foldersOnlyList();

        if (style === "folders_files") {
          return folders.concat(files);
        } else {
          return files.concat(folders);
        }
      } else {
        return self.configs.paginatedItems();
      }
    });

    self._getConfigPath = function () {
      if (
        self.settings &&
        self.settings.settings &&
        self.settings.settings.plugins &&
        self.settings.settings.plugins.klipper &&
        self.settings.settings.plugins.klipper.configuration &&
        ko.isObservable(self.settings.settings.plugins.klipper.configuration.config_path)
      ) {
        return self.settings.settings.plugins.klipper.configuration.config_path();
      }
      return undefined;
    };

    self.onStartupComplete = function () {
      self._fromLocalStorage();
      self._lastConfigPath = self._getConfigPath();
    };

    // Called by the editor when it is shown. Keeps the current folder for
    // everyday use, but resets to the root when the config path changed so the
    // file browser doesn't stay on a folder from a previous config path.
    // Returns true if the config path changed since the last time it was shown.
    self.onEditorShown = function () {
      var configPath = self._getConfigPath();
      var changed = self._lastConfigPath !== configPath;
      if (changed) {
        self._lastConfigPath = configPath;
        self.currentPath("");
        self.searchQuery("");
      }
      self.requestData({ force: true });
      return changed;
    };

    self.fromCurrentData = function (data) {
      self._processStateData(data.state);
    };

    self.fromHistoryData = function (data) {
      self._processStateData(data.state);
    };

    self._processStateData = function (data) {
      self.isLoading(data.flags.loading);
    };

    self._otherRequestInProgress = undefined;
    self._focus = undefined;
    self._switchToPath = undefined;

    self.requestData = function (params) {
      self.klipperViewModel.consoleMessage("debug", "requestData started");
      if (!self.loginState.hasPermission(self.access.permissions.FILES_LIST)) {
        self.klipperViewModel.consoleMessage("debug", "No Permission for FileList");
        return;
      }

      var focus, switchToPath, force;

      if (_.isObject(params)) {
        focus = params.focus;
        switchToPath = params.switchToPath;
        force = params.force;
      }

      self._focus = self._focus || focus;
      self._switchToPath = self._switchToPath || switchToPath;

      if (self._otherRequestInProgress !== undefined) {
        return self._otherRequestInProgress;
      }

      return (self._otherRequestInProgress = OctoPrint.plugins.klipper
        .list(true, force)
        .done(function (response) {
          self.klipperViewModel.consoleMessage("debug", "requestData done");
          if (response.status == "success") {
            self.fromResponse(response, {
              focus: self._focus,
              switchToPath: self._switchToPath,
            });
          } else {
            self.klipperViewModel.consoleMessage("error", "requestData failed");
            self.klipperViewModel.consoleMessage("error", response.error.message);
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "requestData failed");
          self.klipperViewModel.consoleMessage("error", response.responseText);
          self.allItems(undefined);
          self.configs.updateItems([]);
        })
        .always(function () {
          self._otherRequestInProgress = undefined;
          self._focus = undefined;
          self._switchToPath = undefined;
        }));
    };

    self.fromResponse = function (response, options) {
      var focus = options.focus || undefined;
      var switchToPath = options.switchToPath || undefined;

      //for (index in response.data.files) {
      //response.data.files[index].size = "(" + (parseInt(response.data.files[index].bytes) / 1024).toFixed(2) + " KB)";
      // old from backend: size=" ({:.1f} KB)".format(filesize / 1000.0),
      //}
      //self.configs.updateItems(response.data.files);
      //self.PathToConfigs(gettext("Path: ") + response.data.path);
      //self.configs.resetPage();

      var files = response.data.files;
      self.allItems(files);

      var createFolderList = function (entries) {
        var result = [];
        _.each(entries, function (entry) {
          if (entry.type !== "folder") return;

          result.push("/" + entry.path);

          if (entry.children) {
            result = result.concat(createFolderList(entry.children));
          }
        });
        return result;
      };
      self.folderList(["/"].concat(createFolderList(files)));

      var nonrecursive = false;
      _.each(files, function (file) {
        if (file.type === "folder" && file.children === undefined) {
          nonrecursive = true;
        }
      });
      if (nonrecursive) {
        log.error(
          "At least one folder doesn't have a 'children' element defined. That means the file list request " +
          "wasn't actually made with 'recursive=true' in the query.\n\n" +
          "This can happen on wrong reverse proxy configs that " +
          "swallow up query parameters, see https://github.com/OctoPrint/OctoPrint/issues/2572",
        );
      }

      if (!switchToPath) {
        var currentPath = self.currentPath();
        if (currentPath === undefined) {
          self.configs.updateItems(files);
          self.currentPath("");
        } else {
          // if we have a current path, make sure we stay on it
          self.changeFolderByPath(currentPath);
        }
      } else {
        self.changeFolderByPath(switchToPath);
      }

      if (focus) {
        // got a file to scroll to
        var entryElement = self.getEntryElement({
          path: focus.path,
          origin: focus.location,
        });
        if (entryElement) {
          // scroll to uploaded element
          self.listElement.scrollTop(entryElement.offsetTop);

          // highlight uploaded element
          var element = $(entryElement);
          element.on("webkitAnimationEnd oanimationend msAnimationEnd animationend", function (e) {
            // remove highlight class again
            element.removeClass("highlight");
          });
          element.addClass("highlight");
        }
      }
      if (response.free !== undefined) {
        self.freeSpace(response.free);
      }

      if (response.total !== undefined) {
        self.totalSpace(response.total);
      }

      self.highlightCurrentFilename();
    };

    self.highlightCurrentFilename = function () {
      self.highlightFilename(self.klipperViewModel.currentCfgFilename());
    };

    self.highlightFilename = function (filename) {
      if (filename === undefined || filename === null || filename === "") {
        self.configs.selectNone();
      } else {
        self.configs.selectItem(function (item) {
          if (item.type === "folder") {
            return _.startsWith(filename, item.path + "/");
          } else {
            return item.path === filename;
          }
        });
      }
    };

    self.changeFolder = function (data) {
      if (data.children === undefined) {
        log.error("Can't switch to folder '" + data.path + "', no children available");
        return;
      }

      self.currentPath(data.path);
      self.configs.updateItems(data.children);
      self.highlightCurrentFilename();
    };

    self.navigateUp = function () {
      var path = self.currentPath().split("/");
      path.pop();
      self.changeFolderByPath(path.join("/"));
      self.klipperViewModel.currentCfgFilename(
        self.klipperViewModel.currentCfgFilename().split("/").slice(0, -1).join("/"),
      );
    };

    self.changeFolderByPath = function (path) {
      var element = self.elementByPath(path);
      if (element) {
        self.currentPath(path);
        self.configs.updateItems(element.children);
      } else {
        self.currentPath("");
        self.configs.updateItems(self.allItems());
      }
      self.highlightCurrentFilename();
    };

    self.showAddFolderDialog = function () {
      if (!self.loginState.hasPermission(self.access.permissions.FILES_UPLOAD)) return;

      if (self.addFolderDialog) {
        self.addFolderName("");
        self.addFolderDialog.modal("show");
      }
    };

    self.addFolder = function () {
      if (!self.loginState.hasPermission(self.access.permissions.FILES_UPLOAD)) return;

      var name = self.addFolderName();

      self.ignoreUpdatedFilesEvent = true;
      self.addingFolder(true);
      OctoPrint.plugins.klipper
        .createFolder(self.klipperViewModel.storageLocation, name, self.currentPath())
        .done(function (data) {
          self
            .requestData({
              focus: {
                path: data.folder.name,
                location: data.folder.origin,
              },
            })
            .done(function () {
              self.addFolderDialog.modal("hide");
            })
            .always(function () {
              self.addingFolder(false);
            });
        })
        .fail(function () {
          self.addingFolder(false);
        })
        .always(function () {
          self.ignoreUpdatedFilesEvent = false;
        });
    };

    self.removeFolder = function (folder, event) {
      if (!self.loginState.hasPermission(self.access.permissions.FILES_DELETE)) return;

      if (!folder) {
        return;
      }

      if (folder.type !== "folder") {
        return;
      }

      if (folder.weight > 0) {
        // confirm recursive delete
        var options = {
          message: _.sprintf(
            gettext('You are about to delete the folder "%(folder)s" which still contains files and/or sub folders.'),
            { folder: _.escape(folder.name) },
          ),
          onproceed: function () {
            self._removeEntry(folder, event);
          },
        };
        showConfirmationDialog(options);
      } else {
        self._removeEntry(folder, event);
      }
    };

    self.showMoveDialog = function (entry, event) {
      if (
        !self.loginState.hasAllPermissions(self.access.permissions.FILES_UPLOAD, self.access.permissions.FILES_DELETE)
      ) {
        return;
      }

      if (!entry) {
        return;
      }

      if (!self.moveDialog) {
        return;
      }

      var slashPos = entry.path.lastIndexOf("/");
      var current;
      if (slashPos >= 0) {
        current = "/" + entry.path.substr(0, slashPos);
      } else {
        current = "/";
      }

      self.moveEntry(entry);
      self.moveError("");
      self.moveSource(current);
      self.moveDestination(current);
      self.moveSourceFilename(entry.name);
      self.moveDestinationFilename(entry.name);
      self.moveDialog.modal("show");
    };

    self.removeFile = function (file, event) {
      if (!self.loginState.hasPermission(self.access.permissions.FILES_DELETE)) return;

      if (!file) {
        return;
      }

      if (file.type === "folder") {
        return;
      }

      self._removeEntry(file, event);
    };

    self.moveFileOrFolder = function (source, destination, force) {
      self.movingFileOrFolder(true);
      return OctoPrint.plugins.klipper
        .move(self.klipperViewModel.storageLocation, source, destination, force)
        .done(function () {
          self
            .requestData()
            .done(function () {
              self.moveDialog.modal("hide");
            })
            .always(function () {
              self.movingFileOrFolder(false);
            });
        })
        .fail(function (response) {
          self.moveError(
            gettext("Unable to move file or folder") +
            " " +
            self.moveEntry().display +
            " " +
            gettext("to") +
            " " +
            self.moveDestination() +
            ": \n" +
            gettext(response.responseJSON.error),
          );
          self.movingFileOrFolder(false);
        });
    };

    self._removeEntry = function (entry, event) {
      self.activeRemovals.push("klipper_configs:" + entry.path);
      var finishActiveRemoval = function () {
        self.activeRemovals(
          _.filter(self.activeRemovals(), function (e) {
            return e !== "klipper_configs:" + entry.path;
          }),
        );
      };

      var activateSpinner = function () { };
      var finishSpinner = function () { };

      if (event) {
        var element = $(event.currentTarget);
        if (element.length) {
          var icon = $("i.fa-trash-alt", element);
          if (icon.length) {
            activateSpinner = function () {
              icon.removeClass("fa-trash-alt").addClass("fa-spinner fa-spin");
            };
            finishSpinner = function () {
              icon.removeClass("fa-spinner fa-spin").addClass("fa-trash-alt");
            };
          }
        }
      }

      activateSpinner();

      var deferred = $.Deferred();
      OctoPrint.plugins.klipper
        .delete(self.klipperViewModel.storageLocation, entry.path)
        .done(function () {
          self
            .requestData()
            .done(function () {
              deferred.resolve();
            })
            .fail(function () {
              deferred.reject();
            });
        })
        .fail(function () {
          deferred.reject();
        });

      return deferred.promise().always(function () {
        finishActiveRemoval();
        finishSpinner();
      });
    };

    self.downloadLink = function (data) {
      if (data["refs"] && data["refs"]["download"]) {
        return data["refs"]["download"];
      } else {
        return false;
      }
    };

    self.enableRemove = function (data) {
      if (_.contains(self.activeRemovals(), "klipper_configs:" + data.path)) {
        return false;
      }

      var busy = false;
      if (data.type === "folder") {
        busy = _.any(self.printerState.busyFiles(), function (name) {
          return _.startsWith(name, "klipper_configs:" + data.path + "/");
        });
      } else {
        busy = _.contains(self.printerState.busyFiles(), "klipper_configs:" + data.path);
      }
      return self.loginState.hasPermission(self.access.permissions.FILES_DELETE) && !busy;
    };

    self.enableMove = function (data) {
      return self.loginState.hasAllPermissions(
        self.access.permissions.FILES_UPLOAD,
        self.access.permissions.FILES_DELETE,
      ); // && some way to figure out if there are subfolders;
    };

    self.enableSelect = function (data) {
      return !self.configs.isSelected(data);
    };

    self.clearSearchQuery = function () {
      self.searchQuery("");
    };

    self.performSearch = function (e) {
      var query = self.searchQuery();
      if (query !== undefined && query.trim() !== "") {
        query = query.toLocaleLowerCase();

        var recursiveSearch = function (entry) {
          if (entry === undefined) {
            return false;
          }

          var success =
            (entry["display"] && entry["display"].toLocaleLowerCase().indexOf(query) > -1) ||
            entry["name"].toLocaleLowerCase().indexOf(query) > -1;
          if (!success && entry["type"] === "folder" && entry["children"]) {
            return _.any(entry["children"], recursiveSearch);
          }

          return success;
        };

        self.configs.changeSearchFunction(recursiveSearch);
      } else {
        self.configs.resetSearch();
      }

      return false;
    };

    self.elementByPath = function (path, root) {
      root = root || { children: self.allItems() };

      var recursiveSearch = function (location, element) {
        if (location.length === 0) {
          return element;
        }

        if (!element.hasOwnProperty("children") || !element.children) {
          return undefined;
        }

        var name = location.shift();
        for (var i = 0; i < element.children.length; i++) {
          if (name === element.children[i].name) {
            return recursiveSearch(location, element.children[i]);
          }
        }

        return undefined;
      };

      return recursiveSearch(path.split("/"), root);
    };

    self.updateButtons = function () {
      if (self.loginState.hasPermission(self.access.permissions.FILES_UPLOAD)) {
        self.uploadButton.fileupload("enable");
      } else {
        self.uploadButton.fileupload("disable");
      }
    };

    self.onUserPermissionsChanged =
      self.onUserLoggedIn =
      self.onUserLoggedOut =
      function () {
        self.updateButtons();
        self.requestData();
      };

    self.onStartup = function () {
      $(".accordion-toggle[data-target='#klipper_files']").click(function () {
        var files = $("#klipper_files");
        if (files.hasClass("in")) {
          files.removeClass("overflow_visible");
          self.filesListVisible(false);
        } else {
          setTimeout(function () {
            files.addClass("overflow_visible");
            self.filesListVisible(true);
          }, 100);
        }
      });

      self.listElement = $("#klipper_files").find(".scroll-wrapper");

      self.moveDialog = $("#klipper_move_file_or_folder_dialog");
      self.addFolderDialog = $("#klipper_add_folder_dialog");
      self.addFolderDialog.on("shown", function () {
        $("input", self.addFolderDialog).focus();
      });
      $("form", self.addFolderDialog).on("submit", function (e) {
        e.preventDefault();
        if (self.enableAddFolder()) {
          self.addFolder();
        }
      });

      self.uploadExistsDialog = $("#klipper_upload_exists_dialog");

      //~~ File upload

      self.uploadButton = $("#klipperconfig_upload");

      self.uploadProgress = $("#klipperconfig_upload_progress");
      self.uploadProgressBar = $(".bar", self.uploadProgress);

      function evaluateUploadButton() {
        var enableLocal =
          self.loginState.hasPermission(self.access.permissions.FILES_UPLOAD) && !self.printerState.isPrinting();

        self._setUploadButton(enableLocal);
      }
      self.loginState.currentUser.subscribe(evaluateUploadButton);
      self.printerState.isPrinting.subscribe(evaluateUploadButton);
      evaluateUploadButton();
    };

    self.onEventUpdatedFiles = function (payload) {
      if (self.ignoreUpdatedFilesEvent) {
        return;
      }

      if (payload.type === "printables") {
        return;
      }

      self.requestData();
    };

    self.templateFor = function (data) {
      return "files_template_klipper_" + data.type;
    };

    self.getEntryId = function (data) {
      return "config_file_" + md5("local:" + data["path"]);
    };

    self.getEntryElement = function (data) {
      var entryId = self.getEntryId(data);
      var entryElements = $("#" + entryId);
      if (entryElements && entryElements[0]) {
        return entryElements[0];
      } else {
        return undefined;
      }
    };

    self._setUploadButton = function (enable) {
      var button = self.uploadButton;
      var url = OctoPrint.getBlueprintUrl("klipper") + self.klipperViewModel.storageLocation;

      if (button === undefined) return;

      button.fileupload({
        url: url,
        dataType: "json",
        add: self._handleUploadAdd,
        submit: self._handleUploadStart,
        done: self._handleUploadDone,
        fail: self._handleUploadFail,
        always: self._handleUploadAlways,
        progressall: self._handleUploadProgress,
      });
    };

    self._setProgressBar = function (percentage, text, active) {
      self.uploadProgressBar.css("width", percentage + "%");
      self.uploadProgressText(text);
      self.uploadProgressPercentage(percentage);

      if (active) {
        self.uploadProgress.addClass("progress-striped active");
      } else {
        self.uploadProgress.removeClass("progress-striped active");
      }
    };

    self._handleUploadAdd = function (e, data) {
      var file = data.files[0];
      var path = self.currentPath();

      var formData = {};
      if (path !== "") {
        formData.path = path;
      }

      if (self.settings.feature_uploadOverwriteConfirmation()) {
        OctoPrint.plugins.klipper
          .exists(self.klipperViewModel.storageLocation, path, file.name)
          .done(function (response) {
            if (response.exists) {
              $("h3", self.uploadExistsDialog).text(
                _.sprintf(gettext("File already exists: %(name)s"), {
                  name: file.name,
                }),
              );
              $("input", self.uploadExistsDialog).val("").prop("placeholder", response.suggestion);
              $("a.upload-rename", self.uploadExistsDialog)
                .prop("disabled", false)
                .off("click")
                .on("click", function () {
                  var newName = $("input", self.uploadExistsDialog).val();
                  if (newName === "") newName = response.suggestion;

                  OctoPrint.plugins.klipper
                    .exists(self.klipperViewModel.storageLocation, path, newName)
                    .done(function (r) {
                      if (r.exists) {
                        $(".control-group", self.uploadExistsDialog).addClass("error");
                        $(".help-block", self.uploadExistsDialog).show();
                      } else {
                        $(".control-group", self.uploadExistsDialog).removeClass("error");
                        $(".help-block", self.uploadExistsDialog).hide();

                        self.uploadExistsDialog.modal("hide");

                        formData.filename = newName;
                        formData.noOverwrite = true;
                        data.formData = formData;

                        data.submit();
                      }
                    });
                });
              $("a.upload-overwrite", self.uploadExistsDialog)
                .off("click")
                .on("click", function () {
                  self.uploadExistsDialog.modal("hide");
                  data.formData = formData;
                  data.submit();
                });
              self.uploadExistsDialog.modal("show");
            } else {
              data.formData = formData;
              self.uploadingFile(true);
              data.submit();
            }
          });
      } else {
        data.formData = formData;
        data.submit();
      }
    };

    self._handleUploadStart = function (e, data) {
      self.ignoreUpdatedFilesEvent = true;
      return true;
    };

    self._handleUploadDone = function (e, data) {
      self._setProgressBar(100, gettext("Refreshing list ..."), true);

      var focus = undefined;
      focus = { location: self.klipperViewModel.storageLocation, path: data.result.files.klipper_configs.path };

      self.requestData({ focus: focus }).done(function () {
        if (data.result.done) {
          self.uploadingFile(false);
          self._setProgressBar(0, "", false);
        }
      });
    };

    self._handleUploadFail = function (e, data) {
      var extensions = _.map(SUPPORTED_EXTENSIONS, function (extension) {
        return extension.toLowerCase();
      }).sort();
      extensions = extensions.join(", ");
      var error =
        "<p>" +
        _.sprintf(
          gettext(
            "Could not upload the file. Make sure that it is a readable, valid file with one of these extensions: %(extensions)s",
          ),
          { extensions: _.escape(extensions) },
        ) +
        "</p>";
      if (data.jqXHR.responseText) {
        error += pnotifyAdditionalInfo("<pre>" + _.escape(data.jqXHR.responseText) + "</pre>");
      }
      new PNotify({
        title: "Upload failed",
        text: error,
        type: "error",
        hide: false,
      });
      self.uploadingFile(false);
      self._setProgressBar(0, "", false);
    };

    self._handleUploadAlways = function (e, data) {
      self.ignoreUpdatedFilesEvent = false;
    };

    self._handleUploadProgress = function (e, data) {
      var progress = parseInt((data.loaded / data.total) * 100, 10);
      var uploaded = progress >= 100;

      self._setProgressBar(progress, uploaded ? gettext("Saving ...") : gettext("Uploading ..."), uploaded);
    };

    self.onDataUpdaterPluginMessage = function (plugin, data) {
      if (plugin == "klipper" && data.type == "reload" && data.subtype == "configlist") {
        self.klipperViewModel.consoleMessage("debug", "onDataUpdaterPluginMessage klipper reload configlist");
        self.requestData();
      }
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperFilesViewModel,
    dependencies: [
      "settingsViewModel",
      "klipperViewModel",
      "accessViewModel",
      "loginStateViewModel",
      "printerStateViewModel",
    ],
    elements: [],
  });
});
