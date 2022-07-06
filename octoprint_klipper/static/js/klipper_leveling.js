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
  function KlipperLevelingViewModel(parameters) {
    var self = this;
    self.settings = parameters[0];
    self.loginState = parameters[1];

    self.activePoint = ko.observable(-1);
    self.pointCount = ko.observable();
    self.points = ko.observableArray();

    self.initView = function () {
      self.points(self.settings.settings.plugins.klipper.probe.points());
      self.pointCount(self.points().length);
    };

    self.startLeveling = function () {
      OctoPrint.control.sendGcode("G28");
      self.moveToPoint(0);
    };

    self.stopLeveling = function () {
      OctoPrint.control.sendGcode(
        "G1 Z" +
          (self.settings.settings.plugins.klipper.probe.height() * 1 +
            self.settings.settings.plugins.klipper.probe.lift() * 1)
      );
      self.gotoHome();
    };

    self.gotoHome = function () {
      OctoPrint.control.sendGcode("G28");
      self.activePoint(-1);
    };

    self.nextPoint = function () {
      self.moveToPoint(self.activePoint() + 1);
    };

    self.previousPoint = function () {
      self.moveToPoint(self.activePoint() - 1);
    };

    self.jumpToPoint = function (item) {
      self.moveToPoint(self.points().indexOf(item));
    };
    /*
        self.pointCount = function() {
           return self.settings.settings.plugins.klipper.probe.points().length;
        }
        */
    self.moveToPosition = function (x, y) {
      OctoPrint.control.sendGcode([
        // Move Z up
        "G1 Z" +
          (self.settings.settings.plugins.klipper.probe.height() * 1 +
            self.settings.settings.plugins.klipper.probe.lift() * 1) +
          " F" +
          self.settings.settings.plugins.klipper.probe.speed_z(),
        // Move XY
        "G1 X" + x + " Y" + y + " F" + self.settings.settings.plugins.klipper.probe.speed_xy(),
        // Move Z down
        "G1 Z" +
          self.settings.settings.plugins.klipper.probe.height() +
          " F" +
          self.settings.settings.plugins.klipper.probe.speed_z(),
      ]);
    };

    self.moveToPoint = function (index) {
      var point = self.points()[index];

      self.moveToPosition(point.x(), point.y());
      self.activePoint(index);
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperLevelingViewModel,
    dependencies: ["settingsViewModel", "loginStateViewModel"],
    elements: ["#klipper_leveling_dialog"],
  });
});
