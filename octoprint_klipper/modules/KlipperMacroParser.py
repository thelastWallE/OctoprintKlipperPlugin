# -*- coding: utf-8 -*-
"""Parse gcode macros out of Klipper config files.

Klipper config files are INI-like: sections ``[name]`` with ``key: value``
parameters. Macros are defined in ``[gcode_macro NAME]`` sections with a
``gcode:`` parameter holding the macro body (which may span multiple indented
continuation lines). Config files can include other files via
``[include path]`` directives (plain filenames or glob patterns).

This module is pure logic (no OctoPrint dependencies) so it can be unit tested
directly.
"""

from __future__ import absolute_import, division, print_function, unicode_literals

import glob
import os
import re

# Matches the plugin's parameter placeholder syntax used in the macro dialog,
# e.g. {label:Heater, default:extruder, options:extruder|extruder1}. Requires
# one of the known keys so plain Jinja2 expressions ({bed_temp}, {{ ... }}) are
# not mistaken for parameters.
_PARAM_PLACEHOLDER_RE = re.compile(
    r"\{[^{}]*\b(?:label|default|options|unit)\s*:[^{}]*\}"
)

_INCLUDE_RE = re.compile(r"^\s*\[include\s+(.+?)\s*\]\s*$", re.IGNORECASE)
_SECTION_RE = re.compile(r"^\s*\[([^\]]+)\]\s*$")
_GCODE_MACRO_RE = re.compile(r"^gcode_macro\s+(.+)$", re.IGNORECASE)
_KEY_VALUE_RE = re.compile(r"^\s*([^:#\s][^:]*?)\s*[:=]\s*(.*)$")


def _strip_comment(line):
    """Remove trailing comments (# or ;) from a config line."""
    for marker in ("#", ";"):
        idx = line.find(marker)
        if idx != -1:
            line = line[:idx]
    return line.rstrip()


def _iter_config_lines(content):
    """Yield (line_no, line) for non-empty, non-comment lines.

    ``line`` keeps leading whitespace so indented continuation lines can be
    distinguished from new sections/keys.
    """
    for line_no, raw in enumerate(content.splitlines(), start=1):
        line = _strip_comment(raw)
        if line.strip():
            yield line_no, line


def _resolve_include(include, base_dir):
    """Resolve an ``[include ...]`` value to a list of absolute file paths.

    Supports plain filenames and glob patterns. Relative paths are resolved
    against ``base_dir`` (the directory of the including file).
    """
    include = include.strip().strip('"').strip("'")
    if not include:
        return []
    if os.path.isabs(include):
        pattern = include
    else:
        pattern = os.path.join(base_dir, include)
    matches = sorted(glob.glob(pattern))
    return [os.path.realpath(m) for m in matches if os.path.isfile(m)]


def find_missing_includes(content, base_dir, _seen=None):
    """Find ``[include ...]`` directives whose target file does not exist.

    Recursively follows includes (with cycle protection), so missing files in
    nested includes are reported too. For a missing include in a nested file,
    the returned ``line``/``startColumn``/``endColumn`` point at the
    ``[include ...]`` directive in the ROOT content that leads to it, and
    ``chain`` lists the files (basenames) from the root to the file containing
    the missing include.

    Args:
        content (str): Config file content.
        base_dir (str): Directory to resolve relative includes against.
        _seen (set, optional): internal set of already-visited files for cycle
            protection.

    Returns:
        list: dicts with ``line``, ``include``, ``startColumn``, ``endColumn``
        (1-based) and ``chain`` for each missing include.
    """
    errors = []
    seen = _seen if _seen is not None else set()

    for line_no, raw in enumerate(content.splitlines(), start=1):
        line = _strip_comment(raw)
        m = _INCLUDE_RE.match(line)
        if not m:
            continue
        include = m.group(1).strip().strip('"').strip("'")
        if not include:
            continue
        resolved = _resolve_include(include, base_dir)
        if not resolved:
            start, end = m.span(1)
            errors.append(
                dict(
                    line=line_no,
                    include=include,
                    startColumn=start + 1,
                    endColumn=end + 1,
                    chain=[],
                )
            )
            continue
        # Recurse into each resolved file to catch missing includes deeper in
        # the include tree.
        for resolved_path in resolved:
            real = os.path.realpath(resolved_path)
            if real in seen:
                continue
            seen.add(real)
            nested_content = _read_file(real)
            nested_dir = os.path.dirname(real)
            for err in find_missing_includes(nested_content, nested_dir, seen):
                # Attribute the nested missing include to this include line in
                # the root content.
                start, end = m.span(1)
                errors.append(
                    dict(
                        line=line_no,
                        include=err["include"],
                        startColumn=start + 1,
                        endColumn=end + 1,
                        chain=[os.path.basename(real)] + err["chain"],
                    )
                )
    return errors


def _read_file(path):
    """Read a config file as text, tolerating encoding issues."""
    for encoding in ("utf-8", "latin-1"):
        try:
            with open(path, "r", encoding=encoding) as f:
                return f.read()
        except (IOError, UnicodeDecodeError):
            continue
    return ""


def _parse_macro_section(lines, section_name, source_file):
    """Extract a macro dict from a ``[gcode_macro NAME]`` section's lines."""
    name = section_name.strip()
    gcode_lines = []
    in_gcode = False
    for _line_no, line in lines:
        if in_gcode:
            # Continuation lines are indented; a non-indented line ends the
            # body (e.g. a following "description:" key or new section).
            if line.startswith((" ", "\t")):
                gcode_lines.append(line.strip())
                continue
            break
        m = _KEY_VALUE_RE.match(line)
        if m and m.group(1).strip().lower() == "gcode":
            in_gcode = True
            value = m.group(2).strip()
            if value:
                gcode_lines.append(value)
    gcode = "\n".join(gcode_lines)
    return dict(
        name=name,
        gcode=gcode,
        has_params=bool(_PARAM_PLACEHOLDER_RE.search(gcode)),
        source=source_file,
    )


def parse_macros(baseconfig_path):
    """Parse all gcode macros from a Klipper config tree.

    Reads ``baseconfig_path`` and follows ``[include ...]`` directives
    (recursively, with cycle protection). Includes are resolved relative to
    the directory of the file that contains the directive (matching Klipper).
    Returns a list of macro dicts with keys: ``name``, ``gcode``,
    ``has_params``, ``source``.

    Args:
        baseconfig_path (str): absolute path to the base config (printer.cfg).

    Returns:
        list: macro dicts in file/definition order.
    """
    if not baseconfig_path or not os.path.isfile(baseconfig_path):
        return []

    seen_files = set()
    macros = []

    def _walk(path):
        real = os.path.realpath(path)
        if real in seen_files:
            return
        seen_files.add(real)
        content = _read_file(real)
        lines = list(_iter_config_lines(content))
        file_dir = os.path.dirname(real)
        current_section = None
        section_lines = []

        def _flush_section():
            if current_section:
                m = _GCODE_MACRO_RE.match(current_section)
                if m:
                    macros.append(_parse_macro_section(section_lines, m.group(1), real))

        for _line_no, line in lines:
            inc = _INCLUDE_RE.match(line)
            if inc:
                _flush_section()
                current_section = None
                section_lines = []
                for inc_path in _resolve_include(inc.group(1), file_dir):
                    _walk(inc_path)
                continue
            sec = _SECTION_RE.match(line)
            if sec:
                _flush_section()
                current_section = sec.group(1)
                section_lines = []
                continue
            if current_section:
                section_lines.append((_line_no, line))
        _flush_section()

    _walk(baseconfig_path)
    return macros
