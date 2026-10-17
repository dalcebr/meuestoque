import { HttpError } from './http';
import { z } from 'zod';

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Endereço: 3 a 40 letras minúsculas, números ou hífen.');
export const email = z.string().trim().toLowerCase().email('E-mail inválido.').max(254);
export const password = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(72);
export const personName = z.string().trim().min(1, 'Informe o nome.').max(80);
export const isoDate = z.string().datetime({ offset: true, message: 'Data inválida.' });
export const uuid = z.string().uuid('Identificador inválido.');

/** Valida um parâmetro de rota (ex.: [id]) como UUID. */
export function idParam(v: string | string[] | undefined): string {
  const r = uuid.safeParse(Array.isArray(v) ? v[0] : v);
  if (!r.success) throw new HttpError(400, 'Identificador inválido.');
  return r.data;
}
