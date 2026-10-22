import { z } from 'zod';
import type { Env } from '../../_lib/env';
import { body, handle, HttpError, json } from '../../_lib/http';
import { isMediaKey, MEDIA_MAX_BYTES, MEDIA_TYPES, mediaBucket, mediaUrl } from '../../_lib/media';
import { idParam } from '../../_lib/schemas';
import { requireActiveMember } from '../../_lib/supabase';

type Ctx = EventContext<Env, 'storeId', unknown>;

/**
 * PUT /api/media/:storeId — envia uma foto (corpo = a imagem, Content-Type = image/webp|png|jpeg).
 * Responde { key, url }. Só membros de loja liberada (mesma regra do RLS no Postgres).
 */
export const onRequestPut = handle<Ctx>(async ({ request, env, params }) => {
  const storeId = idParam(params.storeId);
  await requireActiveMember(request, env, storeId);

  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = MEDIA_TYPES[type];
  if (!ext) throw new HttpError(415, 'Formato de imagem não aceito. Use JPG, PNG ou WebP.');
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MEDIA_MAX_BYTES) throw new HttpError(413, 'Foto grande demais (máximo 10 MB).');

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw new HttpError(400, 'Foto vazia.');
  if (bytes.byteLength > MEDIA_MAX_BYTES) throw new HttpError(413, 'Foto grande demais (máximo 10 MB).');
  if (!matchesType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)), ext)) {
    throw new HttpError(415, 'O arquivo não é uma imagem válida.');
  }

  const key = `${storeId}/img/${crypto.randomUUID()}.${ext}`;
  await mediaBucket(env).put(key, bytes, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
  });
  return json({ key, url: mediaUrl(env, request, key) }, 201);
});

const DeleteBody = z.object({ keys: z.array(z.string().max(200)).min(1).max(1000) });

/** DELETE /api/media/:storeId — apaga fotos que saíram de uso. Corpo: { keys: [...] } */
export const onRequestDelete = handle<Ctx>(async ({ request, env, params }) => {
  const storeId = idParam(params.storeId);
  await requireActiveMember(request, env, storeId);
  const { keys } = await body(request, DeleteBody);
  const own = [...new Set(keys)].filter((k) => isMediaKey(k, storeId));
  if (own.length) await mediaBucket(env).delete(own);
  return json({ deleted: own.length });
});

/** Confere os primeiros bytes (assinatura do arquivo). */
function matchesType(b: Uint8Array, ext: string): boolean {
  if (ext === 'png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ext === 'jpg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  // WebP: "RIFF" .... "WEBP"
  return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}
