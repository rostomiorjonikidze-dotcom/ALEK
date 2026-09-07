
import crypto from 'node:crypto';

export function validateTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) throw new Error('missing init data');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) throw new Error('missing hash');

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) throw new Error('missing auth_date');
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSeconds || authDate > now + 60) throw new Error('expired init data');

  const entries = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash' || key === 'signature') continue;
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(calculatedHash, 'hex');
  const b = Buffer.from(receivedHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('invalid hash');

  const userRaw = params.get('user');
  if (!userRaw) throw new Error('missing user');
  const user = JSON.parse(userRaw);
  if (!user?.id) throw new Error('invalid user');

  return { user, authDate, queryId: params.get('query_id') || null };
}

export async function telegramApi(botToken, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}
