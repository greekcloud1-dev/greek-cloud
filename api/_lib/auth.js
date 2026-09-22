import { randomBytes } from 'node:crypto';
import {
  SESSION_COOKIE, STATE_COOKIE, SESSION_DAYS, sessionConfigured, signToken, safeEqual,
  parseCookies, cookie, clearCookie, roleFor,
} from './session.js';

/* Google sign-in, server side (authorization-code flow). No Google script runs on
   the CRM page, so its CSP stays 'self' only. The ID token comes straight from
   Google's token endpoint over TLS in exchange for our client secret, which is
   what makes its claims trustworthy without a separate signature check. */

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

function redirect(location, cookies = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

export function decodeJwtPayload(jwt) {
  const part = String(jwt || '').split('.')[1];
  if (!part) return null;
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); } catch { return null; }
}

export function createAuthHandler({ env, store, fetchImpl = fetch, now = () => Date.now() }) {
  return async function handle(request) {
    const url = new URL(request.url);
    const back = (code) => redirect(`/crm/?e=${code}`, [clearCookie(STATE_COOKIE)]);
    if (!sessionConfigured(env) || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return back('config');

    const redirectUri = `${url.origin}/api/crm-auth`;
    if (url.searchParams.get('error')) return back('google');

    const code = url.searchParams.get('code');
    if (!code) {
      const state = randomBytes(24).toString('base64url');
      const target = new URL(GOOGLE_AUTH);
      target.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email',
        state,
        prompt: 'select_account',
      }).toString();
      // Lax, not Strict: Google's redirect back to us is a cross-site navigation.
      return redirect(target.toString(), [cookie(STATE_COOKIE, state, { maxAge: 600, sameSite: 'Lax' })]);
    }

    const state = url.searchParams.get('state') || '';
    const saved = parseCookies(request.headers.get('cookie'))[STATE_COOKIE] || '';
    if (!state || !saved || !safeEqual(state, saved)) return back('state');

    let claims;
    try {
      const res = await fetchImpl(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri, grant_type: 'authorization_code',
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return back('google');
      claims = decodeJwtPayload((await res.json()).id_token);
    } catch {
      return back('google');
    }

    if (!claims || claims.aud !== env.GOOGLE_CLIENT_ID || !ISSUERS.has(claims.iss)
        || typeof claims.exp !== 'number' || claims.exp * 1000 <= now()
        || claims.email_verified !== true || typeof claims.email !== 'string') {
      return back('google');
    }

    const email = claims.email.toLowerCase();
    const role = await roleFor(email, env, store).catch(() => null);
    if (!role) return back('denied');

    const token = signToken({ email, exp: Math.floor(now() / 1000) + SESSION_DAYS * 86400 }, env.CRM_SESSION_SECRET);
    return redirect('/crm/', [clearCookie(STATE_COOKIE), cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 })]);
  };
}
