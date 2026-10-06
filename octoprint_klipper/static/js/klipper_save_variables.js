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
  function KlipperSaveVariablesViewModel(parameters) {
    var self = this;

    self.loginState = parameters[0];
    self.access = parameters[1];
    self.klipperViewModel = parameters[2];

    self.variables = ko.observableArray([]);
    self.configured = ko.observable(true);
    self.path = ko.observable("");
    self.exists = ko.observable(false);
    self.loading = ko.observable(false);
    self.loadError = ko.observable("");

    // Turn a parsed value back into editable literal-ish text.
    var toText = function (v) {
      if (v === null) return "None";
      if (typeof v === "boolean") return v ? "True" : "False";
      if (typeof v === "string") return v;
      if (Array.isArray(v) || typeof v === "object") return JSON.stringify(v);
      return String(v);
    };

    self.loadVariables = function () {
      self.loading(true);
      self.loadError("");
      OctoPrint.plugins.klipper
        .getSaveVariables()
        .done(function (response) {
          self.configured(response.configured !== false);
          self.path(response.path || "");
          self.exists(response.exists === true);
          var rows = _.map(response.variables || {}, function (value, name) {
            return {
              name: name,
              value: ko.observable(toText(value)),
              usedBy: (response.usedBy && response.usedBy[name]) || [],
              saving: ko.observable(false),
            };
          });
          rows.sort(function (a, b) {
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
          });
          self.variables(rows);
        })
        .fail(function () {
          self.loadError(gettext("Failed to load the save variables."));
        })
        .always(function () {
          self.loading(false);
        });
    };

    self.saveVariable = function (row) {
      if (!row.saving()) row.saving(true);
      self.klipperViewModel.consoleMessage("debug", "saveVariable: " + row.name);
      OctoPrint.plugins.klipper
        .saveVariable(row.name, row.value())
        .done(function (response) {
          if (response.status === "error") {
            self.klipperViewModel.showPopUp(
              "error",
              gettext("Save Variable"),
              response.data && response.data.message
                ? response.data.message
                : gettext("Could not save variable"),
            );
          } else {
            self.klipperViewModel.showPopUp(
              "success",
              gettext("Save Variable"),
              _.sprintf(gettext("Variable %(name)s saved."), { name: row.name }),
            );
            self.loadVariables();
          }
        })
        .fail(function (response) {
          self.klipperViewModel.consoleMessage(
            "error",
            "saveVariable failed: " + _.escape(response.responseText),
          );
          self.klipperViewModel.showPopUp("error", gettext("Save Variable"), gettext("Could not save variable"));
        })
        .always(function () {
          row.saving(false);
        });
    };

    self.onStartupComplete = function () {
      self.loadVariables();
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperSaveVariablesViewModel,
    dependencies: ["loginStateViewModel", "accessViewModel", "klipperViewModel"],
    elements: ["#klipper_save_variables_dialog"],
  });
});