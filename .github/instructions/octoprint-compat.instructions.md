---
description: "Use when writing or editing OctoKlipper plugin code that interacts with OctoPrint APIs — blueprint routes, simple API, templates, tornado download routes, imports, or permissions. Covers OctoPrint 2.0 compatibility patterns and 1.11.x backward compatibility."
applyTo: "octoprint_klipper/**/*.py"
---

# OctoPrint 2.0 Compatibility Patterns

OctoKlipper targets OctoPrint 2.0.0rc5+ and stays backward compatible with 1.11.x. These patterns must not regress.

## Blueprint protection

Blueprint routes are NOT login-protected by default in OctoPrint 2.0. Keep these methods in `octoprint_klipper/__init__.py`:

```python
def is_blueprint_protected(self):
    return True

def is_blueprint_csrf_protected(self):
    return True
```

## Simple API protection

```python
def is_api_protected(self):
    return True
```

## Template autoescape

```python
def is_template_autoescaped(self):
    return True
```

Never put raw HTML inside `{{ _('...') }}` strings — it will be escaped literally. Use plain text or move HTML outside the translation call.

## Tornado download routes

Every `LargeResponseHandler` in `route_hook` needs explicit `access_validation`:

```python
from octoprint.server import app
from octoprint.server.util.flask import permission_validator
from octoprint.server.util.tornado import access_validation_factory

config_download_access = access_validation_factory(
    app, permission_validator, Permissions.PLUGIN_KLIPPER_CONFIG
)

# in the handler dict:
dict(
    path=configpath,
    as_attachment=True,
    access_validation=config_download_access,
    path_validation=path_validation_factory(
        lambda p: not is_hidden_path(p), status_code=404
    ),
)
```

## Permissions, not @restricted_access

`@restricted_access` is deprecated in OctoPrint 2.0. Blueprint-level protection handles login. Use fine-grained permission decorators:

```python
@octoprint.plugin.BlueprintPlugin.route("/restart", methods=["POST"])
@Permissions.PLUGIN_KLIPPER_CONFIG.require(403)
def restart_klipper(self):
    ...
```

## Import fallbacks

`parse_firmware_line` moved to the serial_connector plugin in 2.0:

```python
try:
    from octoprint.plugins.serial_connector.serial_comm import parse_firmware_line
except ImportError:
    from octoprint.util.comm import parse_firmware_line
```

## Other hard rules

- `__plugin_pythoncompat__ = ">=3.10,<4"`
- Never import `pkg_resources` (removed in setuptools 84)
- Keep `plugin_requires = ["psutil", "sarge"]` in `setup.py` in sync with actual imports
