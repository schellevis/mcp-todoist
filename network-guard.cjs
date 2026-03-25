/**
 * Network guard - blokkeert alle uitgaande verbindingen behalve naar *.todoist.com
 * Geladen via: node --require ./network-guard.cjs
 */

'use strict';

const ALLOWED_HOSTS = /^(.*\.)?todoist\.com$/;

function checkHost(host) {
  if (!host) return;
  const hostname = host.split(':')[0]; // strip port
  if (!ALLOWED_HOSTS.test(hostname)) {
    const err = new Error(`[network-guard] Verbinding geblokkeerd naar: ${hostname}`);
    err.code = 'ERR_NETWORK_BLOCKED';
    throw err;
  }
}

// --- native fetch (Node 18+) ---
const originalFetch = globalThis.fetch;
if (originalFetch) {
  globalThis.fetch = function guardedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
    try {
      checkHost(new URL(url).hostname);
    } catch (e) {
      return Promise.reject(e);
    }
    return originalFetch.call(this, input, init);
  };
}

// --- https module ---
const https = require('https');
const http = require('http');

function wrapRequest(original) {
  return function guardedRequest(options, callback) {
    const hostname =
      typeof options === 'string' || options instanceof URL
        ? new URL(options).hostname
        : options?.hostname || options?.host;
    checkHost(hostname);
    return original.call(this, options, callback);
  };
}

https.request = wrapRequest(https.request.bind(https));
https.get = wrapRequest(https.get.bind(https));
http.request = wrapRequest(http.request.bind(http));
http.get = wrapRequest(http.get.bind(http));

// block net.connect als fallback
const net = require('net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(options, ...rest) {
  const host =
    typeof options === 'object' && options !== null
      ? options.host
      : null;
  if (host) checkHost(host);
  return originalConnect.call(this, options, ...rest);
};
