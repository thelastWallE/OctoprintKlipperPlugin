import subprocess
import shlex
import re
import os
import platform
from flask_babel import gettext

def log_info(self, only_logging, message):
    self._octoklipper_logger.info(message)
    if not only_logging:
        send_message(
            self,
            type = "log",
            subtype = "info",
            title = message,
            payload = message
        )

def log_debug(self, only_logging, message):
    self._octoklipper_logger.debug(message)
    self._logger.info(message)
    if not only_logging:
        send_message(
            self,
            type = "console",
            subtype = "debug",
            title = message,
            payload = message
        )

def log_error(self, only_logging, error):
    self._octoklipper_logger.error(error)
    self._logger.error(error)
    if not only_logging:
        send_message(
            self,
            type = "log",
            subtype = "error",
            title = error,
            payload = error
        )

def migrate_old_settings(self, settings):
    '''
    For Old settings
    '''
    migrate_settings(settings, "serialport", "connection", "port")
    migrate_settings(settings, "replace_connection_panel", "connection", "replace_connection_panel")
    migrate_settings(settings, "probeHeight", "probe", "height")
    migrate_settings(settings, "probeLift", "probe", "lift")
    migrate_settings(settings, "probeSpeedXy", "probe", "speed_xy")
    migrate_settings(settings, "probeSpeedZ", "probe", "speed_z")
    migrate_settings(settings, "configPath", "configuration", "configpath")

    if settings.has(["probePoints"]):
        points = settings.get(["probePoints"])
        points_new = [dict(name="", x=int(p["x"]), y=int(p["y"]), z=0) for p in points]
        settings.set(["probe", "points"], points_new)
        settings.remove(["probePoints"])

def migrate_settings(self, settings, old, new, new2=""):
    """migrate setting to setting with an additional path

    Args:
        settings (any): instance of self._settings
        old (str): the old setting to migrate
        new (str): group or only new setting if there is no new2
        new2 (str, optional): the new setting to migrate to. Defaults to "".
    """        ''''''
    if settings.has(old):
        if new2 != "":
            log_info(self, False, "migrate setting for '" + old + "' -> '" + new + "/" + new2 + "'")
            settings.set([new, new2], settings.get(old))
        else:
            log_info(self, False, "migrate setting for '" + old + "' -> '" + new + "'")
            settings.set([new], settings.get(old))
        settings.remove(old)

def migrate_settings_configuration(self, settings, new, old):
    """migrate setting in path configuration to new name

    :param settings: the class of the mixin
    :type settings: class
    :param new: new name
    :type new: str
    :param old: the old name
    :type old: str
    """

    if settings.has(["configuration", old]):
        log_info(self, False, "migrate setting for 'configuration/" + old + "' -> 'configuration/" + new + "'")
        settings.set(["configuration", new], settings.get(["configuration", old]))
        settings.remove(["configuration", old])

def poll_status(self):
    self._printer.commands("STATUS")

def update_status(self, subtype, status):
    send_message(
        self,
        type = "status",
        subtype = subtype,
        payload = status)

def file_exist(self, filepath, **kwargs):
    '''
    Returns if a file exists and shows default a PopUp if not
    '''
    #TODO rework this to a more general function, maybe just use the one from octoprint
    PopUp = kwargs.get('PopUp',True)
    from os import path
    if not path.isfile(filepath):
        log_debug(self, False, gettext("File")+ ": <br />" + filepath + "<br /> "+ gettext("does not exist!"))
        if PopUp:
            send_message(
                self,
                type = "PopUp",
                subtype = "warning",
                title = "OctoKlipper Settings",
                payload = gettext("File")+": <br />" + filepath + "<br /> "+ gettext("does not exist!"))
        return False
    else:
        return True

def key_exist(dict, key1, key2):
    try:
        dict[key1][key2]
    except KeyError:
        return False
    else:
        return True

def send_message(self, type, subtype, title = "", payload = ""):
        """
        Send Message over API to FrontEnd
        """
        import datetime
        self._plugin_manager.send_plugin_message(
            self._identifier,
            dict(
                time = datetime.datetime.now().strftime("%H:%M:%S"),
                type = type,
                subtype = subtype,
                title = title,
                payload = payload
            )
        )


def run(self, cmd):
    """Runs the given command locally and returns the output, err and exit_code."""
    cmd_parts = cmd.split('|') if "|" in cmd else [cmd]
    i = 0
    p = {}
    log_info(self, True, "Run Command:"+cmd)
    for cmd_part in cmd_parts:
        cmd_part = cmd_part.strip()
        prog = shlex.split(cmd_part) if platform.system() == "posix" else cmd_part
        if i == 0:
          p[i]=subprocess.Popen(prog,stdin=None, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        else:
          p[i]=subprocess.Popen(prog,stdin=p[i-1].stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        i += 1
    (output, err) = p[i-1].communicate()
    exit_code = p[0].wait()
    out_text = format_stream(output)
    err_text = format_stream(err)
    response=out_text+err_text
    log_info(self, True, "Response: "+response+" exit_code:"+str(exit_code))
    if exit_code==0:
        return response
    log_error(self, False, "<b>"+gettext("Failed to run command")+":</b> \""+cmd+"\" <b>"+gettext("Output")+":</b> "+response)

def format_stream(output):
    out=output.splitlines()
    for line in out:
        line=line.rsplit('\n')
        if line=='':
            break
    return ''.join(out)


def retrieve_git_tag(self, source_path):
    # TODO Drop python2.7 support like a hot potatoe
    cmd = "git -C "+source_path+" rev-list --tags --max-count=1"
    hash = run(self, cmd)
    cmd = "git -C " + source_path + " describe --tags "+hash
    tag = run(self, cmd)
    cmd = "git -C " + source_path + " rev-list "+tag+"..HEAD --count"
    count = run(self, cmd)
    return ""+tag+"-"+count+""

def retrieve_remote_git_tag(self, remote):
    # TODO Drop python2.7 support like a hot potatoe
    # Klipper Repo: https://github.com/Klipper3D/klipper.git
    # OctoKlipper Repo: https://github.com/thelastWallE/OctoprintKlipperPlugin.git
    if self._connectivity_checker.online:
        return gettext("We are not online")
    repo = self._repo_klipper if remote=="klipper" else remote
    cmd = 'git ls-remote --exit-code --refs --sort="version:refname" --tags ' + repo + ' "*.*.*" | tail --lines=1 | cut --delimiter="/" --fields=3'
    #cmd = "git ls-remote --refs --sort='v:refname' --tags " + remote
    #+ " | tail --lines=1 | cut --delimiter='/' --fields=3"
    output = run(self, cmd)
    log_info(self, True, "retrieve_remote_git_tag Output: " + output)
    return output


# Parse the git version from the command line.  This code
# is borrowed from Klipper.
def retrieve_git_version(self, source_path):
    # Obtain version info from "git" program
    cmd = "git -C "+source_path+" describe --always --tags --long --dirty"
    ver = run(self, cmd)
    tag_match = re.match(r"v\d+\.\d+\.\d+", ver)
    if tag_match is not None:
        return ver
    # This is likely a shallow clone.  Resolve the tag and manually create
    # the version string

    tag = retrieve_git_tag(self, source_path)
    return "t"+tag+"-g"+ver+"-shallow"

def retrieve_last_git_tag(self, source_path):
    cmd = "git -C "+source_path+" describe --tags --abbrev=0"
    return run(self, cmd)

def get_software_version(self):
    version = "?"

    klipper_path = os.path.normpath(
        os.path.join(
            os.path.expanduser(
                self._settings.get(["configuration", "klipper_path"])), ""))

    try:
        version = retrieve_git_version(self, klipper_path)
    except Exception:
        vfile = os.path.join(
            klipper_path, "klippy", ".version")
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
            os.path.expanduser(self._settings.get(["configuration", "klipper_path"])), ""
        )
    )
    cmd = "git -C "+ klipper_path +" fetch --all --tags"
    run(self, cmd)
    cmd = "git -C "+ klipper_path +" pull"
    run(self, cmd)
    cmd = "git -C "+ klipper_path +" checkout "+ tag

    return run(self, cmd)
