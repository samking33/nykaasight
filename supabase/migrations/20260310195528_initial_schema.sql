-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Datasets table
CREATE TABLE datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  columns jsonb NOT NULL,
  row_count int NOT NULL,
  user_session text,
  created_at timestamptz DEFAULT now()
);

-- Chat sessions
CREATE TABLE chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz DEFAULT now()
);

-- Chat messages
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  chart_config jsonb,
  created_at timestamptz DEFAULT now()
);

-- Vector embeddings table
CREATE TABLE embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE,
  content_type text CHECK (content_type IN ('chart_config', 'data_chunk', 'insight')),
  content text NOT NULL,
  metadata jsonb,
  embedding vector(1024),
  created_at timestamptz DEFAULT now()
);

-- Vector similarity search index
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RPC function for similarity search
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1024),
  match_dataset_id uuid,
  match_count int DEFAULT 5
)
RETURNS TABLE(id uuid, content text, content_type text, metadata jsonb, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT id, content, content_type, metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM embeddings
  WHERE dataset_id = match_dataset_id
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Dashboard snapshots
CREATE TABLE dashboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE,
  title text NOT NULL,
  chart_configs jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
