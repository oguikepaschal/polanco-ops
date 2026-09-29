-- Per-IP rate limit for the public showcase enquiry endpoint
-- (app/api/leads/create-from-showcase). The existing per-phone limit is
-- bypassed by rotating phone numbers; lib/showcase/rateLimiter.ts now also
-- counts recent website leads by client IP.
--
-- Stored as a SHA-256 hex digest, never the raw address. Nullable: staff-created
-- leads and rows from before this migration have no IP.
alter table public.leads add column if not exists ip_hash text;

-- Serves the limiter's "recent rows for this ip_hash" count. Partial, since
-- only website leads ever carry a hash.
create index if not exists leads_ip_hash_created_at_idx
  on public.leads (ip_hash, created_at)
  where ip_hash is not null;
