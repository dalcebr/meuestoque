import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { configured, env } from './env';

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!configured) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'estoque-auth' },
    });
  }
  return client;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Chama as Cloudflare Functions em /api com o token da sessão. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error || `Erro ${res.status}. Tente de novo.`;
    throw new ApiError(msg, res.status);
  }
  return json as T;
}

/** Converte erros do Supabase em mensagens em português. */
export function authMessage(err: unknown): string {
  const m = String((err as { message?: string })?.message ?? err ?? '');
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (/password should be at least|weak/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/same password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da atual.';
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m || 'Algo deu errado. Tente de novo.';
}
