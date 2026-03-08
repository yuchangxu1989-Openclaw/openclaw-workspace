const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.history = [];
    this.maxHistory = 1000;
  }

  publish(event, data) {
    const record = {
      event,
      data,
      timestamp: Date.now()
    };
    
    this.history.push(record);
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    this.emit(event, data);
    
    return record;
  }

  subscribe(event, handler) {
    this.on(event, handler);
    return () => this.off(event, handler);
  }

  getHistory(eventType, limit = 100) {
    let history = this.history;
    
    if (eventType) {
      history = history.filter(h => h.event === eventType);
    }
    
    return history.slice(-limit);
  }
}

module.exports = EventBus;
