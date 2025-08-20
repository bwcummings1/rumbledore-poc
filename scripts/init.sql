-- PostgreSQL initialization script for Rumbledore
-- Creates required extensions for the application

-- UUID support for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Vector support for AI embeddings (1536 dimensions for OpenAI)
CREATE EXTENSION IF NOT EXISTS "vector";

-- Trigram support for fuzzy text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- B-tree GiST support for advanced indexing
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Create application user if not exists (for production use)
-- Note: In development, we use the rumbledore_dev user from docker-compose