# OctoKlipper 0.5.0 rc2

A follow-up to [0.5.0 rc1](release_note_0.5.0.md) that fixes the most common
reason OctoPrint never sees a working Klipper connection, gets the settings gear
out of the sidebar panels, and restores the translated sidebar panel.

## 🧭 Setup Wizard

The wizard's serial-port step now recognises the modern Klipper layout and can
switch to it in one click.

- **Use detected port** — when the configured port is not usable but Klipper's
  virtual serial port was found elsewhere, the step offers this action instead
  of the old "Add port". It switches the configured port to
  `~/printer_data/comms/klippy.serial` **and** swaps that path into OctoPrint's
  additional serial ports, replacing the old entry instead of adding a second
  one, so no dead path is left behind. Only paths from the server's own
  candidate list that actually exist are accepted, so the action cannot point
  OctoPrint at an arbitrary file.
- **No more dead `/tmp/printer`** — modern Klipper installs (the
  `~/printer_data` layout) never create `/tmp/printer`; the virtual port is
  `~/printer_data/comms/klippy.serial`. OctoKlipper now upgrades a configured
  port that is still the legacy default as soon as that file exists. An empty
  setting is upgraded as well; a port you picked is left alone. The switch is
  logged as
  `Switched the klipper serial port from /tmp/printer to /home/pi/printer_data/comms/klippy.serial.`
- **Fixes show up immediately** — wizard fixes are now written with a forced
  save and announced through OctoPrint's settings-updated event, so every open
  client reloads its settings tree. Previously the in-memory value could already
  match while the settings file still held the old one, so OctoPrint's own
  serial settings kept showing the pre-fix port — and a later Save from that
  stale tree wrote it back.

See [setup-wizard.md](setup-wizard.md) for the full behaviour.

## 🎨 UI

- **Gear moved into the panel heading** — the settings gear of the "Macros" and
  "Klipper Macros" sidebar panels was a row inside the panel body, taking
  vertical space above the macro buttons. It now sits in the panel heading next
  to the title. OctoPrint renders that heading itself, so the gear is injected
  at startup; it stays hidden for users without settings permission, and its
  click no longer toggles the panel's collapse.

## 🌍 Translations

- **Klipper sidebar panel is translated again** — `klipper_sidebar.jinja2` uses
  OctoPrint's `{% try %}` tag, which plain Jinja2 cannot parse, so Babel
  silently extracted nothing from the file and strings such as **Open Editor**,
  **Connect**, **Printer Profile**, **Connection Type** and **Go to OctoKlipper
  Tab** were missing from every catalogue. `babel.cfg` now loads
  `octoprint.util.jinja.ExceptionHandlerExtension`, and those strings — plus the
  new Setup Wizard ones — are translated for German, Spanish and French.

## 📝 Notes

- Works with OctoPrint 1.11.x and 2.0, Python 3.10+.
- German, Spanish and French translations included.
- The startup upgrade only touches the legacy default (or an empty port): any
  other port you configured is left untouched, and the switch is announced in
  the OctoPrint log so it is easy to spot and undo.
