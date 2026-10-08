CREATE TABLE community_sources (
  id text PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('facebook', 'reddit')),
  scope text NOT NULL CHECK (scope IN ('neighbourhood', 'general')),
  name text NOT NULL,
  aliases text[] NOT NULL,
  alias_keys text[] NOT NULL,
  neighbourhood_ids text[] NOT NULL DEFAULT '{}',
  url text,
  canonical_url text,
  status text NOT NULL CHECK (status IN ('ordered_unverified', 'missing_url', 'configured', 'verified')),
  provenance jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_sources_aliases_idx ON community_sources USING gin (alias_keys);
CREATE INDEX community_sources_scope_idx ON community_sources (scope, platform);
