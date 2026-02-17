#!/usr/bin/env node
const https = require('node:https');

function head(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      resolve({ status: res.statusCode, headers: res.headers });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('Node:', process.version);
  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'npm_config_http_proxy', 'npm_config_https_proxy'];
  for (const key of proxyVars) {
    if (process.env[key]) console.log(`${key}=${process.env[key]}`);
  }

  try {
    const registry = process.env.npm_config_registry || 'https://registry.npmjs.org/';
    const result = await head(registry);
    console.log(`Registry HEAD ${registry} -> ${result.status}`);
  } catch (error) {
    console.error('Registry check failed:', error && (error.message || String(error)));
  }

  try {
    const scoped = await head('https://registry.npmjs.org/@types%2fexpress');
    console.log(`Scoped package check @types/express -> ${scoped.status}`);
    if (scoped.status === 403) {
      console.log('⚠️ Tu red/proxy está bloqueando paquetes scopeados (@scope/name).');
      console.log('Pide allowlist en proxy o usa una red sin esa restricción.');
    }
  } catch (error) {
    console.error('Scoped package check failed:', error && (error.message || String(error)));
  }
})();
