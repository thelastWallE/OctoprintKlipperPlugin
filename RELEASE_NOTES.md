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
