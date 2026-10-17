/**
 * Camada de dados: guarda as coleções do sistema (produtos, vendas...) na tabela
 * `store_records`, um registro por item. Cada gravação envia só o que mudou,
 * então dois aparelhos podem trabalhar ao mesmo tempo sem sobrescrever a lista inteira.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const COLLECTIONS = ['products', 'moves', 'sales', 'customers', 'catalog', 'presets'] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** Coleções em que o item novo entra no começo da lista (unshift). */
const NEWEST_FIRST: Record<Collection, boolean> = {
  products: true, moves: true, sales: true, customers: true, catalog: false, presets: false,
};
const SINGLETON_ID = 'main';
const BUCKET = 'store-media';
const PAGE = 1000;
const CHUNK = 300;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
interface Row { id: string; data: Json; seq: number }

export const CLIENT_ID = crypto.randomUUID();

export function isCollection(k: string): k is Collection {
  return (COLLECTIONS as readonly string[]).includes(k);
}

export class RecordStore {
  private snap = new Map<Collection, Map<string, string>>();
  private uploaded = new WeakMap<Blob, string>();
  private publicPrefix: string;

  constructor(private client: SupabaseClient, private storeId: string) {
    this.publicPrefix = client.storage.from(BUCKET).getPublicUrl(`${storeId}/`).data.publicUrl;
  }

  /** Lê todas as coleções da loja (com paginação). */
  async loadAll(): Promise<Record<Collection, unknown>> {
    const out = {} as Record<Collection, unknown>;
    const rows = new Map<Collection, Row[]>();
    for (const c of COLLECTIONS) rows.set(c, []);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from('store_records')
        .select('coll, id, data, seq')
        .eq('store_id', this.storeId)
        .order('seq', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of data ?? []) rows.get(r.coll as Collection)?.push(r as Row);
      if (!data || data.length < PAGE) break;
    }
    for (const c of COLLECTIONS) {
      const list = rows.get(c)!;
      if (NEWEST_FIRST[c]) list.reverse();
      this.snap.set(c, new Map(list.map((r) => [r.id, JSON.stringify(r.data)])));
      if (c === 'catalog') out[c] = list.find((r) => r.id === SINGLETON_ID)?.data ?? null;
      else out[c] = list.length ? list.map((r) => r.data) : null;
    }
    return out;
  }

  /** Grava a coleção: envia fotos novas, insere/atualiza o que mudou e apaga o que saiu. */
  async save(coll: Collection, value: unknown): Promise<void> {
    const items: { id: string; data: Json }[] = [];
    if (coll === 'catalog') {
      if (value && typeof value === 'object') items.push({ id: SINGLETON_ID, data: await this.serialize(value) });
    } else if (Array.isArray(value)) {
      for (const it of value) {
        const id = it && typeof it === 'object' && 'id' in it ? String((it as { id: unknown }).id) : '';
        if (!id) continue;
        items.push({ id, data: await this.serialize(it) });
      }
    }
    const prev = this.snap.get(coll) ?? new Map<string, string>();
    const next = new Map<string, string>();
    const changed: { id: string; data: Json; index: number }[] = [];
    items.forEach((it, index) => {
      if (next.has(it.id)) return; // id repetido: mantém o primeiro
      const s = JSON.stringify(it.data);
      next.set(it.id, s);
      if (prev.get(it.id) !== s) changed.push({ ...it, index });
    });
    const removed = [...prev.keys()].filter((id) => !next.has(id));

    // Itens novos recebem `seq` na ordem certa para a lista voltar igual ao recarregar.
    const isNew = (id: string) => !prev.has(id);
    changed.sort((a, b) => {
      const an = isNew(a.id), bn = isNew(b.id);
      if (an !== bn) return an ? 1 : -1;
      return NEWEST_FIRST[coll] ? b.index - a.index : a.index - b.index;
    });

    for (let i = 0; i < changed.length; i += CHUNK) {
      const batch = changed.slice(i, i + CHUNK).map((c) => ({
        store_id: this.storeId, coll, id: c.id, data: c.data, client_id: CLIENT_ID,
      }));
      const { error } = await this.client.from('store_records').upsert(batch, { onConflict: 'store_id,coll,id' });
      if (error) throw error;
    }
    for (let i = 0; i < removed.length; i += CHUNK) {
      const { error } = await this.client
        .from('store_records')
        .delete()
        .eq('store_id', this.storeId)
        .eq('coll', coll)
        .in('id', removed.slice(i, i + CHUNK));
      if (error) throw error;
    }

    // Limpa fotos que não são mais usadas (melhor esforço).
    const before = new Set<string>();
    for (const id of [...removed, ...changed.map((c) => c.id)]) this.collectUrls(prev.get(id), before);
    const after = new Set<string>();
    for (const s of next.values()) this.collectUrls(s, after);
    const orphan = [...before].filter((u) => !after.has(u)).map((u) => u.slice(this.publicPrefix.length - this.storeId.length - 1));
    this.snap.set(coll, next);
    if (orphan.length) void this.client.storage.from(BUCKET).remove(orphan).catch(() => undefined);
  }

  /** Cópia do valor com cada Blob (foto) trocado pela URL pública no Storage. */
  private async serialize(v: unknown): Promise<Json> {
    if (v instanceof Blob) return this.upload(v);
    if (Array.isArray(v)) {
      const out: Json[] = [];
      for (const x of v) out.push(await this.serialize(x));
      return out;
    }
    if (v && typeof v === 'object') {
      const out: { [k: string]: Json } = {};
      for (const [k, x] of Object.entries(v)) {
        if (x === undefined || typeof x === 'function') continue;
        out[k] = await this.serialize(x);
      }
      return out;
    }
    if (typeof v === 'number' && !Number.isFinite(v)) return null;
    return (v ?? null) as Json;
  }

  private async upload(blob: Blob): Promise<string> {
    const done = this.uploaded.get(blob);
    if (done) return done;
    const type = blob.type || 'image/webp';
    const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'webp';
    const path = `${this.storeId}/img/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.client.storage.from(BUCKET).upload(path, blob, {
      contentType: type, cacheControl: '31536000', upsert: false,
    });
    if (error) throw error;
    const url = this.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    this.uploaded.set(blob, url);
    return url;
  }

  private collectUrls(json: string | undefined, into: Set<string>): void {
    if (!json || !json.includes(this.publicPrefix)) return;
    const re = /"(https?:\/\/[^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(json))) if (m[1].startsWith(this.publicPrefix)) into.add(m[1]);
  }

  /** Exporta tudo como JSON (backup / LGPD). */
  async exportAll(): Promise<Record<string, unknown>> {
    const data = await this.loadAll();
    return { format: 'estoque-da-loja/v1', exported_at: new Date().toISOString(), data };
  }
}
