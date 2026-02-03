import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { buildAuthorizeUrl, createPkcePair, exchangeCodeForToken, fetchSchedule } from './magister.js';
import { encrypt, decrypt } from './crypto.js';
import { upsertUser, getUser, listNotifications } from './db.js';
import { runScheduleCheck } from './scheduler.js';
import cron from 'node-cron';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

const pkceStore = new Map();

function parseUserId(req) {
  const header = req.headers.cookie || '';
  const match = header.match(/user_id=(\\d+)/);
  if (match) {
    return match[1];
  }
  return null;
}

function requireUser(req, res, next) {
  const userId = req.headers['x-user-id'] || parseUserId(req) || req.query.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = getUser(Number(userId));
  if (!user) {
    return res.status(401).json({ error: 'Unknown user' });
  }
  req.user = user;
  return next();
}

app.post('/auth/start', (req, res) => {
  const { magisterBaseUrl, email, identityProvider } = req.body;
  const clientId = process.env.MAGISTER_CLIENT_ID;
  const redirectUri = process.env.MAGISTER_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Missing MAGISTER_CLIENT_ID or MAGISTER_REDIRECT_URI' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  const { codeVerifier, codeChallenge } = createPkcePair();
  pkceStore.set(state, { codeVerifier, magisterBaseUrl, email });
  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: magisterBaseUrl,
    clientId,
    redirectUri,
    state,
    codeChallenge,
    identityProvider
  });
  return res.json({ authorizeUrl });
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const stored = pkceStore.get(state);
  if (!stored) {
    return res.status(400).send('Invalid state');
  }
  pkceStore.delete(state);
  try {
    const token = await exchangeCodeForToken({
      baseUrl: stored.magisterBaseUrl,
      clientId: process.env.MAGISTER_CLIENT_ID,
      clientSecret: process.env.MAGISTER_CLIENT_SECRET,
      redirectUri: process.env.MAGISTER_REDIRECT_URI,
      code,
      codeVerifier: stored.codeVerifier
    });
    const tokenExpiresAt = Date.now() + token.expires_in * 1000;
    const userId = upsertUser({
      magister_base_url: stored.magisterBaseUrl,
      email: stored.email,
      access_token_enc: encrypt(token.access_token),
      refresh_token_enc: encrypt(token.refresh_token),
      token_expires_at: tokenExpiresAt,
      created_at: Date.now()
    });
    res.cookie('user_id', userId, { httpOnly: true, secure: false, sameSite: 'lax' });
    return res.redirect('/');
  } catch (error) {
    console.error(error);
    return res.status(500).send('Login failed');
  }
});

app.get('/api/schedule', requireUser, async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    const data = await fetchSchedule({
      baseUrl: req.user.magister_base_url,
      accessToken: decrypt(req.user.access_token_enc),
      from,
      to
    });
    return res.json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

app.get('/api/notifications', requireUser, (req, res) => {
  const notifications = listNotifications(req.user.id, 50);
  return res.json({ notifications });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('user_id');
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

cron.schedule(process.env.SCHEDULE_CRON || '*/5 * * * *', () => {
  runScheduleCheck();
});
