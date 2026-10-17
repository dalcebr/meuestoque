import { $, copyText, toast, waLink } from './ui';
import { env } from './env';

/** Mostra a senha gerada uma única vez (diálogo #pwDlg presente na página). */
export function showCredentials(c: { name: string; email: string; password: string; phone?: string | null; extra?: string }): void {
  const text =
    `Olá, ${c.name}! Seu acesso ao ${env.appName}:\n` +
    `Endereço: ${location.origin}/\n` +
    `E-mail: ${c.email}\n` +
    `Senha provisória: ${c.password}\n` +
    (c.extra ? `${c.extra}\n` : '') +
    `No primeiro acesso você cria a sua senha.`;
  $('pwShow').textContent = c.password;
  $<HTMLAnchorElement>('pwWa').href = waLink(c.phone ?? '', text);
  $('pwCopy').onclick = async () => toast((await copyText(text)) ? 'Dados copiados.' : 'Não foi possível copiar.');
  const d = $<HTMLDialogElement>('pwDlg');
  $('pwClose').onclick = () => d.close();
  d.showModal();
}
