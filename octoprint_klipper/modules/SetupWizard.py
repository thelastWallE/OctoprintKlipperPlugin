# -*- coding: utf-8 -*-
"""Diagnostics for the OctoKlipper setup wizard.

Pure logic (no OctoPrint imports) so every check can be unit tested directly,
matching KlipperMacroParser / KlipperLogAnalyzer. The plugin layer feeds these
functions plain values and turns the results into the wizard's step list.

The wizard is a diagnostic + guided-fix tool: it never rewrites printer.cfg.
"""

from __future__ import absolute_import, division, print_function, unicode_literals

import os
import re

from flask_babel import gettext

from octoprint_klipper.modules.KlipperMacroParser import (
    _INCLUDE_RE,
    _SECTION_RE,
    find_missing_includes as _find_missing_includes,
    iter_config_tree,
    read_config_file,
)

# Sections that matter for an OctoPrint-driven Klipper workflow, with the
# severity to report when they are missing. Sourced from Klipper's
# Config_Reference.md and OctoPrint.md.
#
# [mcu] and [printer] are mandatory for Klipper to start at all. [virtual_sdcard]
# and [pause_resume] are not strictly required, but Klipper's own docs recommend
# them for an OctoPrint setup (virtual_sdcard.path should point at OctoPrint's
# upload directory; pause_resume gives position capture/restore).
def _required_sections():
    """The sections to check, with reasons translated for the active locale.

    Built per call (rather than as a module constant) so babel extracts the
    literal gettext() calls and the lookup uses the request's locale instead of
    the one in effect at import time.
    """
    return (
        (
            "mcu",
            "error",
            gettext(
                "The micro-controller link. Without it Klipper cannot talk to the printer."
            ),
            "https://www.klipper3d.org/Config_Reference.html#mcu",
        ),
        (
            "printer",
            "error",
            gettext(
                "High level printer settings (kinematics, max_velocity, max_accel). "
                "All three are mandatory."
            ),
            "https://www.klipper3d.org/Config_Reference.html#printer",
        ),
        (
            "virtual_sdcard",
            "warning",
            gettext(
                "Lets Klipper read g-code from a host directory. Klipper's docs recommend "
                "pointing path at OctoPrint's upload directory (~/.octoprint/uploads/)."
            ),
            "https://www.klipper3d.org/Config_Reference.html#virtual_sdcard",
        ),
        (
            "pause_resume",
            "warning",
            gettext(
                "Pause/Resume with position capture and restore. Without it OctoPrint's "
                "pause is degraded."
            ),
            "https://www.klipper3d.org/Config_Reference.html#pause_resume",
        ),
        (
            "exclude_object",
            "info",
            gettext("Enables cancelling individual objects during a print."),
            "https://www.klipper3d.org/Config_Reference.html#exclude_object",
        ),
        (
            "save_variables",
            "info",
            gettext(
                "Needed by OctoKlipper's Save Variables dialog (requires a filename option)."
            ),
            "https://www.klipper3d.org/Config_Reference.html#save_variables",
        ),
        (
            "idle_timeout",
            "info",
            gettext("Controls what Klipper does when the printer sits idle."),
            "https://www.klipper3d.org/Config_Reference.html#idle_timeout",
        ),
        (
            "respond",
            "info",
            gettext(
                "Lets macros send messages to the OctoPrint console (M118 / RESPOND)."
            ),
            "https://www.klipper3d.org/Config_Reference.html#respond",
        ),
    )

_SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2}

# Klipper's virtual serial port. The modern printer_data layout is preferred;
# /tmp/printer is the older location and the plugin's current default.
MODERN_SERIAL_PORT = "~/printer_data/comms/klippy.serial"
LEGACY_SERIAL_PORT = "/tmp/printer"

# Klipper wants "cancel" here: it keeps the connection alive when a print is
# cancelled, which is what OctoPrint expects.
EXPECTED_ERROR_HANDLING = "cancel"

# The Moonraker Connector is experimental. See docs/setup-wizard.md.
MOONRAKER_CONNECTOR_ID = "moonraker"
MOONRAKER_DEFAULT_PORT = 7125
def moonraker_warning():
    """The experimental-Moonraker warning, translated for the active locale.

    Built per call so babel extracts the literal and the lookup uses the
    request's locale.
    """
    return gettext(
        "The Moonraker Connector is experimental and unfinished. It is version "
        "0.1.0 with no published release, requires OctoPrint 2.0, and is still "
        "under development. OctoKlipper's macros, config editor, Save Variables "
        "and log analysis are built around the serial connection and are "
        "unverified against it."
    )

# Klipper raises this when it cannot read printer.cfg. Seeing it in the terminal
# after sending "status" is the documented proof that OctoPrint reached Klipper
# over the virtual serial port — it is a SUCCESS signal, not a failure.
EXPECTED_STATUS_ERROR = "Unable to open config file"


def resolve_path(value):
    """Expand ``~`` and environment variables in a configured path.

    Settings like ``configuration/klipper_path`` are stored as the user typed
    them (e.g. ``~/klipper09/klipper``). Every other part of the plugin expands
    them before touching the filesystem (see repo_handler.get_software_version),
    so the wizard must too — otherwise a perfectly valid path is reported as
    missing.

    Args:
        value (str): the raw setting value.

    Returns:
        str: the expanded, normalized path, or ``""`` for an empty value.
    """
    if not value:
        return ""
    return os.path.normpath(os.path.expandvars(os.path.expanduser(value)))


def additional_ports_path(octoprint_version):
    """Return the settings path holding OctoPrint's additional serial ports.

    OctoPrint 2.0 moved the serial settings to ``plugins.serial_connector.*``
    and installs a read-only compatibility overlay for the legacy ``serial.*``
    paths, so writes to the old path are silently dropped. Writing to the wrong
    path means the Klipper virtual serial port never shows up in the port list.

    Args:
        octoprint_version (str): the running OctoPrint version string, e.g.
            ``"2.0.0rc6"`` or ``"1.11.0"``.

    Returns:
        list: the settings path to read/write.
    """
    if octoprint_version and _is_octoprint_2(octoprint_version):
        return ["plugins", "serial_connector", "additionalPorts"]
    return ["serial", "additionalPorts"]


def is_octoprint_2(version):
    """True when ``version`` is OctoPrint 2.0.0 or newer.

    Parsed manually rather than via octoprint.util.version so this module stays
    free of OctoPrint imports (and therefore unit testable). Pre-release
    suffixes (``2.0.0rc6``) compare as their base version.
    """
    m = re.match(r"^\s*(\d+)\.(\d+)", str(version))
    if not m:
        return False
    return (int(m.group(1)), int(m.group(2))) >= (2, 0)


# Kept as a private alias for readability inside this module.
_is_octoprint_2 = is_octoprint_2


def find_missing_includes(baseconfig_path):
    """Find ``[include ...]`` directives whose target file does not exist.

    Walks the whole tree starting at ``baseconfig_path``, so missing includes in
    nested files are reported too.

    Args:
        baseconfig_path (str): absolute path to the base config (printer.cfg).

    Returns:
        list: dicts with ``line``, ``include``, ``startColumn``, ``endColumn``
        and ``chain`` for each missing include.
    """
    if not baseconfig_path or not os.path.isfile(baseconfig_path):
        return []
    return _find_missing_includes(
        read_config_file(baseconfig_path), os.path.dirname(baseconfig_path)
    )


def collect_sections(baseconfig_path):
    """Map every config section in the tree to the file that defines it.

    Starts at ``baseconfig_path`` (printer.cfg) and follows ``[include ...]``
    directives recursively, so a section defined in an included file counts as
    present.

    Args:
        baseconfig_path (str): absolute path to the base config (printer.cfg).

    Returns:
        dict: ``{section_name: realpath}``. Section names are lowercased;
        the first definition wins.
    """
    sections = {}
    for path, content in iter_config_tree(baseconfig_path):
        for _line_no, line in _iter_lines(content):
            if _INCLUDE_RE.match(line):
                continue
            m = _SECTION_RE.match(line)
            if not m:
                continue
            name = m.group(1).strip().lower()
            if name and name not in sections:
                sections[name] = path
    return sections


def check_required_sections(baseconfig_path_or_sections):
    """Report which sections an OctoPrint-driven Klipper setup is missing.

    Args:
        baseconfig_path_or_sections: either an absolute path to the base config
            (the tree is walked) or an already-collected sections dict.

    Returns:
        list: one dict per section, sorted errors first, with keys ``section``,
        ``present``, ``severity``, ``reason``, ``docs`` and ``source`` (the file
        defining it, or ``None``).
    """
    if isinstance(baseconfig_path_or_sections, dict):
        sections = baseconfig_path_or_sections
    else:
        sections = collect_sections(baseconfig_path_or_sections)

    result = []
    for section, severity, reason, docs in _required_sections():
        result.append(
            dict(
                section=section,
                present=section in sections,
                severity=severity,
                reason=reason,
                docs=docs,
                source=sections.get(section),
            )
        )
    result.sort(key=lambda e: _SEVERITY_ORDER.get(e["severity"], 99))
    return result


def preferred_serial_port(current_port, modern_exists, modern_port=None, legacy_port=None):
    """Return the serial port to switch to, or ``None`` to leave it alone.

    Modern Klipper installs write their virtual serial port to
    ``~/printer_data/comms/klippy.serial`` and never create ``/tmp/printer``, so
    the legacy default can only ever fail on such a host. Only the legacy
    default (or an empty value) is upgraded — a port the user picked is left
    untouched.

    Args:
        current_port (str): the port configured in OctoKlipper.
        modern_exists (bool): whether the modern port file exists.
        modern_port (str, optional): the modern path; defaults to
            :data:`MODERN_SERIAL_PORT`.
        legacy_port (str, optional): the legacy default; defaults to
            :data:`LEGACY_SERIAL_PORT`.

    Returns:
        str or None: the absolute modern path to store, or ``None``.
    """
    modern_port = modern_port or MODERN_SERIAL_PORT
    legacy_port = legacy_port or LEGACY_SERIAL_PORT
    if not modern_exists:
        return None

    modern_path = os.path.expanduser(modern_port)
    current = (current_port or "").strip()
    if current and current != legacy_port and current != modern_port:
        return None
    if os.path.expanduser(current) == modern_path:
        return None
    return modern_path


def with_serial_port(additional_ports, new_port, old_port=None):
    """Return the additional-ports list with ``new_port`` in place.

    The previous entry is removed so the port list does not accumulate dead
    paths, and the new one is appended unless it is already there.

    Args:
        additional_ports (list): OctoPrint's configured additional ports.
        new_port (str): the port to add; an empty value changes nothing.
        old_port (str, optional): the entry to drop, e.g. the legacy default.

    Returns:
        list: the new list (never ``None``).
    """
    ports = [port for port in (additional_ports or []) if port and port != old_port]
    if new_port and new_port not in ports:
        ports.append(new_port)
    return ports


def validate_detected_port(value, candidates):
    """Validate a detected serial port before it is written to the settings.

    Only a path from the server's own candidate list, resolving to an existing
    file, is accepted, so the wizard fix cannot be abused as a generic settings
    writer.

    Args:
        value (str): the port reported by the client.
        candidates (list): known candidates from the wizard payload.

    Returns:
        str or None: the absolute path to store, or ``None`` when rejected.
    """
    if not value or not candidates:
        return None

    expanded = os.path.expanduser(value)
    if not os.path.isabs(expanded):
        return None
    if expanded not in [os.path.expanduser(candidate) for candidate in candidates if candidate]:
        return None
    if not os.path.exists(expanded):
        return None
    return expanded


def check_serial_port(port, additional_ports, port_exists, candidates=None):
    """Check whether the Klipper virtual serial port is usable.

    Args:
        port (str): the port configured in OctoKlipper.
        additional_ports (list): OctoPrint's configured additional ports.
        port_exists (bool): whether the port file exists on disk.
        candidates (list, optional): other known Klipper serial ports to
            suggest when the configured one is not usable.

    Returns:
        dict: ``port``, ``registered``, ``port_exists``, ``ok`` and
        ``suggestion`` (a better candidate, or ``None``).
    """
    registered = bool(port) and port in (additional_ports or [])
    suggestion = None
    if not (registered and port_exists):
        for candidate in candidates or []:
            if candidate and candidate != port:
                suggestion = candidate
                break
    return dict(
        port=port,
        registered=registered,
        port_exists=bool(port_exists),
        ok=bool(registered and port_exists),
        suggestion=suggestion,
    )


def check_error_handling(error_handling):
    """Check OctoPrint's "what to do on an unhandled printer error" setting.

    Klipper wants ``cancel``: keep the connection alive and cancel the print.

    Args:
        error_handling (str): the current value (``disconnect``/``cancel``/
            ``ignore``).

    Returns:
        dict: ``current``, ``expected`` and ``ok``.
    """
    return dict(
        current=error_handling,
        expected=EXPECTED_ERROR_HANDLING,
        ok=error_handling == EXPECTED_ERROR_HANDLING,
    )


def error_handling_to_settings(value):
    """Translate the 2.0 ``errorHandling`` enum into OctoPrint 1.11 settings.

    OctoPrint 1.11 has no ``serial.errorHandling``; it stores the same intent as
    two booleans. The mapping mirrors OctoPrint 2.0's own serial compatibility
    overlay (``init_serial_compat_overlay``).

    Args:
        value (str): ``disconnect``, ``cancel`` or ``ignore``.

    Returns:
        dict: the two 1.11 boolean settings, or ``{}`` for an unknown value.
    """
    mapping = {
        "disconnect": {"disconnectOnErrors": True, "ignoreErrorsFromFirmware": False},
        "cancel": {"disconnectOnErrors": False, "ignoreErrorsFromFirmware": False},
        "ignore": {"disconnectOnErrors": False, "ignoreErrorsFromFirmware": True},
    }
    return dict(mapping.get(value, {}))


def error_handling_from_settings(disconnect_on_errors, ignore_errors_from_firmware):
    """Derive the 2.0 ``errorHandling`` enum from OctoPrint 1.11's booleans.

    Inverse of :func:`error_handling_to_settings`. Either argument being ``None``
    (never saved) falls back to OctoPrint 1.11's default of disconnecting on
    errors.

    Args:
        disconnect_on_errors: the 1.11 ``serial.disconnectOnErrors`` value.
        ignore_errors_from_firmware: the ``serial.ignoreErrorsFromFirmware`` value.

    Returns:
        str: ``disconnect``, ``cancel`` or ``ignore``.
    """
    if ignore_errors_from_firmware:
        return "ignore"
    if disconnect_on_errors is None and ignore_errors_from_firmware is None:
        return "disconnect"
    if disconnect_on_errors:
        return "disconnect"
    return "cancel"


KLIPPER_SERVICE_CANDIDATES = ("klipper", "klippy")

# Tokens that are never the service name in a restart command.
_SERVICE_COMMAND_WORDS = frozenset(
    {
        "sudo",
        "doas",
        "service",
        "systemctl",
        "initctl",
        "restart",
        "start",
        "stop",
        "reload",
        "status",
        "is-active",
        "enable",
        "disable",
    }
)

KLIPPER_DOCS_URL = "https://www.klipper3d.org/Installation.html"


def parse_service_name(command):
    """Extract the systemd/SysV unit name from a configured service command.

    OctoKlipper's ``configuration/restart_service_system_command`` default is
    ``sudo service klipper restart``, but users may configure ``systemctl`` or a
    custom unit name. Rather than hardcoding "klipper", the name is taken from
    whatever that command references, so a renamed unit is still checked.

    Args:
        command (str): e.g. ``"sudo service klipper restart"``.

    Returns:
        str, optional: the unit name without any ``.service`` suffix, or
        ``None`` when nothing recognisable is present.
    """
    if not command:
        return None
    for raw in re.split(r"\s+", str(command).strip()):
        token = raw.strip().strip("'\"")
        if not token or token.startswith("-"):
            continue
        base = os.path.basename(token).lower()
        if base in _SERVICE_COMMAND_WORDS:
            continue
        if base.endswith(".service"):
            base = base[: -len(".service")]
        return base
    return None


def interpret_service_state(output):
    """Map ``systemctl is-active`` output onto a wizard service state.

    The command's exit code is not enough: it returns non-zero for anything
    that is not ``active``, so ``failed`` and ``inactive`` would be
    indistinguishable. The printed state is what matters.

    Args:
        output (str): the command's stdout.

    Returns:
        str: ``running``, ``stopped``, ``failed`` or ``unknown``.
    """
    lines = (output or "").strip().splitlines()
    state = lines[0].strip().lower() if lines else ""
    if state in ("active", "activating", "reloading"):
        return "running"
    if state in ("inactive", "deactivating", "dead"):
        return "stopped"
    if state == "failed":
        return "failed"
    return "unknown"


def check_klipper_host(platform_name, path, path_exists, service_state):
    """Report whether a usable Klipper host is present on this machine.

    Klipper's host software (klippy) is **Linux-only** — its install docs assume
    "a Linux-based host". On Windows/macOS a ``~/klipper`` directory is only a
    source checkout: cloning and reading the git version work fine, so the
    Update tab looks healthy, but nothing can actually run and OctoPrint can
    never connect to it locally. Saying that plainly is the whole point of this
    check.

    Args:
        platform_name (str): ``platform.system()``, e.g. ``"Linux"``.
        path (str): the resolved Klipper install path.
        path_exists (bool): whether that directory exists.
        service_state (str): from :func:`interpret_service_state`.

    Returns:
        dict: ``status`` (ok/warning/error/info), ``supported``, ``reason``,
        ``docs``, plus the echoed ``path``, ``path_exists`` and
        ``service_state``.
    """
    supported = platform_name == "Linux"

    if not supported:
        status = "warning"
        reason = gettext(
            "Klipper's host software only runs on Linux, so it cannot run on "
            "this %(platform)s host. The Klipper path below may exist as a "
            "source checkout, but OctoPrint cannot connect to a Klipper "
            "instance running here."
        ) % {"platform": platform_name or gettext("non-Linux")}
    elif not path_exists:
        status = "warning"
        reason = gettext("No Klipper installation found at %(path)s.") % {"path": path}
    elif service_state == "running":
        status = "ok"
        reason = gettext("The Klipper service is running.")
    elif service_state == "stopped":
        status = "warning"
        reason = gettext(
            "Klipper is installed but its service is not running. Start it "
            "before connecting."
        )
    elif service_state == "failed":
        status = "error"
        reason = gettext(
            "The Klipper service is in a failed state. Check the Klipper log "
            "for the reason it could not start."
        )
    else:
        status = "info"
        reason = gettext(
            "Klipper is installed, but the state of its service could not be "
            "determined."
        )

    return dict(
        status=status,
        supported=supported,
        reason=reason,
        docs=KLIPPER_DOCS_URL,
        path=path,
        path_exists=bool(path_exists),
        service_state=service_state,
    )


def check_moonraker(plugin_info):
    """Report the state of the experimental Moonraker Connector.

    Read-only: the wizard never writes the connector's settings. The result is
    always flagged experimental and always carries the warning text.

    Args:
        plugin_info (dict, optional): the plugin manager's info dict for
            ``moonraker_connector``, or ``None`` when it is not installed.

    Returns:
        dict: ``installed``, ``version``, ``experimental``, ``warning`` and
        ``port``.
    """
    installed = bool(plugin_info)
    version = None
    if installed:
        version = plugin_info.get("version")
    return dict(
        installed=installed,
        version=version,
        experimental=True,
        warning=moonraker_warning(),
        port=MOONRAKER_DEFAULT_PORT,
    )


def _iter_lines(content):
    """Yield (line_no, line) for non-empty, non-comment lines."""
    for line_no, raw in enumerate(content.splitlines(), start=1):
        line = raw
        for marker in ("#", ";"):
            idx = line.find(marker)
            if idx != -1:
                line = line[:idx]
        line = line.rstrip()
        if line.strip():
            yield line_no, line
