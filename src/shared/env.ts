const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  appName: (import.meta.env.VITE_APP_NAME as string | undefined) || 'Estoque da Loja',
  salesWhatsapp: ((import.meta.env.VITE_SALES_WHATSAPP as string | undefined) || '').replace(/\D/g, ''),
};

export const configured = Boolean(url && anonKey);

export function salesLink(message: string): string {
  if (!env.salesWhatsapp) return '';
  return `https://wa.me/${env.salesWhatsapp}?text=${encodeURIComponent(message)}`;
}
