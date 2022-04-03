import os
import re

from flask_babel import gettext

from extra import file_exist, run
from logger import log_error, log_info


def retrieve_git_tag(self, source_path):
    # TODO Drop python2.7 support like a hot potatoe
    cmd = "git -C " + source_path + " rev-list --tags --max-count=1"
    commit_hash = run(self, cmd)
    cmd = "git -C " + source_path + " describe --tags " + commit_hash
    tag = run(self, cmd)
    cmd = "git -C " + source_path + " rev-list " + tag + "..HEAD --count"
    count = run(self, cmd)
    return "" + tag + "-" + count + ""


def retrieve_remote_git_tag(self, remote):
    # TODO Drop python2.7 support like a hot potatoe
    # Klipper Repo: https://github.com/Klipper3D/klipper.git
    # OctoKlipper Repo: https://github.com/thelastWallE/OctoprintKlipperPlugin.git
    if not self._connectivity_checker.online:
        return gettext("We are not online")
    repo = self._repo_klipper if remote == "klipper" else remote
    cmd = (
        'git ls-remote --exit-code --refs --sort="version:refname" --tags '
        + repo
        + ' "*.*.*" | tail --lines=1 | cut --delimiter="/" --fields=3'
    )
    # cmd = "git ls-remote --refs --sort='v:refname' --tags " + remote
    # + " | tail --lines=1 | cut --delimiter='/' --fields=3"
    output = run(self, cmd)
    log_info(self, True, "retrieve_remote_git_tag Output: " + output)
    return output


# Parse the git version from the command line.  This code
# is borrowed from Klipper.
def retrieve_git_version(self, source_path):
    # Obtain version info from "git" program
    cmd = "git -C " + source_path + " describe --always --tags --long --dirty"
    ver = run(self, cmd)
    tag_match = re.match(r"v\d+\.\d+\.\d+", ver)
    if tag_match is not None:
        return ver
    # This is likely a shallow clone.  Resolve the tag and manually create
    # the version string

    tag = retrieve_git_tag(self, source_path)
    return "t" + tag + "-g" + ver + "-shallow"


def retrieve_last_git_tag(self, source_path):
    cmd = "git -C " + source_path + " describe --tags --abbrev=0"
    return run(self, cmd)


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
        if file_exist(self, vfile, PopUp=False):
            try:
                version = vfile.read_text().strip()
            except Exception:
                log_error(self, False, gettext("Unable to extract version from file"))
                version = "?"
    return version


def update_klipper_host(self, tag):
    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])),
            "",
        )
    )
    cmd = "git -C " + klipper_path + " fetch --all --tags"
    run(self, cmd)
    cmd = "git -C " + klipper_path + " pull"
    run(self, cmd)
    cmd = "git -C " + klipper_path + " checkout " + tag

    return run(self, cmd)
