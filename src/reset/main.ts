import '../styles/base.css';
import { sb, authMessage } from '../shared/supabase';
import { $, busy, initTheme, requireConfig } from '../shared/ui';

initTheme();

async function main(): Promise<void> {
  if (!requireConfig()) return;
  const client = sb();
  // O link do e-mail traz a sessão de recuperação na URL; o supabase-js a lê sozinho.
  let ok = false;
  client.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN') ok = true; });
  const { data } = await client.auth.getSession();
  if (data.session) ok = true;
  setTimeout(() => {
    if (!ok) { $('form').hidden = true; $('expired').hidden = false; }
  }, 1200);

  $<HTMLFormElement>('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('err');
    err.hidden = true;
    const p1 = $<HTMLInputElement>('p1').value, p2 = $<HTMLInputElement>('p2').value;
    if (p1.length < 8) { err.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; err.hidden = false; return; }
    if (p1 !== p2) { err.textContent = 'As senhas não são iguais.'; err.hidden = false; return; }
    void busy($<HTMLButtonElement>('btn'), async () => {
      const { error } = await client.auth.updateUser({ password: p1, data: { must_change_password: false } });
      if (error) { err.textContent = authMessage(error); err.hidden = false; return; }
      await client.auth.signOut();
      location.replace('/?aviso=senha');
    });
  });
}

void main();
