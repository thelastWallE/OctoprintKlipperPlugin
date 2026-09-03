# OctoKlipper 0.4rc3

This release candidate focuses on **backup/restore improvements**, **safer sudo handling**, and a **UI overhaul** of the settings dialogs.

## ✨ New

- **Better config backups** — backups are now kept in an `archive/` folder (previous versions) plus a `current/` duplicate, so OctoPrint's own backup always holds the latest config state.
- **Restore servicefile backups** — servicefile backups can be restored and deployed to the real path (`/etc/default/klipper`) via sudo. If passwordless sudo isn't configured, you'll be asked for the sudo password.
- **Backup type tags** — the backup list now shows whether an entry is a `Config` or a `Servicefile`, and restore handles each type correctly.
- **Sudo password safety check** — before a sudo password is sent, the plugin checks the connection: HTTPS and localhost are fine, anything else asks for your confirmation first.

## 🎨 UI improvements

- **Small dialogs fixed** — the assisted bed leveling, coordinate offset, macro parameter, and PID tuning dialogs no longer clip text over button/input borders.
- **Macros settings reworked** — the macro list is now a proper table with an *Add Macro* footer row, a live button preview that shows the macro name as you type, and a style selector that clears the custom color. The example command box is pinned to the bottom of the tab.
- **Fixes** — pressing Enter in an input no longer triggers unrelated buttons, the Klipper Tab / Sidebar checkboxes are aligned with their labels, and the copy-to-clipboard icon no longer overlaps the example command text.

## 📝 Notes

- Compatible with OctoPrint 1.11.x and OctoPrint 2.0.
- Python 3.10+.
- German translations updated.

---

# OctoKlipper 0.4

This release brings OctoKlipper back up to date with the **newer OctoPrint versions** and improves **Windows support**, while adding a brand-new **Monaco-based config editor** with a built-in **syntax linter**.

## ✨ New

- **Monaco editor** — the config editor has been migrated from Ace to Monaco: better rendering, smoother scrolling, and a proper Monokai theme.
- **Syntax linter (squiggle lines)** — errors are underlined directly in the editor:
  - Squiggles appear automatically as you type (debounced, no popups).
  - The check also runs when the editor opens.
  - The manual **Check Syntax** button still shows the full error message.
- **Config versioning plan** — a design document for keeping the last 5 versions of every config plus a revert button (coming in a follow-up).

## 🔧 Compatibility & platform fixes

This release reworks the plugin for the **newer OctoPrint versions** (while staying backward compatible with 1.11.x) and fixes several **Windows-specific** issues that surfaced in that process:

- **OctoPrint compatibility** — updated blueprint protection, permissions, and internal APIs for the newer OctoPrint versions.
- **Windows path handling** — fixed path-separator handling when saving configs in subfolders or the baseconfig, and when restoring backups.
- **Config editor fixes** — "Reload from file" and backup preview now load the actual content correctly.
- **Toast/popup fixes** — error notifications now display their message properly.
- **Backup/restore** — saving and restoring backups no longer fail on paths with trailing separators.

## 📝 Notes

- Compatible with OctoPrint 1.11.x and the upcoming OctoPrint 2.0.
- Python 3.10+.
