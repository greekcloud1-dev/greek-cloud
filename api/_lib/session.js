import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = '__Host-gc-crm';
export const STATE_COOKIE = '__Host-gc-crm-state';
export const SESSION_DAYS = 30;

export function sessionConfigured(env) {
  return typeof env.CRM_SESSION_SECRET === 'string' && env.CRM_SESSION_SECRET.length >= 32;
}

function mac(body, secret) {
  return createHmac('sha256', secret).update(body).digest();
}

export function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

/** The payload if the token is ours and unexpired, otherwise null. */
export function verifyToken(token, secret, nowMs) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = mac(body, secret);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null;
  if (typeof payload.email !== 'string') return null;
  return payload;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

export function cookie(name, value, { maxAge, sameSite = 'Strict' } = {}) {
  const attrs = [`${name}=${value}`, 'Path=/', 'Secure', 'HttpOnly', `SameSite=${sameSite}`];
  if (maxAge !== undefined) attrs.push(`Max-Age=${maxAge}`);
  return attrs.join('; ');
}

export const clearCookie = (name) => cookie(name, '', { maxAge: 0, sameSite: 'Lax' });

/** 'admin' | 'member' | null. The env admin can never be locked out by the users file. */
export async function roleFor(email, env, store) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  if (e === String(env.CRM_ADMIN_EMAIL || '').trim().toLowerCase()) return 'admin';
  const file = await store.getJSON('crm/users.json');
  const users = file && Array.isArray(file.data?.users) ? file.data.users : [];
  const hit = users.find((u) => u.email === e);
  return hit ? (hit.role === 'admin' ? 'admin' : 'member') : null;
}
