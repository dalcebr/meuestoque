/**
 * Ponte entre a interface original (public/legacy/estoque.js) e a nuvem.
 *
 * A interface chama window.SaaS.ready(), kvGet(k) e kvSet(k, v) — as mesmas
 * assinaturas do IndexedDB que ela usava. Aqui elas passam a:
 *  - exigir login e loja liberada (assinatura em dia);
 *  - ler/gravar no Supabase (tabela store_records + Storage para fotos);
 *  - no catálogo público (/c/<loja>), ler os dados sem login e sem custos.
 */
import { sb } from '../shared/supabase';
import { configured, env } from '../shared/env';
import { loadContext, loginUrl, mustChangePassword, displayName, signOut, type Context } from '../shared/session';
import { accessState, daysLeft } from '../shared/types';
import type { ModuleId } from '../shared/perms';
import { CLIENT_ID, RecordStore, isCollection, isLimitError, isNetworkError, type Collection } from './records';

interface SaaSBridge {
  ready(): Promise<void>;
  kvGet(k: string): Promise<unknown>;
  kvSet(k: string, v: unknown): Promise<void>;
  catalogUrl(): string;
  userName(): string;
  setDisplayName(name: string): void;
  signOut(): void;
  /** Mensagem de bloqueio se o plano não permite mais um produto; '' se pode. */
  productLimitMessage(currentCount: number): string;
}

declare global {
  interface Window {
    SaaS: SaaSBridge;
    show?: (v: string) => void;
    toast?: (m: string) => void;
  }
}

/** Aviso usando o toast da interface original (ou alert, se ainda não carregou). */
function notify(message: string): void {
  if (typeof window.toast === 'function') window.toast(message);
  else console.warn(message);
}

const CATALOG = /^\/c\//.test(location.pathname) || /[?&]catalogo(=|&|$)/.test(location.search);
const PUBLIC_SLUG = (/^\/c\/([^/?#]+)/.exec(location.pathname)?.[1] ?? '').toLowerCase();

let ctx: Context | null = null;
let store: RecordStore | null = null;
let cache: Record<string, unknown> = {};
let slug = PUBLIC_SLUG;

const domReady = new Promise<void>((r) => {
  if (document.readyState !== 'loading') r();
  else document.addEventListener('DOMContentLoaded', () => r(), { once: true });
});

/* ------------------------------------------------------------------ */
/* Tela de carregamento / avisos                                       */
/* ------------------------------------------------------------------ */
const css = `
#saasBoot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:var(--bg,#F3F4F9);color:var(--muted,#646B7D);font:500 15px/1.4 "Plus Jakarta Sans",system-ui,sans-serif;transition:opacity .25s}
#saasBoot i{display:block;width:34px;height:34px;margin:0 auto 14px;border:3px solid color-mix(in srgb,var(--accent,#4F46E5) 25%,transparent);border-top-color:var(--accent,#4F46E5);border-radius:50%;animation:saasSpin .8s linear infinite}
#saasBoot.off{opacity:0;pointer-events:none}
@keyframes saasSpin{to{transform:rotate(360deg)}}
#saasSync{position:fixed;left:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:2147482000;background:var(--surface,#fff);color:var(--ink,#12141D);border:1px solid var(--line,#E4E7EF);border-radius:999px;padding:7px 14px;font:600 13px/1.3 "Plus Jakarta Sans",system-ui,sans-serif;box-shadow:0 8px 24px -12px rgba(0,0,0,.3);display:none}
#saasSync[data-s="saving"],#saasSync[data-s="error"]{display:block}
#saasSync[data-s="error"]{background:var(--bad,#D92D20);color:#fff;border-color:transparent}
.saasBar{position:sticky;top:0;z-index:6;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 16px;font:600 14px/1.35 "Plus Jakarta Sans",system-ui,sans-serif;background:var(--soft,#EEF);color:var(--ink,#12141D);text-align:center}
.saasBar.warn{background:color-mix(in srgb,#F79009 18%,var(--surface,#fff))}
.saasBar button,.saasBar a{border:0;border-radius:10px;padding:6px 12px;font:inherit;background:var(--accent,#4F46E5);color:var(--accent-ink,#fff);cursor:pointer;text-decoration:none}
.saasGone{min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center;font:400 15px/1.5 "Plus Jakarta Sans",system-ui,sans-serif;background:var(--bg,#F3F4F9);color:var(--ink,#12141D)}
.saasGone h1{font-size:1.6rem;margin:0 0 8px;letter-spacing:-.02em}
.saasGone p{color:var(--muted,#646B7D);max-width:42ch;margin:0 auto}
`;

function injectChrome(): void {
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  const boot = document.createElement('div');
  boot.id = 'saasBoot';
  boot.setAttribute('role', 'status');
  boot.innerHTML = `<div><i></i>${CATALOG ? 'Abrindo catálogo…' : 'Carregando sua loja…'}</div>`;
  const sync = document.createElement('div');
  sync.id = 'saasSync';
  sync.setAttribute('role', 'status');
  sync.setAttribute('aria-live', 'polite');
  const mount = () => { document.body.appendChild(boot); document.body.appendChild(sync); };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

function hideBoot(): void {
  const b = document.getElementById('saasBoot');
  if (!b) return;
  b.classList.add('off');
  setTimeout(() => b.remove(), 300);
}

function topBar(html: string, cls = ''): HTMLElement {
  const bar = document.createElement('div');
  bar.className = `saasBar ${cls}`;
  bar.innerHTML = html;
  document.body.prepend(bar);
  return bar;
}

function catalogGone(): void {
  // Esconde a página (sem apagá-la, para a interface original não quebrar) e mostra o aviso.
  for (const el of Array.from(document.body.children)) (el as HTMLElement).style.display = 'none';
  const box = document.createElement('main');
  box.className = 'saasGone';
  box.innerHTML = `<div><h1>Catálogo indisponível</h1>
    <p>Este endereço não existe ou a loja está temporariamente fora do ar. Confira o link com a loja.</p></div>`;
  document.body.appendChild(box);
  document.title = 'Catálogo indisponível';
}

const never = new Promise<never>(() => undefined);
function go(url: string): Promise<never> {
  location.replace(url);
  return never;
}

/* ------------------------------------------------------------------ */
/* Status de sincronização                                             */
/* ------------------------------------------------------------------ */
type SyncState = 'idle' | 'saving' | 'error';
function setSync(s: SyncState, text = ''): void {
  const el = document.getElementById('saasSync');
  if (!el) return;
  el.dataset.s = s;
  el.textContent = s === 'saving' ? 'Salvando…' : s === 'error' ? text || 'Sem conexão. Tentando salvar de novo…' : '';
}

interface Lane {
  latest: unknown;
  dirty: boolean;
  running: boolean;
  failed: boolean;
  waiters: (() => void)[];
  retry?: number;
  delay: number;
}
const lanes = new Map<Collection, Lane>();
const lane = (c: Collection): Lane => {
  let l = lanes.get(c);
  if (!l) { l = { latest: null, dirty: false, running: false, failed: false, waiters: [], delay: 2000 }; lanes.set(c, l); }
  return l;
};
const pending = () => [...lanes.values()].some((l) => l.dirty || l.running || l.failed);

function refreshSync(): void {
  const anyFailed = [...lanes.values()].some((l) => l.failed);
  const anyRunning = [...lanes.values()].some((l) => l.running);
  setSync(anyFailed ? 'error' : anyRunning ? 'saving' : 'idle');
}

async function pump(c: Collection): Promise<void> {
  const l = lane(c);
  if (l.running || !store) return;
  l.running = true;
  refreshSync();
  while (l.dirty) {
    l.dirty = false;
    const waiters = l.waiters.splice(0);
    try {
      await store.save(c, l.latest);
      l.failed = false;
      l.delay = 2000;
    } catch (err) {
      console.error('[SaaS] falha ao salvar', c, err);
      if (isAccessDenied(err)) void recheckAccess();
      if (!isNetworkError(err)) {
        // Recusa definitiva (ex.: limite do plano): não adianta repetir sozinho.
        const msg = isLimitError(err)
          ? String((err as { message?: string }).message) + ' O produto novo não foi salvo na nuvem.'
          : 'Não foi possível salvar uma alteração. Recarregue a página e tente de novo.';
        notify(msg);
        l.failed = false;
        waiters.forEach((w) => w());
        break;
      }
      l.failed = true;
      window.clearTimeout(l.retry);
      l.retry = window.setTimeout(() => { l.dirty = true; void pump(c); }, l.delay);
      l.delay = Math.min(l.delay * 2, 60_000);
      waiters.forEach((w) => w());
      break;
    }
    waiters.forEach((w) => w());
  }
  l.running = false;
  refreshSync();
}

function isAccessDenied(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: string | number; message?: string };
  return e?.code === '42501' || String(e?.statusCode) === '403' || /row-level security/i.test(e?.message ?? '');
}

async function recheckAccess(): Promise<void> {
  const fresh = await loadContext().catch(() => null);
  if (!fresh) { location.replace(loginUrl()); return; }
  const m = fresh.memberships.find((x) => x.store_id === ctx?.current?.store_id);
  if (!m) { location.replace('/assinatura/?motivo=removido'); return; }
  const state = accessState(m.store);
  if (state !== 'active') location.replace(`/assinatura/?motivo=${state}`);
}

/* ------------------------------------------------------------------ */
/* Catálogo público                                                    */
/* ------------------------------------------------------------------ */
interface PublicCatalog { store: { name: string; slug: string }; catalog: unknown; products: unknown[] }
let pubCache: { at: number; data: Promise<PublicCatalog | null> } | null = null;

function fetchPublic(force = false): Promise<PublicCatalog | null> {
  if (!force && pubCache && Date.now() - pubCache.at < 1500) return pubCache.data;
  const data = (async () => {
    const { data, error } = await sb().rpc('public_catalog', { p_slug: slug });
    if (error) throw error;
    return (data as PublicCatalog | null) ?? null;
  })();
  pubCache = { at: Date.now(), data };
  return data;
}

async function bootCatalog(): Promise<void> {
  if (!slug) {
    // Link antigo (?catalogo) dentro do painel: manda para o endereço público da loja.
    const c = await loadContext().catch(() => null);
    const s = c?.current?.store.slug;
    if (s) return go(`/c/${s}${location.hash}`);
    await domReady;
    catalogGone();
    return never;
  }
  const data = await fetchPublic(true).catch((e) => { console.error(e); return null; });
  if (!data) {
    await domReady;
    catalogGone();
    return never;
  }
  await domReady;
  hideBoot();
}

/* ------------------------------------------------------------------ */
/* Painel da loja (login obrigatório)                                  */
/* ------------------------------------------------------------------ */
async function bootPanel(): Promise<void> {
  const c = await loadContext();
  if (!c) return go(loginUrl());
  ctx = c;
  if (mustChangePassword(c.user)) return go(`/conta/?senha=1&next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
  if (!c.current) return go(c.isPlatformAdmin ? '/admin/' : '/assinatura/?motivo=sem-loja');
  const state = accessState(c.current.store);
  if (state !== 'active') return go(`/assinatura/?motivo=${state}`);

  slug = c.current.store.slug;
  store = new RecordStore(sb(), c.current.store_id);
  store.onWarning = notify;
  cache = await store.loadAll();
  try { localStorage.setItem('nome', displayName(c)); } catch { /* sem storage */ }

  await domReady;
  applyPermissions(c.current.perms, c.current.role === 'owner');
  expiryWarning(c);
  watchRemoteChanges(c.current.store_id);
  window.addEventListener('beforeunload', (e) => {
    if (pending()) { e.preventDefault(); e.returnValue = ''; }
  });
  hideBoot();
}

function applyPermissions(perms: ModuleId[], owner: boolean): void {
  const allowed = new Set<string>(perms);
  // style.display também, porque o CSS original define display nos botões e venceria o atributo hidden
  const hide = (el: HTMLElement) => { el.hidden = true; el.style.setProperty('display', 'none', 'important'); };
  document.querySelectorAll<HTMLElement>('.nav[data-view]').forEach((b) => {
    if (!allowed.has(b.dataset.view ?? '')) hide(b);
  });
  const hideIf = (id: string, mod: ModuleId) => {
    const el = document.getElementById(id);
    if (el && !allowed.has(mod)) hide(el);
  };
  hideIf('goProd', 'products');
  hideIf('goSale', 'sales');
  hideIf('goSales', 'sales');
  const original = window.show;
  if (typeof original === 'function') {
    window.show = (v: string) => original(allowed.has(v) ? v : 'home');
  }
  const acc = document.getElementById('saasAccountBtn');
  if (acc) acc.textContent = owner ? 'Conta, equipe e assinatura' : 'Minha conta';
}

function expiryWarning(c: Context): void {
  const left = daysLeft(c.current!.store.expires_at);
  if (left === null || left > 7 || c.current!.role !== 'owner') return;
  const msg = left <= 1 ? 'Seu acesso vence hoje.' : `Seu acesso vence em ${left} dias.`;
  const link = env.salesWhatsapp
    ? `<a href="https://wa.me/${env.salesWhatsapp}?text=${encodeURIComponent(`Olá! Quero renovar o acesso da loja ${c.current!.store.name} (${c.current!.store.slug}).`)}" target="_blank" rel="noopener">Renovar agora</a>`
    : '<a href="/conta/">Ver assinatura</a>';
  topBar(`<span>${msg}</span>${link}`, 'warn');
}

function watchRemoteChanges(storeId: string): void {
  let shown = false;
  sb()
    .channel(`store:${storeId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_records', filter: `store_id=eq.${storeId}` }, (p) => {
      const row = (p.new ?? {}) as { client_id?: string };
      if (p.eventType === 'DELETE' || !row.client_id || row.client_id === CLIENT_ID || shown) return;
      shown = true;
      const bar = topBar('<span>Os dados foram alterados em outro aparelho.</span><button type="button">Atualizar agora</button>');
      bar.querySelector('button')!.addEventListener('click', () => {
        if (pending()) { setSync('saving'); setTimeout(() => location.reload(), 1500); } else location.reload();
      });
    })
    .subscribe();
}

/* ------------------------------------------------------------------ */
/* API usada pela interface                                            */
/* ------------------------------------------------------------------ */
let readyPromise: Promise<void> | null = null;
let nameTimer: number | undefined;

const bridge: SaaSBridge = {
  ready() {
    if (!readyPromise) {
      readyPromise = (async () => {
        if (!configured) {
          await domReady;
          document.body.innerHTML = '<main class="saasGone"><div><h1>Falta configurar o Supabase</h1><p>Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e gere o build de novo.</p></div></main>';
          return never;
        }
        return CATALOG ? bootCatalog() : bootPanel();
      })().catch(async (err) => {
        console.error('[SaaS] erro ao iniciar', err);
        await domReady;
        const boot = document.getElementById('saasBoot');
        if (boot) boot.innerHTML = '<div style="max-width:36ch;text-align:center"><b style="color:var(--ink)">Não foi possível carregar.</b><br>Verifique sua conexão e <a href="" style="color:var(--accent)">tente de novo</a>.</div>';
        return never;
      });
    }
    return readyPromise;
  },

  async kvGet(k) {
    await bridge.ready();
    if (CATALOG) {
      const d = await fetchPublic().catch(() => null);
      if (!d) return null;
      if (k === 'catalog') return d.catalog ?? null;
      if (k === 'products') return d.products ?? [];
      return null;
    }
    return cache[k] ?? null;
  },

  kvSet(k, v) {
    if (CATALOG || !isCollection(k)) return Promise.resolve();
    const l = lane(k);
    l.latest = v;
    l.dirty = true;
    window.clearTimeout(l.retry);
    return new Promise<void>((resolve) => {
      l.waiters.push(resolve);
      void bridge.ready().then(() => pump(k));
    });
  },

  catalogUrl() {
    return `${location.origin}/c/${slug}`;
  },

  userName() {
    return ctx ? displayName(ctx) : '';
  },

  setDisplayName(name) {
    if (!ctx?.current) return;
    ctx.current.display_name = name;
    window.clearTimeout(nameTimer);
    nameTimer = window.setTimeout(() => {
      void sb().rpc('set_my_display_name', { p_store: ctx!.current!.store_id, p_name: name });
    }, 800);
  },

  productLimitMessage(count) {
    const max = ctx?.current?.store.max_products;
    if (max == null || count < max) return '';
    return `Seu plano permite até ${max} ${max === 1 ? 'produto' : 'produtos'}. Exclua algum ou fale com a gente para mudar de plano.`;
  },

  signOut() {
    if (pending() && !confirm('Ainda há alterações sendo salvas. Sair mesmo assim?')) return;
    void signOut('/');
  },
};

window.SaaS = bridge;
injectChrome();
void bridge.ready();
