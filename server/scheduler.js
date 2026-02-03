import { getScheduleCache, getUsers, upsertScheduleCache, updateUserTokens } from './db.js';
import { decrypt, encrypt } from './crypto.js';
import { fetchSchedule, refreshAccessToken } from './magister.js';
import { sendNotification } from './notifier.js';

function normalizeLesson(lesson) {
  return {
    id: lesson.Id ?? lesson.id ?? `${lesson.Start}-${lesson.Einde}-${lesson.Lokaal}-${lesson.Vak}`,
    start: lesson.Start ?? lesson.start,
    end: lesson.Einde ?? lesson.end,
    room: lesson.Lokaal ?? lesson.room,
    subject: lesson.Vak ?? lesson.subject,
    teacher: lesson.Docent ?? lesson.teacher,
    status: lesson.Status ?? lesson.status,
    isCancelled: lesson.IsUitgevallen ?? lesson.isCancelled
  };
}

function diffSchedules(previous = [], current = []) {
  const prevMap = new Map(previous.map((l) => [l.id, l]));
  const currMap = new Map(current.map((l) => [l.id, l]));
  const changes = [];

  for (const [id, prevLesson] of prevMap.entries()) {
    if (!currMap.has(id)) {
      changes.push({ type: 'cancelled', lesson: prevLesson });
    }
  }

  for (const [id, currLesson] of currMap.entries()) {
    const prevLesson = prevMap.get(id);
    if (!prevLesson) {
      continue;
    }
    const differences = [];
    if (prevLesson.start !== currLesson.start || prevLesson.end !== currLesson.end) {
      differences.push('tijd');
    }
    if (prevLesson.room !== currLesson.room) {
      differences.push('lokaal');
    }
    if (prevLesson.teacher !== currLesson.teacher) {
      differences.push('docent');
    }
    if (prevLesson.subject !== currLesson.subject) {
      differences.push('vak');
    }
    if (differences.length > 0) {
      changes.push({ type: 'changed', lesson: currLesson, differences });
    }
  }

  return changes;
}

function formatMessage(change) {
  if (change.type === 'cancelled') {
    return `Les uitgevallen: ${change.lesson.subject} (${change.lesson.start} - ${change.lesson.end}).`;
  }
  const diff = change.differences.join(', ');
  return `Les gewijzigd (${diff}): ${change.lesson.subject} (${change.lesson.start} - ${change.lesson.end}) in lokaal ${change.lesson.room}, docent ${change.lesson.teacher}.`;
}

function dateRange() {
  const from = new Date();
  const to = new Date();
  to.setDate(from.getDate() + 2);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

async function ensureToken(user) {
  const expiresAt = Number(user.token_expires_at);
  const now = Date.now();
  if (now < expiresAt - 60_000) {
    return { accessToken: decrypt(user.access_token_enc), refreshToken: decrypt(user.refresh_token_enc) };
  }
  const refreshed = await refreshAccessToken({
    baseUrl: user.magister_base_url,
    clientId: process.env.MAGISTER_CLIENT_ID,
    clientSecret: process.env.MAGISTER_CLIENT_SECRET,
    refreshToken: decrypt(user.refresh_token_enc)
  });
  const tokenExpiresAt = now + refreshed.expires_in * 1000;
  updateUserTokens(
    user.id,
    encrypt(refreshed.access_token),
    encrypt(refreshed.refresh_token ?? decrypt(user.refresh_token_enc)),
    tokenExpiresAt
  );
  return { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token };
}

export async function runScheduleCheck() {
  const users = getUsers();
  for (const user of users) {
    try {
      const { from, to } = dateRange();
      const { accessToken } = await ensureToken(user);
      const scheduleData = await fetchSchedule({ baseUrl: user.magister_base_url, accessToken, from, to });
      const normalized = (scheduleData?.Items ?? scheduleData ?? []).map(normalizeLesson);
      const cache = getScheduleCache(user.id, from);
      const previous = cache ? JSON.parse(cache.schedule_json) : [];
      const changes = diffSchedules(previous, normalized);
      for (const change of changes) {
        const message = formatMessage(change);
        await sendNotification({
          userId: user.id,
          email: user.email,
          subject: 'Magister roosterwijziging',
          text: message
        });
      }
      upsertScheduleCache(user.id, from, JSON.stringify(normalized));
    } catch (error) {
      console.error(`Schedule check failed for user ${user.id}`, error);
    }
  }
}
