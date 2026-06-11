-- pgvector must exist before any vector columns land (AI memory, embeddings).
-- Created in the first migration so fresh volumes work without manual setup.
CREATE EXTENSION IF NOT EXISTS vector;
