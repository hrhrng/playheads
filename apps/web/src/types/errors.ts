/**
 * Error classification and handling types
 * @module types/errors
 */

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  NETWORK = 'NETWORK',
  API_ERROR = 'API_ERROR',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Classified error with category and metadata
 */
export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  originalError: unknown;
  retryable: boolean;
  action?: 'reauth' | 'retry' | 'contact_support';
}

/**
 * Context information for error handling
 */
export interface ErrorContext {
  operation?: string;
  userId?: string;
  timestamp?: number;
}
