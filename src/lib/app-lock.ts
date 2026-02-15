const APP_LOCK_ENABLED_KEY = 'finansas-app-lock-enabled';
const APP_LOCK_SALT_KEY = 'finansas-app-lock-salt-b64';
const APP_LOCK_HASH_KEY = 'finansas-app-lock-hash-b64';
const APP_LOCK_SESSION_UNLOCKED_KEY = 'finansas-app-lock-session-unlocked';

function safeGetStorage(kind: 'localStorage' | 'sessionStorage') {
    try {
        if (typeof window === 'undefined') return null;
        return window[kind] ?? null;
    } catch {
        return null;
    }
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function sha256(bytes: Uint8Array) {
    const cryptoObj = globalThis.crypto;
    if (!cryptoObj?.subtle?.digest) {
        throw new Error('Crypto no disponible en este navegador.');
    }
    const digest = await cryptoObj.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    return new Uint8Array(digest);
}

async function hashPin(pin: string, saltB64: string) {
    const saltBytes = base64ToBytes(saltB64);
    const pinBytes = new TextEncoder().encode(pin);
    const combined = new Uint8Array(saltBytes.length + 1 + pinBytes.length);
    combined.set(saltBytes, 0);
    combined[saltBytes.length] = 58; // ':'
    combined.set(pinBytes, saltBytes.length + 1);
    const digestBytes = await sha256(combined);
    return bytesToBase64(digestBytes);
}

function sanitizePin(pin: string) {
    return String(pin || '').replace(/\s+/g, '').trim();
}

export function isAppLockEnabled() {
    const storage = safeGetStorage('localStorage');
    if (!storage) return false;
    return storage.getItem(APP_LOCK_ENABLED_KEY) === '1';
}

export function isAppLockSessionUnlocked() {
    const storage = safeGetStorage('sessionStorage');
    if (!storage) return false;
    return storage.getItem(APP_LOCK_SESSION_UNLOCKED_KEY) === '1';
}

export function markAppLockSessionUnlocked() {
    const storage = safeGetStorage('sessionStorage');
    if (!storage) return;
    storage.setItem(APP_LOCK_SESSION_UNLOCKED_KEY, '1');
}

export function clearAppLockSessionUnlocked() {
    const storage = safeGetStorage('sessionStorage');
    if (!storage) return;
    storage.removeItem(APP_LOCK_SESSION_UNLOCKED_KEY);
}

export async function enableAppLock(pin: string) {
    const normalized = sanitizePin(pin);
    if (!/^\d{4,6}$/.test(normalized)) {
        throw new Error('El PIN debe tener 4 a 6 dígitos.');
    }

    const storage = safeGetStorage('localStorage');
    if (!storage) {
        throw new Error('Storage no disponible en este navegador.');
    }

    const saltBytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(saltBytes);
    const saltB64 = bytesToBase64(saltBytes);
    const hashB64 = await hashPin(normalized, saltB64);

    storage.setItem(APP_LOCK_ENABLED_KEY, '1');
    storage.setItem(APP_LOCK_SALT_KEY, saltB64);
    storage.setItem(APP_LOCK_HASH_KEY, hashB64);

    markAppLockSessionUnlocked();
}

export function disableAppLock() {
    const storage = safeGetStorage('localStorage');
    if (!storage) return;
    storage.removeItem(APP_LOCK_ENABLED_KEY);
    storage.removeItem(APP_LOCK_SALT_KEY);
    storage.removeItem(APP_LOCK_HASH_KEY);
    clearAppLockSessionUnlocked();
}

export async function verifyAppLockPin(pin: string) {
    const normalized = sanitizePin(pin);
    if (!/^\d{4,6}$/.test(normalized)) return false;

    const storage = safeGetStorage('localStorage');
    if (!storage) return false;

    const enabled = storage.getItem(APP_LOCK_ENABLED_KEY) === '1';
    if (!enabled) return true;

    const saltB64 = storage.getItem(APP_LOCK_SALT_KEY);
    const storedHashB64 = storage.getItem(APP_LOCK_HASH_KEY);
    if (!saltB64 || !storedHashB64) return false;

    const computedHashB64 = await hashPin(normalized, saltB64);
    return computedHashB64 === storedHashB64;
}
