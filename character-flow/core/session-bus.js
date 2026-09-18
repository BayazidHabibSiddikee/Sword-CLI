/**
 * core/session-bus.js — the web ↔ terminal sync backbone.
 *
 * Singleton EventEmitter (default export). Every conversation turn is appended
 * here and fanned out to subscribers via the 'message' event. A ring buffer of
 * the last 200 messages stays in memory for getHistory().
 */

import { EventEmitter } from 'events';

const RING_BUFFER_LIMIT = 200;

class SessionBus extends EventEmitter {
  constructor(limit = RING_BUFFER_LIMIT) {
    super();
    this.setMaxListeners(0); // many subscribers (CLI, web server, agents)
    this.limit = limit;
    /** @type {Array<{source: string, role: string, content: string, ts: number}>} */
    this.history = [];
  }

  /**
   * Append a message and emit it as 'message'.
   * @param {string} source origin, e.g. 'cli' | 'web' | 'agent' | 'system'
   * @param {string} role    'user' | 'assistant' | 'system' | 'tool'
   * @param {string} content message body
   * @returns {{source: string, role: string, content: string, ts: number}}
   */
  append(source, role, content) {
    const entry = { source, role, content, ts: Date.now() };
    this.history.push(entry);
    if (this.history.length > this.limit) {
      this.history.splice(0, this.history.length - this.limit);
    }
    this.emit('message', entry);
    return entry;
  }

  /**
   * Most recent messages, oldest first.
   * @param {number} [limit=50]
   * @returns {Array<{source: string, role: string, content: string, ts: number}>}
   */
  getHistory(limit = 50) {
    const n = Number.isFinite(limit) && limit > 0 ? limit : 50;
    return this.history.slice(-n).map((entry) => ({ ...entry }));
  }

  /** Empty the ring buffer and notify subscribers. */
  clear() {
    this.history = [];
    this.emit('clear');
  }

  /**
   * Subscribe to 'message' events.
   * @param {(entry: {source: string, role: string, content: string, ts: number}) => void} fn
   * @returns {() => void} unsubscribe function
   */
  subscribe(fn) {
    this.on('message', fn);
    return () => this.off('message', fn);
  }
}

const bus = new SessionBus();
export default bus;
