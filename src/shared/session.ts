import type { Session, User } from '@supabase/supabase-js';
import { sb } from './supabase';
import type { Membership, Store } from './types';
import { sanitizePerms } from './perms';

const STORE_KEY = 'saas_store';

export interface Context {
  session: Session;
  user: User;
  memberships: Membership[];
  current: Membership | null;
  isPlatformAdmin: boolean;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await sb().auth.getSession();
  return data.session;
}

export function loginUrl(next = location.pathname + location.search + location.hash): string {
  return `/?next=${encodeURIComponent(next)}`;
}

/** Carrega o usuário logado, as lojas a que ele tem acesso e se é administrador da plataforma. */
export async function loadContext(): Promise<Context | null> {
  const session = await getSession();
  if (!session) return null;
  const client = sb();
  const [mRes, aRes] = await Promise.all([
    client
      .from('store_members')
      .select('store_id, role, perms, display_name, store:stores(*)')
      .eq('user_id', session.user.id),
    client.from('platform_admins').select('user_id').eq('user_id', session.user.id).maybeSingle(),
  ]);
  if (mRes.error) throw mRes.error;
  const memberships: Membership[] = (mRes.data ?? [])
    .filter((m) => m.store)
    .map((m) => ({
      store_id: m.store_id as string,
      role: m.role as Membership['role'],
      perms: m.role === 'owner' ? sanitizePerms(['home', 'products', 'stock', 'sales', 'clients', 'reports', 'catalog']) : sanitizePerms(m.perms),
      display_name: (m.display_name as string) || '',
      store: (Array.isArray(m.store) ? m.store[0] : m.store) as Store,
    }));
  let saved: string | null = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch { /* sem storage */ }
  const current = memberships.find((m) => m.store_id === saved) ?? memberships[0] ?? null;
  return { session, user: session.user, memberships, current, isPlatformAdmin: !aRes.error && Boolean(aRes.data) };
}

export function rememberStore(id: string): void {
  try { localStorage.setItem(STORE_KEY, id); } catch { /* sem storage */ }
}

export function mustChangePassword(user: User): boolean {
  return Boolean(user.user_metadata?.must_change_password);
}

export function displayName(ctx: Context): string {
  return ctx.current?.display_name || (ctx.user.user_metadata?.name as string) || (ctx.user.email ?? '').split('@')[0];
}

export async function signOut(to = '/'): Promise<void> {
  try { await sb().auth.signOut(); } catch { /* sessão já expirada */ }
  location.replace(to);
}
