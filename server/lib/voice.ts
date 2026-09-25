export async function attachGroups(db: D1Database, rows: any[]): Promise<void> {
  const withGroup = rows.filter((r) => r.group_id != null);
  if (withGroup.length === 0) return;
  const groupIds = [...new Set(withGroup.map((r) => Number(r.group_id)))];
  const scheduleIds = [...new Set(withGroup.map((r) => Number(r.id)))];
  const gq = await db
    .prepare(`SELECT id, name, kind FROM voice_groups WHERE id IN (${groupIds.map(() => "?").join(",")})`)
    .bind(...groupIds)
    .all();
  const groups = new Map(
    (gq.results as any[]).map((g) => [
      Number(g.id),
      { id: Number(g.id), name: String(g.name), kind: String(g.kind), members: [] as any[] },
    ]),
  );
  const mq = await db
    .prepare(
      `SELECT sgm.schedule_id, u.id AS user_id, u.name, u.avatar_url,
         vc.name AS classification, vc.color AS classification_color, sgm.status
       FROM schedule_group_members sgm
       JOIN users u ON u.id = sgm.user_id
       LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
       LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id
       WHERE sgm.schedule_id IN (${scheduleIds.map(() => "?").join(",")})
       ORDER BY u.name`,
    )
    .bind(...scheduleIds)
    .all();
  const bySchedule = new Map<number, any[]>();
  for (const m of mq.results as any[]) {
    const sid = Number(m.schedule_id);
    const arr = bySchedule.get(sid) ?? [];
    arr.push({
      user_id: Number(m.user_id),
      name: m.name,
      avatar_url: m.avatar_url ?? null,
      classification: m.classification ?? null,
      classification_color: m.classification_color ?? null,
      status: m.status,
    });
    bySchedule.set(sid, arr);
  }
  for (const r of withGroup) {
    const g = groups.get(Number(r.group_id));
    r.group = g ? { ...g, members: bySchedule.get(Number(r.id)) ?? [] } : null;
  }
}
