# -*- coding: utf-8 -*-
class SourceIsDestinationError(Exception):
    """
    Raised when source and destination are the same.
    """

    def __init__(self, message):
        self.message = message
