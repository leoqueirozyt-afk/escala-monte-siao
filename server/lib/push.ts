import { sendPushBatch } from "@mmmike/web-push/send";
import type { Env } from "./env.js";

export interface PushPayload {
  title: string;
  body?: string;
  url: string;
}

type SubRow = { endpoint: string; p256dh: string; auth: string };

function vapidConfig(env: Env) {
  const keys = JSON.parse(env.VAPID_KEYS);
  return { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "mailto:admin@montesiao.org" };
}

async function sendToSubscriptions(env: Env, subs: SubRow[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;
  try {
    const { gone } = await sendPushBatch(
      subs.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
      payload,
      vapidConfig(env),
      { timeoutMs: 10000 },
    );
    if (gone.length > 0) {
      await env.DB.batch(
        gone.map((endpoint) => env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint)),
      );
    }
  } catch (err) {
    console.error("push: envio falhou", err instanceof Error ? err.message : String(err));
  }
}

export function schedulePush(c: any, task: Promise<void>): void {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    task.catch(() => {});
  }
}

export async function notifyUser(env: Env, userId: number, payload: PushPayload): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
  )
    .bind(userId)
    .all();
  await sendToSubscriptions(env, rows.results as SubRow[], payload);
}

export async function notifyVisibleSubscribers(
  env: Env,
  ministryId: number | null,
  payload: PushPayload,
): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscriptions ps
     JOIN users u ON u.id = ps.user_id
     WHERE u.role = 'ADMIN'
        OR ? IS NULL
        OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.ministry_id = ?)
        OR EXISTS (SELECT 1 FROM ministry_leaders ml WHERE ml.user_id = u.id AND ml.ministry_id = ?)`,
  )
    .bind(ministryId, ministryId, ministryId)
    .all();
  await sendToSubscriptions(env, rows.results as SubRow[], payload);
}
