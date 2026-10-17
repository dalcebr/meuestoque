import { z } from 'zod';
import type { Env } from '../../../_lib/env';
import { body, handle, HttpError, json } from '../../../_lib/http';
import { audit, deleteUserIfOrphan, requirePlatformAdmin } from '../../../_lib/supabase';
import { idParam, isoDate, slug } from '../../../_lib/schemas';

type Ctx = EventContext<Env, 'id', unknown>;

const UpdateStore = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: slug.optional(),
  status: z.enum(['active', 'blocked']).optional(),
  plan: z.string().trim().min(1).max(40).optional(),
  maxUsers: z.number().int().min(1).max(100).optional(),
  expiresAt: isoDate.nullable().optional(),
  /** Soma dias à validade (a partir de hoje, se já venceu). */
  extendDays: z.number().int().min(1).max(3660).optional(),
  contactName: z.string().trim().max(80).nullable().optional(),
  contactPhone: z.string().trim().max(20).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** PATCH /api/admin/stores/:id — altera plano, validade, situação etc. */
export const onRequestPatch = handle<Ctx>(async ({ request, env, params }) => {
  const { sb, user } = await requirePlatformAdmin(request, env);
  const id = idParam(params.id);
  const b = await body(request, UpdateStore);
  const { data: cur } = await sb.from('stores').select('*').eq('id', id).maybeSingle();
  if (!cur) throw new HttpError(404, 'Loja não encontrada.');

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.slug !== undefined && b.slug !== cur.slug) {
    const { data: taken } = await sb.from('stores').select('id').eq('slug', b.slug).neq('id', id).maybeSingle();
    if (taken) throw new HttpError(409, 'Esse endereço já está em uso.');
    patch.slug = b.slug;
  }
  if (b.status !== undefined) patch.status = b.status;
  if (b.plan !== undefined) patch.plan = b.plan;
  if (b.maxUsers !== undefined) patch.max_users = b.maxUsers;
  if (b.expiresAt !== undefined) patch.expires_at = b.expiresAt;
  if (b.extendDays) {
    const base = Math.max(Date.now(), cur.expires_at ? new Date(cur.expires_at).getTime() : 0);
    const d = new Date(base + b.extendDays * 86_400_000);
    d.setUTCHours(23, 59, 59, 0);
    patch.expires_at = d.toISOString();
  }
  if (b.contactName !== undefined) patch.contact_name = b.contactName;
  if (b.contactPhone !== undefined) patch.contact_phone = b.contactPhone;
  if (b.notes !== undefined) patch.notes = b.notes;
  if (!Object.keys(patch).length) return json({ store: cur });

  const { data: store, error } = await sb.from('stores').update(patch).eq('id', id).select('*').single();
  if (error) throw new HttpError(400, error.message);

  const changed = Object.fromEntries(Object.keys(patch).filter((k) => k !== 'notes').map((k) => [k, patch[k]]));
  await audit(sb, { store_id: id, actor: user, action: 'store.update', details: { store_name: store.name, ...changed } });
  return json({ store });
});

/** DELETE /api/admin/stores/:id — apaga loja, dados, fotos e usuários que ficarem sem loja. */
export const onRequestDelete = handle<Ctx>(async ({ request, env, params }) => {
  const { sb, user } = await requirePlatformAdmin(request, env);
  const id = idParam(params.id);
  const { data: cur } = await sb.from('stores').select('id, name, slug').eq('id', id).maybeSingle();
  if (!cur) throw new HttpError(404, 'Loja não encontrada.');
  const { data: members } = await sb.from('store_members').select('user_id').eq('store_id', id);

  // Fotos no Storage (pasta <store_id>/img)
  const bucket = sb.storage.from('store-media');
  for (;;) {
    const { data: files } = await bucket.list(`${id}/img`, { limit: 1000 });
    if (!files?.length) break;
    await bucket.remove(files.map((f) => `${id}/img/${f.name}`));
    if (files.length < 1000) break;
  }

  const { error } = await sb.from('stores').delete().eq('id', id);
  if (error) throw new HttpError(400, error.message);
  for (const m of members ?? []) await deleteUserIfOrphan(sb, m.user_id).catch(() => undefined);
  await audit(sb, { store_id: null, actor: user, action: 'store.delete', details: { store_name: cur.name, slug: cur.slug } });
  return json({ ok: true });
});
