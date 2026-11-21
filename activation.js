/* Diecast Archive encrypted release activation — v0.4.16 Stable.
 *
 * Replaces the earlier flag-based lock. There is no "unlocked" boolean
 * anywhere in this file or in storage. The password is used to derive an
 * AES-GCM key; that key is what decrypts script.enc.json into the real,
 * running application. A wrong password makes decryption throw (AES-GCM
 * authenticates its ciphertext) — there is nothing to forge in DevTools,
 * because there is no separate "did they enter it correctly" flag to set.
 *
 * What this still does NOT do: stop someone from reading the decrypted
 * script.js in DevTools once it's running, or from patching this file's
 * own logic in a debugger. No client-only scheme can do that. This raises
 * the bar from "one console line" to "you have to actually break the
 * encryption or intercept it while running," which is the realistic
 * ceiling for a purely static, offline-first app with no server.
 */
'use strict';

const DA_LOCK_RELEASE = '0.4.5-dev-phase3';
const DA_UNLOCK_SESSION_KEY = 'diecast-archive-permanent-key-v2-' + DA_LOCK_RELEASE; // IndexedDB-held key handle, NOT a boolean
const DA_ENC_MANIFEST_URL = './script.enc.json';

function daFail(root, message) {
  const err = document.getElementById('daActivationError');
  if (err) { err.textContent = message; return; }
  if (root) root.innerHTML = `<div class="daActivationDialog"><p role="alert">${message}</p></div>`;
}

async function daDeriveKey(password, saltB64, iterations, usage) {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable; stored as a CryptoKey in IndexedDB
    [usage]
  );
}

async function daDecryptScript(key, manifest) {
  const iv = Uint8Array.from(atob(manifest.iv), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(manifest.ciphertext), c => c.charCodeAt(0));
  // Throws (OperationError) on a wrong key. This IS the check — not an if-statement.
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

function daRunDecryptedApp(code) {
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const script = document.createElement('script');
  script.src = blobUrl;
  script.onload = () => URL.revokeObjectURL(blobUrl);
  script.onerror = () => console.error('Decrypted application script failed to load.');
  document.body.appendChild(script);
}

/* --- Optional convenience: remember the derived key on THIS device only, so a
 * returning user doesn't retype the password every visit. This is explicitly
 * NOT a security boundary — it's the same trade-off the old "Remove Lock"
 * switch made, just done honestly: the key is held in IndexedDB (not a
 * plaintext flag in localStorage), and clearing it requires the same
 * "Remove convenience" action in Settings, which re-derives nothing and
 * simply forgets the stored key. Anyone who can read IndexedDB in DevTools
 * can already read the running app anyway, so this adds no new exposure. */
let daSessionKey = null;
let daPermanentUnlock = false;

// A persisted, authenticated AES key is the ONLY durable unlock credential.
// The previous DEV auto-remembered key is deliberately not reused.
window.daActivationIsPermanent = () => daPermanentUnlock;
window.daRemoveActivationLock = async () => {
  if (daPermanentUnlock) return true;
  if (!daSessionKey) throw new Error('Activation key unavailable. Please unlock this release again.');
  await daKeyStore.save(daSessionKey);
  daPermanentUnlock = true;
  return true;
};

const daKeyStore = (() => {
  const dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open('diecast-archive-activation', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return {
    async save(key) {
      const db = await dbp;
      return new Promise((res, rej) => {
        const tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').put(key, DA_UNLOCK_SESSION_KEY);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    },
    async load() {
      const db = await dbp;
      return new Promise((res, rej) => {
        const tx = db.transaction('keys', 'readonly');
        const req = tx.objectStore('keys').get(DA_UNLOCK_SESSION_KEY);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => rej(req.error);
      });
    },
    async clear() {
      const db = await dbp;
      return new Promise((res, rej) => {
        const tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').delete(DA_UNLOCK_SESSION_KEY);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    },
  };
})();

async function daTryStoredKey(manifest) {
  const raw = await daKeyStore.load().catch(() => null);
  if (!raw) return false;
  try {
    const key = raw;
    const code = await daDecryptScript(key, manifest);
    daPermanentUnlock = true;
    daRunDecryptedApp(code);
    return true;
  } catch {
    await daKeyStore.clear().catch(() => {}); // stale/corrupted — don't keep retrying with it
    return false;
  }
}

function daLockScreen(manifest) {
  const root = document.getElementById('daActivationRoot');
  if (!root) return;
  root.innerHTML = `<div class="daActivationDialog" role="dialog" aria-modal="true" aria-labelledby="daActivationHeading"><div class="daActivationBrand">DIECAST ARCHIVE / V0.4.5 DEV · PHASE 3<span class="daActivationAuthor">noelgato-dll</span></div><h2 id="daActivationHeading">Activation Required</h2><p>Enter the password for this stable release.</p><form id="daActivationForm"><input aria-label="Release password" id="daActivationPassword" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required maxlength="64" /><p id="daActivationError" role="alert" aria-live="polite"></p><button type="submit">Confirm</button></form></div>`;
  const input = document.getElementById('daActivationPassword');
  input.focus();
  document.getElementById('daActivationForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    const err = document.getElementById('daActivationError');
    err.textContent = '';
    try {
      const key = await daDeriveKey(input.value, manifest.salt, manifest.iterations, 'decrypt');
      const code = await daDecryptScript(key, manifest); // throws on wrong password
      daSessionKey = key; // session only until Remove Lock is explicitly toggled
      daRunDecryptedApp(code);
      root.remove();
    } catch (_) {
      daFail(root, 'Incorrect activation password.');
      input.value = '';
      input.focus();
    } finally {
      btn.disabled = false;
    }
  };
}

(async function daBoot() {
  let manifest;
  if (location.protocol === 'file:') {
    daFail(document.getElementById('daActivationRoot'), 'Local file mode is not supported. Open this release through http://localhost or HTTPS.');
    return;
  }
  try {
    // Read the encrypted payload from the *same cache* that installed the
    // shell. Do not assume a network response or an exact cache name.
    // This supports pre-activation offline startup as well as remembered keys.
    const assetURL = new URL(DA_ENC_MANIFEST_URL, document.baseURI).href;
    let response = await caches.match(assetURL, { ignoreSearch: true });
    if (!response) {
      response = await fetch(assetURL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Encrypted package HTTP ' + response.status);
      // Explicitly persist payload even when a previous service worker is
      // controlling this tab; wait for cache write before showing activation.
      const cache = await caches.open('diecast-archive-shell-v0405-dev-phase3');
      await cache.put(assetURL, response.clone());
    }
    manifest = await response.json();
    if (!manifest || !manifest.salt || !manifest.iv || !manifest.ciphertext || !Number.isInteger(manifest.iterations)) {
      throw new Error('Invalid encrypted release package');
    }
  } catch (e) {
    console.error('Diecast Archive encrypted package failed to load:', e);
    daFail(document.getElementById('daActivationRoot'), navigator.onLine === false
      ? 'Encrypted release package is unavailable offline. Connect once to finish installing this release.'
      : 'Could not load the encrypted release package. Check the deployed script.enc.json file and reload.');
    return;
  }
  const alreadyRunning = await daTryStoredKey(manifest);
  if (!alreadyRunning) daLockScreen(manifest);
})();
