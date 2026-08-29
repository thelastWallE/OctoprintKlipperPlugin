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
  function KlipperBackupViewModel(parameters) {
    var self = this;

    self.loginState = parameters[0];
    self.klipperViewModel = parameters[1];
    self.access = parameters[2];

    self.markedForFileRestore = ko.observableArray([]);

    self.cfgContent = ko.observable();

    //uploads
    self.maxUploadSize = ko.observable(0);
    self.backupUploadData = undefined;
    self.backupUploadName = ko.observable();
    self.isAboveUploadSize = function (data) {
      return data.size > self.maxUploadSize();
    };

    self.onStartupComplete = function () {
      $("#klipper_backups_dialog").css("display", "none");
      if (self.loginState.loggedIn()) {
        self.listBakFiles();
      }
    };

    // initialize list helper
    self.backups = new ItemListHelper(
      "plugin.OctoKlipper.klipperBakFiles",
      {
        name: function (a, b) {
          // sorts ascending
          if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
          if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
          return 0;
        },
        date: function (a, b) {
          // sorts descending
          if (a["mdate"] > b["mdate"]) return -1;
          if (a["mdate"] < b["mdate"]) return 1;
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
      5,
    );

    self.listBakFiles = function () {
      self.klipperViewModel.consoleMessage("debug", "listBakFiles");

      OctoPrint.plugins.klipper
        .listCfgBak()
        .done(function (response) {
          if (response.status == "success") {
            for (file in response.data.files) {
              response.data.files[file].size =
                "(" + (parseInt(response.data.files[file].bytes) / 1024).toFixed(2) + " KB)";
              // old from backend: size=" ({:.1f} KB)".format(filesize / 1000.0),
            }
            self.backups.updateItems(response.data.files);
            self.backups.resetPage();
          } else {
            self.klipperViewModel.consoleMessage("error", "listBakFiles failed");
            self.klipperViewModel.consoleMessage("error", response.error.message);
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "listBakFiles failed");
          self.klipperViewModel.consoleMessage("error", response.responseText);
        });
    };

    self.showCfg = function (backup) {
      if (!self.loginState.hasPermission(self.access.permissions.PLUGIN_KLIPPER_CONFIG)) return;

      OctoPrint.plugins.klipper
        .getCfgBak(backup)
        .done(function (response) {
          if (response.status == "error") {
            self.klipperViewModel.consoleMessage("error", response.error.message);
            var html =
              "<p>" +
              _.sprintf(
                gettext("Failed to retrieve config %(name)s.</p><p>Please consult octoprint.log for details.</p>"),
                { name: _.escape(backup) },
              );
            html += pnotifyAdditionalInfo('<pre style="overflow: auto">' + _.escape(response.error.message) + "</pre>");
            new PNotify({
              title: gettext("Could not retrieve config"),
              text: html,
              type: "error",
              hide: false,
            });
            return;
          }
          $("#klipper_backups_dialog textarea").attr("rows", response.data.body.content.split(/\r\n|\r|\n/).length);
          self.cfgContent(response.data.body.content);
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage("error", "Error getting backup: " + backup);
          var html =
            "<p>" +
            _.sprintf(
              gettext("Failed to retrieve config %(name)s.</p><p>Please consult octoprint.log for details.</p>"),
              { name: _.escape(backup) },
            );
          html += pnotifyAdditionalInfo('<pre style="overflow: auto">' + _.escape(response.responseText) + "</pre>");
          new PNotify({
            title: gettext("Could not retrieve config"),
            text: html,
            type: "error",
            hide: false,
          });
        });
    };

    self.removeCfg = function (backup) {
      if (!self.loginState.hasPermission(self.access.permissions.PLUGIN_KLIPPER_CONFIG)) return;

      var perform = function () {
        OctoPrint.plugins.klipper
          .deleteBackup(backup)
          .done(function (response) {
            if (response.status == "error") {
              self.klipperViewModel.consoleMessage("error", response.error.message);
              var html =
                "<p>" +
                _.sprintf(
                  gettext("Failed to remove config %(name)s.</p><p>Please consult octoprint.log for details.</p>"),
                  { name: _.escape(backup) },
                );
              html += pnotifyAdditionalInfo(
                '<pre style="overflow: auto">' + _.escape(response.error.message) + "</pre>",
              );
              new PNotify({
                title: gettext("Could not remove config"),
                text: html,
                type: "error",
                hide: false,
              });
              return;
            }
            self.listBakFiles();
          })
          .fail(function (response) {
            var html =
              "<p>" +
              _.sprintf(
                gettext("Failed to remove config %(name)s.</p><p>Please consult octoprint.log for details.</p>"),
                { name: _.escape(backup) },
              );
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
        _.sprintf(gettext('You are about to delete backed up config file "%(name)s".'), {
          name: _.escape(backup),
        }),
        perform,
      );
    };

    self.restoreBak = function (backup) {
      if (!self.loginState.hasPermission(self.access.permissions.PLUGIN_KLIPPER_CONFIG)) return;

      var restore = function () {
        OctoPrint.plugins.klipper
          .restoreBackup(backup)
          .done(function (response) {
            if (response.status == "error") {
              self.klipperViewModel.consoleMessage("error", response.error.message);
              var html =
                "<p>" +
                _.sprintf(
                  gettext("Failed to restore config %(name)s.</p><p>Please consult octoprint.log for details.</p>"),
                  { name: _.escape(backup) },
                );
              html += pnotifyAdditionalInfo(
                '<pre style="overflow: auto">' + _.escape(response.error.message) + "</pre>",
              );
              new PNotify({
                title: gettext("Could not restore config"),
                text: html,
                type: "error",
                hide: false,
              });
              return;
            } else if (response.status == "success") {
              self.klipperViewModel.showPopUp("success", gettext("Restore Config"), gettext("Config restored."));
            }
            self.klipperViewModel.consoleMessage("debug", "restoreCfg: " + backup + " / " + response.status);
          })
          .fail(function (response) {
            var html =
              "<p>" +
              _.sprintf(
                gettext("Failed to restore config %(name)s.</p><p>Please consult octoprint.log for details.</p>"),
                { name: _.escape(backup) },
              );
            html += pnotifyAdditionalInfo('<pre style="overflow: auto">' + _.escape(response.responseText) + "</pre>");
            new PNotify({
              title: gettext("Could not restore config"),
              text: html,
              type: "error",
              hide: false,
            });
          });
      };

      var html =
        "<p>" +
        gettext("This will overwrite any file with the same name on the configpath.") +
        "</p>" +
        "<p>" +
        backup +
        "</p>";

      showConfirmationDialog({
        title: gettext("Are you sure you want to restore now?"),
        html: html,
        proceed: gettext("Proceed"),
        onproceed: restore,
      });
    };

    self.markFilesOnPage = function () {
      self.markedForFileRestore(
        _.uniq(self.markedForFileRestore().concat(_.map(self.backups.paginatedItems(), "file"))),
      );
    };

    self.markAllFiles = function () {
      self.markedForFileRestore(_.map(self.backups.allItems, "file"));
    };

    self.clearMarkedFiles = function () {
      self.markedForFileRestore.removeAll();
    };

    self.restoreMarkedFiles = function () {
      var perform = function () {
        self._bulkRestore(self.markedForFileRestore()).done(function () {
          self.markedForFileRestore.removeAll();
        });
      };

      showConfirmationDialog(
        _.sprintf(gettext("You are about to restore %(count)d backed up config files."), {
          count: self.markedForFileRestore().length,
        }),
        perform,
      );
    };

    self.removeMarkedFiles = function () {
      var perform = function () {
        self._bulkRemove(self.markedForFileRestore()).done(function () {
          self.markedForFileRestore.removeAll();
        });
      };

      showConfirmationDialog(
        _.sprintf(gettext("You are about to delete %(count)d backed up config files."), {
          count: self.markedForFileRestore().length,
        }),
        perform,
      );
    };

    self._bulkRestore = function (files) {
      var title, message, handler;

      title = gettext("Restoring klipper config files");
      self.klipperViewModel.consoleMessage("debug", title);
      message = _.sprintf(gettext("Restoring %(count)d backed up config files..."), {
        count: files.length,
      });

      handler = function (filename) {
        return OctoPrint.plugins.klipper
          .restoreBackup(filename)
          .done(function (response) {
            if (response.status == "error") {
              self.klipperViewModel.consoleMessage("debug", "restoreCfg: " + filename + " / " + response.error.message);
              deferred.notify(
                _.sprintf(gettext("Restoring of %(filename)s failed, continuing..."), { filename: _.escape(filename) }),
                false,
              );
              return;
            }

            deferred.notify(
              _.sprintf(gettext("Restored %(filename)s..."), {
                filename: _.escape(filename),
              }),
              true,
            );
            self.klipperViewModel.consoleMessage("debug", "restoreCfg: " + filename + " / " + response.restored);
            self.markedForFileRestore.remove(function (item) {
              return item.name == filename;
            });
          })
          .fail(function (response) {
            self.klipperViewModel.consoleMessage(
              "debug",
              "restoreCfg: " + filename + " / " + _.escape(response.responseText),
            );
            deferred.notify(
              _.sprintf(gettext("Restoring of %(filename)s failed, continuing..."), { filename: _.escape(filename) }),
              false,
            );
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
      });

      return promise;
    };

    self._bulkRemove = function (files) {
      var title, message, handler;

      title = gettext("Deleting backup files");
      message = _.sprintf(gettext("Deleting %(count)d backed up files..."), {
        count: files.length,
      });

      handler = function (filename) {
        return OctoPrint.plugins.klipper
          .deleteBackup(filename)
          .done(function (response) {
            if (response.status == "error") {
              deferred.notify(
                _.sprintf(gettext("Deleting of %(filename)s failed, continuing..."), { filename: _.escape(filename) }),
                false,
              );
              return;
            }
            deferred.notify(_.sprintf(gettext("Deleted %(filename)s..."), { filename: _.escape(filename) }), true);
            self.markedForFileRestore.remove(function (item) {
              return item.name == filename;
            });
          })
          .fail(function () {
            deferred.notify(
              _.sprintf(gettext("Deleting of %(filename)s failed, continuing..."), { filename: _.escape(filename) }),
              false,
            );
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
        self.listBakFiles();
      });

      return promise;
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperBackupViewModel,
    dependencies: ["loginStateViewModel", "klipperViewModel", "accessViewModel"],
    elements: ["#klipper_backups_dialog"],
  });
});
