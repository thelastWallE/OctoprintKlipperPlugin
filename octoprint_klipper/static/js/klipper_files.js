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
        self.klipperEditorViewModel = parameters[2];

        self.header = OctoPrint.getRequestHeaders({
            "content-type": "application/json",
            "cache-control": "no-cache",
        });

        self.markedForFileRemove = ko.observableArray([]);
        self.PathToConfigs = ko.observable("");

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
                self.freeSpace() < self.settings.server_diskspace_warning()
            );
        });
        self.diskusageCritical = ko.pureComputed(function () {
            return (
                self.freeSpace() !== undefined &&
                self.freeSpace() < self.settings.server_diskspace_critical()
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

        self.searchQuery = ko.observable(undefined);
        self.searchQuery.subscribe(function () {
            self.performSearch();
        });

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
                self.klipperViewModel.hasRight("CONFIG") &&
                self.addFolderName() &&
                self.addFolderName().trim() !== "" &&
                !self.addingFolder()
            );
        });

        self.listElement = undefined;

        self.uploadExistsDialog = undefined;
        self.uploadFilename = ko.observable(undefined);

        self.allItems = ko.observable(undefined);
        self.currentPath = ko.observable("");
        self.uploadProgressText = ko.observable();
        self.uploadProgressPercentage = ko.observable();

        var optionsLocalStorageKey = "OctoKlipper.options";
        var defaultListStyle = "folders_files";
        self._toLocalStorage = function () {
            saveToLocalStorage(optionsLocalStorageKey, { configsListStyle: self.listStyle() });
        };

        self._fromLocalStorage = function () {
            var data = loadFromLocalStorage(optionsLocalStorageKey);
            if (data["configsListStyle"] !== undefined) {
                self.listStyle(data["configsListStyle"]);
            }
        };

        self.listStyle = ko.observable(defaultListStyle);
        self.listStyle.subscribe(self._toLocalStorage)

        var saveListStyleToLocalStorage = function () {
            if (initListStyleLocalStorage()) {
                localStorage[listStyleStorageKey] = self.listStyle();
            }
        };
        var loadListStyleFromLocalStorage = function () {
            if (initListStyleLocalStorage()) {
                self.listStyle(localStorage[listStyleStorageKey]);
            }
        };
        var initListStyleLocalStorage = function () {
            if (!Modernizr.localstorage) return false;

            if (localStorage[listStyleStorageKey] !== undefined) return true;

            localStorage[listStyleStorageKey] = defaultListStyle;
            return true;
        };

        self.listStyle = ko.observable(defaultListStyle);
        self.listStyle.subscribe(saveListStyleToLocalStorage);
        loadListStyleFromLocalStorage();



        var sortByName = function (a, b) {
            // sorts ascending
            if (a["display"].toLowerCase() < b["display"].toLowerCase()) return -1;
            if (a["display"].toLowerCase() > b["display"].toLowerCase()) return 1;
            return 0;
        };

        $(document).on('shown.bs.modal', '#klipper_editor', function () {
            self.klipperEditorViewModel.onShown();
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

        self.highlightCurrentFilename = function () {
            self.highlightFilename(self.printerState.filepath());
        };

        self.highlightFilename = function (filename) {
            if (filename === undefined || filename === null) {
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

        // initialize list helper
        self.configs = new ItemListHelper(
            "klipperCfgFiles",
            {
                name: sortByName,
                date: function (a, b) {
                    // sorts descending
                    if (b["date"] === undefined || a["date"] > b["date"]) return -1;
                    if (a["date"] === undefined || a["date"] < b["date"]) return 1;
                    return 0;
                },
                size: function (a, b) {
                    // sorts descending
                    if (b["size"] === undefined || a["size"] > b["size"]) return -1;
                    if (a["size"] === undefined || a["size"] < b["size"]) return 1;
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
            self.listCfgFiles();
            self._fromLocalStorage();
            self.loadBaseConfig();
        };

        self._otherRequestInProgress = undefined;
        self._focus = undefined;
        self._switchToPath = undefined;
        self.requestData = function (params) {
            if (!self.klipperViewModel.hasRight("CONFIG")) return;

            var focus, switchToPath, force;

            focus = params.focus;
            switchToPath = params.switchToPath;
            force = params.force;

            self._focus = self._focus || focus;
            self._switchToPath = self._switchToPath || switchToPath;

            if (self._otherRequestInProgress !== undefined) {
                return self._otherRequestInProgress;
            }

            return (self._otherRequestInProgress = OctoPrint.plugins.klipper
                .list(true, force)
                .done(function (response) {
                    self.fromResponse(response, {
                        focus: self._focus,
                        switchToPath: self._switchToPath
                    });
                })
                .fail(function () {
                    self.allItems(undefined);
                    self.configs.updateItems([]);
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

            focus = params.focus || undefined;
            switchToPath = params.switchToPath || undefined;

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
            self.configs.updateItems(data.children);
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
                self.configs.updateItems(element.children);
            } else {
                self.currentPath("");
                self.configs.updateItems(self.allItems());
            }
            self.highlightCurrentFilename();
        };

        self.addFolder = function () {
            if (!self.klipperViewModel.hasRight("CONFIG")) return;

            var name = self.addFolderName();

            // "local" only for now since we only support local and sdcard,
            // and sdcard doesn't support creating folders...
            var location = "local";

            self.ignoreUpdatedFilesEvent = true;
            self.addingFolder(true);
            OctoPrint.plugins.klipper
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
            if (!self.klipperViewModel.hasRight("CONFIG")) return;

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
                !self.klipperViewModel.hasAllPerms(
                    "CONFIG"
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
            if (!self.klipperViewModel.hasRight("CONFIG")) return;

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
            return OctoPrint.plugins.klipper
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
            OctoPrint.plugins.klipper
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

        self.getEntryElement = function (data) {
            var entryId = self.getEntryId(data);
            var entryElements = $("#" + entryId);
            if (entryElements && entryElements[0]) {
                return entryElements[0];
            } else {
                return undefined;
            }
        };

        self.enableRemove = function (data) {
            if (_.contains(self.activeRemovals(), data.origin + ":" + data.path)) {
                return false;
            }

            return (
                self.klipperViewModel.hasRight("CONFIG")
            );
        };

        self.enableMove = function (data) {
            return (
                self.klipperViewModel.hasAllPerms(
                    "CONFIG"
                ) && data.origin === "local"
            ); // && some way to figure out if there are subfolders;
        };

        self.enableSelect = function (data) {
            return (
                self.isLoadAndPrintActionPossible() && !self.configs.isSelected(data)
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
            if (self.klipperViewModel.hasRight("CONFIG")) {
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
            $(".accordion-toggle[data-target='#klipperconfig_files']").click(function () {
                var files = $("#klipperconfig_files");
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

            self.listElement = $("#klipperconfig_files").find(".scroll-wrapper");

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

            //~~ Gcode upload

            self.uploadButton = $("#config_upload");
            self.uploadSdButton = $("#config_upload_sd");
            if (!self.uploadSdButton.length) {
                self.uploadSdButton = undefined;
            }

            self.uploadProgress = $("#config_upload_progress");
            self.uploadProgressBar = $(".bar", self.uploadProgress);

        };

        self.onServerConnect = self.onServerReconnect = function (payload) {
            self.requestData();
        };

        /* self.listCfgFiles = function () {
          self.klipperViewModel.consoleMessage("debug", "listCfgFiles started");
    
          OctoPrint.plugins.klipper.listCfg().done(function (response) {
            self.klipperViewModel.consoleMessage("debug", "listCfgFiles done");
            self.configs.updateItems(response.files);
            self.PathToConfigs(gettext("Path: ") + response.path);
            self.configs.resetPage();
          });
        }; */

        self.loadBaseConfig = function () {
            if (!self.klipperViewModel.hasRight("CONFIG")) return;

            var baseconfig = self.settings.settings.plugins.klipper.configuration.baseconfig();
            if (baseconfig != "") {
                self.klipperViewModel.consoleMessage("debug", "loadBaseConfig:" + baseconfig);
                OctoPrint.plugins.klipper.getCfg(baseconfig).done(function (response) {
                    var config = {
                        content: response.response.config,
                        file: baseconfig,
                    };
                    self.klipperEditorViewModel.process(config).then();
                });

                /* self.removeCfg = function (config) {
                  if (!self.klipperViewModel.hasRight("CONFIG")) return;
            
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
                }; */

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
                            self.listCfgFiles();
                            self.loadBaseConfig();
                        };

                        self.listCfgFiles = function () {
                            self.klipperViewModel.consoleMessage("debug", "listCfgFiles started");

                            OctoPrint.plugins.klipper.listCfg().done(function (response) {
                                self.klipperViewModel.consoleMessage("debug", "listCfgFiles done");
                                self.configs.updateItems(response.files);
                                self.PathToConfigs(gettext("Path: ") + response.path);
                                self.configs.resetPage();
                            });
                        };

                        self.loadBaseConfig = function () {
                            if (!self.klipperViewModel.hasRight("CONFIG")) return;

                            var baseconfig = self.settings.settings.plugins.klipper.configuration.baseconfig();
                            if (baseconfig != "") {
                                self.klipperViewModel.consoleMessage("debug", "loadBaseConfig:" + baseconfig);
                                OctoPrint.plugins.klipper.getCfg(baseconfig).done(function (response) {
                                    var config = {
                                        content: response.response.config,
                                        file: baseconfig,
                                    };
                                    self.klipperEditorViewModel.process(config).then();
                                });
                            }
                        };

                        self.removeCfg = function (config) {
                            if (!self.klipperViewModel.hasRight("CONFIG")) return;

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


                        self.newFile = function () {
                            if (!self.klipperViewModel.hasRight("CONFIG")) return;
                            var config = {
                                content: "",
                                file: "Change Filename",
                            };
                            self.klipperEditorViewModel.process(config).then(
                                function () { self.klipperViewModel.showEditorDialog(); }
                            );
                        };

                        self.openConfig = function (file) {
                            if (!self.klipperViewModel.hasRight("CONFIG")) return;

                            OctoPrint.plugins.klipper.getCfg(file).done(function (response) {
                                var config = {
                                    content: response.response.config,
                                    file: file,
                                };
                                self.klipperEditorViewModel.process(config).then(
                                    function () { self.klipperViewModel.showEditorDialog(); }
                                );
                            });
                        };

                        self.onDataUpdaterPluginMessage = function (plugin, data) {
                            if (plugin == "klipper" && data.type == "reload" && data.subtype == "configlist") {
                                self.klipperViewModel.consoleMessage("debug", "onDataUpdaterPluginMessage klipper reload configlist");
                                self.listCfgFiles();
                            }
                        };
                    }

                    OCTOPRINT_VIEWMODELS.push({
                        construct: KlipperFilesViewModel,
                        dependencies: [
                            "settingsViewModel",
                            "klipperViewModel",
                            "klipperEditorViewModel"
                        ],
                        elements: ["#klipper_files_dialog"],
                    });
                });
