#!/usr/bin/env node
/**
 * npm run demo:https — trusted LAN HTTPS demo serve (DEMO_RESCUE D1).
 *
 * Builds the shipping bundle and serves it with `vite preview --host` over HTTPS using a
 * locally trusted mkcert certificate, so a phone on the same Wi-Fi gets a secure context
 * (geolocation works) and same-origin /api through the first-party proxies.
 *
 * - The certificate and key live in .yori-runtime/demo-https/ (gitignored, never committed).
 * - mkcert is a documented system tool (brew install mkcert); this script never installs it,
 *   never installs a root CA, and never serves without a certificate (no self-signed click-through).
 * - No tunnel, no public exposure: it binds only the detected LAN address (not 0.0.0.0, so no
 *   VPN or other interface), and only for the life of the process.
 * - Provider flags are NOT changed here; pass them in the shell (e.g. WEATHER_LIVE_ENABLED=true).
 *
 * Usage: npm run demo:https [-- --skip-build] [-- --check]
 *   --check       print the resolved URL and certificate status, then exit (no build, no serve)
 *   --skip-build  serve the existing dist/ without rebuilding
 * Env: DEMO_HTTPS_PORT (default 4443), DEMO_HTTPS_CERT / DEMO_HTTPS_KEY (override paths),
 *      DEMO_LAN_IP (override the detected LAN address).
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const certDir = path.join(root, '.yori-runtime', 'demo-https');
const certPath = path.resolve(process.env.DEMO_HTTPS_CERT || path.join(certDir, 'cert.pem'));
const keyPath = path.resolve(process.env.DEMO_HTTPS_KEY || path.join(certDir, 'key.pem'));
const port = Number(process.env.DEMO_HTTPS_PORT || 4443);
const args = new Set(process.argv.slice(2));

function detectLanIp() {
  if (process.env.DEMO_LAN_IP) return process.env.DEMO_LAN_IP;
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
        return addr.address;
      }
    }
  }
  return null;
}

const lanIp = detectLanIp();
const certReady = existsSync(certPath) && existsSync(keyPath);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error(`demo:https: DEMO_HTTPS_PORT must be an integer in 1024-65535 (got ${process.env.DEMO_HTTPS_PORT}).`);
  process.exit(2);
}

if (!lanIp) {
  console.error('demo:https: no LAN IPv4 address found. Join the same Wi-Fi as the phone, or set DEMO_LAN_IP.');
  console.error('Fallback: npm run build && npm run preview -- --port 4174, then open http://localhost:4174 on this Mac.');
  process.exit(2);
}

if (!certReady) {
  console.error('demo:https: no trusted certificate yet. One-time owner setup (see docs/demo/DEMO_HTTPS.md):');
  console.error('  brew install mkcert');
  console.error('  mkcert -install');
  console.error(`  mkdir -p ${path.relative(root, certDir)}`);
  console.error(
    `  mkcert -cert-file ${path.relative(root, certPath)} -key-file ${path.relative(root, keyPath)} ${lanIp} localhost 127.0.0.1`
  );
  console.error('  then install the mkcert root CA on the phone (iOS/Android steps in docs/demo/DEMO_HTTPS.md).');
  console.error('Fallback: npm run build && npm run preview -- --port 4174, then open http://localhost:4174 on this Mac.');
  process.exit(1);
}

const url = `https://${lanIp}:${port}/`;

if (args.has('--check')) {
  console.log(`demo:https: certificate OK (${path.relative(root, certPath)}); would serve ${url}`);
  process.exit(0);
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

if (!args.has('--skip-build')) {
  const build = spawnSync(npmCmd, ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

console.log(`\ndemo:https: open ${url} on the phone (same Wi-Fi). Ctrl+C stops the LAN serve.\n`);

const child = spawn(npxCmd, ['vite', 'preview', '--host', lanIp, '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Lets the first-party /api proxies accept the LAN Host/Referer for this session only.
    DEV_DEVICE_TESTING: 'true',
    DEMO_HTTPS_CERT: certPath,
    DEMO_HTTPS_KEY: keyPath,
  },
});
const stop = signal => child.kill(signal);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', code => process.exit(code ?? 0));
