import type { ZodSchema } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export async function body<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, 'Corpo da requisição inválido.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, first?.message || 'Dados inválidos.');
  }
  return parsed.data;
}

/** Envolve um handler: converte erros em JSON com mensagem em português. */
export function handle<C extends { request: Request }>(fn: (ctx: C) => Promise<Response>) {
  return async (ctx: C): Promise<Response> => {
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Erro interno. Tente de novo em instantes.' }, 500);
    }
  };
}

/** Comparação em tempo constante (para tokens). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
