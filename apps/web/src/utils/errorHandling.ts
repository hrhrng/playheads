/**
 * Error handling and classification utilities
 * @module utils/errorHandling
 */

import { toast } from 'sonner';
import { ErrorCategory, type ClassifiedError } from '../types/errors';

/**
 * Classify an error into a category for appropriate handling
 */
export function classifyError(error: unknown): ClassifiedError {
  // Default classification
  const classified: ClassifiedError = {
    category: ErrorCategory.UNKNOWN,
    message: 'An unexpected error occurred',
    originalError: error,
    retryable: false
  };

  // Handle Response objects from fetch
  if (error instanceof Response) {
    if (error.status === 401 || error.status === 403) {
      classified.category = ErrorCategory.AUTH_EXPIRED;
      classified.message = 'Your session has expired. Please reconnect.';
      classified.action = 'reauth';
    } else if (error.status === 400) {
      classified.category = ErrorCategory.VALIDATION;
      classified.message = 'Invalid request. Please check your input.';
    } else if (error.status === 429) {
      classified.category = ErrorCategory.API_ERROR;
      classified.message = 'Too many requests. Please try again later.';
      classified.retryable = true;
      classified.action = 'retry';
    } else if (error.status >= 500) {
      classified.category = ErrorCategory.API_ERROR;
      classified.message = 'Server error. Please try again.';
      classified.retryable = true;
      classified.action = 'retry';
    }
    return classified;
  }

  // Handle Error objects
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      classified.category = ErrorCategory.NETWORK;
      classified.message = 'Network error. Check your connection.';
      classified.retryable = true;
      classified.action = 'retry';
      return classified;
    }

    // Auth errors
    if (errorMessage.includes('unauthorized') || errorMessage.includes('not authorized')) {
      classified.category = ErrorCategory.AUTH_EXPIRED;
      classified.message = 'Authentication required. Please reconnect.';
      classified.action = 'reauth';
      return classified;
    }

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
      classified.category = ErrorCategory.PERMISSION;
      classified.message = 'You do not have permission for this action.';
      return classified;
    }

    classified.message = error.message || 'An error occurred';
    return classified;
  }

  // Handle MusicKit errors
  if (typeof error === 'object' && error !== null) {
    const mkError = error as any;

    // Check for MusicKit authorization errors
    if (mkError.isAuthorized === false || mkError.code === 'AUTHORIZATION_ERROR') {
      classified.category = ErrorCategory.AUTH_EXPIRED;
      classified.message = 'Apple Music connection lost. Please reconnect.';
      classified.action = 'reauth';
      return classified;
    }

    // Check for MusicKit network errors
    if (mkError.code === 'NETWORK_ERROR') {
      classified.category = ErrorCategory.NETWORK;
      classified.message = 'Network error. Check your connection.';
      classified.retryable = true;
      classified.action = 'retry';
      return classified;
    }
  }

  // Handle structured backend errors
  if (typeof error === 'object' && error !== null) {
    const structuredError = error as any;
    if (structuredError.error && structuredError.status) {
      classified.message = structuredError.message || classified.message;
      classified.retryable = structuredError.retryable || false;
      classified.action = structuredError.action;

      // Map backend error codes to categories
      switch (structuredError.error) {
        case 'AUTH_TOKEN_INVALID':
        case 'AUTH_TOKEN_EXPIRED':
          classified.category = ErrorCategory.AUTH_EXPIRED;
          break;
        case 'PERMISSION_DENIED':
          classified.category = ErrorCategory.PERMISSION;
          break;
        case 'RATE_LIMIT':
        case 'SERVICE_UNAVAILABLE':
          classified.category = ErrorCategory.API_ERROR;
          break;
        case 'VALIDATION_ERROR':
          classified.category = ErrorCategory.VALIDATION;
          break;
        default:
          classified.category = ErrorCategory.UNKNOWN;
      }
    }
  }

  return classified;
}

/**
 * Show an error toast with appropriate styling and actions
 */
export function showErrorToast(error: unknown, context?: string): void {
  const classified = classifyError(error);

  const description = context
    ? `${context}: ${classified.message}`
    : classified.message;

  toast.error('Error', {
    description,
    duration: classified.category === ErrorCategory.AUTH_EXPIRED ? Infinity : 4000,
    action: classified.retryable ? {
      label: 'Retry',
      onClick: () => {
        // Retry logic would need to be passed in as a callback
        console.log('Retry requested');
      }
    } : undefined
  });
}

/**
 * Show a success toast
 */
export function showSuccessToast(message: string, description?: string): void {
  toast.success(message, {
    description,
    duration: 3000
  });
}

/**
 * Show a warning toast
 */
export function showWarningToast(message: string, description?: string): void {
  toast.warning(message, {
    description,
    duration: 4000
  });
}

/**
 * Show an info toast
 */
export function showInfoToast(message: string, description?: string): void {
  toast.info(message, {
    description,
    duration: 3000
  });
}

/**
 * Parse MusicKit-specific errors
 */
export function parseMusicKitError(mkError: any): ClassifiedError {
  return classifyError(mkError);
}

/**
 * Parse backend API error responses
 */
export async function parseBackendError(response: Response): Promise<ClassifiedError> {
  try {
    const data = await response.json();
    return classifyError({ ...data, status: response.status });
  } catch {
    // Failed to parse JSON, use status code
    return classifyError(response);
  }
}
