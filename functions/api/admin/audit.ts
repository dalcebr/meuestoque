import type { Env } from '../../_lib/env';
import { handle, HttpError, json } from '../../_lib/http';
import { requirePlatformAdmin } from '../../_lib/supabase';

/** GET /api/admin/audit — últimas 300 ações. */
export const onRequestGet = handle<EventContext<Env, string, unknown>>(async ({ request, env }) => {
  const { sb } = await requirePlatformAdmin(request, env);
  const { data, error } = await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw new HttpError(500, error.message);
  return json({ entries: data ?? [] });
});
