# DocuMind AI — Production Update

This update turns the starter into a working document-processing/RAG foundation.

## Implemented
- Email OTP sign-in and OTP verification
- Protected dashboard/upload/assistant routes
- Private Supabase Storage
- Upload validation and 15 MB limit
- PDF, DOCX, TXT, CSV, XLSX and PPTX text extraction
- Document metadata + extracted text
- Chunking and OpenAI embeddings
- pgvector similarity search with user isolation
- AI document summary
- Document-aware AI chat
- Favorites, search and delete
- Updated Next.js security version

## Required environment variables
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-5.6-luna
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

## Supabase
Run `sql/schema.sql` in Supabase SQL Editor once.

## Important
Never commit `.env.local` or API keys. Keep `OPENAI_API_KEY` server-side only.
