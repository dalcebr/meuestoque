#!/usr/bin/env node
/**
 * Migra as fotos do Supabase Storage (bucket "store-media") para o Cloudflare R2
 * e troca os endereços dentro dos registros (store_records).
 *
 * Pode rodar quantas vezes quiser: o que já foi migrado é pulado.
 *
 * Uso:
 *   node --env-file=.migracao.env scripts/migrar-fotos-r2.mjs            # simula (não grava nada)
 *   node --env-file=.migracao.env scripts/migrar-fotos-r2.mjs --aplicar  # migra de verdade
 *
 * Variáveis (veja .migracao.env.example):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   MEDIA_BASE_URL  → https://seudominio.com.br/media  (ou o MEDIA_PUBLIC_URL, se usar domínio no bucket)
 */
import { createClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';

const APPLY = process.argv.includes('--aplicar');
const need = (k) => {
  const v = (process.env[k] || '').trim();
  if (!v) { console.error(`Falta a variável ${k}.`); process.exit(1); }
  return v;
};

const SUPABASE_URL = need('SUPABASE_URL').replace(/\/+$/, '');
const sb = createClient(SUPABASE_URL, need('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ACCOUNT = need('R2_ACCOUNT_ID');
const BUCKET = (process.env.R2_BUCKET || 'estoque-fotos').trim();
const r2 = new AwsClient({ accessKeyId: need('R2_ACCESS_KEY_ID'), secretAccessKey: need('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });
const R2_ENDPOINT = `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}`;
const MEDIA_BASE = need('MEDIA_BASE_URL').replace(/\/+$/, '');

const LEGACY = `${SUPABASE_URL}/storage/v1/object/public/store-media/`;
const URL_RE = /"(https?:\/\/[^"]+\/storage\/v1\/object\/public\/store-media\/([0-9a-f-]{36}\/img\/[0-9a-f-]{36}\.(?:webp|png|jpg)))"/g;
const TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };
const PAGE = 500;
const PARALLEL = 6;

const stats = { registros: 0, alterados: 0, fotos: 0, copiadas: 0, jaNoR2: 0, faltando: 0, erros: 0 };
const copied = new Map(); // key -> true (ok) | false (faltando)

async function existsInR2(key) {
  const res = await r2.fetch(`${R2_ENDPOINT}/${key}`, { method: 'HEAD' });
  return res.ok;
}

async function copy(key, srcUrl) {
  if (copied.has(key)) return copied.get(key);
  stats.fotos++;
  let ok = false;
  try {
    if (await existsInR2(key)) {
      stats.jaNoR2++;
      ok = true;
    } else {
      const src = await fetch(srcUrl.startsWith('http') ? srcUrl : LEGACY + key);
      if (src.status === 404 || src.status === 400) {
        stats.faltando++;
        console.warn(`  ! foto não encontrada no Storage: ${key}`);
      } else if (!src.ok) {
        throw new Error(`download ${src.status}`);
      } else if (APPLY) {
        const body = new Uint8Array(await src.arrayBuffer());
        const ext = key.split('.').pop();
        const put = await r2.fetch(`${R2_ENDPOINT}/${key}`, {
          method: 'PUT',
          body,
          headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
        });
        if (!put.ok) throw new Error(`upload R2 ${put.status}: ${await put.text()}`);
        stats.copiadas++;
        ok = true;
      } else {
        stats.copiadas++;
        ok = true;
      }
    }
  } catch (err) {
    stats.erros++;
    console.error(`  x erro em ${key}: ${err.message}`);
    copied.delete(key);
    return false; // tenta de novo numa próxima execução
  }
  copied.set(key, ok);
  return ok;
}

async function pool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function main() {
  console.log(APPLY ? '>> MIGRANDO (gravando no R2 e no banco)' : '>> SIMULAÇÃO (nada será gravado). Use --aplicar para migrar.');
  console.log(`   R2: ${BUCKET} · novas URLs: ${MEDIA_BASE}/<loja>/img/...\n`);

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('store_records')
      .select('store_id, coll, id, data')
      .order('store_id').order('coll').order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      stats.registros++;
      const json = JSON.stringify(row.data);
      const found = [...json.matchAll(URL_RE)].map((m) => ({ url: m[1], key: m[2] }))
        .filter((f) => f.key.startsWith(`${row.store_id}/`));
      if (!found.length) continue;

      const unique = [...new Map(found.map((f) => [f.key, f])).values()];
      await pool(unique, (f) => copy(f.key, f.url));

      let next = json;
      for (const f of unique) {
        if (copied.get(f.key) !== true) continue; // mantém a URL antiga se não deu para copiar
        next = next.split(`"${f.url}"`).join(`"${MEDIA_BASE}/${f.key}"`);
      }
      if (next === json) continue;
      stats.alterados++;
      console.log(`  ${row.coll}/${row.id} (loja ${row.store_id.slice(0, 8)}): ${unique.length} foto(s)`);
      if (APPLY) {
        const { error: upErr } = await sb.from('store_records')
          .update({ data: JSON.parse(next) })
          .eq('store_id', row.store_id).eq('coll', row.coll).eq('id', row.id);
        if (upErr) { stats.erros++; console.error(`  x erro ao gravar ${row.coll}/${row.id}: ${upErr.message}`); }
      }
    }
    if (data.length < PAGE) break;
  }

  console.log('\nResumo:', stats);
  if (!APPLY) console.log('Nada foi gravado. Rode de novo com --aplicar.');
  else if (stats.erros) console.log('Houve erros. Rode de novo: o que já foi migrado é pulado.');
  else console.log('Pronto. Confira o sistema e o catálogo antes de apagar o bucket antigo no Supabase.');
}

main().catch((err) => { console.error(err); process.exit(1); });
