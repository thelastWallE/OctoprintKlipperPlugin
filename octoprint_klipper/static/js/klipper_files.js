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

    self.searchQuery = ko.observable(undefined);
    self.searchQuery.subscribe(function () {
      self.performSearch();
    });

    self.freeSpace = ko.observable(undefined);
    self.totalSpace = ko.observable(undefined);
    self.freeSpaceString = ko.pureComputed(function () {
      if (!self.freeSpace()) return "-";
      return formatSize(self.freeSpace());
    });
    self.totalSpaceString = ko.pureComputed(function () {
      if (!self.totalSpace()) return "-";
      return formatSize(self.totalSpace());
    });

    self.diskusageWarning = ko.pureComputed(function () {
      return (
        self.freeSpace() !== undefined &&
        self.freeSpace() < self.settingsViewModel.server_diskspace_warning()
      );
    });
    self.diskusageCritical = ko.pureComputed(function () {
      return (
        self.freeSpace() !== undefined &&
        self.freeSpace() < self.settingsViewModel.server_diskspace_critical()
      );
    });
    self.diskusageString = ko.pureComputed(function () {
      if (self.diskusageCritical()) {
        return gettext("Your available free disk space is critically low.");
      } else if (self.diskusageWarning()) {
        return gettext("Your available free disk space is starting to run low.");
      } else {
        return gettext("Your current disk usage.");
      }
    });

    self.uploadButton = undefined;
    self.uploadSdButton = undefined;
    self.uploadProgressBar = undefined;
    self.localTarget = undefined;
    self.sdTarget = undefined;

    self.dropOverlay = undefined;
    self.dropZone = undefined;
    self.dropZoneLocal = undefined;
    self.dropZoneSd = undefined;
    self.dropZoneBackground = undefined;
    self.dropZoneLocalBackground = undefined;
    self.dropZoneSdBackground = undefined;
    self.listElement = undefined;

    self.ignoreUpdatedFilesEvent = false;

    self.addingFolder = ko.observable(false);
    self.activeRemovals = ko.observableArray([]);

    self.movingFileOrFolder = ko.observable(false);
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

    self.uploadExistsDialog = undefined;
    self.uploadFilename = ko.observable(undefined);

    self.allItems = ko.observable(undefined);
    self.currentPath = ko.observable("");
    self.uploadProgressText = ko.observable();
    self.uploadProgressPercentage = ko.observable();

    self._otherRequestInProgress = undefined;
    self._focus = undefined;
    self._switchToPath = undefined;

    self.requestData = function (params) {
      if (!self.loginState.hasPermission(self.access.permissions.FILES_LIST)) {
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

      return (self._otherRequestInProgress = OctoPrint.files
        .list(true, force)
        .done(function (response) {
          self.fromResponse(response, {
            focus: self._focus,
            switchToPath: self._switchToPath
          });
        })
        .fail(function () {
          self.allItems(undefined);
          self.listHelper.updateItems([]);
        })
        .always(function () {
          self._otherRequestInProgress = undefined;
          self._focus = undefined;
          self._switchToPath = undefined;
        }));
    };

    self.fromResponse = function (response, params) {
      var focus = undefined;
      var switchToPath;

      if (_.isObject(params)) {
        focus = params.focus || undefined;
        switchToPath = params.switchToPath || undefined;
      } else if (arguments.length > 1) {
        log.warn(
          "FilesViewModel.requestData called with old argument list. That is deprecated, please use parameter object instead."
        );
        if (arguments.length > 2) {
          focus = { location: arguments[2], path: arguments[1] };
        } else {
          focus = { location: "local", path: arguments[1] };
        }
        if (arguments.length > 3) {
          switchToPath = arguments[3] || undefined;
        }
      }

      var files = response.files;

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

      // Sanity check file list - see #2572
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
          "swallow up query parameters, see https://github.com/OctoPrint/OctoPrint/issues/2572"
        );
      }

      if (!switchToPath) {
        var currentPath = self.currentPath();
        if (currentPath === undefined) {
          self.listHelper.updateItems(files);
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
          origin: focus.location
        });
        if (entryElement) {
          // scroll to uploaded element
          self.listElement.scrollTop(entryElement.offsetTop);

          // highlight uploaded element
          var element = $(entryElement);
          element.on(
            "webkitAnimationEnd oanimationend msAnimationEnd animationend",
            function (e) {
              // remove highlight class again
              element.removeClass("highlight");
            }
          );
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

    self.changeFolder = function (data) {
      if (data.children === undefined) {
        log.error(
          "Can't switch to folder '" + data.path + "', no children available"
        );
        return;
      }

      self.currentPath(data.path);
      self.listHelper.updateItems(data.children);
      self.highlightCurrentFilename();
    };

    self.navigateUp = function () {
      var path = self.currentPath().split("/");
      path.pop();
      self.changeFolderByPath(path.join("/"));
    };

    self.changeFolderByPath = function (path) {
      var element = self.elementByPath(path);
      if (element) {
        self.currentPath(path);
        self.listHelper.updateItems(element.children);
      } else {
        self.currentPath("");
        self.listHelper.updateItems(self.allItems());
      }
      self.highlightCurrentFilename();
    };

    self.showAddFolderDialog = function () {
      if (!self.loginState.hasPermission(self.access.permissions.FILES_UPLOAD))
        return;

      if (self.addFolderDialog) {
        self.addFolderName("");
        self.addFolderDialog.modal("show");
      }
    };

    self.addFolder = function () {
      if (!self.loginState.hasPermission(self.access.permissions.FILES_UPLOAD))
        return;

      var name = self.addFolderName();

      // "local" only for now since we only support local and sdcard,
      // and sdcard doesn't support creating folders...
      var location = "local";

      self.ignoreUpdatedFilesEvent = true;
      self.addingFolder(true);
      OctoPrint.files
        .createFolder(location, name, self.currentPath())
        .done(function (data) {
          self.requestData({
            focus: {
              path: data.folder.name,
              location: data.folder.origin
            }
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
      if (!self.loginState.hasPermission(self.access.permissions.FILES_DELETE))
        return;

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
            gettext(
              'You are about to delete the folder "%(folder)s" which still contains files and/or sub folders.'
            ),
            { folder: _.escape(folder.name) }
          ),
          onproceed: function () {
            self._removeEntry(folder, event);
          }
        };
        showConfirmationDialog(options);
      } else {
        self._removeEntry(folder, event);
      }
    };

    self.showMoveDialog = function (entry, event) {
      if (
        !self.loginState.hasAllPermissions(
          self.access.permissions.FILES_UPLOAD,
          self.access.permissions.FILES_DELETE
        )
      ) {
        return;
      }

      if (!entry) {
        return;
      }

      if (entry.origin !== "local") {
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
      if (!self.loginState.hasPermission(self.access.permissions.FILES_DELETE))
        return;

      if (!file) {
        return;
      }

      if (file.type === "folder") {
        return;
      }

      self._removeEntry(file, event);
    };

    self.moveFileOrFolder = function (source, destination) {
      self.movingFileOrFolder(true);
      return OctoPrint.files
        .move("local", source, destination)
        .done(function () {
          self.requestData()
            .done(function () {
              self.moveDialog.modal("hide");
            })
            .always(function () {
              self.movingFileOrFolder(false);
            });
        })
        .fail(function () {
          self.moveError(
            gettext("Unable to move file or folder") +
            " " +
            self.moveEntry().display +
            " " +
            gettext("to") +
            " " +
            self.moveDestination()
          );
          self.movingFileOrFolder(false);
        });
    };

    self._removeEntry = function (entry, event) {
      self.activeRemovals.push(entry.origin + ":" + entry.path);
      var finishActiveRemoval = function () {
        self.activeRemovals(
          _.filter(self.activeRemovals(), function (e) {
            return e !== entry.origin + ":" + entry.path;
          })
        );
      };

      var activateSpinner = function () { },
        finishSpinner = function () { };

      if (event) {
        var element = $(event.currentTarget);
        if (element.length) {
          var icon = $("i.fa-trash-alt", element);
          if (icon.length) {
            activateSpinner = function () {
              icon.removeClass("fa-trash-alt").addClass(
                "fa-spinner fa-spin"
              );
            };
            finishSpinner = function () {
              icon.removeClass("fa-spinner fa-spin").addClass(
                "fa-trash-alt"
              );
            };
          }
        }
      }

      activateSpinner();

      var deferred = $.Deferred();
      OctoPrint.files
        .delete(entry.origin, entry.path)
        .done(function () {
          self.requestData()
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
      if (_.contains(self.activeRemovals(), data.origin + ":" + data.path)) {
        return false;
      }

      var busy = false;
      if (data.type === "folder") {
        busy = _.any(self.printerState.busyFiles(), function (name) {
          return _.startsWith(name, data.origin + ":" + data.path + "/");
        });
      } else {
        busy = _.contains(
          self.printerState.busyFiles(),
          data.origin + ":" + data.path
        );
      }
      return (
        self.loginState.hasPermission(self.access.permissions.FILES_DELETE) &&
        !busy
      );
    };

    self.enableMove = function (data) {
      return (
        self.loginState.hasAllPermissions(
          self.access.permissions.FILES_UPLOAD,
          self.access.permissions.FILES_DELETE
        ) && data.origin === "local"
      ); // && some way to figure out if there are subfolders;
    };
    self.enableSelect = function (data) {
      return (
        self.isLoadAndPrintActionPossible() && !self.listHelper.isSelected(data)
      );
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
            (entry["display"] &&
              entry["display"].toLocaleLowerCase().indexOf(query) > -1) ||
            entry["name"].toLocaleLowerCase().indexOf(query) > -1;
          if (!success && entry["type"] === "folder" && entry["children"]) {
            return _.any(entry["children"], recursiveSearch);
          }

          return success;
        };

        self.listHelper.changeSearchFunction(recursiveSearch);
      } else {
        self.listHelper.resetSearch();
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
        if (self.uploadSdButton) {
          self.uploadSdButton.fileupload("enable");
        }
      } else {
        self.uploadButton.fileupload("disable");
        if (self.uploadSdButton) {
          self.uploadSdButton.fileupload("disable");
        }
      }
    };

    self.onUserPermissionsChanged = self.onUserLoggedIn = self.onUserLoggedOut = function () {
      self.updateButtons();
      self.requestData();
    };

    self.onStartup = function () {
      $(".accordion-toggle[data-target='#files']").click(function () {
        var files = $("#files");
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

      self.listElement = $("#files").find(".scroll-wrapper");

      self.moveDialog = $("#move_file_or_folder_dialog");
      self.addFolderDialog = $("#add_folder_dialog");
      self.addFolderDialog.on("shown", function () {
        $("input", self.addFolderDialog).focus();
      });
      $("form", self.addFolderDialog).on("submit", function (e) {
        e.preventDefault();
        if (self.enableAddFolder()) {
          self.addFolder();
        }
      });

      self.uploadExistsDialog = $("#upload_exists_dialog");

      //~~ Gcode upload

      self.uploadButton = $("#gcode_upload");
      self.uploadSdButton = $("#gcode_upload_sd");
      if (!self.uploadSdButton.length) {
        self.uploadSdButton = undefined;
      }

      self.uploadProgress = $("#gcode_upload_progress");
      self.uploadProgressBar = $(".bar", self.uploadProgress);

      self.dropOverlay = $("#drop_overlay");
      self.dropZone = $("#drop");
      self.dropZoneLocal = $("#drop_locally");
      self.dropZoneSd = $("#drop_sd");
      self.dropZoneBackground = $("#drop_background");
      self.dropZoneLocalBackground = $("#drop_locally_background");
      self.dropZoneSdBackground = $("#drop_sd_background");

      if (CONFIG_SD_SUPPORT) {
        self.localTarget = self.dropZoneLocal;
      } else {
        self.localTarget = self.dropZone;
        self.listHelper.removeFilter("sd");
      }
      self.sdTarget = self.dropZoneSd;

      self.dropOverlay.on("drop", self._forceEndDragNDrop);

      function evaluateDropzones() {
        var enableLocal = self.loginState.hasPermission(
          self.access.permissions.FILES_UPLOAD
        );
        var enableSd =
          enableLocal &&
          CONFIG_SD_SUPPORT &&
          self.printerState.isSdReady() &&
          !self.isPrinting();

        self._setDropzone("local", enableLocal);
        self._setDropzone("sdcard", enableSd);
      }
      self.loginState.currentUser.subscribe(evaluateDropzones);
      self.printerState.isSdReady.subscribe(evaluateDropzones);
      self.isPrinting.subscribe(evaluateDropzones);
      evaluateDropzones();
    };

    self.onEventUpdatedFiles = function (payload) {
      if (self.ignoreUpdatedFilesEvent) {
        return;
      }

      if (payload.type !== "printables") {
        return;
      }

      self.requestData();
    };

    self._setDropzone = function (dropzone, enable) {
      var button = dropzone === "local" ? self.uploadButton : self.uploadSdButton;
      var drop = dropzone === "local" ? self.localTarget : self.sdTarget;
      var url = API_BASEURL + "files/" + dropzone;

      if (button === undefined) return;

      button.fileupload({
        url: url,
        dataType: "json",
        dropZone: enable ? drop : null,
        drop: function (e, data) { },
        add: self._handleUploadAdd,
        submit: self._handleUploadStart,
        done: self._handleUploadDone,
        fail: self._handleUploadFail,
        always: self._handleUploadAlways,
        progressall: self._handleUploadProgress
      });
    };

    self._enableDragNDrop = function (enable) {
      if (enable) {
        $(document).bind("dragenter", self._handleDragEnter);
        $(document).bind("dragleave", self._handleDragLeave);
        log.debug("Enabled drag-n-drop");
      } else {
        $(document).unbind("dragenter", self._handleDragEnter);
        $(document).unbind("dragleave", self._handleDragLeave);
        log.debug("Disabled drag-n-drop");
      }
    };

    self._handleUploadAdd = function (e, data) {
      var file = data.files[0];
      var path = self.currentPath();

      var formData = {};
      if (path !== "") {
        formData.path = path;
      }

      if (self.settingsViewModel.feature_uploadOverwriteConfirmation()) {
        OctoPrint.files
          .exists("local", path, file.name)
          .done(function (response) {
            if (response.exists) {
              $("h3", self.uploadExistsDialog).text(
                _.sprintf(gettext("File already exists: %(name)s"), {
                  name: file.name
                })
              );
              $("input", self.uploadExistsDialog)
                .val("")
                .prop("placeholder", response.suggestion);
              $("a.upload-rename", self.uploadExistsDialog)
                .prop("disabled", false)
                .off("click")
                .on("click", function () {
                  var newName = $(
                    "input",
                    self.uploadExistsDialog
                  ).val();
                  if (newName === "") newName = response.suggestion;

                  OctoPrint.files
                    .exists("local", path, newName)
                    .done(function (r) {
                      if (r.exists) {
                        $(
                          ".control-group",
                          self.uploadExistsDialog
                        ).addClass("error");
                        $(
                          ".help-block",
                          self.uploadExistsDialog
                        ).show();
                      } else {
                        $(
                          ".control-group",
                          self.uploadExistsDialog
                        ).removeClass("error");
                        $(
                          ".help-block",
                          self.uploadExistsDialog
                        ).hide();

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
      if (data.result.files.hasOwnProperty("sdcard")) {
        focus = { location: "sdcard", path: data.result.files.sdcard.path };
      } else if (data.result.files.hasOwnProperty("local")) {
        focus = { location: "local", path: data.result.files.local.path };
      }
      self.requestData({ focus: focus }).done(function () {
        if (data.result.done) {
          self._setProgressBar(0, "", false);
        }
      });

      if (focus && _.endsWith(focus.path.toLowerCase(), ".stl")) {
        self.slicing.show(focus.location, focus.path);
      }
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
            "Could not upload the file. Make sure that it is a readable, valid file with one of these extensions: %(extensions)s"
          ),
          { extensions: _.escape(extensions) }
        ) +
        "</p>";
      if (data.jqXHR.responseText) {
        error += pnotifyAdditionalInfo(
          "<pre>" + _.escape(data.jqXHR.responseText) + "</pre>"
        );
      }
      new PNotify({
        title: "Upload failed",
        text: error,
        type: "error",
        hide: false
      });
      self._setProgressBar(0, "", false);
    };

    self._handleUploadAlways = function (e, data) {
      self.ignoreUpdatedFilesEvent = false;
    };

    self._handleUploadProgress = function (e, data) {
      var progress = parseInt((data.loaded / data.total) * 100, 10);
      var uploaded = progress >= 100;

      self._setProgressBar(
        progress,
        uploaded ? gettext("Saving ...") : gettext("Uploading ..."),
        uploaded
      );
    };

    self._dragNDropTarget = null;
    self._dragNDropFFTimeout = undefined;
    self._dragNDropFFTimeoutDelay = 100;
    self._forceEndDragNDrop = function () {
      self.dropOverlay.removeClass("in");
      if (self.dropZoneLocal) self.dropZoneLocalBackground.removeClass("hover");
      if (self.dropZoneSd) self.dropZoneSdBackground.removeClass("hover");
      if (self.dropZone) self.dropZoneBackground.removeClass("hover");
      self._dragNDropTarget = null;
    };

    self._handleDragLeave = function (e) {
      if (e.target !== self._dragNDropTarget) return;
      self._forceEndDragNDrop();
    };

    self._handleDragEnter = function (e) {
      self.dropOverlay.addClass("in");

      var foundLocal = false;
      var foundSd = false;
      var found = false;
      var node = e.target;
      do {
        if (self.dropZoneLocal && node === self.dropZoneLocal[0]) {
          foundLocal = true;
          break;
        } else if (self.dropZoneSd && node === self.dropZoneSd[0]) {
          foundSd = true;
          break;
        } else if (self.dropZone && node === self.dropZone[0]) {
          found = true;
          break;
        }
        node = node.parentNode;
      } while (node !== null);

      if (foundLocal) {
        self.dropZoneLocalBackground.addClass("hover");
        self.dropZoneSdBackground.removeClass("hover");
      } else if (foundSd && self.printerState.isSdReady() && !self.isPrinting()) {
        self.dropZoneSdBackground.addClass("hover");
        self.dropZoneLocalBackground.removeClass("hover");
      } else if (found) {
        self.dropZoneBackground.addClass("hover");
      } else {
        if (self.dropZoneLocalBackground)
          self.dropZoneLocalBackground.removeClass("hover");
        if (self.dropZoneSdBackground)
          self.dropZoneSdBackground.removeClass("hover");
        if (self.dropZoneBackground) self.dropZoneBackground.removeClass("hover");
      }
      self._dragNDropTarget = e.target;
      self._dragNDropLastOver = Date.now();
    };
    self.onEventSettingsUpdated = function () {
      self.showInternalFilename(
        self.settingsViewModel.settings.appearance.showInternalFilename()
      );
    };
    self.onBeforeBinding = function () {
      self.showInternalFilename(
        self.settingsViewModel.settings.appearance.showInternalFilename()
      );
    };
    self.onAllBound = function (allViewModels) {
      self.allViewModels = allViewModels;
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperFilesViewModel,
    dependencies: [
      "settingsViewModel",
      "loginStateViewModel",
      "connectionViewModel",
      "klipperViewModel",
      "accessViewModel",
    ],
    elements: [
      "#dialog_plugin_klipper_files",
      "#plugin_klipper_files_wrapper",
      "#plugin_klipper_add_folder_dialog",
      "#plugin_klipper_move_file_or_folder_dialog",
      "#plugin_klipper_upload_exists_dialog"
    ],
  });
});
