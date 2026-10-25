2026-10-25: hide the config upload progress bar while nothing is uploading — it had no visibility binding and was always rendered (an empty Bootstrap progress bar), and its bar width was written to a selector that does not exist (#klipperconfig_upload_progress vs #config_upload_progress), so it never filled either; the width is now bound in the template, the container only shows when a percentage > 0 is set, and the progress is always cleared after the refresh — even when the upload response is not flagged as done, which previously left the bar and upload spinner stuck
2026-10-25: move the “Klipper Documentation” link out of the config editor's file list into the footer row, centred between the filename input and the “Reload from file” button, and style it as a small pill (border, hover state) so the link to the Klipper config reference is easier to spot
2026-10-25: fix MCU pin names in the config editor being coloured as one word — “P0.2” matched the uppercase gcode-command rule, so “P” and “0” shared the keyword colour; a pin rule before it now colours the port letter as a parameter (orange, distinct from both the green config keys and the purple numbers) and the pin number as a number (P0.2, P2.0, P1.28, PA1, PC13)
2026-10-25: move the “Resolves to: …” / “Will load: …” results of the Basic tab's three path checks from their own line below the button to the right of the “Check path” button (same row, 10px gap, vertically centred), so each check and its result read as one line
2026-10-25: give OctoKlipper its own settings dialog again — OctoPrint's plugin pane can never be wider than the span9 column of its 975px settings dialog, which cramps the 7-column Klipper Macros table; the dialog is 90% of the window (capped at 1200px), centered, keeps Save/Cancel in its footer (plus “OctoPrint settings”, “Reset all settings” and “Donate”) and saves through OctoPrint's settings view model, so validation, onSettingsBeforeSave hooks and the restart hints keep working. OctoPrint's plugin pane now only holds a launcher button, and the gear/wrench shortcuts open the dialog on the matching tab; the left-menu collapsing of OctoPrint's dialog and its “Collapse Settings Menu” option were removed with it, while all the macro-table styling (floating field labels, merged Tab/Sidebar/action cell, wider group dropdown and name column, read-only fields, Monaco-highlighted gcode) is unchanged
2026-10-25: fix the gcode highlighting colouring parameter digits like the letter — the parameter rule only covered A–V, so X/Y/Z fell through to the word rule and “Z0” became one token (Z, X5, Y5 and Z10 all in the parameter colour); the rule now covers the whole alphabet, and the command-word rule no longer requires a trailing word boundary so “G1Z10” splits too
2026-10-25: show the gcode of each parsed macro in the Klipper Macros table — a read-only block under the Button Style row displays the macro body from printer.cfg (monospace, scrollable, selectable for copying) inside the same dashed, greyed box as the other read-only fields, with a lock next to the “Command” label and a tooltip
2026-10-25: syntax-highlight those macro commands with Monaco — instead of one editor instance per row the settings view model uses monaco.editor.tokenize(), which needs no editor and no theme, and a new “klipper_gcode” language in lib/monaco/klipper-config.js tokenizes command words, parameter letters, numbers and comments (the config-file tokenizer marked every uppercase word as a keyword, which flattened a gcode block into one colour); the token colours are set in CSS so the snippet stays readable on the light read-only box, and it falls back to plain text if Monaco is unavailable
2026-10-25: mark the read-only fields of the Klipper Macros table (Name, Source, Params) — they get a dashed border, muted background/text and a lock icon (Name and Source) plus a tooltip, so they are distinguishable from the editable Group dropdown and checkboxes at a glance; the tab's help text now says name, source and parameters are read-only, and the Name column keeps a 300px minimum so the table still fits the pane
2026-10-25: give the Params box of the Klipper Macros table a 58px minimum width so its floating “Params” label fits on the top border instead of running past the right border of the box
2026-10-25: rebalance the macro table columns — the Group dropdown now fills its box with a 220px minimum instead of a 120px one, and the Name field gets a 320px minimum so the name column stays the widest (parsed macros: Name 327px / Group 225px; Macros: 372px / 269px), with no horizontal scrolling
2026-10-25: replace the header row of both macro tables in the settings with per-field labels — Name, Group, Source and Params of a macro row sit in their own bordered box whose title floats on the box border, so the columns are labelled on the item itself and the tables need no header (the cells get overflow: visible because OctoPrint clips table cells and would cut the labels)
2026-10-25: merge the Tab, Sidebar and action columns of both macro tables into one cell, so the two checkboxes and the row action icons sit side by side in a single row (with tooltips on all of them) instead of in three separate boxes
2026-10-25: fix the OctoKlipper settings template leaving two stray closing divs behind, which broke the settings tab markup — the panes of later plugins (e.g. "Action Command Prompt") ended up outside the tab content and their text showed up at the bottom of the dialog, and the plugin's install/servicefile/logfilter dialogs were bound twice ("You cannot apply bindings multiple times to the same element")
2026-10-25: fix the Log Filters dialog never appearing — it used the modal "fade" class, whose transition-end callback does not reliably fire, so it stayed invisible while its modal state said "shown"; it now opens immediately like the plugin's other dialogs
2026-10-25: put a small gap between the macro items in the settings tables — table layout ignores margins on a tbody, so the groups are now separated by the spacer row that was already in the template (with a real cell that has a height); the "Macros" table, which had no spacer row at all, got one too
2026-10-25: make the macro rows in the settings tables easier to read — the group boxes get a darker border (#999) and the "Button Style"/"Command" labels a brighter chip (pure white with a soft halo and black text so the box border no longer crosses the text)
2026-10-25: fix the help texts in the settings checkbox rows being centred instead of starting right after their checkbox — those rows use `justify-content: space-between`, so the help span in the middle was pushed to the row centre; it now takes the free space and stays left-aligned
2026-10-25: add small gear icons to the "Macros" and "Klipper Macros" panels on the Klipper tab and in the sidebar that open the matching settings tab directly (shown only for users allowed to change settings)
2026-10-25: fix the macro tables in Settings > OctoKlipper ignoring their width on narrower windows — an auto-layout table treats `width` as a minimum, so long macro names/config paths plus the Group select's min-width floored the 7-column Klipper Macros table at ~780px, which pushed its group-box border under the settings scrollbar; long words in the cells now wrap, which lowers that minimum so the `calc(100% - 20px)` width is honoured, and the Klipper Macros table uses the same margins as the Macros tab table (16px clearance to the scrollbar)
2026-10-25: make the gear shortcuts on the macro panels open OctoPrint's settings on the matching OctoKlipper tab (with the menu collapsed)
2026-10-17: add a Klipper service check to the Setup Wizard's "Klipper host" step — it reads the service state with "systemctl is-active" (no privileges needed), deriving the unit name from the configured restart command so a renamed unit is still checked, and reports running/stopped/failed/unknown; on non-Linux platforms no command is run and the step now warns that Klipper's host software only runs on Linux, instead of reporting a green "Klipper found" for a source checkout that can never run (cloning works on Windows, so the Klipper Update tab looked healthy while connecting could never succeed)
2026-10-17: fix the Setup Wizard's "Set to cancel" action doing nothing on OctoPrint 1.11 — 1.11 has no "serial.errorHandling" setting (it stores the same intent as the "disconnectOnErrors"/"ignoreErrorsFromFirmware" booleans), so the write appeared to succeed while the step stayed unchanged; the wizard now translates between the 2.0 enum and the 1.11 booleans in both directions (mirroring OctoPrint 2.0's own serial compat overlay), and reads the real current value instead of reporting "unset"
2026-10-17: add a "Connect & send status" action to the Setup Wizard's "Connect & verify" step — it connects automatically (if needed, waiting up to 20s for isOperational), sends "status" via OctoPrint.control.sendGcode, and watches the live terminal data for the expected "Unable to open config file" response (finishing immediately on a match instead of waiting out the full 10s timeout); skips sending while a print is in progress (it would queue behind the print's g-code) and reports a timeout/connect-failure with the captured terminal lines when it doesn't succeed; still skipped for the Moonraker connector
2026-10-16: fix the Setup Wizard reporting a valid Klipper install as missing when the Klipper path setting uses ~ or an environment variable — the wizard checked the raw setting with a plain isdir() instead of expanding it first, unlike the update tab which already expanded it
2026-10-16: add a Setup Wizard dialog (Settings > OctoKlipper > Basic) that diagnoses whether OctoPrint can talk to the Klipper host and offers one-click fixes — it checks the Klipper install path, the config directory and base config, walks printer.cfg plus its [include]d files for missing includes and missing sections, verifies the virtual serial port and the error-handling setting, and explains the expected "Unable to open config file" result of sending status
2026-10-16: fix the Klipper virtual serial port never being registered on OctoPrint 2.0 — writes to the legacy serial.additionalPorts path are silently dropped by the 2.0 compatibility overlay ("Prevented write of ... to deprecated settings path"), so the port is now written to plugins.serial_connector.additionalPorts on 2.0 and serial.additionalPorts on 1.11.x
2026-10-16: render OctoPrint's connection_options block inside OctoKlipper's own connection panel — with "Replace Connection Panel" enabled the core template that renders connector options was replaced, so a non-serial connector's parameters (e.g. the Moonraker Connector's host/port/apikey) were never rendered and connecting sent empty parameters; the panel now mirrors the core markup and keeps the #connection_options_<connector> / data-connection-parameter DOM contract, and the serial connector's own port and baudrate dropdowns are rendered too
2026-10-16: extract the [include]-walking logic into KlipperMacroParser.iter_config_tree so the config tree can be traversed by other modules; parse_macros keeps its own inline walk because macros must be collected in inline order (an [include] expands at the point it appears)
2026-10-16: add a read-only Moonraker Connector detection to the Setup Wizard, flagged experimental with a non-dismissible warning (version 0.1.0, no published release, requires OctoPrint 2.0, OctoKlipper's features unverified against it); the wizard never auto-selects it and skips the status verification step for it
2026-10-07: keep [include ...] targets and multi-segment paths as a single token in the editor's Monaco tokenizer (no colour split right after the slash), without swallowing the closing bracket
2026-10-07: keep file-path values (`./`, `../`, `~/`, `/`) as a single token in the editor's Monaco tokenizer instead of re-colouring them as separate variable words
2026-10-07: add direct Klipper documentation links — a "Klipper Documentation" link in the config editor (Config_Reference) and save_variables/SAVE_VARIABLE links in the Save Variables dialog
2026-10-07: extend the editor's Monaco language definition with the full set of Klipper config sections from Config_Reference (added probe_eddy_current, smart_effector, fan_generic, led, TMC drivers, load_cell(_probe), z_thermal_adjust, axis_twist_compensation, accelerometer chips, display_*, carriage, angle, and more)
2026-10-07: let long variable names and "Used by" macro lists wrap in the Save Variables dialog table instead of being cut off (code defaulted to white-space: nowrap)
2026-10-07: fix a 500 on /config/save when saving an empty config file — the saveCfg client sent an empty body as `[]` (array), which crashed the file write; keep empty content a string and coerce list/None payloads to text in save_cfg
2026-10-07: fix a 500 on /config/check when saving an empty config file — the editor client sent an empty body as `[]` (array), which crashed configparser's read_string; keep empty content a string and coerce list/None payloads to text backend-side
2026-10-07: fix the "Create file..." dialog submit button being dead — the dialog element was missing from the KlipperEditorViewModel `elements` list, so Knockout never bound the input/button
2026-10-07: add a "Create file..." button to the config editor file browser (next to "Create folder...") — creates an empty config file in the currently open folder (a missing extension gets ".cfg" appended); backed by a new "filename" branch on the storage POST route
2026-10-07: add a "Save Variables" dialog (Klipper tab > Tools) that reads the [save_variables] file configured in printer.cfg, shows the current variable values, highlights which parsed macros use each variable, and lets you update values via SAVE_VARIABLE gcode (validated name + Python literal)
2026-10-06: let long backup filenames wrap in the Backups dialog instead of being cut off; keep the action icons on one line
2026-10-06: show the live "current" config duplicates in a dedicated "Current Configs" section of the Backups dialog (preview/download only) instead of mixing them with the versioned backups
2026-10-06: exclude directories from the Backups list — the recursive glob also returned folder entries (data folder, archive/, current/, configs/) which could not be previewed, downloaded or restored; only files are listed now
2026-10-06: add a "Check path" button + resolved-path hint to the "Klipper Config Directory" and "Klipper Base Config Filename" settings, reusing the klippy log path check pattern (new simple API commands `checkKlipperConfigPath` / `checkKlipperBaseConfig`)
2026-10-06: fix a crash in the macro parameter dialog when a placeholder has no `default:` — every parameter now always gets a `value` observable
2026-10-06: let the backend provide the Klipper runtime parameter names (`klipper_params`) so the frontend no longer carries a second, drifted regex (fixes `{ params.X }` not being recognized)
2026-10-06: honour the "Parse macros from printer.cfg" setting server-side — the config tree is only walked when parsing is enabled
2026-10-06: clamp `/checkConfig` include resolution to the configured config directory (a crafted `CurrentFile` can no longer point it elsewhere)
2026-10-06: validate the shape and size of `/config/saveParsedMacros` payloads
2026-10-06: demote the sidebar template-sorting debug logging from INFO to DEBUG (it ran on every page render)
2026-10-06: add a separate "Show Klipper Macros panel on the sidebar" setting so the two sidebar panels can be toggled independently
2026-10-06: make the previously hardcoded settings strings translatable — macro button style options (Default/Danger/Success/Warning/Info), restart-type options, log filter tooltips, the editor dialog title, the probes table headers and the Refresh file list tooltip
2026-10-06: complete the Spanish and French translations (397/397 strings each, up from 53) and translate the newly extracted strings in German (397/397)
2026-10-06: refresh the gettext template from the current source — 397 strings (was 311, missing 113 in-use strings and carrying 24 dead ones)
2026-10-06: fix babel.cfg for Jinja2 3.x — jinja2.ext.autoescape and jinja2.ext.with_ were removed, so babel_extract/babel_refresh failed outright; also ignore vendored static/js/lib (the minified Monaco bundle produced bogus matches)
2026-09-30: add dedicated group management — create, rename, reorder and delete macro groups with an "Add Group" button; the macro Group fields are now dropdowns populated from the groups
2026-09-30: add a group ordering setting for the user-defined and parsed macro groups (empty = alphabetical)
2026-09-30: add sidebar-specific macro group computeds (macroGroupsSidebar / klipperMacroGroupsSidebar) that pre-filter to sidebar-visible macros
2026-09-30: frame macro groups with a border and header on the main tab and sidebar
2026-09-30: truncate long macro names on the buttons with an ellipsis (klipper-truncate)
2026-09-30: persist the group collapse state across page reloads
2026-09-30: show a macro's description as a tooltip on its button
2026-09-30: show the source file relative to the config directory for parsed macros
2026-09-30: sort macro groups alphabetically by default
2026-09-27: detect Klipper runtime parameters ({params.X}, {rawparams.X}, {input.X}) in parsed macros and open the parameter dialog — values are sent as MACRONAME X=value arguments
2026-09-27: allow macro buttons to be clicked without a connected printer — when not connected the gcode is logged and a hint toast is shown instead of failing silently
2026-09-27: deliver parsed macro preferences via the getKlipperMacros API response — ko.mapping flattens nested dict values in the settings tree to empty objects, so the frontend can't read parsedMacros from there
2026-09-27: fix parsed macro preferences not being saved — use the onSettingsBeforeSave hook (the plugin settings dialog fires that, not onUserSettingsBeforeSave) and persist via a dedicated /config/saveParsedMacros route
2026-09-27: add "Collapse Klipper Macros panel by default" option and make parsed macro loading resilient to preference-merge errors
2026-09-27: store parsed macro preferences as a dict keyed by macro name so they survive a reload
2026-09-27: add a dedicated "Klipper Macros" sidebar panel below the "Macros" panel
2026-09-27: move the "Parse macros from printer.cfg" option to the "Klipper Macros" settings tab
2026-09-27: show source file, parameter indicator and gcode preview for parsed macros on the "Klipper Macros" settings tab
2026-09-27: add dedicated "Klipper Macros" settings tab to group parsed printer.cfg macros and choose where they are shown
2026-09-27: show parsed printer.cfg macros grouped on the sidebar and main tab
2026-09-26: place the "Macros" sidebar panel directly below the connection panel via the templatetypes hook
2026-09-26: check for missing [include ...] targets recursively in nested included files
2026-09-26: add option to collapse the "Macros" sidebar panel by default
2026-09-26: add dedicated "Macros" sidebar panel with a "Show Macros on the sidebar" option
2026-09-26: add [include ...] file path autocomplete to the config editor
2026-09-26: re-parse macros from the config files after saving in the editor
2026-09-26: show squiggle markers under missing [include ...] targets in the config editor linter
2026-09-25: parse gcode macros out of printer.cfg (incl. [include]d files) and show them as clickable buttons -closes #70
2026-09-25: add collapsible user-defined macro groups (e.g. Tests, Calibration) -closes #93
2026-09-25: add option to collapse the connection panel by default -closes #91
2021-05-06: another day another work on highlighter
2021-05-05: update highlighter
2021-05-04: work on ace highlighter
2021-05-04: update for sensor AD597
2021-05-04: shortStatus on sidebar -styling
2021-04-26: check values for xyz offsets
2021-04-26: more highlight work -closes #48
2021-04-15: add probe for z-endstop
2021-04-14: fix for config lines with =
2021-04-13: fix for config lines with =
2021-04-13: more syntax highlighting
2021-04-13: more syntax highlighting
2021-04-12: improve syntaxhighlight
2021-04-11: css
2021-04-11: -zooming on editor todo: editor is taking whole dialog
2021-04-07: added parsingCheck Checkbox -Strict mode disabled for parsing checks -reworked debug messages
2021-04-01: add newline
2021-04-01: work on offset dialog -show offset command in the logger -hide the offsetdialog
