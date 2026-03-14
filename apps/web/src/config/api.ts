/**
 * API configuration
 * Centralizes API base URL configuration
 */

/**
 * Get the API base URL from environment or use default
 */
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';
