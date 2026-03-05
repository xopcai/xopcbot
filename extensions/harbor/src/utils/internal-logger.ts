/**
 * Simple Logger for Harbor Extension
 * 
 * Standalone logger that doesn't depend on xopcbot core.
 * Uses console with prefixed output.
 */

export interface LogContext {
  [key: string]: unknown;
  err?: Error | unknown;
}

export interface Logger {
  debug: (data: LogContext | string, message?: string) => void;
  info: (data: LogContext | string, message?: string) => void;
  warn: (data: LogContext | string, message?: string) => void;
  error: (data: LogContext | string, message?: string) => void;
}

/**
 * Format log context into a consistent string representation
 */
function formatContext(data: LogContext | string): string {
  if (typeof data === 'string') {
    return data;
  }
  
  const entries: string[] = [];
  
  // Handle error specially
  if (data.err) {
    const err = data.err as Error;
    entries.push(`error=${err.message}`);
    if (err.stack) {
      entries.push(`stack=${err.stack.split('\n')[1]?.trim()}`);
    }
  }
  
  // Handle other fields
  for (const [k, v] of Object.entries(data)) {
    if (k === 'err') continue;
    
    let formatted: string;
    if (v === null || v === undefined) {
      formatted = 'null';
    } else if (typeof v === 'object') {
      formatted = JSON.stringify(v);
    } else {
      formatted = String(v);
    }
    
    // Truncate long values
    if (formatted.length > 100) {
      formatted = formatted.slice(0, 97) + '...';
    }
    
    entries.push(`${k}=${formatted}`);
  }
  
  return entries.length > 0 ? `[${entries.join(' ')}]` : '';
}

/**
 * Get ISO timestamp for logging
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

export function createLogger(prefix: string): Logger {
  const logPrefix = `[Harbor:${prefix}]`;
  const isDebugEnabled = process.env.DEBUG === 'true' || process.env.DEBUG?.includes('harbor');

  return {
    debug: (data, message) => {
      if (!isDebugEnabled) return;
      const timestamp = getTimestamp();
      const ctx = formatContext(data);
      console.debug(`${timestamp} ${logPrefix} [DEBUG] ${ctx} ${message || ''}`.trim());
    },
    info: (data, message) => {
      const timestamp = getTimestamp();
      const ctx = formatContext(data);
      console.info(`${timestamp} ${logPrefix} [INFO]  ${ctx} ${message || ''}`.trim());
    },
    warn: (data, message) => {
      const timestamp = getTimestamp();
      const ctx = formatContext(data);
      console.warn(`${timestamp} ${logPrefix} [WARN]  ${ctx} ${message || ''}`.trim());
    },
    error: (data, message) => {
      const timestamp = getTimestamp();
      const ctx = formatContext(data);
      console.error(`${timestamp} ${logPrefix} [ERROR] ${ctx} ${message || ''}`.trim());
    },
  };
}
