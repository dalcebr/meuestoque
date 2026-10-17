import '../styles/base.css';
import { sb, authMessage } from '../shared/supabase';
import { env, salesLink } from '../shared/env';
import { $, busy, initTheme, requireConfig } from '../shared/ui';
import { loadContext } from '../shared/session';

initTheme();

const NOTICES: Record<string, string> = {
  'sem-loja': 'Seu usuário não está ligado a nenhuma loja. Fale com o responsável.',
  saiu: 'Você saiu da sua conta.',
  senha: 'Senha alterada. Entre com a senha nova.',
};

/** Só aceita caminhos internos, para não virar redirecionamento aberto. */
function safeNext(): string | null {
  const n = new URLSearchParams(location.search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : null;
}

async function destination(): Promise<string> {
  const ctx = await loadContext();
  const next = safeNext();
  if (next) return next;
  if (ctx?.isPlatformAdmin && !ctx.current) return '/admin/';
  return '/app/';
}

async function main(): Promise<void> {
  if (!requireConfig()) return;
  document.title = `Entrar · ${env.appName}`;
  $('appName').textContent = env.appName;

  const buy = salesLink(`Olá! Quero conhecer o ${env.appName} para a minha loja.`);
  if (buy) { const a = $<HTMLAnchorElement>('buyLink'); a.href = buy; a.hidden = false; }

  const code = new URLSearchParams(location.search).get('erro') ?? new URLSearchParams(location.search).get('aviso');
  if (code && NOTICES[code]) { const n = $('notice'); n.textContent = NOTICES[code]; n.hidden = false; }

  const { data } = await sb().auth.getSession();
  if (data.session) { location.replace(await destination()); return; }

  const form = $<HTMLFormElement>('loginForm');
  const err = $('err');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    const email = $<HTMLInputElement>('email').value.trim().toLowerCase();
    const password = $<HTMLInputElement>('password').value;
    if (!email || !password) { err.textContent = 'Preencha e-mail e senha.'; err.hidden = false; return; }
    void busy($<HTMLButtonElement>('loginBtn'), async () => {
      const { error } = await sb().auth.signInWithPassword({ email, password });
      if (error) { err.textContent = authMessage(error); err.hidden = false; return; }
      location.replace(await destination());
    });
  });

  const forgot = $<HTMLFormElement>('forgotForm');
  $('forgotBtn').onclick = () => {
    form.hidden = true; forgot.hidden = false;
    $<HTMLInputElement>('fEmail').value = $<HTMLInputElement>('email').value;
    $<HTMLInputElement>('fEmail').focus();
  };
  $('backBtn').onclick = () => { forgot.hidden = true; form.hidden = false; };
  forgot.addEventListener('submit', (e) => {
    e.preventDefault();
    const fErr = $('fErr');
    fErr.hidden = true;
    const email = $<HTMLInputElement>('fEmail').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fErr.textContent = 'Informe um e-mail válido.'; fErr.hidden = false; return; }
    void busy($<HTMLButtonElement>('fBtn'), async () => {
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/redefinir-senha/` });
      if (error) { fErr.textContent = authMessage(error); fErr.hidden = false; return; }
      $('fOk').hidden = false;
    });
  });
}

void main();
