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

/** Erro de rede/servidor (vale tentar de novo) — diferente de um "não" definitivo do banco. */
export function isNetworkError(err: unknown): boolean {
  const e = err as { message?: string; status?: number; statusCode?: string | number; code?: string };
  const status = Number(e?.status ?? e?.statusCode ?? 0);
  if (status >= 500 || status === 408 || status === 429) return true;
  if (e?.code && /^[0-9A-Z]{5}$/.test(e.code)) return false; // código do Postgres
  return /fetch|network|timeout|load failed|connection/i.test(e?.message ?? '') || (!status && !e?.code);
}

export function isLimitError(err: unknown): boolean {
  const e = err as { code?: string; hint?: string; message?: string };
  return e?.hint === 'product_limit' || /plano permite até/i.test(e?.message ?? '');
}

export function isCollection(k: string): k is Collection {
  return (COLLECTIONS as readonly string[]).includes(k);
}

export class RecordStore {
  private snap = new Map<Collection, Map<string, string>>();
  private uploaded = new WeakMap<Blob, string>();
  private publicPrefix: string;
  /** Avisos que não impedem a gravação (ex.: foto recusada). */
  onWarning?: (message: string) => void;

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

  /**
   * Grava a coleção: envia fotos novas, apaga o que saiu, atualiza o que mudou e
   * por último insere os itens novos. Cada etapa atualiza o "último estado salvo",
   * então, se algo falhar (ex.: limite de produtos), só a parte que falhou é reenviada.
   */
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
    const prev = new Map(this.snap.get(coll) ?? new Map<string, string>());
    const saved = this.snap.get(coll) ?? new Map<string, string>();
    this.snap.set(coll, saved);
    const next = new Map<string, string>();
    const updates: { id: string; data: Json; json: string }[] = [];
    const inserts: { id: string; data: Json; json: string; index: number }[] = [];
    items.forEach((it, index) => {
      if (next.has(it.id)) return; // id repetido: mantém o primeiro
      const json = JSON.stringify(it.data);
      next.set(it.id, json);
      if (!prev.has(it.id)) inserts.push({ ...it, json, index });
      else if (prev.get(it.id) !== json) updates.push({ ...it, json });
    });
    const removed = [...prev.keys()].filter((id) => !next.has(id));

    // 1) exclusões primeiro (libera espaço no limite do plano)
    for (let i = 0; i < removed.length; i += CHUNK) {
      const ids = removed.slice(i, i + CHUNK);
      const { error } = await this.client
        .from('store_records').delete()
        .eq('store_id', this.storeId).eq('coll', coll).in('id', ids);
      if (error) throw error;
      ids.forEach((id) => saved.delete(id));
    }
    // 2) alterações em itens que já existem
    for (let i = 0; i < updates.length; i += CHUNK) {
      const batch = updates.slice(i, i + CHUNK);
      await this.upsert(coll, batch);
      batch.forEach((b) => saved.set(b.id, b.json));
    }
    // 3) itens novos, na ordem certa de `seq` para a lista voltar igual ao recarregar
    inserts.sort((a, b) => (NEWEST_FIRST[coll] ? b.index - a.index : a.index - b.index));
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const batch = inserts.slice(i, i + CHUNK);
      await this.upsert(coll, batch);
      batch.forEach((b) => saved.set(b.id, b.json));
    }

    // Limpa fotos que não são mais usadas (melhor esforço).
    const before = new Set<string>();
    for (const id of [...removed, ...updates.map((u) => u.id)]) this.collectUrls(prev.get(id), before);
    const after = new Set<string>();
    for (const json of next.values()) this.collectUrls(json, after);
    const cut = this.publicPrefix.length - this.storeId.length - 1;
    const orphan = [...before].filter((u) => !after.has(u)).map((u) => u.slice(cut));
    if (orphan.length) void this.client.storage.from(BUCKET).remove(orphan).catch(() => undefined);
  }

  private async upsert(coll: Collection, rows: { id: string; data: Json }[]): Promise<void> {
    const { error } = await this.client.from('store_records').upsert(
      rows.map((r) => ({ store_id: this.storeId, coll, id: r.id, data: r.data, client_id: CLIENT_ID })),
      { onConflict: 'store_id,coll,id' },
    );
    if (!error) return;
    // Num lote com produto acima do limite, grava um por um para salvar o que couber.
    if (rows.length > 1 && isLimitError(error)) {
      let first: unknown = null;
      for (const r of rows) {
        try { await this.upsert(coll, [r]); } catch (e) { first ??= e; }
      }
      if (first) throw first;
      return;
    }
    throw error;
  }

  /** Cópia do valor com cada Blob (foto) trocado pela URL pública no Storage. */
  private async serialize(v: unknown): Promise<Json> {
    if (v instanceof Blob) return this.upload(v);
    if (Array.isArray(v)) {
      const out: Json[] = [];
      for (const x of v) {
        const s = await this.serialize(x);
        if (x instanceof Blob && s === '') continue; // foto recusada: fica fora da lista
        out.push(s);
      }
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
    if (done !== undefined) return done;
    const type = blob.type || 'image/webp';
    const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'webp';
    const path = `${this.storeId}/img/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.client.storage.from(BUCKET).upload(path, blob, {
      contentType: type, cacheControl: '31536000', upsert: false,
    });
    if (error) {
      if (isNetworkError(error)) throw error;
      // Foto recusada (grande demais / formato): salva o resto e avisa.
      const big = /size|large|exceed|payload/i.test(String((error as { message?: string }).message));
      this.onWarning?.(big
        ? 'Uma foto ficou grande demais e não foi salva. Tente uma imagem menor.'
        : 'Uma foto não foi aceita e não foi salva. Tente outra imagem (JPG ou PNG).');
      this.uploaded.set(blob, '');
      return '';
    }
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
