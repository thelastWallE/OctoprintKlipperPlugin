## Fork information:

- This is forked from [the original](https://github.com/mmone/OctoprintKlipperPlugin) version 0.2.5

## Fork Installation Information:

- Uninstall any other versions of the plugin using Plugin Manager or other means, as necessary.
- Install this version by using Plugin Manager's "From Url" option and entering this URL:
  `https://github.com/thelastWallE/OctoprintKlipperPlugin/archive/master.zip`

# OctoKlipper Plugin

This plugin assists in managing and monitoring the [Klipper](https://github.com/KevinOConnor/klipper) 3D printer firmware.

## Features

- Simplified connection dialog.
- Restart Host and MCU processes.
- User defineable macro buttons with optional parameter dialogs.
- Assisted bed leveling wizard with user definable probe points.
- PID Tuning Dialog.
- Dialog to set a coordinate offset for future GCODE move commands.
- Message log displaying messages from Klipper prepended with "//" and "!!".
- Klipper configuration editor
- Performance graph displaying key parameters extracted from the Klipper logs.

## Installation

Search for "Klipper" in OctoPrints Plugin Manager.

![Message Log](docs/assets/img/install.png)

or install manually using this URL / zip:

    https://github.com/thelastWallE/OctoprintKlipperPlugin/archive/master.zip

## Update

OctoPrint will inform you when a new version of this plugin becomes available.

## Configuration

Click on the wrench icon in the titlebar to open OctoPrints settings dialog. Select "OctoKlipper" at the bottom of the settings dialog.

## API for Third Party

This needs an API-Key to access the endpoint.
You can easily create one in Octoprint.

Example for a jquery request that will get the content of printer.cfg at the path that is set in OctoKlipper:

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

For endpoints see [octoprint_klipper/\_\_init\_\_.py](https://github.com/thelastWallE/OctoprintKlipperPlugin/blob/2e4fe3ba005550de4fe0e2f07ebb96109764a1c5/octoprint_klipper/__init__.py#L571-L853)

## Contributions

Also for the moment this plugin does what I wanted it to do, it is far from finished, pull requests are welcome. If you want to get started, the OctoPrint Plugin API is quite well documented here: [docs.octoprint.org/en/master/plugins](http://docs.octoprint.org/en/master/plugins).

- The [devel](https://github.com/thelastWallE/OctoprintKlipperPlugin/tree/devel) branch is the branch to merge new features and bugfixes to.
- The [rc](https://github.com/thelastWallE/OctoprintKlipperPlugin/tree/rc) branch is for Release Candidates and bugfixing them.
- The [master](https://github.com/thelastWallE/OctoprintKlipperPlugin/tree/master) branch is for Stable Releases.

## Screenshots

#### Message Log

![Message Log](docs/assets/img/message-log.png)

#### Bed Leveling

![Bed Leveling](docs/assets/img/bed-leveling.png)

#### PID Tuning

![PID Tuning](docs/assets/img/pid-tuning.png)

#### Coordinate Offset

![Coordinate Offset](docs/assets/img/offset.png)

#### Settings

![Settings](docs/assets/img/settings.png)

#### Klipper Config

![Klipper Config](docs/assets/img/klipper-config.png)

#### Performance Graph

![Performance Grap](docs/assets/img/performance-graph.png)
