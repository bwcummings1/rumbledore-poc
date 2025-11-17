/**
 * DEVELOPMENT ONLY - Auth bypass for testing
 * This file should be removed before production
 */

export const DEV_USER = {
  id: '8a4bfba9-0c6d-47cb-8005-5754b663b425',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['MEMBER'],
  permissions: ['VIEW_LEAGUES']
};

export const DEV_SESSION = {
  user: DEV_USER,
  expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
};

/**
 * Get session for development - returns mock session
 */
export async function getDevSession() {
  // Always return dev session in development
  if (process.env.NODE_ENV === 'development') {
    return DEV_SESSION;
  }
  return null;
}