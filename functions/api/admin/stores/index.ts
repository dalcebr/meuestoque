import { z } from 'zod';
import type { Env } from '../../../_lib/env';
import { body, handle, HttpError, json } from '../../../_lib/http';
import { audit, createAuthUser, requirePlatformAdmin } from '../../../_lib/supabase';
import { email, isoDate, password, personName, slug } from '../../../_lib/schemas';
import { ALL_MODULES } from '../../../../src/shared/perms';

type Ctx = EventContext<Env, string, unknown>;

/** GET /api/admin/stores — lista todas as lojas com dados do dono e uso. */
export const onRequestGet = handle<Ctx>(async ({ request, env }) => {
  const { sb } = await requirePlatformAdmin(request, env);
  const { data, error } = await sb.from('admin_store_overview').select('*').order('created_at', { ascending: false });
  if (error) throw new HttpError(500, error.message);
  return json({ stores: data ?? [] });
});

const CreateStore = z.object({
  name: z.string().trim().min(1, 'Informe o nome da loja.').max(120),
  slug,
  ownerName: personName,
  ownerEmail: email,
  password,
  plan: z.string().trim().min(1).max(40),
  maxUsers: z.number().int().min(1).max(100),
  expiresAt: isoDate.nullable(),
  contactName: z.string().trim().max(80).nullable().optional(),
  contactPhone: z.string().trim().max(20).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** POST /api/admin/stores — cria a loja e o usuário do dono. */
export const onRequestPost = handle<Ctx>(async ({ request, env }) => {
  const { sb, user } = await requirePlatformAdmin(request, env);
  const b = await body(request, CreateStore);

  const { data: taken } = await sb.from('stores').select('id').eq('slug', b.slug).maybeSingle();
  if (taken) throw new HttpError(409, 'Esse endereço de catálogo já está em uso.');

  const owner = await createAuthUser(sb, b.ownerEmail, b.password, b.ownerName);
  try {
    const { data: store, error } = await sb
      .from('stores')
      .insert({
        name: b.name,
        slug: b.slug,
        plan: b.plan,
        max_users: b.maxUsers,
        expires_at: b.expiresAt,
        owner_id: owner.id,
        contact_name: b.contactName ?? b.ownerName,
        contact_phone: b.contactPhone ?? null,
        notes: b.notes ?? null,
      })
      .select('*')
      .single();
    if (error || !store) throw new HttpError(400, error?.code === '23505' ? 'Esse endereço já está em uso.' : error?.message || 'Erro ao criar a loja.');

    const { error: mErr } = await sb.from('store_members').insert({
      store_id: store.id, user_id: owner.id, role: 'owner', perms: ALL_MODULES, display_name: b.ownerName,
    });
    if (mErr) {
      await sb.from('stores').delete().eq('id', store.id);
      throw new HttpError(500, mErr.message);
    }
    // Catálogo já nasce com o nome da loja
    await sb.from('store_records').insert({
      store_id: store.id, coll: 'catalog', id: 'main', data: { store: b.name }, client_id: 'server',
    });
    await audit(sb, { store_id: store.id, actor: user, action: 'store.create', details: { store_name: b.name, slug: b.slug, plano: b.plan, dono: b.ownerEmail, validade: b.expiresAt } });
    return json({ store }, 201);
  } catch (err) {
    await sb.auth.admin.deleteUser(owner.id).catch(() => undefined);
    throw err;
  }
});
