import { z } from 'zod';
import type { Env } from '../../../../_lib/env';
import { body, handle, HttpError, json } from '../../../../_lib/http';
import { audit, requirePlatformAdmin, setPassword } from '../../../../_lib/supabase';
import { idParam, password } from '../../../../_lib/schemas';

type Ctx = EventContext<Env, 'id', unknown>;

/** POST /api/admin/stores/:id/reset-password — define senha provisória para o dono. */
export const onRequestPost = handle<Ctx>(async ({ request, env, params }) => {
  const { sb, user } = await requirePlatformAdmin(request, env);
  const id = idParam(params.id);
  const b = await body(request, z.object({ password }));
  const { data: store } = await sb.from('stores').select('id, name, owner_id').eq('id', id).maybeSingle();
  if (!store?.owner_id) throw new HttpError(404, 'Loja sem dono cadastrado.');
  await setPassword(sb, store.owner_id, b.password);
  await audit(sb, { store_id: id, actor: user, action: 'store.reset_password', details: { store_name: store.name } });
  return json({ ok: true });
});
