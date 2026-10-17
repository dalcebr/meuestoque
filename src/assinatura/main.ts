import '../styles/base.css';
import { env, salesLink } from '../shared/env';
import { $, fmtDate, initTheme, requireConfig } from '../shared/ui';
import { loadContext, loginUrl, signOut } from '../shared/session';
import { accessState } from '../shared/types';

initTheme();

async function main(): Promise<void> {
  if (!requireConfig()) return;
  $('appName').textContent = env.appName;
  $('out').onclick = () => void signOut('/?aviso=saiu');
  $('retry').onclick = () => location.replace('/app/');

  const ctx = await loadContext().catch(() => null);
  if (!ctx) { location.replace(loginUrl('/app/')); return; }
  const m = ctx.current;
  if (!m) {
    $('title').textContent = 'Nenhuma loja ligada';
    $('msg').textContent = 'Seu usuário não está ligado a nenhuma loja. Fale com o responsável pela sua loja.';
    $('safe').hidden = true;
    return;
  }
  const state = accessState(m.store);
  if (state === 'active') { location.replace('/app/'); return; }
  $('storeName').textContent = m.store.name;
  if (state === 'expired') {
    $('title').textContent = 'Acesso vencido';
    $('msg').textContent = `O acesso da loja venceu em ${fmtDate(m.store.expires_at)}.`;
  } else {
    $('title').textContent = 'Acesso bloqueado';
    $('msg').textContent = 'O acesso desta loja está bloqueado no momento.';
  }
  if (m.role !== 'owner') {
    $('msg').textContent += ' Avise o dono da loja para regularizar.';
    return;
  }
  const link = salesLink(`Olá! Quero renovar o acesso da loja ${m.store.name} (${m.store.slug}).`);
  if (link) { const a = $<HTMLAnchorElement>('renew'); a.href = link; a.hidden = false; }
}

void main();
