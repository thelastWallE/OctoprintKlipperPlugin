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
  };

  var downloadUrl = "download/configs";
  var url = this.url;

  OctoKlipperClient.prototype.get = function (refresh, opts) {
    return this.base.get(this.url, opts);
  };

  OctoKlipperClient.prototype.getServerInfo = function (opts) {
    return this.base.get(this.url + "/serverinfo", opts);
  };

  OctoKlipperClient.prototype.restartKlipper = function (opts) {
    return this.base.post(this.url + "restart", opts);
  };

  OctoKlipperClient.prototype.updateKlipper = function (opts) {
    return this.base.post(this.url + "update", opts);
  };

  OctoKlipperClient.prototype.getCfg = function (config, opts) {
    return this.base.get(this.url + "config/" + config, opts);
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
    return this.base.get(this.url + "config/list", opts);
  };

  var resourceForLocation = function (location) {
    return url + "/" + OctoPrintClient.escapePath(location);
  };

  var downloadForLocation = function (location) {
    return downloadUrl + "/" + OctoPrintClient.escapePath(location);
  };

  var downloadForEntry = function (location, filename) {
    return downloadForLocation(location) + "/" + OctoPrintClient.escapePath(filename);
  };

  var resourceForEntry = function (location, filename) {
    return resourceForLocation(location) + "/" + OctoPrintClient.escapePath(filename);
  };

  var preProcessList = function (response) {
    var recursiveCheck = function (element, index, list) {
      if (!element.hasOwnProperty("parent"))
        element.parent = { children: list, parent: undefined };
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
    _.each(response.files, recursiveCheck);
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

    return this.base.getWithQuery(url, query, opts).done(preProcessList);
  };

  OctoKlipperClient.prototype.delete = function (location, path, opts) {
    return this.base.delete(resourceForEntry(location, path), opts);
  };

  OctoKlipperClient.prototype.issueEntryCommand = function (
    location,
    entryname,
    command,
    data,
    opts
  ) {
    var url = resourceForEntry(location, entryname);
    return this.base.issueCommand(url, command, data, opts);
  };

  OctoKlipperClient.prototype.move = function (location, path, destination, opts) {
    return this.issueEntryCommand(
      location,
      path,
      "move",
      { destination: destination },
      opts
    );
  };

  OctoKlipperClient.prototype.createFolder = function (location, name, path, opts) {
    var data = { foldername: name };
    if (path !== undefined && path !== "") {
      data.path = path;
    }

    return this.base.postForm(resourceForLocation(location), data, opts);
  };

  OctoKlipperClient.prototype.exists = function (location, path, filename, opts) {
    return this.base.issueCommand(
      testUrl,
      "exists",
      { storage: location, path: path, filename: filename },
      opts
    );
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

  OctoKlipperClient.prototype.saveCfg = function (content, filename, opts) {
    content = content || [];
    filename = filename || [];

    var data = {
      DataToSave: content,
      filename: filename,
    };

    return this.base.postJson(this.url + "config/save", data, opts);
  };

  OctoKlipperClient.prototype.deleteCfg = function (config, opts) {
    return this.base.delete(this.url + "config/" + config, opts);
  };

  OctoKlipperClient.prototype.deleteBackup = function (backup, opts) {
    return this.base.delete(this.url + "backup/" + backup, opts);
  };

  OctoKlipperClient.prototype.restoreBackup = function (backup, opts) {
    return this.base.get(this.url + "backup/restore/" + backup, opts);
  };

  OctoKlipperClient.prototype.restoreBackupFromUpload = function (file, data) {
    data = data || {};

    var filename = data.filename || undefined;
    return this.base.upload(this.url + "restore", file, filename, data);
  };

  OctoPrintClient.registerPluginComponent("klipper", OctoKlipperClient);
  return OctoKlipperClient;
});
