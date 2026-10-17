import { z } from 'zod';
import type { Env } from '../../_lib/env';
import { body, handle, HttpError, json, safeEqual } from '../../_lib/http';
import { adminClient, audit } from '../../_lib/supabase';
import { email, slug } from '../../_lib/schemas';

/**
 * POST /api/webhooks/renovar
 * Renova uma loja automaticamente — ligue no seu gateway de pagamento
 * (Mercado Pago, Asaas, Stripe...) direto ou por uma automação (n8n, Make, Zapier).
 *
 * Header:  Authorization: Bearer <WEBHOOK_SECRET>
 * Corpo:   { "slug": "minha-loja", "days": 30, "plan": "profissional", "maxUsers": 3 }
 *          (ou "email" do dono no lugar de "slug")
 */
const Renew = z
  .object({
    slug: slug.optional(),
    email: email.optional(),
    days: z.number().int().min(1).max(3660),
    plan: z.string().trim().min(1).max(40).optional(),
    maxUsers: z.number().int().min(1).max(100).optional(),
    unblock: z.boolean().optional().default(true),
  })
  .refine((v) => v.slug || v.email, { message: 'Informe "slug" ou "email".' });

export const onRequestPost = handle<EventContext<Env, string, unknown>>(async ({ request, env }) => {
  const secret = env.WEBHOOK_SECRET ?? '';
  const auth = request.headers.get('Authorization') ?? '';
  if (secret.length < 24 || !safeEqual(auth, `Bearer ${secret}`)) throw new HttpError(401, 'Não autorizado.');

  const b = await body(request, Renew);
  const sb = adminClient(env);
  let q = sb.from('admin_store_overview').select('id, name, slug, expires_at');
  q = b.slug ? q.eq('slug', b.slug) : q.eq('owner_email', b.email!);
  const { data: rows, error } = await q.limit(2);
  if (error) throw new HttpError(500, error.message);
  if (!rows?.length) throw new HttpError(404, 'Loja não encontrada.');
  if (rows.length > 1) throw new HttpError(409, 'Mais de uma loja com esse e-mail. Use "slug".');
  const store = rows[0];

  const base = Math.max(Date.now(), store.expires_at ? new Date(store.expires_at).getTime() : 0);
  const exp = new Date(base + b.days * 86_400_000);
  exp.setUTCHours(23, 59, 59, 0);
  const patch: Record<string, unknown> = { expires_at: exp.toISOString() };
  if (b.unblock) patch.status = 'active';
  if (b.plan) patch.plan = b.plan;
  if (b.maxUsers) patch.max_users = b.maxUsers;
  const { error: uErr } = await sb.from('stores').update(patch).eq('id', store.id);
  if (uErr) throw new HttpError(500, uErr.message);
  await audit(sb, { store_id: store.id, action: 'store.renew_webhook', details: { store_name: store.name, dias: b.days, validade: patch.expires_at } });
  return json({ ok: true, slug: store.slug, expires_at: patch.expires_at });
});
