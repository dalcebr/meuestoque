/** Telas do sistema que podem ser liberadas para cada pessoa da equipe. */
export const MODULES = [
  { id: 'home', label: 'Início' },
  { id: 'products', label: 'Produtos' },
  { id: 'stock', label: 'Estoque' },
  { id: 'sales', label: 'Vendas' },
  { id: 'clients', label: 'Clientes' },
  { id: 'reports', label: 'Relatórios' },
  { id: 'catalog', label: 'Catálogo' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];
export const ALL_MODULES: ModuleId[] = MODULES.map((m) => m.id);

export const ROLE_PRESETS: { id: string; label: string; description: string; perms: ModuleId[] }[] = [
  { id: 'gerente', label: 'Gerente', description: 'Opera tudo, menos equipe e assinatura.', perms: [...ALL_MODULES] },
  { id: 'vendedor', label: 'Vendedor', description: 'Registra vendas e clientes e usa o catálogo.', perms: ['home', 'products', 'sales', 'clients', 'catalog'] },
  { id: 'estoquista', label: 'Estoquista', description: 'Cuida de produtos, entradas e saídas.', perms: ['home', 'products', 'stock', 'reports'] },
  { id: 'catalogo', label: 'Catálogo', description: 'Só cuida do catálogo online.', perms: ['home', 'catalog'] },
];

export function sanitizePerms(input: unknown): ModuleId[] {
  const list = Array.isArray(input) ? input : [];
  const set = new Set<ModuleId>(['home']);
  for (const p of list) if ((ALL_MODULES as string[]).includes(String(p))) set.add(p as ModuleId);
  return ALL_MODULES.filter((m) => set.has(m));
}
