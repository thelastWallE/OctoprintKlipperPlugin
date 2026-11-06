# Setup Wizard

The Setup Wizard is a step-by-step dialog that checks whether OctoPrint can talk
to your Klipper host and offers to fix what it can. It is a **diagnostic and
guided-fix** tool: it never rewrites your `printer.cfg`.

Open it from **Settings → OctoKlipper → Basic → Run Setup Wizard**.

## What it checks

| # | Step | What it looks at |
|---|---|---|
| 1 | Environment | OctoPrint version, host OS |
| 2 | Klipper host | Install path, the Klipper **service state**, and whether this platform can run Klipper at all |
| 3 | Config directory | Whether the config directory and base config resolve and exist |
| 4 | Config tree | Walks `printer.cfg` and every `[include]`d file; reports missing includes |
| 5 | Required sections | Which recommended sections are missing, and where they were found |
| 6 | Serial port | Whether the Klipper virtual serial port is registered and present |
| 7 | Error handling | Whether OctoPrint is set to `cancel` |
| 8 | Connect & verify | **Connect & send status** button: connects (if needed) and sends `status` automatically |
| 9 | Slicer | Links to Klipper's slicer guidance |
| 10 | Optional: Moonraker (experimental) | Whether the Moonraker Connector is installed |

Each step shows a status (`OK`, `Warning`, `Problem`, `Info`, `Skipped`), a short
explanation, and a link to the relevant Klipper documentation.

## The Klipper host check

Klipper's host software (`klippy`) is **Linux-only** — Klipper's own install
docs assume "a Linux-based host". Step 2 therefore reports both the install path
and the service state, and on a non-Linux host it says plainly that Klipper
cannot run there.

This matters because a `~/klipper` directory on Windows or macOS is usually just
a **source checkout**: cloning works fine (git is cross-platform), so the
*Klipper Update* tab happily reports an installed host version, but nothing can
actually run and OctoPrint can never connect to it locally. Reporting a green
"Klipper found" in that situation is misleading, so the step warns instead:

> Klipper's host software only runs on Linux, so it cannot run on this Windows
> host. The Klipper path below may exist as a source checkout, but OctoPrint
> cannot connect to a Klipper instance running here.

On Linux the service state is read with `systemctl is-active <unit>` (read-only,
no privileges needed), giving one of:

| Service state | Step status | Meaning |
|---|---|---|
| `running` | OK | Klipper is up; OctoPrint can connect |
| `stopped` | Warning | Installed but not running — start it before connecting |
| `failed` | Problem | Unit in a failed state — check the Klipper log |
| `unknown` | Info | Installed, but the service state could not be determined |

The unit name is **derived from the configured
`configuration/restart_service_system_command`** (default
`sudo service klipper restart`) rather than hardcoded, so a renamed unit
(`sudo systemctl restart myklipper` → `myklipper`) is still checked. On non-Linux
platforms no command is run at all and the service item reads
"not applicable on this platform".

## The config tree check

The check **starts at `printer.cfg`** and follows `[include ...]` directives
recursively, resolving each include relative to the file that contains it
(matching Klipper). Wildcards are supported. A section defined in an included
file counts as present.

Sections are reported with a severity:

| Severity | Sections |
|---|---|
| **error** | `[mcu]`, `[printer]` — Klipper cannot start without these |
| **warning** | `[virtual_sdcard]`, `[pause_resume]` — recommended for an OctoPrint setup |
| **info** | `[exclude_object]`, `[save_variables]`, `[idle_timeout]`, `[respond]` |

## Step 8 — the expected error

When OctoPrint sends `status` over the virtual serial port, Klipper runs its
startup config load. If `printer.cfg` cannot be read, Klipper reports:

```
Unable to open config file <path>
```

**This error is the expected success signal.** It proves OctoPrint reached
Klipper over the virtual serial port. The wizard states this explicitly and does
not treat a matching message as a failure — only a *different* outcome (a
timeout, or no response at all) is reported as a problem.

### Automated "Connect & send status"

Rather than making the user do this manually in the Terminal tab, step 8 has a
**"Connect & send status"** button that runs the whole check automatically,
entirely in the browser (there is no backend endpoint for this — it drives
OctoPrint's existing connection and terminal APIs directly):

1. If the connection is currently closed/in error, it triggers the same
   connect logic as the sidebar's "Connect" button (handling both the 1.11
   and 2.0 connection APIs) and waits up to 20 seconds for OctoPrint to report
   `isOperational`.
2. If a print is already in progress, nothing is sent — `status` would queue
   behind the print's g-code and could take a very long time to arrive,
   making a working connection look like a failure. The wizard reports this
   instead of waiting.
3. Otherwise it sends `status` via `OctoPrint.control.sendGcode("status")` and
   watches the terminal's live data stream (the same `logs` the core Terminal
   tab renders, via a `fromCurrentData` hook) for up to 10 seconds.
4. As soon as a line containing the expected `Unable to open config file`
   text arrives, the check finishes immediately and reports success — it does
   not wait out the rest of the timeout.
5. If no matching line arrives within 10 seconds, it reports a timeout instead
   (hinting to check the Klipper service and the configured port); if the
   initial connect attempt never reaches `isOperational` within 20 seconds, it
   reports a connect failure instead.

The captured terminal lines are shown live in the step so the raw exchange is
visible, not just the final verdict. This step is **skipped** for the Moonraker
connector (see below) for the same reason `status` isn't a Moonraker command.

## Fixes the wizard can apply

The wizard only writes settings through a whitelisted action list. It cannot be
used as a generic settings writer.

| Action | What it changes |
|---|---|
| **Add port** | Adds the configured Klipper port to OctoPrint's additional serial ports |
| **Use detected port** | Switches to a Klipper port that actually exists (the modern `~/printer_data/comms/klippy.serial`), stores it as the configured port **and** swaps it into the additional serial ports, so no dead entry is left behind |
| **Set to cancel** | Sets OctoPrint's "on unhandled error" behaviour to `cancel` |

Both require an explicit click. The wizard shows the current value first.

**Use detected port** only appears when the configured port is not usable and
another Klipper serial port was found on the host. Only paths from the server's
own candidate list that resolve to an existing file are accepted, so the action
cannot be used to point OctoPrint at an arbitrary path.

### The legacy `/tmp/printer` default

Older Klipper setups created the virtual serial port at `/tmp/printer`. Modern
installs (with `~/printer_data`) write it to
`~/printer_data/comms/klippy.serial` instead and never create `/tmp/printer`,
so the old default can never work there. OctoKlipper therefore upgrades the
configured port on startup **once that file exists** — but only if the port is
still the legacy default; a port the user chose is left alone. The switch is
logged as:

```
Switched the klipper serial port from /tmp/printer to /home/pi/printer_data/comms/klippy.serial.
```

### OctoPrint 2.0 and the additional serial ports

OctoPrint 2.0 moved the serial settings to `plugins.serial_connector.*` and
installs a **read-only compatibility overlay** for the legacy `serial.*` paths.
Writes to the old path are silently dropped:

```
[Deprecation] Prevented write of `['/tmp/printer']` to deprecated settings path ['serial', 'additionalPorts'].
```

OctoKlipper writes to the correct path for the running OctoPrint version
(`plugins.serial_connector.additionalPorts` on 2.0, `serial.additionalPorts` on
1.11.x). Without this, the Klipper virtual serial port never appears in
OctoPrint's port list on 2.0.

### 1.11 stores error handling as two booleans

OctoPrint 2.0's `errorHandling` enum **does not exist on 1.11** — there the same
intent is stored as two independent booleans:

| `errorHandling` (2.0) | `serial.disconnectOnErrors` (1.11) | `serial.ignoreErrorsFromFirmware` (1.11) |
|---|---|---|
| `disconnect` | `true` | `false` |
| `cancel` | `false` | `false` |
| `ignore` | `false` | `true` |

OctoKlipper translates between the two forms, mirroring OctoPrint 2.0's own
`init_serial_compat_overlay` mapping. Writing `serial.errorHandling` on 1.11
appears to succeed but has no effect — nothing reads that key — so the wizard
would report success while the step stayed unchanged.

The wizard derives the enum from the booleans on 1.11, so the step shows the
real current value (1.11 defaults to `disconnect`) rather than `unset`.

## Optional: Moonraker (experimental)

> **The Moonraker Connector is experimental and unfinished.** It is version
> 0.1.0 with **no published release**, requires OctoPrint 2.0, and is still under
> development. OctoKlipper's macros, config editor, Save Variables and log
> analysis are built around the **serial** connection and are **unverified**
> against it.

The wizard's Moonraker step is collapsed and de-emphasised, carries a
non-dismissible warning, and is **never auto-selected**. Detection is read-only:
the wizard reports whether the plugin is installed and its version, and does not
write its settings.

If the Moonraker connector is selected, **step 8 is skipped** — `status` is a
Klipper serial command the Moonraker connector does not speak. The step instead
reports that verification is not available for that connector.

### Why the connection panel had to change

OctoPrint 2.0 renders connector options (the "Connection Type" selector plus each
connector's own parameters, such as Moonraker's host/port/apikey) **only** inside
the core `sidebar/connection/connection.jinja2`. OctoKlipper's *Replace Connection
Panel* setting replaces that template, so those inputs were never rendered and
connecting to a non-serial connector sent empty parameters.

OctoKlipper's connection panel now renders the `connection_options` block itself,
mirroring the core markup. This preserves the DOM contract OctoPrint's connection
view model depends on: `doOnAllInputsForConnector()` looks up
`#connection_options_<connector>` and collects the `[data-connection-parameter]`
inputs inside it.

As a side effect, the serial connector's own port and baudrate dropdowns are now
rendered in the panel too.

OctoPrint 1.11 has no `connection_options` templates at all, so the block is
skipped there and the panel is unchanged.

## API

The wizard is backed by two simple-API commands. See
[api.md](api.md) for the general conventions.

### `getSetupWizardState`

Method: POST

Returns the full read-only diagnostic snapshot. Writes nothing.

Example Response (abridged):

    {
      "environment": { "octoprint_version": "2.0.0rc6", "is_linux": true },
      "klipper": { "path": "~/klipper/", "installed": true },
      "config": {
        "config_path": "~/klipper_configs",
        "config_path_exists": true,
        "baseconfig": "~/printer.cfg",
        "baseconfig_exists": true,
        "tree": ["printer.cfg", "mcu.cfg"],
        "missing_includes": [],
        "sections": { "mcu": "printer.cfg" },
        "missing_sections": [
          { "section": "virtual_sdcard", "present": false, "severity": "warning", "reason": "...", "docs": "..." }
        ]
      },
      "serial": {
        "port": "/tmp/printer",
        "port_exists": false,
        "additional_ports": ["/tmp/printer"],
        "additional_ports_path": ["plugins", "serial_connector", "additionalPorts"],
        "check": { "registered": true, "port_exists": false, "ok": false, "suggestion": null },
        "error_handling": { "current": "disconnect", "expected": "cancel", "ok": false }
      },
      "connection": { "replace_connection_panel": true, "connector": "serial" },
      "moonraker": { "installed": false, "version": null, "experimental": true, "warning": "...", "port": 7125 },
      "expected_status_error": "Unable to open config file"
    }

### `applySetupWizard`

Method: POST

Applies one whitelisted fix.

| Parameter | Type | Description |
|---|---|---|
| `action` | string | One of `addPort`, `setErrorHandling`, `setPort` |
| `value` | string | Required for `setErrorHandling` (`disconnect`/`cancel`/`ignore`) and `setPort` (an absolute path) |

Example Response:

    {
      "status": "ok",
      "path": ["plugins", "serial_connector", "additionalPorts"]
    }

An unknown action or an invalid value returns `{"status": "error", "message": "..."}`.
