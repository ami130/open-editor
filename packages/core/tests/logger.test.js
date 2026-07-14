import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../src/logger/logger.js';

describe('Logger', () => {
  let consoleInfo, consoleWarn, consoleError;

  beforeEach(() => {
    consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses info/warn when debug is false but always surfaces errors', () => {
    const log = new Logger(false);
    log.info('hello');
    log.warn('hello');
    log.error('hello');
    expect(consoleInfo).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    // C029: errors must NOT be silently swallowed in production (debug=false).
    expect(consoleError).toHaveBeenCalledWith('[OpenEditor]', 'hello');
  });

  it('logs to console when debug is true', () => {
    const log = new Logger(true);
    log.info('test');
    expect(consoleInfo).toHaveBeenCalledWith('[OpenEditor]', 'test');
  });

  it('warn() uses console.warn', () => {
    const log = new Logger(true);
    log.warn('something');
    expect(consoleWarn).toHaveBeenCalledWith('[OpenEditor]', 'something');
  });

  it('error() uses console.error', () => {
    const log = new Logger(true);
    log.error('bad');
    expect(consoleError).toHaveBeenCalledWith('[OpenEditor]', 'bad');
  });

  it('passes multiple args through', () => {
    const log = new Logger(true);
    log.info('a', 'b', 'c');
    expect(consoleInfo).toHaveBeenCalledWith('[OpenEditor]', 'a', 'b', 'c');
  });

  it('uses custom logger when provided', () => {
    const custom = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = new Logger(true, custom);
    log.info('x');
    log.warn('y');
    log.error('z');
    expect(custom.info).toHaveBeenCalledWith('x');
    expect(custom.warn).toHaveBeenCalledWith('y');
    expect(custom.error).toHaveBeenCalledWith('z');
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('custom logger with missing level falls back to console', () => {
    const custom = { info: vi.fn() };
    const log = new Logger(true, custom);
    log.warn('fallback');
    expect(consoleWarn).toHaveBeenCalledWith('[OpenEditor]', 'fallback');
  });

  it('setDebug(true) enables logging after construction', () => {
    const log = new Logger(false);
    log.info('before');
    expect(consoleInfo).not.toHaveBeenCalled();
    log.setDebug(true);
    log.info('after');
    expect(consoleInfo).toHaveBeenCalledWith('[OpenEditor]', 'after');
  });

  it('setDebug(false) disables logging', () => {
    const log = new Logger(true);
    log.setDebug(false);
    log.info('silent');
    expect(consoleInfo).not.toHaveBeenCalled();
  });
});
