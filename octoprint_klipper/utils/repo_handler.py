# -*- coding: utf-8 -*-
import os
import re

from flask_babel import gettext
import pkg_resources

import octoprint_klipper.utils.extra as extra
import octoprint_klipper.utils.logger as logger


def retrieve_git_tag(self, source_path):
    # TODO Drop python2.7 support like a hot potatoe
    cmd = "git -C " + source_path + " rev-list --tags --max-count=1"
    commit_hash = extra.execute_command(self, cmd)
    cmd = "git -C " + source_path + " describe --tags " + commit_hash
    tag = extra.execute_command(self, cmd)
    cmd = "git -C " + source_path + " rev-list " + tag + "..HEAD --count"
    count = extra.execute_command(self, cmd)
    return "" + tag + "-" + count + ""


def retrieve_remote_git_tag(self, remote):
    # TODO Drop python2.7 support like a hot potatoe
    # Klipper Repo: https://github.com/Klipper3D/klipper.git
    # OctoKlipper Repo: https://github.com/thelastWallE/OctoprintKlipperPlugin.git

    if not self._connectivity_checker.online:
        return gettext("We are not online")

    whole_git_version = extra.execute_command(self, "git --version").strip().split()
    logger.log_info(self, "wholeline git version:" + whole_git_version[2], only_logging=True)
    git_version = whole_git_version[2].split(".windows")[0]
    logger.log_info(self, "parsed git version:" + git_version, only_logging=True)
    if not pkg_resources.parse_version(git_version)>=pkg_resources.parse_version("2.18.0"):
        return gettext("We are not over git version 2.18.0. Please upgrade to the latest version.")

    repo = self._settings.get(["configuration", "remote_host_git"]) if remote == "klipper" else remote
    logger.log_info(self, "Retrieving remote tag for " + repo, only_logging=True)
    cmd = (
        "git ls-remote --exit-code --refs --sort=version:refname --tags "
        + repo
        + " | tail --lines=1 | cut --delimiter='/' --fields=3"
    )

    # cmd = "git ls-remote --refs --sort=v:refname --tags " + remote
    # + " | tail --lines=1 | cut --delimiter='/' --fields=3"
    output = extra.execute_command(self, cmd)
    logger.log_info(
        self, "retrieve_remote_git_tag Output: " + output, only_logging=True
    )
    return output


# Parse the git version from the command line.  This code
# is borrowed from Klipper.
def retrieve_git_version(self, source_path):
    # Obtain version info from "git" program
    cmd = "git -C " + source_path + " describe --always --tags --long --dirty"
    ver = extra.execute_command(self, cmd)
    logger.log_info(self, "retrieve_git_version Output: " + ver, only_logging=True)
    tag_match = re.match(r"v\d+\.\d+\.\d+", ver)
    if tag_match is not None:
        return ver
    # This is likely a shallow clone.  Resolve the tag and manually create
    # the version string

    tag = retrieve_git_tag(self, source_path)
    return "t" + tag + "-g" + ver + "-shallow"


def retrieve_last_git_tag(self, source_path):
    cmd = "git -C " + source_path + " describe --tags --abbrev=0"
    return extra.execute_command(self, cmd)


def get_software_version(self):
    version = "?"

    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])),
            "",
        )
    )

    try:
        version = retrieve_git_version(self, klipper_path)
    except Exception:
        vfile = os.path.join(klipper_path, "klippy", ".version")

        try:
            if extra.file_exist(self, vfile, PopUp=False):
                version = vfile.read_text().strip()
        except Exception:
            logger.log_error(
                self,
                gettext("Unable to extract version from file"),
                only_logging=True,
            )
            return "?"
    return version


def update_klipper_host(self, tag):
    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])),
            "",
        )
    )
    cmd = "git -C " + klipper_path + " fetch --all --tags"
    extra.run(self, cmd)
    cmd = "git -C " + klipper_path + " pull"
    extra.run(self, cmd)
    cmd = "git -C " + klipper_path + " checkout " + tag

    return extra.run(self, cmd)
