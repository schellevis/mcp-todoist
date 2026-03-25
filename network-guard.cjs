/**
 * Network guard - blokkeert alle uitgaande verbindingen behalve naar *.todoist.com
 * Geladen via: node --require ./network-guard.cjs
 *
 * Lagen:
 *  1. fetch override (tamper-resistant via Object.defineProperty)
 *  2. https/http module override
 *  3. net.Socket.connect override
 *  4. dns module override (defense in depth)
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
  const guardedFetch = function guardedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
    try {
      checkHost(new URL(url).hostname);
    } catch (e) {
      return Promise.reject(e);
    }
    return originalFetch.call(this, input, init);
  };
  // Tamper-resistant: fetch kan niet meer overschreven worden door geladen modules
  Object.defineProperty(globalThis, 'fetch', {
    value: guardedFetch,
    writable: false,
    configurable: false,
  });
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

// --- net.Socket.connect (laagste niveau fallback) ---
const net = require('net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(options, ...rest) {
  const host =
    typeof options === 'object' && options !== null
      ? options.host
      : typeof options === 'string' ? options : null;
  if (host) checkHost(host);
  return originalConnect.call(this, options, ...rest);
};

// --- dns module (defense in depth: blokkeert DNS lookups voor niet-Todoist hosts) ---
const dns = require('dns');

// Callback-stijl: laatste arg is callback, error via callback doorgeven
function wrapDnsCallback(original) {
  return function guardedDns(hostname, ...rest) {
    let err;
    try { checkHost(hostname); } catch(e) { err = e; }
    if (err) {
      const cb = rest[rest.length - 1];
      if (typeof cb === 'function') { process.nextTick(cb, err); return; }
      throw err;
    }
    return original.call(this, hostname, ...rest);
  };
}

// Promise-stijl: Promise.reject teruggeven
function wrapDnsPromise(original) {
  return function guardedDnsPromise(hostname, ...rest) {
    try { checkHost(hostname); } catch(e) { return Promise.reject(e); }
    return original.call(this, hostname, ...rest);
  };
}

if (dns.lookup)   dns.lookup   = wrapDnsCallback(dns.lookup.bind(dns));
if (dns.resolve)  dns.resolve  = wrapDnsCallback(dns.resolve.bind(dns));
if (dns.resolve4) dns.resolve4 = wrapDnsCallback(dns.resolve4.bind(dns));
if (dns.resolve6) dns.resolve6 = wrapDnsCallback(dns.resolve6.bind(dns));

if (dns.promises) {
  if (dns.promises.lookup)   dns.promises.lookup   = wrapDnsPromise(dns.promises.lookup.bind(dns.promises));
  if (dns.promises.resolve)  dns.promises.resolve  = wrapDnsPromise(dns.promises.resolve.bind(dns.promises));
  if (dns.promises.resolve4) dns.promises.resolve4 = wrapDnsPromise(dns.promises.resolve4.bind(dns.promises));
  if (dns.promises.resolve6) dns.promises.resolve6 = wrapDnsPromise(dns.promises.resolve6.bind(dns.promises));
}
