'use strict';

class BaseScanner {
  constructor(name, options = {}) {
    if (!name) throw new Error('Scanner name is required');
    this.name = name;
    this.options = options;
    this.bus = options.bus || null;
    this.lastScanTime = null;
    this.stats = { scans: 0, eventsEmitted: 0, errors: 0 };
  }

  async scan() {
    throw new Error('scan() must be implemented by subclass');
  }

  emit(eventType, payload) {
    this.stats.eventsEmitted++;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(eventType, { scanner: this.name, ...payload });
    }
    return { eventType, payload };
  }

  getLastScanTime() {
    return this.lastScanTime;
  }

  getStats() {
    return { name: this.name, ...this.stats, lastScanTime: this.lastScanTime };
  }

  _recordScan() {
    this.lastScanTime = new Date().toISOString();
    this.stats.scans++;
  }
}

module.exports = { BaseScanner };
