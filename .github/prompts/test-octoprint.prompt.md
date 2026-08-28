---
description: "Test the OctoKlipper plugin against OctoPrint 2.0 in the workspace venv: reinstall the plugin, start OctoPrint, and verify it loads without errors."
name: "Test OctoKlipper against OctoPrint 2.0"
argument-hint: "Optional: extra checks to run"
agent: "agent"
---

Test the OctoKlipper plugin against OctoPrint 2.0.0rc5 in the workspace venv:

1. Reinstall the plugin in editable mode:
   `.\.venv\Scripts\pip install -e . --no-build-isolation`
2. Verify the plugin imports:
   `.\.venv\Scripts\python -c "import octoprint_klipper"`
3. Start OctoPrint and check the startup log for:
   - `OctoKlipper (0.4rc0)` registered as a third-party plugin
   - `PLUGIN_KLIPPER_CONFIG` / `PLUGIN_KLIPPER_FILES_LIST` / `PLUGIN_KLIPPER_MACRO` permissions added
   - No errors or tracebacks from `octoprint.plugins.klipper`
4. Report the results concisely.
