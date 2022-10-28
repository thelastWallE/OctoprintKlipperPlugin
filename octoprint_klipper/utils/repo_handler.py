# -*- coding: utf-8 -*-
import os
import re
import platform
from distutils.version import LooseVersion

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
    if self._octoklipper_debug:
        output, _ = extra.execute_command(self, "git --version")
        splitted_output = output.strip().split()
        logger.log_info(self, "whole_line git version: " + splitted_output[2])

        # split if we are on windows
        git_version = splitted_output[2].split(".windows")[0]
        logger.log_info(self, "parsed git version: " + git_version)

    logger.log_info(self, "Retrieving remote tag for " + remote, only_logging=True)
    if platform.system() == "Windows":
        cmd = (
            "git ls-remote --exit-code --refs --tags "
            + remote
            + " | cut --delimiter='/' --fields=3"
        )
        output, status = extra.execute_command(self, cmd)
        logger.log_info(self, "Versionslist Cmd_Output:" + output, only_logging=True)
        versions_list = output.split("\n")
        versions_list.pop()
        if self._octoklipper_debug:
            logger.log_info(
                self,
                "Unsorted VersionList: " + str(versions_list),
                only_logging=True,
            )
        sorted_versions = sorted(versions_list, key=lambda v: LooseVersion(v))
        if self._octoklipper_debug:
            logger.log_info(
                self,
                "Sorted VersionList: " + str(sorted_versions),
                only_logging=True,
            )
    else:
        cmd = (
            "git ls-remote --exit-code --refs --tags "
            + remote
            + " | cut --delimiter='/' --fields=3 | sort -V"
        )

        # cmd = "git ls-remote --refs --sort=v:refname --tags " + remote
        # + " | tail --lines=1 | cut --delimiter='/' --fields=3"
        sorted_versions, status = extra.execute_command(self, cmd)
        logger.log_info(
            self,
            "Sorted VersionsList Cmd_Output: " + str(sorted_versions),
            only_logging=True,
        )

    version_lists = sort_versionlist(split_versionlist(sorted_versions))
    # get the last stable version number, split it at the delimiter
    last_stable_splitted = version_lists["stable_list"][-1].split(".")

    if len(version_lists["rc_list"]) > 0:
        # get the last rc version text and split it at the delimiter
        last_rc_with_rc = version_lists["rc_list"][-1].split(".")

        # split last rc version text then at any symbol if not a number
        last_rc_number = re.split(r"[a-zA-Z]+", last_rc_with_rc[-1])
        last_rc = last_rc_number[0]

        # change the last diget in the rc version to only include the number
        last_rc_with_rc[-1] = last_rc

        # get a list with that
        parsed_last_rc = last_rc_with_rc

        # compare the two versions and get the latest one
        # ["0", "3", "4"] and ["0", "3", "4", "6"] for example
        # step through the two strings simultaneous and compare the numbers if different in a step
        last_version = (
            version_lists["stable_list"][-1]
            if is_stable_last(last_stable_splitted, parsed_last_rc)
            else version_lists["rc_list"][-1]
        )
    else:
        last_version = version_lists["stable_list"][-1]
    return last_version, status


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


def split_versionlist(version_list):
    new_list = []
    rc_list = []

    for item in version_list:
        if not re.search(r"\d+rc", item):
            print(item + " move to normal List")
            new_list.append(item)
        else:
            print(item + " move to RC List")
            rc_list.append(item)
    return dict(rc_list=rc_list, stable_list=new_list)


def sort_versionlist(versions_dict):

    return dict(
        stable_list=sorted(versions_dict["stable_list"], key=lambda v: LooseVersion(v)),
        rc_list=sorted(versions_dict["rc_list"], key=lambda v: LooseVersion(v)),
    )


def is_stable_last(stable, rc):
    """Compares two lists with versiondigits stepwise.
    Iterates through the lists and
    if at a step the numbers are different it compares the numbers.
    If the single digit in 'stable' is greater returns True else False.
    Returns False if 'rc' is longer as 'stable' after the Iteration finished else returns True.
    For versions like '0.3.4' and '0.3.4.1'

    :param stable: first versionnumber(will have priority over 'rc')
    :type stable: str
    :param rc: second versionnumber
    :type rc: str
    :return: True if 'stable' has a higher version or is the same version
    :rtype: boolean
    """
    if len(stable) <= len(rc):
        for (index, symbol) in enumerate(stable):
            if symbol != rc[index]:
                return int(symbol) > int(rc[index])
        if len(rc) > len(stable):
            return False
        else:
            return True
    else:
        for (index, symbol) in enumerate(rc):
            if symbol != stable[index]:
                return int(stable[index]) > int(symbol)
        return False
