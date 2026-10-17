import type { ModuleId } from './perms';

export type StoreStatus = 'active' | 'blocked';
export type AccessState = 'active' | 'blocked' | 'expired';

export interface Store {
  id: string;
  name: string;
  slug: string;
  status: StoreStatus;
  plan: string;
  max_users: number;
  max_products: number | null;
  expires_at: string | null;
  owner_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  store_id: string;
  role: 'owner' | 'staff';
  perms: ModuleId[];
  display_name: string;
  store: Store;
}

export interface AdminStore extends Store {
  owner_email: string | null;
  owner_last_sign_in_at: string | null;
  member_count: number;
  product_count: number;
  sale_count: number;
  last_activity_at: string | null;
}

export interface TeamMember {
  store_id: string;
  user_id: string;
  role: 'owner' | 'staff';
  perms: ModuleId[];
  display_name: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface AuditEntry {
  id: number;
  store_id: string | null;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export function accessState(store: Pick<Store, 'status' | 'expires_at'>, now = Date.now()): AccessState {
  if (store.status === 'blocked') return 'blocked';
  if (store.expires_at && new Date(store.expires_at).getTime() <= now) return 'expired';
  return 'active';
}

export function daysLeft(expiresAt: string | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
}
