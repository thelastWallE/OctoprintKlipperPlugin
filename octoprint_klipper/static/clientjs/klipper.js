(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(["OctoPrintClient", "jquery", "lodash"], factory);
  } else {
    factory(global.OctoPrintClient, global.$, global._);
  }
})(this, function (OctoPrintClient, $, _) {
  var OctoKlipperClient = function (base) {
    this.base = base;
    this.url = this.base.getBlueprintUrl("klipper");
    this.testUrl = this.url + "test";
    this.downloadUrl = this.url + "download/configs";

    this.resourceForLocation = function (location) {
      return this.url + OctoPrintClient.escapePath(location);
    };

    this.downloadForLocation = function (location) {
      return this.downloadUrl + "/" + OctoPrintClient.escapePath(location);
    };

    this.downloadForEntry = function (location, filename) {
      return this.downloadForLocation(location) + "/" + OctoPrintClient.escapePath(filename);
    };

    this.resourceForEntry = function (location, filename) {
      return this.resourceForLocation(location) + "/" + OctoPrintClient.escapePath(filename);
    };
  };

  OctoKlipperClient.prototype.getServerInfo = function (opts) {
    return this.base.get(this.url + "serverinfo", opts);
  };

  OctoKlipperClient.prototype.restartKlipper = function (opts) {
    return this.base.post(this.url + "restart", opts);
  };

  OctoKlipperClient.prototype.checkKlipperUpdate = function (opts) {
    return this.base.get(this.url + "checkKlipperUpdate", opts);
  };

  OctoKlipperClient.prototype.checkOctoKlipperUpdate = function (opts) {
    return this.base.get(this.url + "checkOctoKlipperUpdate", opts);
  };

  OctoKlipperClient.prototype.updateKlipper = function (force, opts) {
    force = force || [];

    var data = {
      forced: force,
    };
    return this.base.postJson(this.url + "update", data, opts);
  };

  OctoKlipperClient.prototype.getCfg = function (location, config, opts) {
    return this.base.get(this.resourceForEntry(location, config), opts);
  };

  OctoKlipperClient.prototype.modifyServicefile = function (path, opts) {
    path = path || [];

    var data = {
      PathToConfigs: path,
    };

    return this.base.postJson(this.url + "servicefile/modify", data, opts);
  };

  OctoKlipperClient.prototype.getCfgBak = function (backup, opts) {
    return this.base.get(this.url + "backup/" + backup, opts);
  };

  OctoKlipperClient.prototype.listCfg = function (opts) {
    return this.base.get(this.url + "list", opts);
  };

  var preProcessList = function (response) {
    var recursiveCheck = function (element, index, list) {
      if (!element.hasOwnProperty("parent")) element.parent = { children: list, parent: undefined };
      if (!element.hasOwnProperty("size")) element.size = undefined;
      if (!element.hasOwnProperty("date")) element.date = undefined;

      if (element.type == "folder") {
        element.weight = 0;
        _.each(element.children, function (e, i, l) {
          e.parent = element;
          recursiveCheck(e, i, l);
          element.weight += e.weight;
        });
      } else {
        element.weight = 1;
      }
    };
    _.each(response.data.files, recursiveCheck);
  };

  OctoKlipperClient.prototype.list = function (recursively, force, opts) {
    recursively = recursively || false;
    force = force || false;

    var query = {};
    if (recursively) {
      query.recursive = recursively;
    }
    if (force) {
      query.force = force;
    }

    return this.base.getWithQuery(this.url, query, opts).done(preProcessList);
  };

  OctoKlipperClient.prototype.delete = function (location, path, opts) {
    return this.base.delete(this.resourceForEntry(location, path), opts);
  };

  OctoKlipperClient.prototype.issueEntryCommand = function (location, entryname, command, data, opts) {
    return this.base.issueCommand(this.resourceForEntry(location, entryname), command, data, opts);
  };

  OctoKlipperClient.prototype.move = function (location, path, destination, force, opts) {
    return this.issueEntryCommand(location, path, "move", { destination: destination, force: force }, opts);
  };

  OctoKlipperClient.prototype.createFolder = function (location, name, path, opts) {
    var data = { foldername: name };
    if (path !== undefined && path !== "") {
      data.path = path;
    }

    return this.base.postForm(this.resourceForLocation(location), data, opts);
  };

  OctoKlipperClient.prototype.exists = function (location, path, filename, opts) {
    // The filename may be a full storage-relative path (e.g. "config/printer.cfg").
    // Split it into path + name so the backend never receives a name containing
    // "/" or "\\" (sanitize_name raises ValueError on those).
    if (filename.indexOf("/") !== -1 || filename.indexOf("\\") !== -1) {
      var parts = filename.split(/[\/\\]/);
      filename = parts.pop();
      path = parts.join("/");
    }
    return this.base.issueCommand(this.testUrl, "exists", { storage: location, path: path, filename: filename }, opts);
  };

  OctoKlipperClient.prototype.listCfgBak = function (opts) {
    return this.base.get(this.url + "backup/list", opts);
  };

  OctoKlipperClient.prototype.checkCfg = function (content, opts) {
    content = content || [];

    var data = {
      DataToCheck: content,
    };

    return this.base.postJson(this.url + "config/check", data, opts);
  };

  /**
   * Saves a file to the server
   * @param {string} content The content of the file to save
   * @param {string} filename The name of the file to save
   * @param {boolean} hasNewName Whether the file has a new name
   * @param {boolean} force Whether to force the save
   * @param {object} opts Additional options
   */
  OctoKlipperClient.prototype.saveCfg = function (content, filename, hasNewName, force, opts) {
    content = content || [];
    filename = filename || [];
    hasNewName = hasNewName || false;
    force = force || false;
    opts = opts || {};

    var data = {
      DataToSave: content,
      filename: filename,
      hasNewName: hasNewName,
      force: force,
    };

    return this.base.postJson(this.url + "config/save", data, opts);
  };

  OctoKlipperClient.prototype.download = function (location, path, opts) {
    return this.base.download(this.downloadForEntry(location, path), opts);
  };

  OctoKlipperClient.prototype.upload = function (location, file, data) {
    data = data || {};

    var filename = data.filename || undefined;
    if (data.userdata && typeof data.userdata === "object") {
      data.userdata = JSON.stringify(userdata);
    }
    return this.base.upload(resourceForLocation(location), file, filename, data);
  };

  OctoKlipperClient.prototype.deleteBackup = function (backup, opts) {
    return this.base.delete(this.url + "backup/" + backup, opts);
  };

  OctoKlipperClient.prototype.restoreBackup = function (backup, opts) {
    var data = {
      BackupToRestore: backup,
    };
    return this.base.postJson(this.url + "backup/restore/" + backup, data, opts);
  };

  OctoKlipperClient.prototype.restoreBackupFromUpload = function (file, data) {
    data = data || {};

    var filename = data.filename || undefined;
    return this.base.upload(this.url + "restore", file, filename, data);
  };

  OctoPrintClient.registerPluginComponent("klipper", OctoKlipperClient);
  return OctoKlipperClient;
});
