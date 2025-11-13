// API service for Klipper plugin
// This wraps the OctoPrint API calls for use in Svelte components

class KlipperAPI {
  constructor() {
    this.apiUrl = null;
    this.blueprintUrl = null;
    this.headers = null;
  }

  init() {
    if (typeof OctoPrint !== 'undefined') {
      this.headers = OctoPrint.getRequestHeaders({
        "content-type": "application/json",
        "cache-control": "no-cache",
      });
      this.apiUrl = OctoPrint.getSimpleApiUrl("klipper");
      this.blueprintUrl = OctoPrint.getBlueprintUrl("klipper");
    }
  }

  async sendCommand(command, data = {}) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ command, ...data })
    });
    return response.json();
  }

  async restartHost() {
    return this.sendCommand('restartHost');
  }

  async restartFirmware() {
    return this.sendCommand('restartFirmware');
  }

  async getStatus() {
    return this.sendCommand('getStatus');
  }

  async executeMacro(macro) {
    return this.sendCommand('executeMacro', { macro });
  }

  async getCfg(config) {
    const response = await fetch(`${this.blueprintUrl}/config/${config}`, {
      headers: this.headers
    });
    return response.json();
  }

  async listCfg() {
    const response = await fetch(`${this.blueprintUrl}/config/list`, {
      headers: this.headers
    });
    return response.json();
  }

  async saveCfg(content, filename) {
    const response = await fetch(`${this.blueprintUrl}/config/save`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        DataToSave: content,
        filename: filename
      })
    });
    return response.json();
  }

  async checkCfg(content) {
    const response = await fetch(`${this.blueprintUrl}/config/check`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        DataToCheck: content
      })
    });
    return response.json();
  }

  async deleteCfg(config) {
    const response = await fetch(`${this.blueprintUrl}/config/${config}`, {
      method: 'DELETE',
      headers: this.headers
    });
    return response;
  }

  async listCfgBak() {
    const response = await fetch(`${this.blueprintUrl}/backup/list`, {
      headers: this.headers
    });
    return response.json();
  }

  async getCfgBak(backup) {
    const response = await fetch(`${this.blueprintUrl}/backup/${backup}`, {
      headers: this.headers
    });
    return response.json();
  }

  async deleteBackup(backup) {
    const response = await fetch(`${this.blueprintUrl}/backup/${backup}`, {
      method: 'DELETE',
      headers: this.headers
    });
    return response;
  }

  async restoreBackup(backup) {
    const response = await fetch(`${this.blueprintUrl}/backup/restore/${backup}`, {
      headers: this.headers
    });
    return response.json();
  }
}

export const api = new KlipperAPI();
