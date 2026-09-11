(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(["OctoPrintClient"], factory);
  } else {
    factory(global.OctoPrintClient);
  }
})(this, function (OctoPrintClient) {
  var OctoKlipperClient = function (base) {
    this.base = base;
    this.url = this.base.getBlueprintUrl("klipper");
  };

  OctoKlipperClient.prototype.restartKlipper = function (opts) {
    return this.base.post(this.url + "restart", opts);
  };

  OctoKlipperClient.prototype.getCfg = function (config, opts) {
    return this.base.get(this.url + "config/" + config, opts);
  };

  OctoKlipperClient.prototype.getCfgBak = function (backup, opts) {
    return this.base.get(this.url + "backup/" + backup, opts);
  };

  OctoKlipperClient.prototype.listCfg = function (opts) {
    return this.base.get(this.url + "config/list", opts);
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
    return this.base.post(this.url + "backup/restore/" + backup, opts);
  };

  OctoPrintClient.registerPluginComponent("klipper", OctoKlipperClient);
  return OctoKlipperClient;
});
