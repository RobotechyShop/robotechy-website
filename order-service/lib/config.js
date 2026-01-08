import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load environment variables from .env file
 * Simple implementation without external dependencies
 */
function loadEnvFile() {
  const envPath = resolve(__dirname, '..', '.env');
  try {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // Remove quotes if present
        const unquoted = value.replace(/^["']|["']$/g, '');
        process.env[key.trim()] = unquoted;
      }
    }
    console.log('[Config] Loaded .env file');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[Config] Error reading .env file:', error.message);
    }
  }
}

// Load .env file on import
loadEnvFile();

/**
 * Get required environment variable (throws if not set)
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
function getEnv(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

// Configuration object
export const config = {
  // Merchant's nsec (secret key)
  merchantNsec: requireEnv('MERCHANT_NSEC'),

  // Lightning Address for invoice generation
  lightningAddress: requireEnv('LIGHTNING_ADDRESS'),

  // Fallback relays (comma-separated)
  fallbackRelays: getEnv('FALLBACK_RELAYS', 'wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net')
    .split(',')
    .map(r => r.trim())
    .filter(Boolean),
};

export default config;
