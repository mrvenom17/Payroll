import crypto from 'crypto';

// HMAC-signed session token. Replaces the previous plain-base64 JSON cookie which any
// client could forge by encoding {role: "super_admin"}.
//
// Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    // Surface a loud error in dev rather than silently signing with a weak key.
    throw new Error('AUTH_SECRET is missing or shorter than 16 chars. Set it in .env.local.');
  }
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

export function createSessionToken(payload) {
  const body = b64url(JSON.stringify({ ...payload, iat: Date.now() }));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(body);
  // Constant-time compare — both must be the same length first.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
