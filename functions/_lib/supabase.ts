import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Env } from './env';
import { HttpError } from './http';

export function adminClient(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(500, 'Servidor sem SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY configurados.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function requireUser(request: Request, sb: SupabaseClient): Promise<User> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new HttpError(401, 'Faça login novamente.');
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
  return data.user;
}

export async function requirePlatformAdmin(request: Request, env: Env): Promise<{ sb: SupabaseClient; user: User }> {
  const sb = adminClient(env);
  const user = await requireUser(request, sb);
  const { data } = await sb.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!data) throw new HttpError(403, 'Somente administradores da plataforma.');
  return { sb, user };
}

/** Confere se quem chama é dono de uma loja liberada. */
export async function requireOwner(request: Request, env: Env, storeId: string) {
  const sb = adminClient(env);
  const user = await requireUser(request, sb);
  const { data: m } = await sb
    .from('store_members')
    .select('role, store:stores(id, name, slug, status, expires_at, max_users)')
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .maybeSingle();
  const store = (Array.isArray(m?.store) ? m?.store[0] : m?.store) as
    | { id: string; name: string; slug: string; status: string; expires_at: string | null; max_users: number }
    | undefined;
  if (!m || m.role !== 'owner' || !store) throw new HttpError(403, 'Somente o dono da loja pode gerenciar a equipe.');
  if (store.status !== 'active' || (store.expires_at && new Date(store.expires_at) <= new Date())) {
    throw new HttpError(403, 'O acesso da loja está pausado. Renove para gerenciar a equipe.');
  }
  return { sb, user, store };
}

/** Confere se quem chama é membro de uma loja liberada e dentro da validade (mesma regra do RLS). */
export async function requireActiveMember(request: Request, env: Env, storeId: string) {
  const sb = adminClient(env);
  const user = await requireUser(request, sb);
  const { data: m } = await sb
    .from('store_members')
    .select('role, store:stores(id, status, expires_at)')
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .maybeSingle();
  const store = (Array.isArray(m?.store) ? m?.store[0] : m?.store) as
    | { id: string; status: string; expires_at: string | null }
    | undefined;
  if (!m || !store) throw new HttpError(403, 'Você não faz parte desta loja.');
  if (store.status !== 'active' || (store.expires_at && new Date(store.expires_at) <= new Date())) {
    throw new HttpError(403, 'O acesso da loja está pausado.');
  }
  return { sb, user };
}

export async function audit(
  sb: SupabaseClient,
  entry: { store_id?: string | null; actor?: User | null; action: string; details?: Record<string, unknown> },
): Promise<void> {
  await sb.from('audit_log').insert({
    store_id: entry.store_id ?? null,
    actor_id: entry.actor?.id ?? null,
    actor_email: entry.actor?.email ?? null,
    action: entry.action,
    details: entry.details ?? {},
  });
}

/** Cria um usuário já confirmado e marcado para trocar a senha no primeiro acesso. */
export async function createAuthUser(sb: SupabaseClient, email: string, password: string, name: string): Promise<User> {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, must_change_password: true },
  });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? '')) throw new HttpError(409, 'Já existe um usuário com esse e-mail.');
    if (/password/i.test(error?.message ?? '')) throw new HttpError(400, 'Senha fraca: use pelo menos 8 caracteres.');
    throw new HttpError(400, error?.message || 'Não foi possível criar o usuário.');
  }
  return data.user;
}

export async function setPassword(sb: SupabaseClient, userId: string, password: string): Promise<void> {
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const { error } = await sb.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { ...(u.user?.user_metadata ?? {}), must_change_password: true },
  });
  if (error) throw new HttpError(400, error.message);
}

/** Apaga o usuário de autenticação se ele não pertencer a mais nenhuma loja nem for admin. */
export async function deleteUserIfOrphan(sb: SupabaseClient, userId: string): Promise<void> {
  const [{ count }, { data: admin }] = await Promise.all([
    sb.from('store_members').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    sb.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
  ]);
  if (!count && !admin) await sb.auth.admin.deleteUser(userId);
}
