import { z } from 'zod';
import type { Env } from '../../../_lib/env';
import { body, handle, HttpError, json } from '../../../_lib/http';
import { audit, requireOwner, setPassword } from '../../../_lib/supabase';
import { idParam, password } from '../../../_lib/schemas';

type Ctx = EventContext<Env, 'userId', unknown>;

/** POST /api/team/:userId/reset-password — dono gera senha provisória para alguém da equipe. */
export const onRequestPost = handle<Ctx>(async ({ request, env, params }) => {
  const userId = idParam(params.userId);
  const b = await body(request, z.object({ storeId: z.string().uuid(), password }));
  const { sb, user, store } = await requireOwner(request, env, b.storeId);
  const { data } = await sb.from('store_members').select('role').eq('store_id', store.id).eq('user_id', userId).maybeSingle();
  if (!data) throw new HttpError(404, 'Pessoa não encontrada nesta loja.');
  if (data.role === 'owner') throw new HttpError(403, 'Para trocar a sua senha, use a área "Trocar senha".');
  await setPassword(sb, userId, b.password);
  await audit(sb, { store_id: store.id, actor: user, action: 'team.reset_password', details: { store_name: store.name } });
  return json({ ok: true });
});
