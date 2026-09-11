# API for Third Party

**The api endpoints require an API-Key to access them.**
**You can easily create one in OctoPrint.**

All endpoints are served under the plugin blueprint prefix `/plugin/klipper`.
Every request must carry the `X-Api-Key` header (or use an authenticated
session). The plugin's blueprint is login-protected and CSRF-protected, and
most endpoints additionally require the `PLUGIN_KLIPPER_CONFIG` permission
(admin by default).

## Authentication

Add the API key to every request:

    X-Api-Key: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

## Example for a jQuery request

This will get the content of `printer.cfg` from the Klipper config path that
is set in OctoKlipper:

    const settings = {
      "async": true,
      "crossDomain": true,
      "url": "http://192.168.2.8:5001/plugin/klipper/klipper_configs/printer.cfg",
      "method": "GET",
      "headers": {
        "Accept": "*/*",
        "User-Agent": "Thunder Client (https://www.thunderclient.com)",
        "X-Api-Key": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
      }
    };

    $.ajax(settings).done(function (response) {
      console.log(response);
    });

## Example for a XMLHttpRequest

This will get the output of a backed up configfile:

    const data = null;

    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;

    xhr.addEventListener("readystatechange", function () {
      if (this.readyState === this.DONE) {
        console.log(this.responseText);
      }
    });

    xhr.open("GET", "http://192.168.2.8:5001/plugin/klipper/backup/archive/printer.cfg");
    xhr.setRequestHeader("Accept", "*/*");
    xhr.setRequestHeader("User-Agent", "Thunder Client (https://www.thunderclient.com)");
    xhr.setRequestHeader("X-Api-Key", "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

    xhr.send(data);

**You will get a response back with a key named `status`**
**that indicates if the request was successful or not.**

---

## Storage & Paths

- **Config storage target**: `klipper_configs` — this is the value used for
  the `<target>` path segment in the config endpoints. It maps to the
  directory configured in OctoKlipper under *Configuration → Config path*
  (e.g. `~/klipper_configs`).
- **Plugin data folder**: `<octoprint data>/data/klipper/`. Backups are
  stored here in subfolders:
  - `archive/` — previous versions of config files (created automatically
    when a config is overwritten).
  - `current/` — duplicates of the current config files, kept so OctoPrint's
    own backup holds every config, not only the ones saved through the plugin.
  - `servicefile/` — backed up Klipper service files (e.g.
    `Servicefile_x.bak`).
- **Backup type**: each entry in the backup list carries a `type` field that
  is either `"config"` or `"servicefile"`.

---

## Backup Endpoints

### Endpoint: `plugin/klipper/backup/list`

Method: GET

Gets all files in the backup directory (the plugin data folder). Each entry
includes name, absolute path, size, last-modified date, a download URL and
the backup type.

Example Response:

    {
      "status": "success",
      "data": {
        "files": [
          {
            "name": "archive/printer.cfg",
            "file": "/home/pi/.octoprint/data/klipper/archive/printer.cfg",
            "bytes": 5767,
            "mdate": "30.01.2022 15:50",
            "url": "/plugin/klipper/download/backup/archive/printer.cfg",
            "type": "config"
          },
          {
            "name": "archive/servicefile/Servicefile_1.bak",
            "file": "/home/pi/.octoprint/data/klipper/archive/servicefile/Servicefile_1.bak",
            "bytes": 3294,
            "mdate": "02.02.2022 08:19",
            "url": "/plugin/klipper/download/backup/archive/servicefile/Servicefile_1.bak",
            "type": "servicefile"
          }
        ]
      }
    }

### Endpoint: `plugin/klipper/backup/<filename>`

Method: GET

Gets the content of a backed up configuration file. `<filename>` is the
data-folder-relative path (e.g. `archive/printer.cfg`).

Example Response:

    {
      "status": "success",
      "data": {
        "body": {
          "content": "[printer]\n...",
          "file": "/home/pi/.octoprint/data/klipper/archive/printer.cfg"
        }
      }
    }

### Endpoint: `plugin/klipper/backup/<filename>`

Method: DELETE

Deletes a backed up configuration file.

Example Response:

    {
      "status": "success"
    }

### Endpoint: `plugin/klipper/backup/restore/<filename>`

Method: POST

Restores a backed up file.

- For **config** backups, the file is copied back to the directory specified
  in the OctoKlipper settings (the config path).
- For **servicefile** backups, the file is deployed to the real service file
  location (`/etc/default/klipper`) via `sudo`. In that case a `password`
  field in the JSON body is used as the sudo password.

Request body (JSON):

    {
      "password": "optional sudo password for servicefile restores"
    }

Example Response:

    {
      "status": "success"
    }

---

## Config Endpoints

The `<target>` path segment is always `klipper_configs`.

### Endpoint: `plugin/klipper/`

Method: GET

Lists the config files in the configured config path.

Query parameters:

- `filter` — optional file type filter.
- `recursive` — `true`/`false`, whether to recurse into subfolders.
- `force` — `true`/`false`, bypass the file list cache.

Example Response:

    {
      "status": "success",
      "data": {
        "files": [ ... ],
        "free": 123456789,
        "total": 987654321
      }
    }

### Endpoint: `plugin/klipper/<target>/<file>`

Method: GET

Gets the content of a config file. If `<file>` is `baseconfig`, the file
configured as the Klipper base config is returned (it may live outside the
config path).

Example Response:

    {
      "status": "success",
      "data": {
        "body": {
          "content": "[printer]\n...",
          "file": "/home/pi/klipper_configs/printer.cfg"
        }
      }
    }

### Endpoint: `plugin/klipper/<target>/<filename>`

Method: DELETE

Deletes a config file or folder.

Example Response:

    {
      "status": "success"
    }

### Endpoint: `plugin/klipper/<target>/<filename>`

Method: POST

Runs a file command. The command is sent in the JSON body.

Valid commands:

- `select` — select a file.
- `unselect` — unselect a file.
- `copy` — requires `destination`.
- `move` — requires `destination` and `force`.

Request body (JSON):

    {
      "command": "copy",
      "destination": "subfolder/printer_copy.cfg"
    }

Example Response (HTTP 201 for copy/move):

    {
      "name": "printer.cfg",
      "path": "subfolder/printer_copy.cfg",
      "origin": "klipper_configs",
      "refs": {
        "resource": "http://.../plugin/klipper/klipper_configs/subfolder/printer_copy.cfg",
        "download": "http://.../plugin/klipper/download/configs/klipper_configs/subfolder/printer_copy.cfg"
      }
    }

### Endpoint: `plugin/klipper/<target>`

Method: POST

Uploads a file or creates a folder.

- **File upload**: send multipart form data with `file`, `file.name`,
  `file.path`, and optionally `path`, `filename`, `noOverwrite` and
  `userdata` (JSON).
- **Create folder**: send form data with `foldername` and optionally `path`.

Example Response (file upload, HTTP 201):

    {
      "files": {
        "klipper_configs": {
          "name": "printer.cfg",
          "path": "printer.cfg",
          "origin": "klipper_configs",
          "refs": {
            "resource": "http://.../plugin/klipper/klipper_configs/printer.cfg",
            "download": "http://.../plugin/klipper/download/configs/klipper_configs/printer.cfg"
          }
        }
      },
      "done": true
    }

### Endpoint: `plugin/klipper/test`

Method: POST

Runs a file test. The command is sent in the JSON body.

Valid commands:

- `sanitize` — requires `storage`, `path`, `filename`.
- `exists` — requires `storage`, `path`, `filename`.

Request body (JSON):

    {
      "command": "exists",
      "storage": "klipper_configs",
      "path": "",
      "filename": "printer.cfg"
    }

Example Response (`exists`):

    {
      "exists": true,
      "suggestion": "printer_1.cfg"
    }

### Endpoint: `plugin/klipper/config/check`

Method: POST

Checks the given data for parsing errors (configparser syntax and float
validation for `bltouch`/`probe` offsets).

Request body (JSON):

    {
      "DataToCheck": "[printer]\n..."
    }

Example Response (success):

    {
      "status": "success"
    }

Example Response (error):

    {
      "status": "error",
      "error": {
        "message": "Klipper Configuration ..."
      },
      "line": 12
    }

### Endpoint: `plugin/klipper/config/backupAll`

Method: POST

Copies every config file from the configured config path into the plugin
data `current/` folder, so OctoPrint's own backup holds all config files.

Example Response:

    {
      "status": "success",
      "data": {
        "copied": [ "/home/pi/.octoprint/data/klipper/current/printer.cfg" ],
        "errors": []
      }
    }

### Endpoint: `plugin/klipper/config/save`

Method: POST

Saves a config file. If the file already exists and `hasNewName` is set
without `force`, the request is rejected.

Request body (JSON):

    {
      "filename": "printer.cfg",
      "DataToSave": "[printer]\n...",
      "hasNewName": false,
      "force": false
    }

Example Response:

    {
      "status": "success",
      "data": {
        "body": "Klipper config file saved!"
      }
    }

---

## Servicefile Endpoints

### Endpoint: `plugin/klipper/servicefile/modify`

Method: POST

Modifies the Klipper service file (`/etc/default/klipper`) so it points to
the configured base config. Only available on Linux.

Request body (JSON):

    {
      "PathToConfigs": "/home/pi/klipper_configs",
      "password": "optional sudo password"
    }

Example Response:

    {
      "status": "success"
    }

---

## Other Endpoints

### Endpoint: `plugin/klipper/restart`

Method: POST

Restarts the Klipper service using the configured restart command.

Example Response:

    {
      "status": "success",
      "data": {
        "message": "Klipper service restarted",
        "command": "sudo systemctl restart klipper"
      }
    }

### Endpoint: `plugin/klipper/serverinfo`

Method: GET

Returns the server operating system.

Example Response:

    {
      "status": "success",
      "data": {
        "body": "Linux"
      }
    }

### Endpoint: `plugin/klipper/update`

Method: POST

Updates Klipper to the latest remote tag. Refuses to run while the system is
throttled or a print job is running.

Request body (JSON):

    {
      "forced": false
    }

Example Response:

    {
      "status": "success",
      "data": {
        "body": "HEAD is now at ..."
      }
    }

### Endpoint: `plugin/klipper/install`

Method: POST

Installs Klipper. The install runs in the background; progress is streamed to
the frontend via plugin messages. Returns immediately.

Request body (JSON):

    {
      "password": "optional sudo password"
    }

Example Response:

    {
      "status": "success",
      "in_progress": true
    }

### Endpoint: `plugin/klipper/resetSettings`

Method: POST

Resets all plugin settings to their defaults.

Example Response:

    {
      "status": "success"
    }

### Endpoint: `plugin/klipper/settingsDefaults`

Method: GET

Returns the plugin's default settings (used for per-setting reset buttons).

Example Response:

    {
      "status": "success",
      "data": { ... }
    }

### Endpoint: `plugin/klipper/checkKlipperUpdate`

Method: GET

Checks whether Klipper is installed and what the latest remote tag is.

Query parameters:

- `remote` — optional git remote to check against (defaults to the configured
  remote).

Example Response:

    {
      "status": "success",
      "data": {
        "klipper_installed": true,
        "klipper_version": "v0.12.0-123-gabcdef",
        "latest_klipper_remote_tag": "v0.12.0",
        "latest_klipper_remote_tag_date": "2024-01-01"
      }
    }

### Endpoint: `plugin/klipper/checkOctoKlipperUpdate`

Method: GET

Checks the latest remote tag of the OctoKlipper plugin repository.

Example Response:

    {
      "status": "success",
      "data": {
        "latest_octoklipper_remote_tag": "v0.4rc4"
      }
    }

---

## Download Endpoints

These are served by Tornado `LargeResponseHandler` routes and require the
`PLUGIN_KLIPPER_CONFIG` permission.

### Endpoint: `plugin/klipper/download/configs/klipper_configs/<path>`

Method: GET

Downloads a config file from the configured config path as an attachment.

### Endpoint: `plugin/klipper/download/backup/<path>`

Method: GET

Downloads a backed up file from the plugin data folder as an attachment
(e.g. `archive/printer.cfg`).
