# API for Third Party

**The api endpoints require an API-Key to access them.  
You can easily create one in Octoprint.**

## Example for a jquery request

This will get the content of printer.cfg at the path that is set in OctoKlipper:

    const settings = {
      "async": true,
      "crossDomain": true,
      "url": "http://192.168.2.8:5001/plugin/klipper/config/printer.cfg",
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

    xhr.open("GET", "http://192.168.2.8:5001/plugin/klipper/backup/printer.cfg");
    xhr.setRequestHeader("Accept", "*/*");
    xhr.setRequestHeader("User-Agent", "Thunder Client (https://www.thunderclient.com)");
    xhr.setRequestHeader("X-Api-Key", "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

    xhr.send(data);

**You will get a response back with a key named 'status'  
that indicates if the request was successful or not.**

## Endpoint: plugin/klipper/backup/list

Method: GET

Gets all files in the backup directory

Example Response:

    {
      "data": {
        "files": [
          {
            "bytes": 5767,
            "file": "/home/pi/.octoprint/data/klipper/configs/printer.cfg",
            "mdate": "30.01.2022 15:50",
            "name": "printer.cfg",
            "url": "/plugin/klipper/download/backup/printer.cfg"
          },
          {
            "bytes": 3294,
            "file": "/home/pi/.octoprint/data/klipper/configs/probe.cfg",
            "mdate": "02.02.2022 08:19",
            "name": "probe.cfg",
            "url": "/plugin/klipper/download/backup/probe.cfg"
          }
        ]
      },
      "status": "success"
    }

## Endpoint: plugin/klipper/backup/<filename>

Method: DELETE

Deletes a backed up configuration file

Example Response:

    {
      "status": "success"
    }

## Endpoint: plugin/klipper/backup/list

Method: GET

Gets all files in the backup directory with name, path, size, date of last modified and an url to the file.

Example Response:

    {
      "data": {
        "files": [
          {
            "bytes": 5767,
            "file": "/home/pi/.octoprint/data/klipper/configs/printer.cfg",
            "mdate": "30.01.2022 15:50",
            "name": "printer.cfg",
            "url": "/plugin/klipper/download/backup/printer.cfg"
          },
          {
            "bytes": 3294,
            "file": "/home/pi/.octoprint/data/klipper/configs/probe.cfg",
            "mdate": "02.02.2022 08:19",
            "name": "probe.cfg",
            "url": "/plugin/klipper/download/backup/probe.cfg"
          }
        ]
      },
      "status": "success"
    }

## Endpoint: plugin/klipper/backup/restore/<filename>

Method: POST

Restores/Copies the backed up file to the directory that is specified in the settings of OctoKlipper.

Example Response:
