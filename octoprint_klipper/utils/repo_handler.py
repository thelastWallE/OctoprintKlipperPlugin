# -*- coding: utf-8 -*-
import os
import re
import datetime
import platform
from distutils.version import LooseVersion

from flask_babel import gettext

import octoprint_klipper.utils.extra as extra
import octoprint_klipper.utils.logger as logger


def _version_sort_key(version):
    """Return a sortable key for a version string.

    Robust to mixed numeric/string components (e.g. ``0.3.9rc4``) which
    ``LooseVersion`` cannot compare directly (it raises ``TypeError`` when a
    string component is compared with an int). Each component is wrapped in a
    ``(is_string, value)`` tuple so numbers sort before strings.
    """
    try:
        components = LooseVersion(version).version
    except Exception:
        return [(1, str(version))]
    return [(1, str(c)) if isinstance(c, str) else (0, c) for c in components]


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

    if self._octoklipper_debug:
        output, _ = extra.execute_command(self, "git --version")
        splitted_output = output.strip().split()
        logger.log_info(self, "whole_line git version: " + splitted_output[2])

        # split if we are on windows
        self._git_version = splitted_output[2].split(".windows")[0]
        logger.log_info(self, "parsed git version: " + self._git_version)

    logger.log_info(self, "Retrieving remote tag for " + remote, only_logging=True)
    # Use plain git ls-remote and parse the output in Python so it works on
    # Windows too (no dependency on unix tools like cut or sort -V).
    cmd = "git ls-remote --exit-code --refs --tags " + remote
    output, status = extra.execute_command(self, cmd)
    if not status:
        return output, False
    logger.log_info(self, "Versionslist Cmd_Output:" + output, only_logging=True)

    # Each line looks like "<sha>\trefs/tags/<tagname>"
    versions_list = []
    for line in output.split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) != 2:
            continue
        ref = parts[1]
        if not ref.startswith("refs/tags/"):
            continue
        tag = ref[len("refs/tags/") :]
        # skip peeled entries for annotated tags
        if tag.endswith("^{}"):
            continue
        versions_list.append(tag)

    if self._octoklipper_debug:
        logger.log_info(
            self,
            "Unsorted VersionList: " + str(versions_list),
            only_logging=True,
        )
    sorted_versions = sorted(versions_list, key=_version_sort_key)
    if self._octoklipper_debug:
        logger.log_info(
            self,
            "Sorted VersionList: " + str(sorted_versions),
            only_logging=True,
        )

    version_lists = sort_versionlist(split_versionlist(sorted_versions))
    last_stable = version_lists["stable_list"][-1]

    if len(version_lists["rc_list"]) > 0:
        last_rc = version_lists["rc_list"][-1]
        # Normalize the rc version to its base (strip the rcN suffix), e.g.
        # 0.3.9rc7 -> 0.3.9, so a stable release like 0.3.9.5 wins over its
        # own release candidates. If the rc is for a newer version (e.g.
        # 0.4.0rc1 vs stable 0.3.9.5) the rc wins.
        rc_base = re.sub(r"rc\d+$", "", last_rc)
        if rc_base and _version_sort_key(last_stable) >= _version_sort_key(
            rc_base
        ):
            last_version = last_stable
        else:
            last_version = last_rc
    else:
        last_version = last_stable
    return last_version, status


def retrieve_remote_git_tag_date(self, remote, tag):
    """Retrieve the release date of a remote git tag via the GitHub API.

    First tries the release API (which gives the release date directly). If the
    tag has no GitHub release, falls back to the tag's commit date.

    :param remote: git remote URL (e.g. https://github.com/Klipper3d/klipper.git)
    :type remote: str
    :param tag: the tag to look up (e.g. v0.13.0)
    :type tag: str
    :return: the release date (YYYY-MM-DD) and True on success
    :rtype: tuple
    """
    if not self._connectivity_checker.online:
        return str(gettext("We are not online")), False

    import json
    import re
    from urllib.request import Request, urlopen

    match = re.match(r"https?://github.com/([^/]+)/([^/]+?)(\.git)?$", remote)
    if not match:
        return "", False

    owner, repo = match.group(1), match.group(2)

    def _get_json(url):
        req = Request(url, headers={"User-Agent": "OctoKlipper"})
        with urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    # Try the release API first (gives the release date directly)
    try:
        data = _get_json(
            "https://api.github.com/repos/{}/{}/releases/tags/{}".format(
                owner, repo, tag
            )
        )
        published_at = data.get("published_at", "")
        if published_at:
            return published_at[:10], True
    except (OSError, ValueError, KeyError):
        pass

    # Fall back to the tag's commit date
    try:
        ref_data = _get_json(
            "https://api.github.com/repos/{}/{}/git/refs/tags/{}".format(
                owner, repo, tag
            )
        )
        sha = ref_data.get("object", {}).get("sha", "")
        obj_type = ref_data.get("object", {}).get("type", "")
        if obj_type == "tag":
            # annotated tag -> follow to the commit
            tag_data = _get_json(
                "https://api.github.com/repos/{}/{}/git/tags/{}".format(
                    owner, repo, sha
                )
            )
            sha = tag_data.get("object", {}).get("sha", "")
        if not sha:
            return "", False
        commit_data = _get_json(
            "https://api.github.com/repos/{}/{}/commits/{}".format(owner, repo, sha)
        )
        commit_date = (
            commit_data.get("commit", {}).get("committer", {}).get("date", "")
        )
        if commit_date:
            return commit_date[:10], True
    except (OSError, ValueError, KeyError):
        pass
    return "", False


# Parse the git version from the command line.  This code
# is borrowed from Klipper.
def retrieve_git_version(self, source_path):
    # Obtain version info from "git" program
    cmd = "git -C " + source_path + " describe --always --tags --long --dirty"
    output, is_success = extra.execute_command(self, cmd)
    if is_success:
        logger.log_info(
            self, "retrieve_git_version Output: " + output, only_logging=True
        )
        tag_match = re.match(r"v\d+\.\d+\.\d+", output)
        if tag_match is not None:
            return output, is_success
        # This is likely a shallow clone.  Resolve the tag and manually create
        # the version string

        tag = retrieve_git_tag(self, source_path)
        return "t" + tag + "-g" + output + "-shallow", is_success
    return output, is_success


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
            if extra.file_exists(self, vfile):
                output = vfile.read_text().strip()
        except Exception:
            logger.log_error(
                self,
                gettext("Unable to extract version from file: ")
                + "{}".format(vfile),
                only_logging=True,
            )
            return "?", False
    return output, status


def git_checkout(self, klipper_path, tag, force):
    # git checkout
    if force:
        t_now = datetime.datetime.now()
        t_now_str = (
            str(t_now.year)
            + str(t_now.month)
            + str(t_now.day)
            + "_"
            + str(t_now.hour)
            + str(t_now.minute)
        )
        stash_message = "stash at " + t_now_str + " before klipper checkout"
        # git stash "push" got added at 2.13.1 so we use "save" before that
        if LooseVersion(self._git_version) >= LooseVersion("2.13.1"):
            cmd = "git -C " + klipper_path + " stash push -m " + stash_message
        else:
            cmd = "git -C " + klipper_path + " stash save " + stash_message
        [_, stash_checkout_is_success] = extra.execute_command(self, cmd)
        if stash_checkout_is_success:
            cmd = "git -C " + klipper_path + " checkout " + tag + " --force"
    else:
        cmd = "git -C " + klipper_path + " checkout " + tag
    [output, is_success] = extra.execute_command(self, cmd)
    if force:
        output += "\nForced update after stashing with StashMessage: " + stash_message
    if not is_success:
        if re.search(
            r"Your local changes to the following files would be overwritten by",
            output,
        ):
            return ["uncommitted changes", False]
    if re.search(r"HEAD is now at", output):
        return [output, True]
    return [output, is_success]


def git_pull(self, klipper_path, force):
    # git pull
    if force:
        t_now = datetime.datetime.now()
        t_now_str = (
            str(t_now.year)
            + str(t_now.month)
            + str(t_now.day)
            + "_"
            + str(t_now.hour)
            + str(t_now.minute)
        )
        stash_message = "stash at " + t_now_str + " before klipper pull"
        if LooseVersion(self._git_version) >= LooseVersion("2.13.1"):
            cmd = "git -C " + klipper_path + " stash push -m " + stash_message
        else:
            cmd = "git -C " + klipper_path + " stash save " + stash_message
        [_, stash_pull_is_success] = extra.execute_command(self, cmd)
        if stash_pull_is_success:
            cmd = "git -C " + klipper_path + " reset --hard origin/master"
    else:
        cmd = "git -C " + klipper_path + " reset --hard origin/master"
    [pull_output, pull_is_success] = extra.execute_command(self, cmd)
    if not pull_is_success:
        if re.search(
            r"Your local changes to the following files would be overwritten by",
            pull_output,
        ):
            return ["uncommitted changes", False]
    return [pull_output, pull_is_success]


def update_klipper_host(self, tag, force=False):
    """Updates the klipper host from the git repo with git

    :param tag: The tag of the release to update to
    :type tag: str
    :param force: Should the update be forced, defaults to False
    :type force: bool, optional
    :return: output and status of the command
    :rtype: tuple
    """
    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])),
            "",
        )
    )
    cmd = "git -C " + klipper_path + " fetch --all --tags"
    extra.execute_command(self, cmd)

    [output, is_success] = git_checkout(self, klipper_path, tag, force)
    if is_success:
        [output, is_success] = git_pull(self, klipper_path, force)

    return [output, is_success]


def is_klipper_installed(self):
    """Check if the Klipper host software is already installed.

    :return: True if a git repository exists at the configured klipper path
    :rtype: bool
    """
    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])),
            "",
        )
    )
    return os.path.isdir(os.path.join(klipper_path, ".git"))


def get_install_script(self, klipper_path):
    """Determine the appropriate Klipper install script for this platform.

    :param klipper_path: path to the cloned Klipper repository
    :type klipper_path: str
    :return: absolute path to the install script or None if unsupported
    :rtype: str or None
    """
    system = platform.system()
    machine = platform.machine()

    if system == "Linux":
        # OctoPi / Raspberry Pi (or any ARM board) use the octopi script
        if os.path.exists("/etc/octopi_version") or machine.startswith(
            ("arm", "aarch64")
        ):
            return os.path.join(klipper_path, "scripts", "install-octopi.sh")
        # Generic Debian/Ubuntu
        return os.path.join(klipper_path, "scripts", "install-debian.sh")
    return None


def patch_install_script(self, install_script):
    """Patch the Klipper install script for compatibility with newer systems.

    The stock Klipper install scripts (e.g. ``install-octopi.sh``) were written
    for older systems and try to install ``python-dev`` and create a Python 2
    virtualenv. On newer Debian/Ubuntu (e.g. Debian 12) ``python-dev`` has been
    replaced by ``python3-dev`` and Python 2 is no longer available, which makes
    the script fail. Patch the script in place so it works on modern systems.

    :param install_script: absolute path to the install script to patch
    :type install_script: str
    :return: True if the script was modified, False otherwise
    :rtype: bool
    """
    try:
        with open(install_script, "r", encoding="utf-8") as f:
            content = f.read()

        changed = False
        # python-dev -> python3-dev (skip if the script already uses the
        # python-dev-is-python3 replacement package)
        if "python-dev-is-python3" not in content and "python-dev" in content:
            content = content.replace("python-dev", "python3-dev")
            changed = True
        # Python 2 virtualenv -> Python 3 virtualenv
        if "virtualenv -p python2" in content:
            content = content.replace(
                "virtualenv -p python2", "virtualenv -p python3"
            )
            changed = True

        if changed:
            with open(install_script, "w", encoding="utf-8") as f:
                f.write(content)
            logger.log_info(
                self, "Patched install script: " + install_script, only_logging=True
            )
            return True
    except Exception:
        logger.log_error(
            self, "Could not patch install script", only_logging=True
        )
    return False


def install_klipper_host(self, on_line=None, sudo_password=None):
    """Install the Klipper host software.

    Clones the Klipper repository to the configured path and runs the
    appropriate install script for the current platform.

    :param on_line: optional callback called with ``(line, stream)`` for each
        output line while running the install script
    :type on_line: callable or None
    :param sudo_password: optional sudo password. If given, it is used to
        cache the sudo credentials (``sudo -S -v``) so the install script's
        internal sudo calls don't prompt. The password is never put on the
        command line and is not logged.
    :type sudo_password: str or None
    :return: output of the commands and True if the install succeeded
    :rtype: list
    """
    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])),
            "",
        )
    )
    remote = self._settings.get(["configuration", "remote_host_git"])

    if is_klipper_installed(self):
        return ["Klipper is already installed at " + klipper_path, False]

    # Clone the repository
    if on_line:
        on_line("Cloning Klipper repository...", "message")
    cmd = "git clone " + remote + " " + klipper_path
    output, is_success = extra.execute_command(self, cmd)
    if not is_success:
        if on_line:
            on_line(output, "stderr")
        return [output, False]

    # Determine the install script for this platform
    install_script = get_install_script(self, klipper_path)
    if install_script is None:
        return ["No Klipper install script available for this platform", False]

    # Patch the install script for compatibility with newer systems
    if on_line:
        on_line("Patching install script for this system...", "message")
    patch_install_script(self, install_script)

    # The install scripts use sudo internally. Either passwordless sudo must be
    # configured, or we cache the sudo credentials with the provided password.
    if sudo_password:
        if on_line:
            on_line("Validating sudo credentials...", "message")
        success = extra.execute_command_stream(
            self, "sudo -S -v", on_line, stdin_data=sudo_password + "\n"
        )
        if not success:
            return ["Invalid sudo password or sudo not available", False]
        # Make sure the credentials are actually cached so the install script
        # won't hang on a password prompt.
        _, sudo_ok = extra.execute_command(self, "sudo -n true")
        if not sudo_ok:
            return [
                "Could not cache sudo credentials. "
                "Please configure passwordless sudo or check the password.",
                False,
            ]
    else:
        _, sudo_ok = extra.execute_command(self, "sudo -n true")
        if not sudo_ok:
            import getpass

            user = getpass.getuser()
            return [
                "Passwordless sudo is required to install Klipper.\n"
                "Run this as root to enable it for user '{}':\n"
                "  echo '{} ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/octoklipper\n"
                "  chmod 440 /etc/sudoers.d/octoklipper\n"
                "Or provide your sudo password in the install dialog.".format(
                    user, user
                ),
                False,
            ]

    # Run the install script
    cmd = "bash " + install_script
    if on_line:
        on_line("Running install script: " + install_script, "message")
        success = extra.execute_command_stream(self, cmd, on_line)
        return ["Install script finished", success]
    else:
        output, is_success = extra.execute_command(self, cmd)
        return [output, is_success]


def split_versionlist(version_list):
    new_list = []
    rc_list = []

    for item in version_list:
        if not re.search(r"\d+rc", item):
            new_list.append(item)
        else:
            rc_list.append(item)
    return dict(rc_list=rc_list, stable_list=new_list)


def sort_versionlist(versions_dict):

    return dict(
        stable_list=sorted(versions_dict["stable_list"], key=_version_sort_key),
        rc_list=sorted(versions_dict["rc_list"], key=_version_sort_key),
    )
