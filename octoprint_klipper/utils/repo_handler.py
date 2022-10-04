# -*- coding: utf-8 -*-
import os
import re

from flask_babel import gettext
import pkg_resources

import octoprint_klipper.utils.extra as extra
import octoprint_klipper.utils.logger as logger


def retrieve_git_tag(self, source_path):
    whole_success = True
    # TODO Drop python2.7 support like a hot potatoe
    cmd = "git -C " + source_path + " rev-list --tags --max-count=1"
    commit_hash, status = extra.execute_command(self, cmd)
    if not status:
        whole_success = False
    cmd = "git -C " + source_path + " describe --tags " + commit_hash
    tag, status = extra.execute_command(self, cmd)
    if not status:
        whole_success = False
    cmd = "git -C " + source_path + " rev-list " + tag + "..HEAD --count"
    count, status = extra.execute_command(self, cmd)
    if not status:
        whole_success = False
    if not whole_success:
        return commit_hash + " /\n " + tag + " /\n " + count, False
    return "" + tag + "-" + count + "", True


def retrieve_remote_git_tag(self, remote):
    # TODO Drop python2.7 support like a hot potatoe
    # Klipper Repo: https://github.com/Klipper3D/klipper.git
    # OctoKlipper Repo: https://github.com/thelastWallE/OctoprintKlipperPlugin.git

    if not self._connectivity_checker.online:
        return str(gettext("We are not online")), False

    # I leave this for debuging purposes
    whole_git_version, status = extra.execute_command(self, "git --version")
    whole_git_version.strip().split()
    logger.log_info(
        self, "wholeline git version:" + whole_git_version[2], only_logging=True
    )

    # split if we are on windows
    git_version = whole_git_version[2].split(".windows")[0]
    logger.log_info(self, "parsed git version:" + git_version, only_logging=True)

    logger.log_info(self, "Retrieving remote tag for " + remote, only_logging=True)
    cmd = (
        "git ls-remote --exit-code --refs --tags "
        + remote
        + " | cut --delimiter='/' --fields=3 | sort -V | tail --lines=1"
    )

    # cmd = "git ls-remote --refs --sort=v:refname --tags " + remote
    # + " | tail --lines=1 | cut --delimiter='/' --fields=3"
    output, status = extra.execute_command(self, cmd)
    logger.log_info(
        self, "retrieve_remote_git_tag Output: " + output, only_logging=True
    )
    return output, status


# Parse the git version from the command line.  This code
# is borrowed from Klipper.
def retrieve_git_version(self, source_path):
    # Obtain version info from "git" program
    cmd = "git -C " + source_path + " describe --always --tags --long --dirty"
    output, status = extra.execute_command(self, cmd)
    if status:
        logger.log_info(
            self, "retrieve_git_version Output: " + output, only_logging=True
        )
        tag_match = re.match(r"v\d+\.\d+\.\d+", output)
        if tag_match is not None:
            return output, status
        # This is likely a shallow clone.  Resolve the tag and manually create
        # the version string

        tag = retrieve_git_tag(self, source_path)
        return "t" + tag + "-g" + output + "-shallow", status
    return output, status


def get_software_version(self):
    output = "?"

    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])),
            "",
        )
    )

    output, status = retrieve_git_version(self, klipper_path)
    if not status:

        vfile = os.path.join(klipper_path, "klippy", ".version")

        try:
            if extra.file_exist(self, vfile, PopUp=False):
                output = vfile.read_text().strip()
        except Exception:
            logger.log_error(
                self,
                gettext("Unable to extract version from file"),
                only_logging=True,
            )
            return "?", False
    return output, status


def update_klipper_host(self, tag):
    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])),
            "",
        )
    )
    cmd = "git -C " + klipper_path + " fetch --all --tags"
    extra.execute_command(self, cmd)
    cmd = "git -C " + klipper_path + " pull"
    extra.execute_command(self, cmd)
    cmd = "git -C " + klipper_path + " checkout " + tag

    return extra.execute_command(self, cmd)
