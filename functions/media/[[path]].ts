import type { Env } from '../_lib/env';
import { isMediaKey } from '../_lib/media';

/**
 * GET /media/<store_id>/img/<arquivo> — entrega a foto do R2 (pública, como o catálogo).
 * Se você configurar um domínio público no bucket (MEDIA_PUBLIC_URL), as fotos novas
 * saem direto de lá e esta rota fica só para compatibilidade.
 */
export const onRequest: PagesFunction<Env, 'path'> = async ({ request, env, params }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Método não permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!isMediaKey(key) || !env.MEDIA) return notFound();

  const obj = await env.MEDIA.get(key, { onlyIf: request.headers });
  if (!obj) return notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  // O editor de fotos abre imagens com crossOrigin="anonymous"
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Content-Type-Options', 'nosniff');

  if (!('body' in obj)) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : obj.body, { status: 200, headers });
};

function notFound(): Response {
  return new Response('Não encontrado', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
