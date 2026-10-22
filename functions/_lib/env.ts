export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  WEBHOOK_SECRET?: string;
  /** Domínio público do bucket R2 (opcional). Sem ele, as fotos saem por /media/. */
  MEDIA_PUBLIC_URL?: string;
  /** Bucket R2 das fotos. */
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
}
