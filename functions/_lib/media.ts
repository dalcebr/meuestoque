import type { Env } from './env';
import { HttpError } from './http';

/** Formatos aceitos (as fotos saem do editor em WebP; iPhone sem WebP manda PNG). */
export const MEDIA_TYPES: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

/** Chave de uma foto: <store_id>/img/<uuid>.<ext> */
const KEY = /^[0-9a-f-]{36}\/img\/[0-9a-f-]{36}\.(?:webp|png|jpg)$/;

export function isMediaKey(key: string, storeId?: string): boolean {
  return KEY.test(key) && (!storeId || key.startsWith(`${storeId}/img/`));
}

export function mediaBucket(env: Env): R2Bucket {
  if (!env.MEDIA) throw new HttpError(500, 'Servidor sem o bucket R2 (binding MEDIA) configurado.');
  return env.MEDIA;
}

/** Endereço público de uma foto. */
export function mediaUrl(env: Env, request: Request, key: string): string {
  const base = (env.MEDIA_PUBLIC_URL || '').trim().replace(/\/+$/, '') || new URL('/media', request.url).origin + '/media';
  return `${base}/${key}`;
}

/** Apaga todas as fotos com o prefixo (ex.: "<store_id>/"). */
export async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map((o) => o.key);
    if (keys.length) await bucket.delete(keys);
    total += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}
