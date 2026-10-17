/**
 * Planos vendidos. Ajuste nomes, limites e preços à vontade —
 * o preço é só informativo (aparece no painel do administrador).
 */
export interface Plan { id: string; label: string; maxUsers: number; price: string }

export const PLANS: Plan[] = [
  { id: 'basico', label: 'Básico', maxUsers: 1, price: 'R$ 39,90/mês' },
  { id: 'profissional', label: 'Profissional', maxUsers: 3, price: 'R$ 69,90/mês' },
  { id: 'premium', label: 'Premium', maxUsers: 10, price: 'R$ 119,90/mês' },
];

export const DEFAULT_PLAN = PLANS[0];

export function planById(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? { id: String(id || 'basico'), label: String(id || 'Básico'), maxUsers: 1, price: '' };
}
