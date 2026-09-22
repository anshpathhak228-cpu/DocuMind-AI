# DocuMind AI
Secure document storage + AI summarization + document-aware assistant.

## Stack
Next.js, React, TypeScript, Supabase Auth/Postgres/Storage/pgvector, OpenAI, Vercel.

## Setup
1. Install Node.js 20+.
2. `npm install`
3. Copy `.env.example` to `.env.local`.
4. Add Supabase URL + anon key.
5. Run `sql/schema.sql` in Supabase.
6. `npm run dev`

The source is structured for the next modules: OTP callback, document metadata, PDF/DOCX extraction, embeddings/RAG, AI summary modes, chat history, search, folders, tags, favorites, profile/settings, rate limiting and production hardening.

Never commit `.env.local` or API keys.