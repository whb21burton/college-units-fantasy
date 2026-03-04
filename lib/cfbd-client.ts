import { client } from 'cfbd';

/**
 * Configure the cfbd client with the API key.
 * Call this once before using any cfbd functions.
 * Uses Bearer token auth as required by cfbd v5.
 */
export function initCfbdClient() {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) throw new Error('CFBD_API_KEY environment variable is not set');

  client.setConfig({
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}
