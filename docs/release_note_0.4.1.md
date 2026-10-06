# OctoKlipper 0.4.1 rc

This release candidate adds the **macro system rework**: gcode macros parsed out of `printer.cfg` (and its `[include]`d files) are now groupable, orderable, and shown on the Klipper tab and/or dedicated sidebar panels. It also makes the connection panel compatible with **OctoPrint 2.0**, adds a few quality-of-life options, and completes the **Spanish, French and German** translations.

## 🧩 Macros & Groups

- **Parsed printer.cfg macros** — gcode macros are parsed out of `printer.cfg` and its `[include]`d files (recursively, with cycle protection) and shown as clickable buttons.
- **Sidebar panels & settings tab** — dedicated "Macros" and "Klipper Macros" panels below the connection panel, plus a "Klipper Macros" settings tab to assign each macro to a group and choose where it is shown.
- **Group management** — create, rename, reorder and delete groups; control display order (empty = alphabetical); groups are collapsible with the state remembered across reloads.
- **Runtime parameters** — macros using `{params.X}`, `{rawparams.X}` or `{input.X}` open a parameter dialog and are sent as `MACRONAME X=value` arguments.
- **Offline execution** — macro buttons work without a connected printer; the command is logged and a hint is shown instead of failing silently.
- **Polish** — description tooltips, source-file display, bordered group containers, and truncated long macro names.

## 🎨 UI improvements

- **Macro button polish** — improved styling/colors, group borders, and a grid layout for the parsed macro buttons.
- **Wider Group column** — the macro Group column in the settings table is now wider and dynamic.
- **Group background styling** — macro groups get a subtle background to separate them visually.

## 🔧 Compatibility & platform fixes

- **OctoPrint 2.0 connection panel** — the connection panel is now compatible with OctoPrint 2.0.
- **Setting label renamed** — the "Klipper Log File" setting is now labeled "Klipper Log Path".
- **Auto-collapse menu option** — an option to auto-collapse the OctoKlipper menu (closes #91).

## 🌍 Translations

- **Spanish and French are now fully translated** — the plugin is completely available in both languages.
- **German is complete again** — every string added since the last release is now translated as well.

## 📝 Notes

- Compatible with OctoPrint 1.11.x and the upcoming OctoPrint 2.0.
- Python 3.10+.
- Ships translations for German, Spanish and French.
