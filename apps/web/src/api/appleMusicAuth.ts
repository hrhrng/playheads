/**
 * Apple Music authentication API functions
 * @module api/appleMusicAuth
 */

import { API_BASE } from '../config/api';

/**
 * Validate user's Apple Music token
 */
export async function validateAppleMusicToken(
  userId: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const response = await fetch(
      `${API_BASE}/apple-music/validate-token?user_id=${userId}`
    );

    if (!response.ok) {
      throw new Error('Failed to validate token');
    }

    return await response.json();
  } catch (error) {
    console.error('Token validation error:', error);
    // Assume valid on network error to avoid false negatives
    return { valid: true };
  }
}

/**
 * Clear user's Apple Music token in database
 */
export async function clearAppleMusicToken(userId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/apple-music/clear-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });

    if (!response.ok) {
      throw new Error('Failed to clear token');
    }
  } catch (error) {
    console.error('Clear token error:', error);
    throw error;
  }
}
