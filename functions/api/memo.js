// POST /api/memo : 端末情報を1件保存(誰でも可)
// GET  /api/memo : 保存済み一覧(ADMIN_TOKEN が必要)

const MAX_BODY_BYTES = 16 * 1024;
const LIST_LIMIT = 200;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export async function onRequestPost({ request, env }) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: "too large" }, 413);

  let entry;
  try {
    entry = JSON.parse(text);
  } catch (e) {
    return json({ error: "invalid json" }, 400);
  }
  if (!entry || typeof entry.id !== "string" || typeof entry.recordedAt !== "string") {
    return json({ error: "id and recordedAt are required" }, 400);
  }

  // IPはクライアント申告ではなく、Cloudflareが見た接続元を正とする
  const ip = request.headers.get("CF-Connecting-IP");
  const country = request.cf && request.cf.country ? request.cf.country : null;
  const hints = entry.clientHints || {};

  await env.DB.prepare(
    `INSERT OR IGNORE INTO device_memo
     (id, recorded_at, received_at, ip, client_ip, country, user_agent, model, platform, note, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      entry.id.slice(0, 64),
      entry.recordedAt.slice(0, 64),
      new Date().toISOString(),
      ip,
      typeof entry.ip === "string" ? entry.ip.slice(0, 64) : null,
      country,
      String(entry.userAgent || "").slice(0, 512),
      String(hints.model || "").slice(0, 128),
      String(hints.platform || entry.platform || "").slice(0, 128),
      String(entry.note || "").slice(0, 1000),
      text
    )
    .run();

  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.ADMIN_TOKEN || auth !== "Bearer " + env.ADMIN_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const { results } = await env.DB.prepare(
    `SELECT id, recorded_at, received_at, ip, client_ip, country, user_agent, model, platform, note
     FROM device_memo ORDER BY received_at DESC LIMIT ?`
  )
    .bind(LIST_LIMIT)
    .all();
  return json(results);
}
