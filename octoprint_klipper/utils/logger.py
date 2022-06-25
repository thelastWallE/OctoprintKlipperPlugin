# -*- coding: utf-8 -*-
import extra


def log_info(self, message, only_logging=False):
    self._octoklipper_logger.info(message)
    if not only_logging:
        extra.send_message(
            self, type="log", subtype="info", title=message, payload=message
        )


def log_debug(self, message, only_logging=False):
    self._octoklipper_logger.debug(message)
    self._logger.info(message)
    if not only_logging:
        extra.send_message(
            self, type="console", subtype="debug", title=message, payload=message
        )


def log_error(self, error, only_logging=False):
    self._octoklipper_logger.error(error)
    self._logger.error(error)
    if not only_logging:
        extra.send_message(
            self, type="log", subtype="error", title=error, payload=error
        )
