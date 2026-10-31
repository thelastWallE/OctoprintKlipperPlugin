# OctoKlipper 0.5.0 rc1

This release contains: macros parsed from your config,
a Setup Wizard that actually checks your setup, new editor tools, and
OctoKlipper's own dedicated settings dialog.

## 🧩 Macros

- **Macros from printer.cfg** — your gcode macros (including `[include]`d files) appear as buttons on the Klipper tab and in a sidebar panel.
- **Groups** — create, rename, reorder and collapse groups; choose per macro whether it shows on the tab, the sidebar or both.
- **Parameters** — macros with runtime parameters ask for them in a dialog before running.
- **Works offline** — buttons work without a connected printer.

## ⚙️ Settings

- **Own settings dialog** — OctoKlipper's settings moved into a larger dialog of their own, opened from the wrench on the Klipper tab, the gear on a macro panel, or the button in OctoPrint's settings.
- **Clearer macro tabs** — every field is labelled on the item itself, read-only values are visibly marked, and each parsed macro shows its command with syntax highlighting.

## 🧭 Setup Wizard

A step-by-step check that tells you what is already right, what is wrong, and
fixes what it safely can — it never rewrites your `printer.cfg`.

- Checks the config tree (includes and required sections), the Klipper host and service, the serial port and OctoPrint's error handling.
- Connects and verifies with a single click, and explains the messages Klipper sends back.
- Detects the experimental Moonraker Connector and warns that macro, editor and log features are untested with it.

## 🛠 Editor & tools

- **Save Variables** — read and update the values in your `[save_variables]` file, with the macros that use each one highlighted.
- **Create file**, better path checks that show the resolved path right away, and a Klipper Documentation link.
- Autocomplete for `[include ...]` paths, hints for missing includes, and the full Klipper configuration reference in the editor.

## 🔧 Fixes

- **Klipper's serial port now appears on OctoPrint 2.0.**
- **Connector options are usable again** with "Replace Connection Panel" enabled.
- **Saving an empty config file works** instead of failing.
- **Backups list** no longer shows folders, and long names wrap.
- **Upload progress** only appears while uploading.
- **Log filter dialog** now opens.
- **Pin names** like `P0.2` are coloured correctly in the editor.

## 📝 Notes

- Works with OctoPrint 1.11.x and 2.0, Python 3.10+.
- German, Spanish and French translations included.
- See [setup-wizard.md](setup-wizard.md) for the Setup Wizard in detail.
