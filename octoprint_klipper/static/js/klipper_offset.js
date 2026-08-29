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
  function KlipperOffsetDialogViewModel(parameters) {
    var self = this;

    self.klipperViewModel = parameters[0];

    self.offsetX = ko.observable();
    self.offsetY = ko.observable();
    self.offsetZ = ko.observable();
    self.adjust = ko.observable();

    self.onStartup = function () {
      self.offsetX(0);
      self.offsetY(0);
      self.offsetZ(0);
      self.adjust(false);
    };

    self.setOffset = function () {
      if (self.adjust()) {
        self.klipperViewModel.logMessage(
          "",
          "info",
          "SET_GCODE_OFFSET\n X_ADJUST=" +
            self.offsetX() +
            " Y_ADJUST=" +
            self.offsetY() +
            " Z_ADJUST=" +
            self.offsetZ()
        );
        OctoPrint.control.sendGcode(
          "SET_GCODE_OFFSET X_ADJUST=" + self.offsetX() + " Y_ADJUST=" + self.offsetY() + " Z_ADJUST=" + self.offsetZ()
        );
      } else {
        self.klipperViewModel.logMessage(
          "",
          "info",
          "SET_GCODE_OFFSET\n X=" + self.offsetX() + " Y=" + self.offsetY() + " Z=" + self.offsetZ()
        );
        OctoPrint.control.sendGcode(
          "SET_GCODE_OFFSET X=" + self.offsetX() + " Y=" + self.offsetY() + " Z=" + self.offsetZ()
        );
      }
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperOffsetDialogViewModel,
    dependencies: ["klipperViewModel"],
    elements: ["#klipper_offset_dialog"],
  });
});
