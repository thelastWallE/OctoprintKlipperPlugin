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
