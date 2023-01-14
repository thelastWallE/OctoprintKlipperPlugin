# -*- coding: utf-8 -*-
import sys

if sys.version_info[0] < 3:
    import extra
else:
    import octoprint_klipper.utils.extra as extra


def log_info(self, message, only_logging=False):
    """Logs a message into the logfile, to the Klipper-Logmessages if debug_logging is enabled and to the console per default.

    :param message: The text to log
    :type message: str
    :param only_logging: don't log to the console if true, defaults to False
    :type only_logging: bool, optional
    """
    self._octoklipper_logger.info(message)

    if self._settings.get_boolean(["configuration", "debug_logging"]):
        extra.send_message(
            self, type="debug", subtype="info", payload="DEBUG: " + message
        )
    elif not only_logging:
        extra.send_message(self, type="log", subtype="info", payload=message)


def log_debug(self, message, only_logging=False):
    """Logs a message into the logfile, to the Klipper-Logmessages if debug_logging is enabled and to the console per default.

    :param message: The text to log
    :type message: str
    :param only_logging: don't log to the console if true, defaults to False
    :type only_logging: bool, optional
    """
    self._octoklipper_logger.debug(message)
    self._logger.info(message)

    if self._settings.get_boolean(["configuration", "debug_logging"]):
        extra.send_message(
            self, type="debug", subtype="debug", payload="DEBUG: " + message
        )
    elif not only_logging:
        extra.send_message(self, type="console", subtype="debug", payload=message)


def log_error(self, error, only_logging=False):
    """Logs a message into the logfile, to the Klipper-Logmessages if debug_logging is enabled and to the console per default.

    :param message: The text to log
    :type message: str
    :param only_logging: don't log to the console if true, defaults to False
    :type only_logging: bool, optional
    """
    self._octoklipper_logger.error(error)
    self._logger.error(error)

    if self._settings.get_boolean(["configuration", "debug_logging"]):
        extra.send_message(
            self, type="debug", subtype="error", payload="DEBUG: " + error
        )
    elif not only_logging:
        extra.send_message(
            self, type="log", subtype="error", title=error, payload=error
        )
