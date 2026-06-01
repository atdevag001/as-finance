/* eslint-disable */
const path = require('path');
const fs = require('fs');

// Load .env.production (gitignored) and merge into the per-app env block.
// Real secrets live in .env.production; this file stays committed.
function loadEnv() {
  const envPath = path.join(__dirname, '.env.production');
  const env = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } else {
    console.warn('[ecosystem] .env.production not found — services will rely on shell env');
  }
  return env;
}

const productionEnv = loadEnv();

module.exports = {
  apps: [
    {
      name: 'asfinance-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...productionEnv,
        NODE_ENV: 'production',
      },
    },
    {
      name: 'asfinance-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
