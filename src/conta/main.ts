import '../styles/base.css';
import { api, authMessage, sb } from '../shared/supabase';
import { salesLink } from '../shared/env';
import { $, busy, confirmDialog, esc, fmtDate, generatePassword, initTheme, requireConfig, toast } from '../shared/ui';
import { displayName, loadContext, loginUrl, rememberStore, signOut, type Context } from '../shared/session';
import { MODULES, ROLE_PRESETS, sanitizePerms, type ModuleId } from '../shared/perms';
import { planById } from '../shared/plans';
import { accessState, daysLeft, type TeamMember } from '../shared/types';
import { showCredentials } from '../shared/credentials';
import { COLLECTIONS, RecordStore } from '../app/records';

initTheme();

let ctx: Context;
let team: TeamMember[] = [];
let editing: TeamMember | null = null;

function safeNext(): string {
  const n = new URLSearchParams(location.search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/app/';
}

async function main(): Promise<void> {
  if (!requireConfig()) return;
  const c = await loadContext().catch(() => null);
  if (!c) { location.replace(loginUrl()); return; }
  ctx = c;

  $('email').textContent = c.user.email ?? '';
  $<HTMLInputElement>('nameIn').value = displayName(c);
  $('adminLink').hidden = !c.isPlatformAdmin;
  $('outBtn').onclick = () => void signOut('/?aviso=saiu');
  bindPassword();
  bindName();

  const forced = new URLSearchParams(location.search).has('senha') || Boolean(c.user.user_metadata?.must_change_password);
  if (forced) {
    $('forceCard').hidden = false;
    $('backApp').hidden = true;
    document.querySelectorAll<HTMLElement>('.wrap > section').forEach((s) => {
      if (s.id !== 'forceCard' && s.id !== 'pwCard') s.hidden = true;
    });
    $<HTMLInputElement>('p1').focus();
    return;
  }

  const m = c.current;
  if (!m) { $('backApp').hidden = true; return; }
  renderStore();
  if (m.role === 'owner') {
    $('slugCard').hidden = false;
    $('teamCard').hidden = false;
    $('dataCard').hidden = false;
    bindSlug();
    bindTeam();
    bindData();
    await loadTeam();
  }
}

function renderStore(): void {
  const m = ctx.current!;
  const s = m.store;
  const state = accessState(s);
  const left = daysLeft(s.expires_at);
  $('storeCard').hidden = false;
  $('storeName').textContent = s.name;
  const chip = $('stateChip');
  chip.className = 'chip ' + (state === 'active' ? (left !== null && left <= 7 ? 'warn' : 'ok') : 'bad');
  chip.textContent = state === 'blocked' ? 'Bloqueada' : state === 'expired' ? 'Vencida' : left !== null && left <= 7 ? `Vence em ${Math.max(left, 0)} dia${left === 1 ? '' : 's'}` : 'Liberada';
  const plan = planById(s.plan);
  $('plan').textContent = plan.label;
  $('expires').textContent = s.expires_at ? fmtDate(s.expires_at) : 'Sem vencimento';
  $('users').textContent = m.role === 'owner' ? `${team.length || 1} de ${s.max_users}` : String(s.max_users);
  void drawProductUsage(s.id, s.max_products);
  const link = m.role === 'owner' ? salesLink(`Olá! Quero renovar/mudar o plano da loja ${s.name} (${s.slug}).`) : '';
  if (link) { const a = $<HTMLAnchorElement>('renew'); a.href = link; a.hidden = false; }
  if (ctx.memberships.length > 1) {
    $('switchWrap').hidden = false;
    const sel = $<HTMLSelectElement>('switch');
    sel.innerHTML = ctx.memberships.map((x) => `<option value="${x.store_id}" ${x.store_id === m.store_id ? 'selected' : ''}>${esc(x.store.name)}</option>`).join('');
    sel.onchange = () => { rememberStore(sel.value); location.reload(); };
  }
}

async function drawProductUsage(storeId: string, max: number | null): Promise<void> {
  const { count } = await sb().from('store_records').select('id', { count: 'exact', head: true })
    .eq('store_id', storeId).eq('coll', 'products');
  const n = count ?? 0;
  $('prods').textContent = max == null ? `${n} · sem limite` : `${n} de ${max}`;
  const bar = $('prodBar');
  if (max == null) { bar.hidden = true; return; }
  const pct = max ? Math.min(100, Math.round((n / max) * 100)) : 100;
  bar.hidden = false;
  bar.classList.toggle('full', pct >= 100);
  (bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
}

/* ---------------- senha e nome ---------------- */
function bindPassword(): void {
  $<HTMLFormElement>('pwForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('pwErr');
    err.hidden = true;
    const p1 = $<HTMLInputElement>('p1').value, p2 = $<HTMLInputElement>('p2').value;
    if (p1.length < 8) { err.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; err.hidden = false; return; }
    if (p1 !== p2) { err.textContent = 'As senhas não são iguais.'; err.hidden = false; return; }
    void busy($<HTMLButtonElement>('pwBtn'), async () => {
      const { error } = await sb().auth.updateUser({ password: p1, data: { must_change_password: false } });
      if (error) { err.textContent = authMessage(error); err.hidden = false; return; }
      $<HTMLInputElement>('p1').value = $<HTMLInputElement>('p2').value = '';
      toast('Senha alterada.');
      if (!$('forceCard').hidden) location.replace(safeNext());
    });
  });
}

function bindName(): void {
  $<HTMLFormElement>('nameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>('nameIn').value.trim();
    if (!name) return toast('Informe seu nome.', 'bad');
    void busy($<HTMLButtonElement>('nameBtn'), async () => {
      await sb().auth.updateUser({ data: { name } });
      if (ctx.current) await sb().rpc('set_my_display_name', { p_store: ctx.current.store_id, p_name: name });
      try { localStorage.setItem('nome', name); } catch { /* sem storage */ }
      toast('Nome salvo.');
    });
  });
}

/* ---------------- endereço do catálogo ---------------- */
function bindSlug(): void {
  const s = ctx.current!.store;
  $('slugBase').textContent = `${location.host}/c/`;
  const input = $<HTMLInputElement>('slugIn');
  input.value = s.slug;
  $<HTMLAnchorElement>('slugOpen').href = `/c/${s.slug}`;
  input.oninput = () => { input.value = input.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); };
  $<HTMLFormElement>('slugForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('slugErr');
    err.hidden = true;
    const v = input.value.trim();
    if (v === s.slug) return toast('O endereço já é esse.');
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(v)) { err.textContent = 'Use de 3 a 40 letras minúsculas, números ou hífen (sem hífen no começo ou no fim).'; err.hidden = false; return; }
    void busy($<HTMLButtonElement>('slugBtn'), async () => {
      const ok = await confirmDialog({ title: 'Mudar endereço?', message: `O link /c/${s.slug} vai parar de funcionar. Envie o novo link para seus clientes.`, confirm: 'Mudar endereço' });
      if (!ok) return;
      const { data, error } = await sb().rpc('set_store_slug', { p_store: s.id, p_slug: v });
      if (error) { err.textContent = error.message; err.hidden = false; return; }
      s.slug = String(data);
      $<HTMLAnchorElement>('slugOpen').href = `/c/${s.slug}`;
      toast('Endereço salvo.');
    });
  });
}

/* ---------------- equipe ---------------- */
async function loadTeam(): Promise<void> {
  try {
    const r = await api<{ members: TeamMember[]; max_users: number }>(`/team?store=${ctx.current!.store_id}`);
    team = r.members;
    ctx.current!.store.max_users = r.max_users;
  } catch (e) {
    $('team').innerHTML = `<p class="empty">${esc((e as Error).message)}</p>`;
    return;
  }
  drawTeam();
  renderStore();
}

function drawTeam(): void {
  const max = ctx.current!.store.max_users;
  const full = team.length >= max;
  $<HTMLButtonElement>('addMember').disabled = full;
  $('teamHint').textContent = full
    ? `Seu plano permite ${max} usuário${max > 1 ? 's' : ''}. Para adicionar mais pessoas, mude de plano.`
    : `Você pode adicionar mais ${max - team.length} pessoa${max - team.length > 1 ? 's' : ''}.`;
  const label = (id: string) => MODULES.find((x) => x.id === id)?.label ?? id;
  $('team').innerHTML = team.map((t) => `
    <div class="member">
      <div class="who"><b>${esc(t.display_name || t.email)}</b><span class="small muted">${esc(t.email)} · último acesso: ${t.last_sign_in_at ? fmtDate(t.last_sign_in_at) : 'nunca'}</span>
        <div class="chips">${t.role === 'owner' ? '<span class="chip acc">Dono · acesso total</span>' : t.perms.map((p) => `<span class="chip">${esc(label(p))}</span>`).join('')}</div>
      </div>
      ${t.role === 'owner' ? '' : `<div class="row">
        <button class="btn sm" data-a="edit" data-id="${t.user_id}">Editar</button>
        <button class="btn sm" data-a="pw" data-id="${t.user_id}">Nova senha</button>
        <button class="btn sm danger" data-a="del" data-id="${t.user_id}">Remover</button></div>`}
    </div>`).join('') || '<p class="empty">Ninguém na equipe ainda.</p>';
}

function permToggles(selected: ModuleId[]): void {
  $('mPerms').innerHTML = MODULES.map((m) => `<label><input type="checkbox" value="${m.id}" ${selected.includes(m.id) ? 'checked' : ''} ${m.id === 'home' ? 'disabled' : ''}>${esc(m.label)}</label>`).join('');
}
const readPerms = (): ModuleId[] => sanitizePerms([...document.querySelectorAll<HTMLInputElement>('#mPerms input:checked')].map((i) => i.value));

function openMember(t: TeamMember | null): void {
  editing = t;
  $('mTitle').textContent = t ? 'Editar acesso' : 'Adicionar pessoa';
  $('mSub').textContent = t ? t.email : 'Ela entra com o e-mail e a senha que você entregar.';
  $('mEmailWrap').hidden = Boolean(t);
  $<HTMLInputElement>('mName').value = t?.display_name ?? '';
  $<HTMLInputElement>('mEmail').value = '';
  $('mErr').hidden = true;
  const sel = $<HTMLSelectElement>('mPreset');
  sel.innerHTML = '<option value="">Personalizado</option>' + ROLE_PRESETS.map((p) => `<option value="${p.id}">${esc(p.label)} — ${esc(p.description)}</option>`).join('');
  const perms = t ? t.perms : ROLE_PRESETS[1].perms;
  sel.value = ROLE_PRESETS.find((p) => p.perms.join() === sanitizePerms(perms).join())?.id ?? '';
  permToggles(perms);
  sel.onchange = () => { const p = ROLE_PRESETS.find((x) => x.id === sel.value); if (p) permToggles(p.perms); };
  $('mPerms').onchange = () => { sel.value = ROLE_PRESETS.find((p) => p.perms.join() === readPerms().join())?.id ?? ''; };
  $<HTMLDialogElement>('memberDlg').showModal();
  $<HTMLInputElement>('mName').focus();
}

function bindTeam(): void {
  $('addMember').onclick = () => openMember(null);
  $('mCancel').onclick = () => $<HTMLDialogElement>('memberDlg').close();
  $<HTMLFormElement>('memberForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('mErr');
    err.hidden = true;
    const name = $<HTMLInputElement>('mName').value.trim();
    const email = $<HTMLInputElement>('mEmail').value.trim().toLowerCase();
    const perms = readPerms();
    if (!name) { err.textContent = 'Informe o nome.'; err.hidden = false; return; }
    if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Informe um e-mail válido.'; err.hidden = false; return; }
    void busy($<HTMLButtonElement>('mSave'), async () => {
      try {
        if (editing) {
          await api(`/team/${editing.user_id}`, { method: 'PATCH', body: { storeId: ctx.current!.store_id, name, perms } });
          $<HTMLDialogElement>('memberDlg').close();
          toast('Acesso atualizado.');
        } else {
          const password = generatePassword();
          await api('/team', { method: 'POST', body: { storeId: ctx.current!.store_id, name, email, perms, password } });
          $<HTMLDialogElement>('memberDlg').close();
          showCredentials({ name, email, password });
        }
        await loadTeam();
      } catch (ex) {
        err.textContent = (ex as Error).message;
        err.hidden = false;
      }
    });
  });

  $('team').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
    if (!b) return;
    const t = team.find((x) => x.user_id === b.dataset.id);
    if (!t) return;
    const storeId = ctx.current!.store_id;
    if (b.dataset.a === 'edit') return openMember(t);
    void busy(b, async () => {
      try {
        if (b.dataset.a === 'pw') {
          if (!(await confirmDialog({ title: 'Gerar senha nova?', message: `${t.display_name || t.email} vai precisar da senha nova para entrar.`, confirm: 'Gerar senha' }))) return;
          const password = generatePassword();
          await api(`/team/${t.user_id}/reset-password`, { body: { storeId, password } });
          showCredentials({ name: t.display_name || t.email, email: t.email, password });
        } else if (b.dataset.a === 'del') {
          if (!(await confirmDialog({ title: 'Remover da equipe?', message: `${t.display_name || t.email} perde o acesso à loja na hora. Vendas e registros feitos por ela continuam.`, confirm: 'Remover', danger: true }))) return;
          await api(`/team/${t.user_id}?store=${storeId}`, { method: 'DELETE' });
          toast('Pessoa removida.');
          await loadTeam();
        }
      } catch (ex) {
        toast((ex as Error).message, 'bad');
      }
    });
  });
}

/* ---------------- backup ---------------- */
function bindData(): void {
  const storeId = ctx.current!.store_id;
  $('exportBtn').onclick = () => void busy($<HTMLButtonElement>('exportBtn'), async () => {
    const data = await new RecordStore(sb(), storeId).exportAll();
    const blob = new Blob([JSON.stringify({ ...data, store: ctx.current!.store.slug }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${ctx.current!.store.slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup baixado.');
  });

  $<HTMLInputElement>('importFile').onchange = async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let parsed: { format?: string; data?: Record<string, unknown> };
    try { parsed = JSON.parse(await file.text()); } catch { toast('Arquivo inválido.', 'bad'); return; }
    if (parsed.format !== 'estoque-da-loja/v1' || !parsed.data) { toast('Este arquivo não é um backup do sistema.', 'bad'); return; }
    const ok = await confirmDialog({ title: 'Restaurar backup?', message: 'Os dados atuais da loja serão substituídos pelos do arquivo. Essa ação não pode ser desfeita.', confirm: 'Restaurar', danger: true, typeToConfirm: 'restaurar' });
    if (!ok) return;
    try {
      const rs = new RecordStore(sb(), storeId);
      await rs.loadAll();
      for (const c of COLLECTIONS) {
        const v = parsed.data[c];
        await rs.save(c, c === 'catalog' ? (v ?? null) : Array.isArray(v) ? v : []);
      }
      toast('Backup restaurado.');
    } catch (ex) {
      toast(`Não foi possível restaurar: ${(ex as Error).message}`, 'bad');
    }
  };
}

void main();
