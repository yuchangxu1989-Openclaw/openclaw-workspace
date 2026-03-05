const fs = require('fs');
const path = require('path');

class FeatureFlags {
  constructor(configPath) {
    this.configPath = configPath || path.join(__dirname, 'flags.json');
    this.flags = {};
    this.disableReasons = {};
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      this.flags = JSON.parse(raw);
    } catch (e) {
      this.flags = {};
    }
  }

  _save() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.flags, null, 2) + '\n', 'utf-8');
  }

  isEnabled(flagName) {
    return this.flags[flagName] === true;
  }

  disable(flagName, reason) {
    if (!(flagName in this.flags)) {
      throw new Error(`Unknown flag: ${flagName}`);
    }
    this.flags[flagName] = false;
    this.disableReasons[flagName] = reason || 'no reason provided';
    this._save();
  }

  enable(flagName) {
    if (!(flagName in this.flags)) {
      throw new Error(`Unknown flag: ${flagName}`);
    }
    this.flags[flagName] = true;
    delete this.disableReasons[flagName];
    this._save();
  }

  getAll() {
    const result = {};
    for (const [k, v] of Object.entries(this.flags)) {
      result[k] = { enabled: v };
      if (this.disableReasons[k]) {
        result[k].disableReason = this.disableReasons[k];
      }
    }
    return result;
  }
}

module.exports = { FeatureFlags };
