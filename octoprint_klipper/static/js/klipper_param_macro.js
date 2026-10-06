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
    // Value charset deliberately excludes "," (the entry separator) but
    // allows "-", "/", "+", "%" and "." so values like "my-value",
    // "path/to" or "190.5" parse correctly.
    var keyValueRegex = /(\w*)\s*:\s*([\w\s°"|\.\-/+%]*)/g;

    self.process = function (macro, callerViewModel) {
      self.macro = macro.macro();
      self.macroName(macro.name());
      self.callerViewModel = callerViewModel;
      self.isKlipperParams = false;

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

        // Always provide a value observable (defaulting to "") so the dialog
        // binding and the substitution below never hit a missing value.
        obj["value"] = ko.observable("default" in obj ? obj["default"] : "");

        params.push(obj);
      }
      self.parameters(params);
    };

    // Same as process(), but for macros parsed out of printer.cfg. Those are
    // plain objects ({name, gcode, has_params, source}) instead of the
    // observable-based settings macros.
    self.processKlipperMacro = function (macro, callerViewModel) {
      self.macro = macro.gcode;
      self.macroName(macro.name);
      self.callerViewModel = callerViewModel;
      self.isKlipperParams = false;

      // Klipper runtime parameters ({params.X}, {rawparams.X}, {input.X}) are
      // collected via the dialog and sent as MACRONAME X=value arguments. The
      // names come from the backend (klipper_params) — the single source of
      // truth for this detection, so the frontend no longer carries a second,
      // drifted regex.
      var klipperNames = (macro.klipper_params || []).slice();

      // Plugin placeholders ({label:..., default:..., options:...}) are
      // substituted into the gcode body before sending. Collect them too so a
      // macro that mixes both styles doesn't silently drop one set.
      var matches = self.macro.match(paramObjRegex) || [];
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
        if (!("label" in obj)) obj["label"] = "Input " + (i + 1);
        if (!("unit" in obj)) obj["unit"] = "";
        // Always provide a value observable so the dialog binding and the
        // substitution below never hit a missing value.
        obj["value"] = ko.observable("default" in obj ? obj["default"] : "");
        params.push(obj);
      }

      if (klipperNames.length) {
        self.isKlipperParams = true;
        // Klipper params first, then any plugin placeholders.
        var kparams = [];
        for (var i = 0; i < klipperNames.length; i++) {
          kparams.push({
            label: klipperNames[i],
            value: ko.observable(""),
            unit: "",
            klipperParam: klipperNames[i],
          });
        }
        self.parameters(kparams.concat(params));
        return;
      }

      self.parameters(params);
    };

    self.executeMacro = function () {
      if (self.isKlipperParams) {
        // Klipper runtime params: send the macro invocation with the collected
        // values as arguments, e.g. "SET_RETRACTIONLENGTH LENGTH=5". Klipper
        // then evaluates {params.LENGTH} in the macro body. Plugin placeholders
        // (no klipperParam) can't be combined with Klipper params in a single
        // printer.cfg macro, so they are shown in the dialog but not sent.
        var args = [];
        _.each(self.parameters(), function (p) {
          if (!p.klipperParam) return;
          var v = p.value();
          if (v !== undefined && v !== "") {
            args.push(p.klipperParam + "=" + v);
          }
        });
        var cmd = self.macroName();
        if (args.length) cmd += " " + args.join(" ");
        self.callerViewModel._sendGcode([cmd], self.macroName());
        return;
      }

      var i = -1;

      function replaceParams(match) {
        i++;
        return self.parameters()[i]["value"]();
      }
      // Use .split to create an array of strings which is sent to
      // OctoPrint.control.sendGcode instead of a single string.
      var expanded = self.macro.replace(paramObjRegex, replaceParams);
      expanded = expanded.split(/\r\n|\r|\n/);
      self.callerViewModel._sendGcode(expanded, self.macroName());
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperMacroDialogViewModel,
    dependencies: [],
    elements: ["#klipper_macro_dialog"],
  });
});
