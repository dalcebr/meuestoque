/**
 * Planos vendidos. Ajuste nomes, limites e preços à vontade —
 * o preço é só informativo (aparece no painel do administrador).
 */
/** maxProducts: null = sem limite · maxPhotos: fotos por produto (1 a 50) */
export interface Plan { id: string; label: string; maxUsers: number; maxProducts: number | null; maxPhotos: number; price: string }

export const PLANS: Plan[] = [
  { id: 'basico', label: 'Básico', maxUsers: 1, maxProducts: 100, maxPhotos: 5, price: 'R$ 39,90/mês' },
  { id: 'profissional', label: 'Profissional', maxUsers: 3, maxProducts: 500, maxPhotos: 10, price: 'R$ 69,90/mês' },
  { id: 'premium', label: 'Premium', maxUsers: 10, maxProducts: null, maxPhotos: 15, price: 'R$ 119,90/mês' },
];

export const DEFAULT_PLAN = PLANS[0];

export const productLimitLabel = (n: number | null | undefined): string =>
  n == null ? 'ilimitados' : `até ${n.toLocaleString('pt-BR')}`;

export function planById(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? { id: String(id || 'basico'), label: String(id || 'Básico'), maxUsers: 1, maxProducts: null, maxPhotos: 5, price: '' };
}
