-- Persistent normalized posts with provenance, plus benchmark bookkeeping.
-- 'simple' text search config: no Croatian stemming exists in stock PostgreSQL.
-- text_folded is computed by the application (diacritics folded) because unaccent() is not IMMUTABLE.
CREATE TABLE posts (
  id bigserial PRIMARY KEY,
  corpus text NOT NULL DEFAULT 'main',
  source text NOT NULL CHECK (source IN ('reddit', 'facebook', 'user')),
  record_kind text NOT NULL CHECK (record_kind IN ('synthetic', 'live_imported', 'user_contributed')),
  external_id text NOT NULL,
  kind text NOT NULL DEFAULT 'unknown' CHECK (kind IN ('request', 'offer', 'unknown')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  text_folded text NOT NULL,
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', text_folded)) STORED,
  city text,
  city_key text,
  neighbourhood_id text,
  price_eur numeric(12, 2) CHECK (price_eur IS NULL OR price_eur >= 0),
  posted_at timestamptz,
  expires_at timestamptz,
  url text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corpus, source, external_id)
);
CREATE INDEX posts_search_gin ON posts USING gin (search);
CREATE INDEX posts_filter_idx ON posts (corpus, kind, city_key);
CREATE INDEX posts_expires_idx ON posts (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX posts_price_idx ON posts (corpus, price_eur) WHERE price_eur IS NOT NULL;

CREATE TABLE benchmark_queries (
  corpus text NOT NULL,
  query_id text NOT NULL,
  query jsonb NOT NULL,
  labels jsonb NOT NULL,          -- {external_id: 0|1|2}; unlisted ids are 0 when labels_complete
  labels_complete boolean NOT NULL DEFAULT true,
  PRIMARY KEY (corpus, query_id)
);

CREATE TABLE benchmark_runs (
  id bigserial PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('dry_run', 'live')),
  corpus text NOT NULL,
  config jsonb NOT NULL,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE benchmark_scores (
  run_id bigint NOT NULL REFERENCES benchmark_runs (id) ON DELETE CASCADE,
  query_id text NOT NULL,
  post_id bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  outcome text NOT NULL,
  score double precision,
  confidence double precision,
  probabilities jsonb,
  input_tokens integer,
  output_tokens integer,
  latency_ms double precision,
  PRIMARY KEY (run_id, query_id, post_id)
);
CREATE INDEX benchmark_scores_post_idx ON benchmark_scores (post_id);
