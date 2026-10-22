import '../styles/base.css';
import { api } from '../shared/supabase';
import { env } from '../shared/env';
import { $, busy, confirmDialog, esc, fmtDate, fmtDateTime, generatePassword, initTheme, requireConfig, toast, toggleTheme } from '../shared/ui';
import { loadContext, loginUrl, signOut } from '../shared/session';
import { PLANS, planById, DEFAULT_PLAN, productLimitLabel } from '../shared/plans';
import { accessState, daysLeft, type AdminStore, type AuditEntry } from '../shared/types';
import { showCredentials } from '../shared/credentials';

initTheme();

type Filter = 'all' | 'active' | 'soon' | 'expired' | 'blocked';
let stores: AdminStore[] = [];
let filter: Filter = 'all';
let editing: AdminStore | null = null;

const ACTIONS: Record<string, string> = {
  'store.create': 'Criou loja',
  'store.update': 'Alterou loja',
  'store.delete': 'Excluiu loja',
  'store.reset_password': 'Gerou senha do dono',
  'store.renew_webhook': 'Renovação automática',
  'team.create': 'Dono adicionou pessoa',
  'team.update': 'Dono alterou pessoa',
  'team.delete': 'Dono removeu pessoa',
  'team.reset_password': 'Dono gerou senha',
};

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');
/** Data escolhida vale até o fim do dia (horário local). */
const fromDateInput = (v: string) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);

function bucket(s: AdminStore): Exclude<Filter, 'all'> {
  const st = accessState(s);
  if (st === 'blocked') return 'blocked';
  if (st === 'expired') return 'expired';
  const left = daysLeft(s.expires_at);
  return left !== null && left <= 7 ? 'soon' : 'active';
}

async function main(): Promise<void> {
  if (!requireConfig()) return;
  $('appName').textContent = env.appName;
  $('themeBtn').onclick = toggleTheme;
  $('outBtn').onclick = () => void signOut('/?aviso=saiu');
  const ctx = await loadContext().catch(() => null);
  if (!ctx) { location.replace(loginUrl()); return; }
  if (!ctx.isPlatformAdmin) { $('denied').hidden = false; return; }
  $('myStore').hidden = !ctx.current;
  $('wrap').hidden = false;

  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $('tab-stores').hidden = b.dataset.tab !== 'stores';
      $('tab-audit').hidden = b.dataset.tab !== 'audit';
      if (b.dataset.tab === 'audit') void loadAudit();
    };
  });
  $('q').oninput = draw;
  $('newStore').onclick = () => openStore(null);
  bindStoreForm();
  bindRows();
  await load();
}

async function load(): Promise<void> {
  try {
    stores = (await api<{ stores: AdminStore[] }>('/admin/stores')).stores;
  } catch (e) {
    $('rows').innerHTML = `<tr><td colspan="7" class="empty">${esc((e as Error).message)}</td></tr>`;
    return;
  }
  draw();
}

function draw(): void {
  const counts = { all: stores.length, active: 0, soon: 0, expired: 0, blocked: 0 } as Record<Filter, number>;
  for (const s of stores) counts[bucket(s)]++;
  const labels: [Filter, string][] = [
    ['all', 'Lojas no total'], ['active', 'Em dia'], ['soon', 'Vencem em 7 dias'], ['expired', 'Vencidas'], ['blocked', 'Bloqueadas'],
  ];
  $('stats').innerHTML = labels.map(([k, l]) => `<button class="stat" type="button" data-f="${k}" aria-pressed="${filter === k}"><b>${counts[k]}</b><span>${l}</span></button>`).join('');
  $('stats').querySelectorAll<HTMLButtonElement>('.stat').forEach((b) => { b.onclick = () => { filter = b.dataset.f as Filter; draw(); }; });

  const q = $<HTMLInputElement>('q').value.trim().toLowerCase();
  const list = stores
    .filter((s) => filter === 'all' || bucket(s) === filter)
    .filter((s) => !q || [s.name, s.slug, s.owner_email, s.contact_name, s.contact_phone].some((v) => (v ?? '').toLowerCase().includes(q)));

  $('rows').innerHTML = list.length ? list.map((s) => {
    const b = bucket(s);
    const left = daysLeft(s.expires_at);
    const chip = { active: ['ok', 'Em dia'], soon: ['warn', `Vence em ${Math.max(left ?? 0, 0)}d`], expired: ['bad', 'Vencida'], blocked: ['bad', 'Bloqueada'] }[b];
    return `<tr>
      <td class="store"><b>${esc(s.name)}</b><a href="/c/${esc(s.slug)}" target="_blank" rel="noopener">/c/${esc(s.slug)}</a></td>
      <td data-label="Dono"><div>${esc(s.contact_name || '')}<div class="small muted">${esc(s.owner_email || 'sem dono')}</div>${s.contact_phone ? `<div class="small muted">${esc(s.contact_phone)}</div>` : ''}</div></td>
      <td data-label="Plano"><div>${esc(planById(s.plan).label)}<div class="small muted">${s.member_count}/${s.max_users} usuário(s) · ${s.max_photos} fotos/produto</div></div></td>
      <td data-label="Validade" class="num">${s.expires_at ? fmtDate(s.expires_at) : 'Sem vencimento'}</td>
      <td data-label="Uso" class="num small"><div>${useLine(s)}${s.sale_count} vendas<div class="muted">ativo ${s.last_activity_at ? fmtDate(s.last_activity_at) : 'nunca'}</div></div></td>
      <td data-label="Situação"><span class="chip ${chip[0]}">${chip[1]}</span></td>
      <td class="acts"><div class="row" style="flex-wrap:nowrap">
        <button class="btn sm" data-a="renew" data-id="${s.id}" title="Somar 30 dias">+30 dias</button>
        <button class="btn sm" data-a="edit" data-id="${s.id}">Editar</button>
      </div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" class="empty">${stores.length ? 'Nenhuma loja neste filtro.' : 'Nenhuma loja ainda. Toque em “Nova loja” para vender o primeiro acesso.'}</td></tr>`;
}

function useLine(s: AdminStore): string {
  if (s.max_products == null) return `${s.product_count} produtos<br>`;
  const pct = s.max_products ? Math.min(100, Math.round((s.product_count / s.max_products) * 100)) : 100;
  return `${s.product_count}/${s.max_products} produtos<span class="use-bar ${pct >= 100 ? 'full' : ''}" title="${pct}% do limite"><i style="width:${pct}%"></i></span>`;
}

function bindRows(): void {
  $('rows').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
    if (!b) return;
    const s = stores.find((x) => x.id === b.dataset.id);
    if (!s) return;
    if (b.dataset.a === 'edit') return openStore(s);
    void busy(b, async () => {
      try {
        await api(`/admin/stores/${s.id}`, { method: 'PATCH', body: { extendDays: 30 } });
        toast(`${s.name}: +30 dias.`);
        await load();
      } catch (ex) { toast((ex as Error).message, 'bad'); }
    });
  });
}

/* ---------------- diálogo da loja ---------------- */
function openStore(s: AdminStore | null): void {
  editing = s;
  const isNew = !s;
  $('sTitle').textContent = isNew ? 'Nova loja' : s.name;
  $('sSub').textContent = isNew
    ? 'Cria a loja e o acesso do dono. A senha provisória aparece uma única vez.'
    : `Dono: ${s.owner_email ?? '—'} · criada em ${fmtDate(s.created_at)}`;
  $('ownerFields').hidden = !isNew;
  $('statusWrap').hidden = isNew;
  $('dangerActs').hidden = isNew;
  $('sErr').hidden = true;
  $<HTMLSelectElement>('sPlan').innerHTML = PLANS.map((p) => `<option value="${p.id}">${esc(p.label)} · ${p.maxUsers} usuário(s) · ${productLimitLabel(p.maxProducts)} produtos · ${p.maxPhotos} fotos${p.price ? ' · ' + esc(p.price) : ''}</option>`).join('');
  const set = (id: string, v: string) => { $<HTMLInputElement>(id).value = v; };
  set('sName', s?.name ?? '');
  set('sSlug', s?.slug ?? '');
  set('sOwner', '');
  set('sEmail', '');
  set('sPhone', s?.contact_phone ?? '');
  $<HTMLSelectElement>('sPlan').value = s?.plan ?? DEFAULT_PLAN.id;
  set('sMax', String(s?.max_users ?? DEFAULT_PLAN.maxUsers));
  set('sPhotos', String(s?.max_photos ?? DEFAULT_PLAN.maxPhotos));
  set('sProd', s ? (s.max_products == null ? '' : String(s.max_products)) : (DEFAULT_PLAN.maxProducts == null ? '' : String(DEFAULT_PLAN.maxProducts)));
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString();
  set('sExp', toDateInput(isNew ? in30 : s.expires_at));
  $<HTMLSelectElement>('sStatus').value = s?.status ?? 'active';
  $<HTMLTextAreaElement>('sNotes').value = s?.notes ?? '';
  $<HTMLDialogElement>('storeDlg').showModal();
  $<HTMLInputElement>('sName').focus();
}

function bindStoreForm(): void {
  const name = $<HTMLInputElement>('sName'), slug = $<HTMLInputElement>('sSlug');
  let slugTouched = false;
  name.oninput = () => { if (!editing && !slugTouched) slug.value = slugify(name.value); };
  slug.oninput = () => { slugTouched = true; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); };
  $<HTMLSelectElement>('sPlan').onchange = () => {
    const plan = planById($<HTMLSelectElement>('sPlan').value);
    $<HTMLInputElement>('sMax').value = String(plan.maxUsers);
    $<HTMLInputElement>('sProd').value = plan.maxProducts == null ? '' : String(plan.maxProducts);
    $<HTMLInputElement>('sPhotos').value = String(plan.maxPhotos);
  };
  $('sCancel').onclick = () => $<HTMLDialogElement>('storeDlg').close();
  $('storeDlg').addEventListener('close', () => { slugTouched = false; });

  $('quick').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-days]');
    if (!b) return;
    const days = Number(b.dataset.days);
    const exp = $<HTMLInputElement>('sExp');
    if (!days) { exp.value = ''; return; }
    const cur = exp.value ? new Date(`${exp.value}T23:59:59`).getTime() : 0;
    const base = Math.max(Date.now(), cur);
    exp.value = new Date(base + days * 86_400_000).toLocaleDateString('sv-SE');
  });

  $<HTMLFormElement>('storeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('sErr');
    err.hidden = true;
    const fail = (m: string) => { err.textContent = m; err.hidden = false; };
    const body = {
      name: name.value.trim(),
      slug: slug.value.trim(),
      plan: $<HTMLSelectElement>('sPlan').value,
      maxUsers: Number($<HTMLInputElement>('sMax').value) || 1,
      maxPhotos: Math.floor(Number($<HTMLInputElement>('sPhotos').value)),
      maxProducts: $<HTMLInputElement>('sProd').value.trim() === '' ? null : Math.max(0, Math.floor(Number($<HTMLInputElement>('sProd').value))),
      expiresAt: fromDateInput($<HTMLInputElement>('sExp').value),
      contactPhone: $<HTMLInputElement>('sPhone').value.trim() || null,
      notes: $<HTMLTextAreaElement>('sNotes').value.trim() || null,
    };
    if (!body.name) return fail('Informe o nome da loja.');
    if (body.maxProducts !== null && !Number.isFinite(body.maxProducts)) return fail('Máximo de produtos: use um número ou deixe em branco.');
    if (!Number.isFinite(body.maxPhotos) || body.maxPhotos < 1 || body.maxPhotos > 50) return fail('Fotos por produto: use um número de 1 a 50.');
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(body.slug)) return fail('Endereço: 3 a 40 letras minúsculas, números ou hífen (sem hífen nas pontas).');
    void busy($<HTMLButtonElement>('sSave'), async () => {
      try {
        if (editing) {
          await api(`/admin/stores/${editing.id}`, { method: 'PATCH', body: { ...body, status: $<HTMLSelectElement>('sStatus').value } });
          $<HTMLDialogElement>('storeDlg').close();
          toast('Loja atualizada.');
        } else {
          const ownerName = $<HTMLInputElement>('sOwner').value.trim();
          const ownerEmail = $<HTMLInputElement>('sEmail').value.trim().toLowerCase();
          if (!ownerName) return fail('Informe o nome do dono.');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return fail('Informe um e-mail válido para o dono.');
          const password = generatePassword();
          await api('/admin/stores', { body: { ...body, contactName: ownerName, ownerName, ownerEmail, password } });
          $<HTMLDialogElement>('storeDlg').close();
          showCredentials({ name: ownerName, email: ownerEmail, password, phone: body.contactPhone, extra: `Catálogo da loja: ${location.origin}/c/${body.slug}` });
        }
        await load();
      } catch (ex) { fail((ex as Error).message); }
    });
  });

  $('sReset').onclick = () => {
    const s = editing;
    if (!s) return;
    void busy($<HTMLButtonElement>('sReset'), async () => {
      if (!(await confirmDialog({ title: 'Gerar senha nova para o dono?', message: `A senha atual de ${s.owner_email} deixa de funcionar.`, confirm: 'Gerar senha' }))) return;
      try {
        const password = generatePassword();
        await api(`/admin/stores/${s.id}/reset-password`, { body: { password } });
        $<HTMLDialogElement>('storeDlg').close();
        showCredentials({ name: s.contact_name || s.name, email: s.owner_email ?? '', password, phone: s.contact_phone });
      } catch (ex) { toast((ex as Error).message, 'bad'); }
    });
  };

  $('sDelete').onclick = () => {
    const s = editing;
    if (!s) return;
    void busy($<HTMLButtonElement>('sDelete'), async () => {
      const ok = await confirmDialog({
        title: `Excluir ${s.name}?`,
        message: 'Apaga a loja, os produtos, as vendas, os clientes, as fotos e os acessos da equipe. Não dá para desfazer. Se for só inadimplência, prefira bloquear.',
        confirm: 'Excluir para sempre', danger: true, typeToConfirm: s.slug,
      });
      if (!ok) return;
      try {
        await api(`/admin/stores/${s.id}`, { method: 'DELETE' });
        $<HTMLDialogElement>('storeDlg').close();
        toast('Loja excluída.');
        await load();
      } catch (ex) { toast((ex as Error).message, 'bad'); }
    });
  };
}

/* ---------------- histórico ---------------- */
async function loadAudit(): Promise<void> {
  $('auditRows').innerHTML = '<tr><td colspan="4" class="empty">Carregando…</td></tr>';
  try {
    const { entries } = await api<{ entries: AuditEntry[] }>('/admin/audit');
    const byId = new Map(stores.map((s) => [s.id, s.name]));
    $('auditRows').innerHTML = entries.length ? entries.map((a) => {
      const d = a.details ?? {};
      const store = (d.store_name as string) || (a.store_id ? byId.get(a.store_id) : '') || '';
      const extra = Object.entries(d).filter(([k]) => k !== 'store_name').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
      return `<tr><td class="store"><b>${esc(ACTIONS[a.action] ?? a.action)}</b>${store ? `<div class="small muted">${esc(store)}</div>` : ''}</td><td data-label="Quando" class="num">${fmtDateTime(a.created_at)}</td><td data-label="Quem">${esc(a.actor_email ?? 'sistema')}</td><td data-label="Detalhes" class="small muted" style="word-break:break-word">${esc(extra)}</td></tr>`;
    }).join('') : '<tr><td colspan="4" class="empty">Sem registros ainda.</td></tr>';
  } catch (e) {
    $('auditRows').innerHTML = `<tr><td colspan="4" class="empty">${esc((e as Error).message)}</td></tr>`;
  }
}

void main();
