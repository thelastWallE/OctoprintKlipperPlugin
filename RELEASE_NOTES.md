# OctoKlipper 0.4rc4

This release candidate adds a **live klippy.log tail** and a **log path check** in the settings, plus **backup-all**, **servicefile fixes**, and **deploy script** improvements.

## ✨ New

- **Live klippy.log tail** — a new _Klippy Log_ tab on the main OctoKlipper tab tails `klippy.log` in real time, so you can watch for print stalls, retransmits, and other diagnostics without opening an SSH session. It auto-scrolls, has a Pause/Start toggle, and shows which file the backend is loading.
- **Log path check in settings** — the _Klipper Log File_ setting now has a **Check path** button that resolves the entered directory on the server and shows whether `klippy.log` exists there, so a wrong path is immediately obvious.
- **Backup all configs** — a button that copies every config file into the plugin data folder so OctoPrint's own backup holds all of them, not only the ones saved through the plugin. This also runs automatically right before a backup is created.

## 🐛 Fixes

- **Log file location** — the Klipper log directory is now resolved correctly (the old code stripped the last path segment). On Windows, the Linux default `/tmp/` is mapped to the OS temp folder, and forward-slash paths like `C:/Users/...` are normalized properly.
- **Log analyzer & tail requests** — the plugin's simple API calls now send the correct JSON `Content-Type`, which fixes the analyzer's empty file list and the live tail (previously returned HTTP 415).
- **Settings path check** — an empty path now falls back to the saved setting, so the hint matches what the main-tab viewer loads.
- **Servicefile base config path** — the servicefile now points to the actual config file Klipper loads instead of a literal `~` path.
- **Servicefile password dialog** — the Apply button in the servicefile password dialog now works (it referenced properties that didn't exist on the viewmodel).

## 🔧 Tooling

- **Deploy script** — `deployOctoKlipper.ps1` now falls back to a non-editable zip install for OctoPrint 1.11.x (editable installs crash there with modern setuptools/pip) and fixes directory-related commands.
- **API docs** — `docs/api.md` updated to reflect the current API routes.

## 📝 Notes

- Compatible with OctoPrint 1.11.x and OctoPrint 2.0.
- Python 3.10+.
- German translations updated.

---

# OctoKlipper 0.4rc3

This release candidate focuses on **backup/restore improvements**, **safer sudo handling**, and a **UI overhaul** of the settings dialogs.

## ✨ New

- **Better config backups** — backups are now kept in an `archive/` folder (previous versions) plus a `current/` duplicate, so OctoPrint's own backup always holds the latest config state.
- **Restore servicefile backups** — servicefile backups can be restored and deployed to the real path (`/etc/default/klipper`) via sudo. If passwordless sudo isn't configured, you'll be asked for the sudo password.
- **Backup type tags** — the backup list now shows whether an entry is a `Config` or a `Servicefile`, and restore handles each type correctly.
- **Sudo password safety check** — before a sudo password is sent, the plugin checks the connection: HTTPS and localhost are fine, anything else asks for your confirmation first.

## 🎨 UI improvements

- **Small dialogs fixed** — the assisted bed leveling, coordinate offset, macro parameter, and PID tuning dialogs no longer clip text over button/input borders.
- **Macros settings reworked** — the macro list is now a proper table with an _Add Macro_ footer row, a live button preview that shows the macro name as you type, and a style selector that clears the custom color. The example command box is pinned to the bottom of the tab.
- **Fixes** — pressing Enter in an input no longer triggers unrelated buttons, the Klipper Tab / Sidebar checkboxes are aligned with their labels, and the copy-to-clipboard icon no longer overlaps the example command text.

## 📝 Notes

- Compatible with OctoPrint 1.11.x and OctoPrint 2.0.
- Python 3.10+.
- German translations updated.

---

# OctoKlipper 0.4

This release brings OctoKlipper up to date with the **newer OctoPrint versions** (while staying backward compatible with 1.11.x), adds a brand-new **Monaco-based config editor** with a built-in **syntax linter**, and significantly improves **backup/restore**, **sudo handling**, and the **settings UI**.

## ✨ New

- **Monaco editor** — the config editor has been migrated from Ace to Monaco: better rendering, smoother scrolling, and a proper Monokai theme.
- **Syntax linter (squiggle lines)** — errors are underlined directly in the editor:
  - Squiggles appear automatically as you type (debounced, no popups).
  - The check also runs when the editor opens.
  - The manual **Check Syntax** button still shows the full error message.
- **Better config backups** — backups are now kept in an `archive/` folder (previous versions) plus a `current/` duplicate, so OctoPrint's own backup always holds the latest config state.
- **Backup all configs** — a button that copies every config file into the plugin data folder so OctoPrint's own backup holds all of them, not only the ones saved through the plugin.
- **Restore servicefile backups** — servicefile backups can be restored and deployed to the real path (`/etc/default/klipper`) via sudo. If passwordless sudo isn't configured, you'll be asked for the sudo password.
- **Backup type tags** — the backup list now shows whether an entry is a `Config` or a `Servicefile`, and restore handles each type correctly.
- **Sudo password safety check** — before a sudo password is sent, the plugin checks the connection: HTTPS and localhost are fine, anything else asks for your confirmation first.
- **Config versioning plan** — a design document for keeping the last 5 versions of every config plus a revert button (coming in a follow-up).

## 🎨 UI improvements

- **Macros settings reworked** — the macro list is now a proper table with an _Add Macro_ footer row, a live button preview that shows the macro name as you type, and a style selector that clears the custom color. The example command box is pinned to the bottom of the tab.
- **Small dialogs fixed** — the assisted bed leveling, coordinate offset, macro parameter, and PID tuning dialogs no longer clip text over button/input borders.
- **Fixes** — pressing Enter in an input no longer triggers unrelated buttons, the Klipper Tab / Sidebar checkboxes are aligned with their labels, and the copy-to-clipboard icon no longer overlaps the example command text.

## 🔧 Compatibility & platform fixes

This release reworks the plugin for the **newer OctoPrint versions** (while staying backward compatible with 1.11.x) and fixes several **Windows-specific** issues that surfaced in that process:

- **OctoPrint compatibility** — updated blueprint protection, permissions, and internal APIs for the newer OctoPrint versions.
- **Windows path handling** — fixed path-separator handling when saving configs in subfolders or the baseconfig, and when restoring backups.
- **Config editor fixes** — "Reload from file" and backup preview now load the actual content correctly.
- **Toast/popup fixes** — error notifications now display their message properly.
- **Backup/restore** — saving and restoring backups no longer fail on paths with trailing separators.
- **Servicefile path fix** — the servicefile now points to the actual base config file (the `~` in the path is expanded correctly).
- **API documentation** — `docs/api.md` rewritten to document the current routes, methods, request/response formats, and the new backup paths.

## 🛠 Developer tooling

- **Deploy script** — a PowerShell script (`deploy/deployOctoKlipper.ps1`) that builds the zip, uploads it to the Raspberry Pi via SCP, installs it into the OctoPrint venv, and optionally restarts OctoPrint. Supports OpenSSH and PuTTY.
- **Zip script rewritten** — the packaging script was rewritten from VBScript to PowerShell (`.NET` `System.IO.Compression`), fixing unreliable COM-based zipping.

## 📝 Notes

- Compatible with OctoPrint 1.11.x and the upcoming OctoPrint 2.0.
- Python 3.10+.
- German translations updated.
