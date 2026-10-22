import { z } from 'zod';
import type { Env } from '../../_lib/env';
import { body, handle, HttpError, json } from '../../_lib/http';
import { audit, deleteUserIfOrphan, requireOwner } from '../../_lib/supabase';
import { idParam, personName } from '../../_lib/schemas';
import { sanitizePerms } from '../../../src/shared/perms';

type Ctx = EventContext<Env, 'userId', unknown>;

async function staffOf(sb: Awaited<ReturnType<typeof requireOwner>>['sb'], storeId: string, userId: string) {
  const { data } = await sb.from('store_members').select('role').eq('store_id', storeId).eq('user_id', userId).maybeSingle();
  if (!data) throw new HttpError(404, 'Pessoa não encontrada nesta loja.');
  if (data.role === 'owner') throw new HttpError(403, 'O acesso do dono não pode ser alterado aqui.');
}

/** PATCH /api/team/:userId — muda nome e telas liberadas. */
export const onRequestPatch = handle<Ctx>(async ({ request, env, params }) => {
  const userId = idParam(params.userId);
  const b = await body(request, z.object({ storeId: z.string().uuid(), name: personName.optional(), perms: z.array(z.string()).max(20).optional() }));
  const { sb, user, store } = await requireOwner(request, env, b.storeId);
  await staffOf(sb, store.id, userId);
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.display_name = b.name;
  if (b.perms !== undefined) patch.perms = sanitizePerms(b.perms);
  const { error } = await sb.from('store_members').update(patch).eq('store_id', store.id).eq('user_id', userId);
  if (error) throw new HttpError(400, error.message);
  await audit(sb, { store_id: store.id, actor: user, action: 'team.update', details: { store_name: store.name, ...patch } });
  return json({ ok: true });
});

/** DELETE /api/team/:userId?store=<id> — remove da equipe. */
export const onRequestDelete = handle<Ctx>(async ({ request, env, params }) => {
  const userId = idParam(params.userId);
  const storeId = idParam(new URL(request.url).searchParams.get('store') ?? '');
  const { sb, user, store } = await requireOwner(request, env, storeId);
  await staffOf(sb, store.id, userId);
  const { error } = await sb.from('store_members').delete().eq('store_id', store.id).eq('user_id', userId);
  if (error) throw new HttpError(400, error.message);
  await deleteUserIfOrphan(sb, userId).catch(() => undefined);
  await audit(sb, { store_id: store.id, actor: user, action: 'team.delete', details: { store_name: store.name } });
  return json({ ok: true });
});
