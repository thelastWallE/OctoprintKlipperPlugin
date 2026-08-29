# Config Versioning & Revert — Implementation Plan

**Status:** Draft
**Target:** OctoKlipper 0.4+
**Author:** Copilot (planning)

## 1. Goal

Give users a way to **revert a config file** to a previous version from inside the
config editor, keep the **last 5 versions of every config file** automatically, and
lay the groundwork for **git-based config versioning** (users attach their own repo).

## 2. Current State

- The plugin already snapshots a config to `<plugin_data_folder>/configs/` before
  every save of an existing file (`copy_cfg_to_backup` in `config_tools/CfgUtils.py`).
- A **Backups dialog** (`klipper_backups_dialog.jinja2` + `klipper_backup.js`) lists
  these snapshots and supports restore / delete / download / preview.
- Known issues already fixed in this session:
  - `copy_cfg_to_backup` produced a "Source and destination are the same" error when
    `config_path` ended with a separator (double-separator bug).
  - Backup list `name` had a leading separator on Windows (`\printer.cfg`), which broke
    the `backup/restore/<path:filename>` route (400 "Unsupported target for storage").

## 3. Design Overview

Three phases, each independently shippable:

| Phase | Feature | Scope |
|-------|---------|-------|
| 1 | Keep last **5 versions** per file | Backend storage model + pruning |
| 2 | **Revert button** in the config editor | Frontend UI + API |
| 3 | **Git repo** integration (future) | Optional backend, settings |

---

## Phase 1 — Version History (last 5 versions per file)

### 1.1 Storage model

Replace the single-snapshot-per-file model with a **versioned** model.

Current layout:
```
<plugin_data_folder>/configs/printer.cfg          # single snapshot (overwritten)
```

New layout:
```
<plugin_data_folder>/configs/printer.cfg/          # version folder per config
    printer.cfg.2026-08-29T21-04-00.cfg           # timestamped versions
    printer.cfg.2026-08-29T21-11-00.cfg
    ...
```

Alternative (flat, simpler): keep files side-by-side with a version suffix:
```
<plugin_data_folder>/configs/printer.cfg.1
<plugin_data_folder>/configs/printer.cfg.2
...
```
A `versions.json` (or the filename suffix) records ordering + source path.

**Recommendation:** flat files with a monotonically increasing version suffix
(`<name>.<n>.cfg`) plus a small `versions.json` index. Simpler to glob, prune, and
map back to the original file. Timestamps in the filename are also fine; the index
makes ordering explicit.

### 1.2 Save flow changes (`save_cfg` / `copy_cfg_to_backup`)

- On save of an existing file, instead of overwriting the single backup:
  1. Copy current on-disk content to the next version slot (`<name>.<n+1>.cfg`).
  2. Record `{source, version, timestamp}` in `versions.json`.
  3. **Prune** to the newest 5 versions for that source file (delete older ones).
- Keep the existing "Source and destination are the same" guard (already fixed).
- `is_new_file` behavior unchanged (no snapshot for brand-new files).

### 1.3 API

- `GET /backup/list` — extend entries with `version`, `timestamp`, `source`.
- `GET /backup/<name>` — unchanged (preview).
- `POST /backup/restore/<name>` — unchanged (restore a version).
- `DELETE /backup/<name>` — unchanged (delete a version).
- New: `GET /config/<path>/versions` — list versions for one config (used by the
  editor revert dialog).

### 1.4 Config setting

- `configuration.backup_count` (default `5`) — how many versions to keep.
  (There is already a `backupCount=3` default in `__init__.py`; align/reuse it.)

---

## Phase 2 — Revert Button in the Config Editor

### 2.1 UI

- Add a **"History" / "Revert"** button to the editor toolbar
  (`klipper_editor.jinja2`), next to "Reload from file" / "Check Syntax".
- Clicking it opens a dialog listing the versions of the **current** config
  (from `GET /config/<path>/versions`), newest first, with timestamp + size.
- Each row has **"Load into editor"** (preview/replace editor content) and
  **"Restore to disk"** (write the version back to the config path).

### 2.2 Behavior

- **Load into editor:** fetch the version content, set it in Monaco, mark editor
  dirty (so the user can review before saving). No write to disk.
- **Restore to disk:** confirm dialog, then write the version content to the config
  path (reuse `save_cfg` with `force`), refresh the file list, and reload the editor.
- Reuse the existing `klipper_backups_dialog` styling/components where possible;
  a dedicated `klipper_versions_dialog.jinja2` + `klipper_versions.js` is cleaner.

### 2.3 Files touched

- `templates/klipper_editor.jinja2` — add button.
- `templates/dialogs/configs.jinja2` or new `templates/klipper_versions_dialog.jinja2`.
- `static/js/klipper_editor.js` — open dialog, load/restore handlers.
- `static/js/klipper_versions.js` — new view model (or extend `klipper_backup.js`).
- `octoprint_klipper/__init__.py` — new `versions` route.
- `config_tools/CfgUtils.py` — version listing/restore helpers.

---

## Phase 3 — Git Repo Integration (future)

### 3.1 Concept

Let users point the plugin at a **git repository** that holds their configs. Git
becomes the versioning backend (replaces or augments the file-based snapshots).

### 3.2 Settings

- `configuration.git_repo` — local path or remote URL of the config repo.
- `configuration.git_auto_commit` (bool, default `true`) — commit on every save.
- `configuration.git_branch` — branch to use (default `main`).
- `configuration.git_remote` — optional remote to push to.

### 3.3 Behavior

- On save: `git add <file> && git commit -m "..."` (auto-commit).
- Revert: `git log -- <file>` → pick a commit → `git show <commit>:<file>` →
  write back (or `git checkout <commit> -- <file>`).
- The existing file-based backups remain as a fallback when no repo is configured.
- Requires `git` on the host (OctoPrint already shells out to git for updates).

### 3.4 Risks / notes

- Windows path handling (git on Windows, `core.autocrlf`).
- Large configs / many commits → keep history shallow or prune.
- Concurrency: guard against concurrent saves/commits (lock file).
- Security: never store credentials in the plugin; use the host's git credential
  helper / SSH agent.

---

## 4. Testing

- Unit tests (pytest) for:
  - Version slot creation + pruning (keep last N).
  - `versions.json` read/write.
  - Restore of a specific version.
  - Backup list names have no leading separator (regression).
- Manual / browser verification:
  - Save a config 6+ times → only 5 versions remain.
  - Revert button loads a version into the editor and restores to disk.
  - Restore from the existing Backups dialog still works.

## 5. Open Questions

- Should "Load into editor" auto-save or leave the editor dirty for review?
- Should versioning apply to the baseconfig too (it lives outside the storage)?
- Flat files vs. per-file folders for versions?
- Should the Backups dialog and the new Revert dialog be merged into one?

## 6. Suggested Milestones

1. **M1:** Phase 1 backend (versioned snapshots + pruning + `versions` API) + tests.
2. **M2:** Phase 2 UI (revert button + versions dialog) + browser verification.
3. **M3:** Phase 3 git integration (settings + commit-on-save + git revert) + docs.