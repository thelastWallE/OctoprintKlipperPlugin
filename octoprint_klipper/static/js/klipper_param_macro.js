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
  function KlipperMacroDialogViewModel(parameters) {
    var self = this;

    self.parameters = ko.observableArray();
    self.interpolatedCmd;
    self.macro;
    self.macroName = ko.observable();
    self.callerViewModel = undefined;

    var paramObjRegex = /{(.*?)}/g;
    var keyValueRegex = /(\w*)\s*:\s*([\w\s°"|\.]*)/g;

    self.process = function (macro, callerViewModel) {
      self.macro = macro.macro();
      self.macroName(macro.name());
      self.callerViewModel = callerViewModel;

      var matches = self.macro.match(paramObjRegex);
      var params = [];

      for (var i = 0; i < matches.length; i++) {
        var obj = {};
        var res = keyValueRegex.exec(matches[i]);

        while (res != null) {
          if ("options" == res[1]) {
            obj["options"] = res[2].trim().split("|");
          } else {
            obj[res[1]] = res[2].trim();
          }
          res = keyValueRegex.exec(matches[i]);
        }

        if (!("label" in obj)) {
          obj["label"] = "Input " + (i + 1);
        }

        if (!("unit" in obj)) {
          obj["unit"] = "";
        }

        if ("default" in obj) {
          obj["value"] = obj["default"];
        }

        params.push(obj);
      }
      self.parameters(params);
    };

    self.executeMacro = function () {
      var i = -1;

      function replaceParams(match) {
        i++;
        return self.parameters()[i]["value"];
      }
      // Use .split to create an array of strings which is sent to
      // OctoPrint.control.sendGcode instead of a single string.
      expanded = self.macro.replace(paramObjRegex, replaceParams);
      expanded = expanded.split(/\r\n|\r|\n/);
      self.callerViewModel.logMessage(null, null, gettext("Execute Macro: ") + self.macroName());
      OctoPrint.control.sendGcode(expanded);
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperMacroDialogViewModel,
    dependencies: [],
    elements: ["#klipper_macro_dialog"],
  });
});
