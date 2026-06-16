// Firstlight feedback endpoint — Vercel serverless function (zero dependencies).
// Receives feature requests / collaboration offers from the landing page and
// emails them to the maintainer via Resend.
//
// Spam defenses (a static, public, low-traffic site does not need a CAPTCHA):
//   1. Honeypot field ("website") — bots fill it; humans never see it.
//   2. Time trap — submissions faster than humanly possible are dropped.
//   3. Lightweight per-instance IP rate limiting (best effort).
//   4. Strict validation + length caps.
//
// The Resend API key is read from the environment (RESEND_API_KEY) and is
// never committed to this public repository.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'Firstlight <firstlight@updates.coffeyconsulting.co>';
const TO = 'seoplanotx@gmail.com';

const MIN_FILL_MS = 3000;        // faster than this = bot
const MAX_AGE_MS = 1000 * 60 * 60 * 6; // stale form (6h) = reject
const RATE_LIMIT = 5;            // max submissions
const RATE_WINDOW_MS = 1000 * 60 * 10; // per 10 minutes, per IP, per warm instance

// Best-effort in-memory limiter. Resets when the instance is recycled — that is
// fine; the honeypot and time trap are the real defenses.
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // guard against unbounded growth
  return arr.length > RATE_LIMIT;
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  // 1. Honeypot — pretend success so bots don't retry, but send nothing.
  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  // 2. Time trap.
  const ts = Number(body.ts);
  const age = Date.now() - ts;
  if (!ts || Number.isNaN(age) || age < MIN_FILL_MS || age > MAX_AGE_MS) {
    return res.status(400).json({ error: 'Please take a moment and try again.' });
  }

  // 3. Validate.
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!name || name.length > 120) return res.status(400).json({ error: 'A valid name is required.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!message || message.length < 2 || message.length > 4000) {
    return res.status(400).json({ error: 'A message is required.' });
  }

  // 4. Rate limit.
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages. Please try again later.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return res.status(500).json({ error: 'Server is not configured to send mail yet.' });
  }

  const html = `
    <h2>New Firstlight message</h2>
    <p><strong>Name:</strong> ${esc(name)}</p>
    <p><strong>Email:</strong> ${esc(email)}</p>
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-wrap">${esc(message)}</p>
    <hr>
    <p style="color:#888;font-size:12px">Sent from firstlighthq.com · IP ${esc(ip)}</p>
  `;

  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: `Firstlight: message from ${name}`,
        html
      })
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Resend error', r.status, detail);
      return res.status(502).json({ error: 'Could not send your message. Please email seoplanotx@gmail.com directly.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('feedback send failed', err);
    return res.status(500).json({ error: 'Could not send your message. Please email seoplanotx@gmail.com directly.' });
  }
};
