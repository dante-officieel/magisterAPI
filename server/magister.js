import crypto from 'crypto';

function baseUrlFromInput(input) {
  if (!input.startsWith('http')) {
    return `https://${input}`;
  }
  return input;
}

export function buildAuthorizeUrl({ baseUrl, clientId, redirectUri, state, codeChallenge, identityProvider }) {
  const url = new URL('/connect/authorize', baseUrlFromInput(baseUrl));
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile magister-api');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (identityProvider) {
    url.searchParams.set('idp', identityProvider);
  }
  return url.toString();
}

export function createPkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export async function exchangeCodeForToken({ baseUrl, clientId, clientSecret, redirectUri, code, codeVerifier }) {
  const url = new URL('/connect/token', baseUrlFromInput(baseUrl));
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function refreshAccessToken({ baseUrl, clientId, clientSecret, refreshToken }) {
  const url = new URL('/connect/token', baseUrlFromInput(baseUrl));
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function fetchSchedule({ baseUrl, accessToken, from, to }) {
  const url = new URL('/api/afspraken', baseUrlFromInput(baseUrl));
  url.searchParams.set('van', from);
  url.searchParams.set('tot', to);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schedule fetch failed: ${res.status} ${text}`);
  }
  return res.json();
}
