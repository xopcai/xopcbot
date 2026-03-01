/**
 * ACP Runtime Errors
 * 
 * Standardized error codes and error class for ACP operations.
 */

export const ACP_ERROR_CODES = {
  // Session initialization failed
  ACP_SESSION_INIT_FAILED: 'Failed to initialize ACP session',
  
  // Backend unavailable
  ACP_BACKEND_UNAVAILABLE: 'ACP backend is not available',
  
  // Backend not registered
  ACP_BACKEND_MISSING: 'ACP backend is not configured',
  
  // Backend doesn't support this control
  ACP_BACKEND_UNSUPPORTED_CONTROL: 'ACP backend does not support this control',
  
  // Turn execution failed
  ACP_TURN_FAILED: 'ACP turn failed before completion',
  
  // Permission denied
  ACP_PERMISSION_DENIED: 'Permission denied for ACP operation',
  
  // Rate limit exceeded
  ACP_RATE_LIMIT_EXCEEDED: 'ACP session creation rate limit exceeded',
  
  // Max concurrent sessions reached
  ACP_MAX_SESSIONS_REACHED: 'Maximum concurrent ACP sessions reached',
} as const;

export type AcpErrorCode = keyof typeof ACP_ERROR_CODES;

/**
 * Error class for ACP runtime operations
 */
export class AcpRuntimeError extends Error {
  public code: AcpErrorCode;
  public retryable: boolean;

  constructor(
    code: AcpErrorCode,
    message?: string,
    options?: ErrorOptions & { retryable?: boolean }
  ) {
    const defaultMessage = ACP_ERROR_CODES[code];
    super(message || defaultMessage, options);
    this.name = 'AcpRuntimeError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Get a user-friendly error message
   */
  toDisplayString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

/**
 * Convert any error to AcpRuntimeError
 */
export function toAcpRuntimeError(
  error: unknown,
  fallbackCode: AcpErrorCode = 'ACP_TURN_FAILED',
  fallbackMessage = 'ACP operation failed'
): AcpRuntimeError {
  if (error instanceof AcpRuntimeError) {
    return error;
  }

  if (error instanceof Error) {
    return new AcpRuntimeError(fallbackCode, `${fallbackMessage}: ${error.message}`, {
      cause: error,
    });
  }

  return new AcpRuntimeError(fallbackCode, `${fallbackMessage}: ${String(error)}`);
}

/**
 * Wrap a function with ACP error boundary
 */
export async function withAcpRuntimeErrorBoundary<T>({
  run,
  fallbackCode,
  fallbackMessage,
}: {
  run: () => Promise<T>;
  fallbackCode: AcpErrorCode;
  fallbackMessage: string;
}): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toAcpRuntimeError(error, fallbackCode, fallbackMessage);
  }
}

/**
 * Normalize error code to known ACP error codes
 */
export function normalizeAcpErrorCode(code: string | undefined): AcpErrorCode {
  if (!code) return 'ACP_TURN_FAILED';
  
  if (code in ACP_ERROR_CODES) {
    return code as AcpErrorCode;
  }
  
  // Map common error patterns
  if (code.includes('NO_SESSION') || code.includes('SESSION_NOT_FOUND')) {
    return 'ACP_SESSION_INIT_FAILED';
  }
  
  if (code.includes('BACKEND') && code.includes('UNAVAILABLE')) {
    return 'ACP_BACKEND_UNAVAILABLE';
  }
  
  if (code.includes('PERMISSION')) {
    return 'ACP_PERMISSION_DENIED';
  }
  
  if (code.includes('RATE_LIMIT')) {
    return 'ACP_RATE_LIMIT_EXCEEDED';
  }
  
  return 'ACP_TURN_FAILED';
}
