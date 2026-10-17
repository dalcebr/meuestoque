import { configured } from './env';

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} não encontrado`);
  return el as T;
};

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function initTheme(): void {
  let t: string | null = null;
  try { t = localStorage.getItem('tema'); } catch { /* sem storage */ }
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  let accent: string | null = null;
  try { accent = localStorage.getItem('cor'); } catch { /* sem storage */ }
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    document.documentElement.style.setProperty('--accent', accent);
    const n = parseInt(accent.slice(1), 16);
    const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    document.documentElement.style.setProperty('--accent-ink', l > 0.62 ? '#10131C' : '#fff');
  }
}

export function toggleTheme(): void {
  const r = document.documentElement;
  const t = r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  r.setAttribute('data-theme', t);
  try { localStorage.setItem('tema', t); } catch { /* sem storage */ }
}

let toastTimer: number | undefined;
export function toast(message: string, kind: 'ok' | 'bad' = 'ok'): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('on'), Math.min(8000, Math.max(3500, message.length * 60)));
}

export async function busy<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>): Promise<T | undefined> {
  if (btn?.disabled) return undefined;
  const old = btn?.textContent ?? '';
  if (btn) { btn.disabled = true; btn.dataset.busy = '1'; }
  try {
    return await fn();
  } finally {
    if (btn) { btn.disabled = false; delete btn.dataset.busy; btn.textContent = old; }
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Senha forte e fácil de ditar (sem 0/O, 1/l). */
export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let out = '';
  for (const n of buf) out += chars[n % chars.length];
  return out;
}

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const fmtDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

/** Abre um diálogo de confirmação. Se `typeToConfirm` for informado, exige que a pessoa digite a palavra. */
export function confirmDialog(opts: { title: string; message: string; confirm?: string; danger?: boolean; typeToConfirm?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.innerHTML = `
      <form method="dialog">
        <h2>${esc(opts.title)}</h2>
        <p class="muted">${esc(opts.message)}</p>
        ${opts.typeToConfirm ? `<label class="fld"><span>Digite <b>${esc(opts.typeToConfirm)}</b> para confirmar</span><input name="t" autocomplete="off" autocapitalize="off"></label>` : ''}
        <div class="row end">
          <button value="no" class="btn" type="submit">Cancelar</button>
          <button value="yes" class="btn ${opts.danger ? 'danger' : 'main'}" type="submit" id="cfOk">${esc(opts.confirm ?? 'Confirmar')}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const input = d.querySelector<HTMLInputElement>('input[name=t]');
    const ok = d.querySelector<HTMLButtonElement>('#cfOk')!;
    if (input) {
      ok.disabled = true;
      input.oninput = () => { ok.disabled = input.value.trim().toLowerCase() !== opts.typeToConfirm!.toLowerCase(); };
    }
    d.addEventListener('close', () => { resolve(d.returnValue === 'yes'); d.remove(); });
    d.showModal();
  });
}

/** Mostra aviso de configuração ausente em vez de quebrar a página. */
export function requireConfig(): boolean {
  if (configured) return true;
  document.body.innerHTML = `
    <main class="center"><div class="panel">
      <h1>Falta configurar o Supabase</h1>
      <p class="muted">Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env</code>
      (local) ou em Cloudflare Pages &gt; Settings &gt; Environment variables, e gere o build de novo.</p>
    </div></main>`;
  return false;
}

export function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits.length <= 11 ? '55' + digits : digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
