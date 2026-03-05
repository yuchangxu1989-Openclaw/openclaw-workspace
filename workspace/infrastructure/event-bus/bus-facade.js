'use strict';

const bus = require('./bus');
const { Dispatcher } = require('./dispatcher');

/**
 * BusFacade — unified entry point: event log + dispatcher dispatch.
 * Wraps bus.emit() and adds dispatcher integration with fault isolation.
 */
class BusFacade {
  constructor(options = {}) {
    this.bus = options.bus || bus;
    this.dispatcher = options.dispatcher || null;
    this._ready = false;
  }

  /**
   * Initialize the facade: create and init dispatcher.
   * @param {object} [dispatcherOptions] - Options for Dispatcher constructor
   */
  async init(dispatcherOptions = {}) {
    if (!this.dispatcher) {
      this.dispatcher = new Dispatcher(dispatcherOptions);
    }
    await this.dispatcher.init();
    this._ready = true;
  }

  /**
   * Emit an event: writes to event log via bus AND dispatches to rules.
   * Dispatcher errors never block or fail the emit.
   * @param {string} type - Event type
   * @param {object} [payload] - Event payload
   * @param {string} [source] - Source identifier
   * @returns {object} The emitted event
   */
  emit(type, payload, source) {
    // 1. Write to event log (synchronous, may throw)
    const event = this.bus.emit(type, payload, source);

    // 2. Dispatch to rules (async, fire-and-forget, fault-isolated)
    if (this._ready && this.dispatcher) {
      try {
        Promise.resolve(this.dispatcher.dispatch(type, payload || {})).catch(e => {
          console.error(`[BusFacade] Dispatcher error (non-fatal): ${e.message}`);
        });
      } catch (e) {
        console.error(`[BusFacade] Dispatcher sync error (non-fatal): ${e.message}`);
      }
    }

    return event;
  }

  /**
   * Get dispatcher statistics.
   * @returns {object|null} Stats or null if dispatcher not ready
   */
  getDispatcherStats() {
    if (!this.dispatcher) return null;
    return {
      ready: this._ready,
      ruleCount: this.dispatcher.getRuleCount(),
      ...this.dispatcher.getStats(),
    };
  }

  /**
   * Proxy: consume events from bus.
   */
  consume(consumerId, options) {
    return this.bus.consume(consumerId, options);
  }

  /**
   * Proxy: ack events on bus.
   */
  ack(consumerId, eventId) {
    return this.bus.ack(consumerId, eventId);
  }

  /**
   * Proxy: query history.
   */
  history(options) {
    return this.bus.history(options);
  }

  /**
   * Proxy: stats from bus.
   */
  stats() {
    return this.bus.stats();
  }

  /**
   * Proxy: purge bus.
   */
  purge() {
    return this.bus.purge();
  }
}

module.exports = { BusFacade };
