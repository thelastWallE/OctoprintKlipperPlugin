# OctoKlipper 0.5.0 rc1

This release candidate collects everything since **0.4** into one release: the
**macro rework** (gcode macros parsed out of `printer.cfg`, with groups,
ordering and dedicated sidebar panels), the new **Setup Wizard**, the editor
tooling added afterwards (**Save Variables**, **Create file**, config path
checks), the plugin's **own settings dialog**, and the OctoPrint 2.0 connection
fixes.

## ⚙️ OctoKlipper settings dialog

OctoKlipper now brings its own settings dialog instead of squeezing its UI into
OctoPrint's settings pane, which can never be wider than about three quarters of
the dialog — too narrow for the macro tables.

- **One entry point, several routes** — open it with the wrench on the Klipper tab, with the gear on either macro panel (it jumps straight to that tab's settings), or with the launcher button in OctoPrint's own settings.
- **Room to breathe** — the dialog uses 90% of the window (capped at 1200 px), keeps its own **Save** / **Cancel**, and closes with the usual ×.
- **Still OctoPrint's settings** — everything is saved through OctoPrint's settings API, so validation, the restart hints and the plugin's save hooks behave exactly as before. **OctoPrint settings** in the footer jumps to OctoPrint's own dialog, next to **Reset all settings** and **Donate**.

## 🧩 Macros & Groups

- **Parsed printer.cfg macros** — gcode macros are parsed out of `printer.cfg` and its `[include]`d files (recursively, with cycle protection) and shown as clickable buttons.
- **Sidebar panels & settings tab** — dedicated "Macros" and "Klipper Macros" panels below the connection panel, plus a "Klipper Macros" settings tab to assign each macro to a group and choose where it is shown.
- **Group management** — create, rename, reorder and delete groups; control display order (empty = alphabetical); groups are collapsible with the state remembered across reloads.
- **Runtime parameters** — macros using `{params.X}`, `{rawparams.X}` or `{input.X}` open a parameter dialog and are sent as `MACRONAME X=value` arguments.
- **Offline execution** — macro buttons work without a connected printer; the command is logged and a hint is shown instead of failing silently.
- **Polish** — description tooltips, source-file display, bordered group containers, truncated long macro names, and separate settings to show/hide each sidebar panel. The backend now supplies the runtime parameter names, and the config tree is only walked when parsing is enabled.
- **Settings shortcuts** — a small gear on each macro panel (Klipper tab and sidebar) opens the matching macro settings tab directly.

## 🧾 Macro settings tables

The two macro tabs in the settings dialog were rebuilt around the items
themselves instead of a wide table header:

- **Labelled fields instead of a header row** — name, group, source and parameters each sit in their own box with the column title floating on its border, so the columns are labelled on the item and the header row is gone.
- **Compact controls** — the "Tab" and "Sidebar" checkboxes and the row actions (move up/down, delete) share one cell and sit side by side.
- **Read-only fields are marked** — name, source, parameters and the macro command get a dashed border, a muted fill and a lock icon, so they are distinguishable at a glance from the group dropdown and the checkboxes you can edit.
- **The macro's gcode, visible** — the body of each parsed macro is shown in a read-only block, syntax-highlighted with Monaco (command words, parameters, numbers, jinja expressions and comments), wrapped so long lines don't widen the table.
- **Sized for real names** — the group dropdown grew to show full group names and the name column stays the widest, with the columns relaxed on narrow windows so the table keeps fitting.

## 🧭 Setup Wizard

A new step-by-step dialog (**OctoKlipper settings → Basic → Run Setup Wizard**)
that diagnoses your setup instead of just describing it. It detects what is
already correct and skips it, detects what is wrong, and offers a one-click fix
where a fix is safe. It never rewrites your `printer.cfg`.

- **Config tree check** — starts at `printer.cfg` and follows `[include ...]` directives recursively (wildcards supported, resolved relative to the including file, cycle-protected). Reports missing includes and missing sections, and recognises a section defined in an included file as present.
- **Required sections** — `[mcu]` and `[printer]` are errors; `[virtual_sdcard]` and `[pause_resume]` are warnings; `[exclude_object]`, `[save_variables]`, `[idle_timeout]` and `[respond]` are informational. Each entry links to the relevant Klipper documentation.
- **Klipper host check** — verifies the configured Klipper path after expanding `~` and environment variables, and reads the Klipper service state with `systemctl is-active` (no privileges needed), deriving the unit name from the configured restart command. On non-Linux platforms it warns that Klipper's host software only runs on Linux.
- **Serial port check** — verifies the Klipper virtual serial port is registered and present, and suggests the modern `~/printer_data/comms/klippy.serial` path when it finds one.
- **Error handling check** — Klipper wants OctoPrint set to `cancel`; the wizard offers to set it. On OctoPrint 1.11 it translates between the 2.0 `serial.errorHandling` enum and the 1.11 `disconnectOnErrors` / `ignoreErrorsFromFirmware` booleans.
- **Connect & verify** — a one-click **Connect & send status** action connects automatically (waiting up to 20 s for the connection), sends `status`, and watches the terminal for the expected response. It skips sending while a print is in progress and reports the captured terminal lines when it fails.
- **Expected-error guidance** — explains that the `Unable to open config file` message after sending `status` is the _expected success signal_, not a failure.

## 🔧 Fixes

All of these were bugs in the code as it stood at the **0.4** tag.

- **Klipper serial port was never registered on OctoPrint 2.0.** OctoPrint 2.0 moved the serial settings to `plugins.serial_connector.*` and installs a read-only compatibility overlay for the legacy `serial.*` paths, so the plugin's write to `serial.additionalPorts` was silently dropped (`Prevented write of ... to deprecated settings path`). The port is now written to the correct path for the running OctoPrint version. Without this, the Klipper virtual serial port never appeared in OctoPrint's port list on 2.0.
- **Connector options were unreachable with "Replace Connection Panel" enabled.** OctoPrint 2.0 renders connector options (the "Connection Type" selector plus each connector's own parameters) only inside the core connection template, which this plugin replaces. OctoKlipper's panel now renders that block itself, preserving the `#connection_options_<connector>` / `data-connection-parameter` DOM contract OctoPrint's connection view model depends on. As a side effect, the serial connector's own port and baudrate dropdowns are now rendered too.
- **Empty config files** — saving or checking an empty file returned HTTP 500 because the client sent `[]` instead of an empty string; empty content is kept as text and list/`None` payloads are coerced backend-side.
- **Backups list** — directories returned by the recursive glob are excluded, long backup names wrap instead of being cut off, and the live `current/` duplicates are shown in a dedicated **Current Configs** section.
- **Upload progress bar** — it was rendered even when nothing was uploading (an empty track sat below the upload button) and never filled, because the width was written to a selector that does not exist (`#klipperconfig_upload_progress` instead of `#config_upload_progress`). It now appears only while a transfer is running, fills as it goes, and disappears afterwards.
- **Log filter dialog never opened** — it used the modal `fade` class, whose transition-end callback did not reliably fire, so its state said "shown" while the dialog stayed invisible. It now opens immediately like the plugin's other dialogs.
- **MCU pin names in the editor** — `P0.2`/`PA1` were matched by the "uppercase gcode command" tokenizer rule, so the port letter and the pin number were one coloured word; the port letter and the pin number now get their own token types.

## 🌙 Moonraker Connector (experimental)

The wizard detects the **Moonraker Connector** and reports whether it is
installed — but it is clearly labelled as experimental and unfinished:

> Version 0.1.0, **no published release**, requires OctoPrint 2.0, still under
> development. OctoKlipper's macros, config editor, Save Variables and log
> analysis are built around the **serial** connection and are **unverified**
> against it.

The step is collapsed, carries a non-dismissible warning, and is never
auto-selected. Detection is read-only. If Moonraker is selected, the wizard's
`status` verification step is skipped, because `status` is a Klipper serial
command the Moonraker connector does not speak.

## 🛠 Editor & tools

- **Save Variables** — a dialog (**Klipper tab → Tools**) that reads the `[save_variables]` file configured in `printer.cfg`, shows the current values, highlights which parsed macros use each variable, and updates values via `SAVE_VARIABLE` gcode (validated name + Python literal).
- **Create file** — a **Create file…** button next to **Create folder…** creates an empty config file in the open folder; a missing extension gets `.cfg` appended.
- **Config path checks** — **Check path** buttons for the **Klipper Config Directory**, the **Klipper Base Config Filename** and the log path, with the resolved path and a found/not-found state shown right next to the button, mirroring the existing klippy log path check.
- **Klipper documentation links** — a **Klipper Documentation** link in the config editor footer (`Config_Reference`), centred between the filename field and the editor buttons, and `save_variables` / `SAVE_VARIABLE` links in the Save Variables dialog.
- **Editor integration** — `[include ...]` path autocomplete, squiggle markers under missing include targets, and macros re-parsed after saving in the editor.
- **Full Klipper language support** — the Monaco language definition now covers the full set of Klipper config sections from `Config_Reference` (eddy current probes, smart effector, fans, LEDs, TMC drivers, load cells, thermal adjustment, axis twist compensation, accelerometer chips, displays, carriage, angle, and more).
- **Tokenizer fixes** — `[include ...]` targets and multi-segment paths stay one token, and file-path values (`./`, `../`, `~/`, `/`) are no longer re-coloured as separate words.
- **Save Variables table** — long variable names and "Used by" macro lists wrap instead of being cut off.

## 🌍 Translations

- **Spanish and French are now fully translated** — the plugin is completely available in both languages.
- **German is complete again** — every string added since the last release is now translated as well.
- **Gettext catalog refreshed** — the template now carries 542 strings (was 311 before the release, with 113 in-use strings missing and 24 dead ones); the previously hardcoded macro button styles, restart types, log filter tooltips, editor dialog title, probes table headers, Refresh file list tooltip and the new settings dialog / macro table texts are translatable. `babel.cfg` was fixed for Jinja2 3.x.

## 📝 Notes

- Compatible with OctoPrint 1.11.x and OctoPrint 2.0 (verified against 2.0.0rc6).
- Python 3.10+.
- Ships translations for German, Spanish and French.
- See [setup-wizard.md](setup-wizard.md) for the full Setup Wizard documentation.
- The connection-panel and serial-port fixes are OctoPrint 2.0 only; 1.11 has no `connection_options` templates, so its panel is unchanged.
- The plugin's settings live in their own dialog; OctoPrint's settings only carry a button that opens it.
