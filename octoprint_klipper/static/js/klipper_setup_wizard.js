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
  function KlipperSetupWizardViewModel(parameters) {
    var self = this;

    self.loginState = parameters[0];
    self.access = parameters[1];
    self.klipperViewModel = parameters[2];
    self.connectionState = parameters[3];

    self.steps = ko.observableArray([]);
    self.loading = ko.observable(false);
    self.applying = ko.observable(false);
    self.loadError = ko.observable("");
    self.state = ko.observable(null);

    // "Connect & verify" step: connects (if needed) and sends "status",
    // then watches the terminal for Klipper's "Unable to open config file"
    // response — see connectAndVerify() below.
    var CONNECT_TIMEOUT_MS = 20000;
    var VERIFY_TIMEOUT_MS = 10000;

    self.connectVerify = {
      running: ko.observable(false),
      phase: ko.observable("idle"), // idle | connecting | sending | done
      outcome: ko.observable(null), // null | matched | timeout | connect-failed | printing
      lines: ko.observableArray([]),
    };

    self.connectVerifyButtonLabel = ko.pureComputed(function () {
      switch (self.connectVerify.phase()) {
        case "connecting":
          return gettext("Connecting…");
        case "sending":
          return gettext("Sending status…");
        default:
          return gettext("Connect & send status");
      }
    });

    // Only processes terminal lines while a verification is in progress
    // (self._capturing); otherwise this is a no-op on every "current" push.
    self._capturing = false;
    self._capturedLines = [];
    self._verifyTimeoutHandle = null;

    self.fromCurrentData = function (data) {
      if (!self._capturing || !data || !data.logs) return;
      var expected = self.state() ? self.state().expected_status_error : "";
      var matched = false;
      _.each(data.logs, function (line) {
        self._capturedLines.push(line);
        if (expected && line.indexOf(expected) !== -1) {
          matched = true;
        }
      });
      self.connectVerify.lines(self._capturedLines.slice(-20));
      // Finish as soon as the expected response arrives instead of waiting
      // out the full timeout — the user shouldn't have to watch a spinner
      // for a result we already have.
      if (matched) {
        self._finishVerify("matched");
      }
    };

    self._finishVerify = function (outcome) {
      if (self._verifyTimeoutHandle) {
        window.clearTimeout(self._verifyTimeoutHandle);
        self._verifyTimeoutHandle = null;
      }
      self._capturing = false;
      self.connectVerify.outcome(outcome);
      self.connectVerify.phase("done");
      self.connectVerify.running(false);
    };

    self._sendStatusAndWatch = function () {
      self.connectVerify.phase("sending");
      self._capturedLines = [];
      self._capturing = true;
      self.connectVerify.lines([]);

      OctoPrint.control.sendGcode("status");

      self._verifyTimeoutHandle = window.setTimeout(function () {
        self._finishVerify("timeout");
      }, VERIFY_TIMEOUT_MS);
    };

    self._waitForConnection = function () {
      var cs = self.connectionState;
      var settled = false;
      var sub = cs.isOperational.subscribe(function (operational) {
        if (!operational || settled) return;
        settled = true;
        sub.dispose();
        window.clearTimeout(timeoutHandle);
        self._sendStatusAndWatch();
      });
      var timeoutHandle = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        sub.dispose();
        self._finishVerify("connect-failed");
      }, CONNECT_TIMEOUT_MS);
    };

    self.connectAndVerify = function () {
      if (self.connectVerify.running()) return;
      self.connectVerify.running(true);
      self.connectVerify.outcome(null);
      self.connectVerify.lines([]);

      var cs = self.connectionState;
      if (cs.isErrorOrClosed()) {
        self.connectVerify.phase("connecting");
        self.klipperViewModel.connect();
        self._waitForConnection();
      } else if (cs.isPrinting && cs.isPrinting()) {
        // Sending "status" would queue behind the running print's gcode and
        // never arrive promptly, making a real connection look like a
        // failure — so skip it while a print is in progress.
        self._finishVerify("printing");
      } else {
        self._sendStatusAndWatch();
      }
    };

    var STATUS_ICON = {
      ok: "icon-ok",
      warning: "icon-warning-sign",
      error: "icon-remove",
      info: "icon-info-sign",
      skipped: "icon-minus",
    };
    var STATUS_TEXT = {
      ok: gettext("OK"),
      warning: gettext("Warning"),
      error: gettext("Problem"),
      info: gettext("Info"),
      skipped: gettext("Skipped"),
    };

    var step = function (status, title, detail, extra) {
      extra = extra || {};
      var result = _.extend(
        {
          status: status,
          title: title,
          detail: detail,
          icon: STATUS_ICON[status] || "icon-info-sign",
          statusText: STATUS_TEXT[status] || "",
          docs: null,
          warning: null,
          expectedError: null,
          isConnectVerify: false,
          fixLabel: null,
          fixHint: null,
          action: null,
          actionValue: null,
        },
        extra,
      );
      // items must stay an observableArray: the template calls items().length.
      // _.extend would otherwise replace it with the plain array from `extra`.
      result.items = ko.observableArray(extra.items || []);
      return result;
    };

    // Build the step list from the backend's diagnostic snapshot. All the
    // decision-making lives server-side; this only renders it.
    var buildSteps = function (s) {
      var steps = [];

      // 1. Environment
      steps.push(
        step(
          "info",
          gettext("Environment"),
          _.sprintf(gettext("OctoPrint %(version)s on %(platform)s."), {
            version: s.environment.octoprint_version,
            platform: s.environment.platform || gettext("an unknown platform"),
          }),
        ),
      );

      // 2. Klipper host — the backend decides the status, since it also
      // reports the service state and whether the platform can run Klipper
      // at all (Klipper's host software is Linux-only).
      var kh = s.klipper.check;
      steps.push(
        step(kh.status, gettext("Klipper host"), kh.reason, {
          docs: kh.docs,
          items: [
            {
              severity: kh.path_exists ? "ok" : "warning",
              label: s.klipper.path,
              text: kh.path_exists
                ? gettext("directory exists")
                : gettext("directory missing"),
            },
            {
              severity:
                kh.service_state === "running"
                  ? "ok"
                  : kh.service_state === "failed"
                    ? "error"
                    : "warning",
              label: gettext("Klipper service"),
              text: kh.supported
                ? _.sprintf(gettext("service state: %(state)s"), {
                    state: kh.service_state,
                  })
                : gettext("not applicable on this platform"),
            },
          ],
        }),
      );

      // 3. Config directory
      var cfgOk = s.config.config_path_exists && s.config.baseconfig_exists;
      steps.push(
        step(
          cfgOk ? "ok" : "error",
          gettext("Config directory"),
          cfgOk
            ? _.sprintf(gettext("Base config found at %(path)s."), {
                path: s.config.baseconfig,
              })
            : gettext("The Klipper config directory or base config could not be found."),
          {
            items: [
              {
                severity: s.config.config_path_exists ? "ok" : "error",
                label: s.config.config_path,
                text: s.config.config_path_exists
                  ? gettext("directory exists")
                  : gettext("directory missing"),
              },
              {
                severity: s.config.baseconfig_exists ? "ok" : "error",
                label: s.config.baseconfig,
                text: s.config.baseconfig_exists
                  ? gettext("file exists")
                  : gettext("file missing"),
              },
            ],
          },
        ),
      );

      // 4. Config tree
      var treeItems = _.map(s.config.tree, function (path) {
        return { severity: "ok", label: path, text: "" };
      });
      _.each(s.config.missing_includes, function (m) {
        treeItems.push({
          severity: "error",
          label: m.include,
          text: _.sprintf(gettext("missing (line %(line)s)"), { line: m.line }),
        });
      });
      steps.push(
        step(
          s.config.missing_includes.length ? "error" : "ok",
          gettext("Config tree"),
          _.sprintf(
            gettext("printer.cfg and its [include]d files: %(count)s file(s)."),
            { count: s.config.tree.length },
          ),
          { items: treeItems },
        ),
      );

      // 5. Required sections
      var missing = _.filter(s.config.missing_sections, function (e) {
        return !e.present;
      });
      var worst = "ok";
      if (_.some(missing, { severity: "error" })) worst = "error";
      else if (_.some(missing, { severity: "warning" })) worst = "warning";
      else if (missing.length) worst = "info";
      steps.push(
        step(
          worst,
          gettext("Required sections"),
          missing.length
            ? _.sprintf(gettext("%(count)s section(s) not found in the config tree."), {
                count: missing.length,
              })
            : gettext("All recommended sections are present."),
          {
            items: _.map(missing, function (e) {
              return {
                severity: e.severity,
                label: "[" + e.section + "]",
                text: e.reason,
                docs: e.docs,
              };
            }),
          },
        ),
      );

      // 6. Serial port
      var sc = s.serial.check;
      var portItems = [
        {
          severity: sc.registered ? "ok" : "error",
          label: s.serial.port,
          text: sc.registered
            ? gettext("registered as an additional serial port")
            : gettext("NOT registered as an additional serial port"),
        },
        {
          severity: sc.port_exists ? "ok" : "warning",
          label: s.serial.port,
          text: sc.port_exists
            ? gettext("the port file exists")
            : gettext("the port file does not exist yet (Klipper may not be running)"),
        },
      ];
      if (sc.suggestion) {
        portItems.push({
          severity: "info",
          label: sc.suggestion,
          text: gettext("a modern Klipper serial port was found — consider using it"),
        });
      }

      // Switching to a port Klipper actually creates beats merely registering
      // the configured one, so it wins when a candidate was found.
      var serialFix = null;
      if (sc.suggestion) {
        serialFix = {
          fixLabel: gettext("Use detected port"),
          fixHint: _.sprintf(
            gettext("Uses %(port)s and registers it as an additional serial port."),
            { port: sc.suggestion },
          ),
          action: "useDetectedPort",
          actionValue: sc.suggestion,
        };
      } else if (!sc.registered) {
        serialFix = {
          fixLabel: gettext("Add port"),
          fixHint: _.sprintf(
            gettext("Adds %(port)s to OctoPrint's additional serial ports."),
            { port: s.serial.port },
          ),
          action: "addPort",
        };
      }

      steps.push(
        step(
          sc.ok ? "ok" : "error",
          gettext("Serial port"),
          sc.ok
            ? gettext("The Klipper virtual serial port is registered and available.")
            : gettext("OctoPrint cannot use the Klipper virtual serial port yet."),
          _.extend({ items: portItems }, serialFix),
        ),
      );

      // 7. Error handling
      var eh = s.serial.error_handling;
      steps.push(
        step(
          eh.ok ? "ok" : "warning",
          gettext("Error handling"),
          eh.ok
            ? gettext('OctoPrint is set to "cancel" — correct for Klipper.')
            : _.sprintf(
                gettext(
                  'OctoPrint is set to "%(current)s". Klipper expects "cancel" so the connection stays alive when a print is cancelled.',
                ),
                { current: eh.current || gettext("unset") },
              ),
          {
            fixLabel: eh.ok ? null : gettext("Set to cancel"),
            fixHint: eh.ok
              ? null
              : gettext("Changes a global OctoPrint setting that also affects non-Klipper setups."),
            action: eh.ok ? null : "setErrorHandling",
            actionValue: "cancel",
          },
        ),
      );

      // 8. Connect & verify. Skipped for the Moonraker connector: "status" is
      // a Klipper serial command it does not speak.
      if (s.moonraker.installed && s.connection.connector === "moonraker") {
        steps.push(
          step(
            "skipped",
            gettext("Connect & verify"),
            gettext("Verification is not available for the Moonraker connector."),
          ),
        );
      } else {
        steps.push(
          step(
            "info",
            gettext("Connect & verify"),
            gettext(
              'Click "Connect & send status" to connect (if needed) and send "status" automatically. An error about the config file is the expected result.',
            ),
            { expectedError: s.expected_status_error, isConnectVerify: true },
          ),
        );
      }

      // 9. Slicer
      steps.push(
        step(
          "info",
          gettext("Slicer"),
          gettext(
            'Set your slicer\'s g-code flavor to Marlin, do not enable "coasting", and prefer START_PRINT/END_PRINT macros.',
          ),
          { docs: "https://www.klipper3d.org/Slicers.html" },
        ),
      );

      // 10. Moonraker (experimental) — always last, always warned.
      steps.push(
        step(
          "info",
          gettext("Optional: Moonraker (experimental)"),
          s.moonraker.installed
            ? _.sprintf(gettext("Moonraker Connector %(version)s is installed."), {
                version: s.moonraker.version || gettext("unknown version"),
              })
            : gettext("The Moonraker Connector is not installed."),
          { warning: s.moonraker.warning },
        ),
      );

      return steps;
    };

    self.refresh = function () {
      self.loading(true);
      self.loadError("");
      OctoPrint.plugins.klipper
        .getSetupWizardState()
        .done(function (response) {
          var s = response.data || response;
          self.state(s);
          self.steps(buildSteps(s));
        })
        .fail(function () {
          self.loadError(gettext("Failed to load the setup wizard state."));
        })
        .always(function () {
          self.loading(false);
        });
    };

    self.applyFix = function (s) {
      if (!s.action || self.applying()) return;
      self.applying(true);
      OctoPrint.plugins.klipper
        .applySetupWizard(s.action, s.actionValue)
        .done(function (response) {
          var r = response.data || response;
          if (r.status === "error") {
            self.klipperViewModel.showPopUp(
              "error",
              gettext("Setup Wizard"),
              r.message || gettext("Could not apply the fix."),
            );
          } else {
            self.klipperViewModel.showPopUp(
              "success",
              gettext("Setup Wizard"),
              gettext("Fix applied."),
            );
            self.refresh();
          }
        })
        .fail(function () {
          self.klipperViewModel.showPopUp(
            "error",
            gettext("Setup Wizard"),
            gettext("Could not apply the fix."),
          );
        })
        .always(function () {
          self.applying(false);
        });
    };

    self.summary = ko.pureComputed(function () {
      var steps = self.steps();
      if (!steps.length) return "";
      var errors = _.filter(steps, { status: "error" }).length;
      var warnings = _.filter(steps, { status: "warning" }).length;
      if (errors) {
        return _.sprintf(gettext("%(count)s problem(s) need attention."), { count: errors });
      }
      if (warnings) {
        return _.sprintf(gettext("%(count)s warning(s)."), { count: warnings });
      }
      return gettext("Everything looks good.");
    });

    self.summaryClass = ko.pureComputed(function () {
      var steps = self.steps();
      if (_.some(steps, { status: "error" })) return "klipper-wizard-summary-error";
      if (_.some(steps, { status: "warning" })) return "klipper-wizard-summary-warning";
      return "klipper-wizard-summary-ok";
    });

    self.onStartupComplete = function () {
      self.refresh();
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperSetupWizardViewModel,
    dependencies: [
      "loginStateViewModel",
      "accessViewModel",
      "klipperViewModel",
      "connectionViewModel",
    ],
    elements: ["#klipper_setup_wizard_dialog"],
  });
});
