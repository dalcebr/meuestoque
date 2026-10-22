import type { Env } from '../_lib/env';
import { adminClient } from '../_lib/supabase';

/**
 * GET /c/<loja> — catálogo público.
 * Entrega a mesma página do sistema (que entra no "modo catálogo" pelo endereço)
 * e preenche título, descrição e imagem para a prévia do link no WhatsApp/Instagram.
 */
interface PublicCatalog {
  store: { name: string; slug: string };
  catalog: { store?: string; title?: string; desc?: string; heroImg?: unknown } | null;
  products: { imgs?: unknown[] }[];
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const onRequestGet: PagesFunction<Env, 'slug'> = async ({ request, env, params }) => {
  const slug = String(Array.isArray(params.slug) ? params.slug[0] : params.slug).toLowerCase();
  const page = await env.ASSETS.fetch(new URL('/app/', request.url));
  if (!SLUG.test(slug)) return withStatus(page, 404);

  let data: PublicCatalog | null = null;
  try {
    const { data: d } = await adminClient(env).rpc('public_catalog', { p_slug: slug });
    data = (d as PublicCatalog | null) ?? null;
  } catch {
    data = null;
  }
  if (!data) return withStatus(page, 404);

  const name = data.catalog?.store?.trim() || data.store.name;
  const title = data.catalog?.title?.trim() ? `${name} · ${data.catalog.title.trim()}` : `${name} · Catálogo`;
  const desc = (data.catalog?.desc?.trim() || `Veja os produtos de ${name} e faça seu pedido pelo WhatsApp.`).slice(0, 200);
  const hero = typeof data.catalog?.heroImg === 'string' ? data.catalog.heroImg : '';
  const firstImg = data.products.find((p) => typeof p.imgs?.[0] === 'string')?.imgs?.[0] as string | undefined;
  const image = hero || firstImg || '';
  const url = new URL(`/c/${data.store.slug}`, request.url).toString();

  const meta = [
    `<meta name="description" content="${attr(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(desc)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    image ? `<meta property="og:image" content="${attr(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<link rel="canonical" href="${attr(url)}">`,
  ].join('');

  const res = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('head', { element(el) { el.append(meta, { html: true }); } })
    .transform(page);

  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'public, max-age=0, s-maxage=60');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(res.body, { status: 200, headers });
};

function withStatus(res: Response, status: number): Response {
  const headers = new Headers(res.headers);
  headers.set('X-Robots-Tag', 'noindex');
  headers.set('Cache-Control', 'no-store');
  return new Response(res.body, { status, headers });
}

function attr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
