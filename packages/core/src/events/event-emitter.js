export class EventEmitter {
  constructor() {
    this._events = Object.create(null);
  }

  on(event, handler) {
    if (typeof handler !== 'function') return this;
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push({ handler, once: false });
    return this;
  }

  once(event, handler) {
    if (typeof handler !== 'function') return this;
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push({ handler, once: true });
    return this;
  }

  off(event, handler) {
    if (!this._events[event]) return this;
    this._events[event] = this._events[event].filter(
      (entry) => entry.handler !== handler
    );
    return this;
  }

  emit(event, ...args) {
    if (!this._events[event]) return false;
    const listeners = this._events[event].slice();
    for (const entry of listeners) {
      // Remove a `once` entry BY IDENTITY before invoking, so (a) off() can't
      // strip a separate persistent listener that shares the same function
      // reference, (b) a self-re-registering handler's new entry survives, and
      // (c) cleanup still happens even if the handler throws.
      if (entry.once) {
        const arr = this._events[event];
        if (arr) {
          const i = arr.indexOf(entry);
          if (i !== -1) arr.splice(i, 1);
        }
      }
      // One throwing listener must not abort the rest of the dispatch.
      try {
        entry.handler(...args);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error(`EventEmitter: listener for "${String(event)}" threw`, err);
        }
      }
    }
    return listeners.length > 0;
  }

  removeAllListeners(event) {
    if (event) {
      delete this._events[event];
    } else {
      this._events = Object.create(null);
    }
    return this;
  }
}
