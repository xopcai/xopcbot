/**
 * Simple Logger for Harbor Extension
 * 
 * Standalone logger that doesn't depend on xopcbot core.
 * Uses console with prefixed output.
 */

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug: (data: LogContext | string, message?: string) => void;
  info: (data: LogContext | string, message?: string) => void;
  warn: (data: LogContext | string, message?: string) => void;
  error: (data: LogContext | string, message?: string) => void;
}

export function createLogger(prefix: string): Logger {
  const formatContext = (data: LogContext | string): string => {
    if (typeof data === 'string') {
      return data;
    }
    const entries = Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    return entries ? `[${entries}]` : '';
  };

  return {
    debug: (data, message) => {
      const ctx = process.env.DEBUG ? formatContext(data) : '';
      if (ctx || message) {
        console.debug(`[Harbor:${prefix}] ${ctx} ${message || data}`);
      }
    },
    info: (data, message) => {
      console.info(`[Harbor:${prefix}] ${formatContext(data)} ${message || ''}`);
    },
    warn: (data, message) => {
      console.warn(`[Harbor:${prefix}] ${formatContext(data)} ${message || ''}`);
    },
    error: (data, message) => {
      console.error(`[Harbor:${prefix}] ${formatContext(data)} ${message || ''}`);
    },
  };
}
