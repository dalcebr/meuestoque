import { z } from 'zod';
import type { Env } from '../../_lib/env';
import { body, handle, HttpError, json } from '../../_lib/http';
import { audit, createAuthUser, requireOwner } from '../../_lib/supabase';
import { email, idParam, password, personName } from '../../_lib/schemas';
import { sanitizePerms } from '../../../src/shared/perms';

type Ctx = EventContext<Env, string, unknown>;

/** GET /api/team?store=<id> — equipe da loja (somente o dono). */
export const onRequestGet = handle<Ctx>(async ({ request, env }) => {
  const storeId = idParam(new URL(request.url).searchParams.get('store') ?? '');
  const { sb, store } = await requireOwner(request, env, storeId);
  const { data, error } = await sb
    .from('member_overview')
    .select('*')
    .eq('store_id', storeId)
    .order('role', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new HttpError(500, error.message);
  return json({ members: data ?? [], max_users: store.max_users });
});

const AddMember = z.object({
  storeId: z.string().uuid(),
  name: personName,
  email,
  password,
  perms: z.array(z.string()).max(20),
});

/** POST /api/team — dono adiciona alguém à equipe (respeita o limite do plano). */
export const onRequestPost = handle<Ctx>(async ({ request, env }) => {
  const b = await body(request, AddMember);
  const { sb, user, store } = await requireOwner(request, env, b.storeId);
  const { count } = await sb.from('store_members').select('user_id', { count: 'exact', head: true }).eq('store_id', store.id);
  if ((count ?? 0) >= store.max_users) {
    throw new HttpError(403, `Seu plano permite ${store.max_users} usuário(s). Mude de plano para adicionar mais pessoas.`);
  }
  const member = await createAuthUser(sb, b.email, b.password, b.name);
  const { error } = await sb.from('store_members').insert({
    store_id: store.id, user_id: member.id, role: 'staff', perms: sanitizePerms(b.perms), display_name: b.name,
  });
  if (error) {
    await sb.auth.admin.deleteUser(member.id).catch(() => undefined);
    throw new HttpError(500, error.message);
  }
  await audit(sb, { store_id: store.id, actor: user, action: 'team.create', details: { store_name: store.name, pessoa: b.email } });
  return json({ ok: true, user_id: member.id }, 201);
});
