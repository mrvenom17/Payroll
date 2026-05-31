// HMAC-signed session token using Web Crypto API for Edge Runtime compatibility

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET is missing or shorter than 16 chars. Set it in .env.local.');
  }
  return s;
}

async function getCryptoKey() {
  const secret = getSecret();
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64urlEncode(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function sign(payloadB64) {
  const key = await getCryptoKey();
  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  return b64urlEncode(signatureBuffer);
}

export async function createSessionToken(payload) {
  const enc = new TextEncoder();
  const bodyString = JSON.stringify({ ...payload, iat: Date.now() });
  const bodyB64 = b64urlEncode(enc.encode(bodyString));
  const signature = await sign(bodyB64);
  return `${bodyB64}.${signature}`;
}

export async function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);

  const key = await getCryptoKey();
  const enc = new TextEncoder();

  const sigBytes = b64urlDecode(sig);
  if (!sigBytes) return null;

  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(body));
  if (!isValid) return null;

  try {
    const bodyBytes = b64urlDecode(body);
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(bodyBytes));
  } catch {
    return null;
  }
}
