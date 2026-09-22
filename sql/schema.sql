create extension if not exists vector;

create table if not exists public.documents(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 file_name text not null,file_type text not null,file_size bigint not null default 0,
 storage_path text not null,extracted_text text,summary text,
 is_favorite boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.folders(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,created_at timestamptz not null default now()
);

create table if not exists public.document_chunks(
 id bigint generated always as identity primary key,
 document_id uuid not null references public.documents(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 chunk_index int not null,content text not null,
 embedding vector(1536) not null,created_at timestamptz not null default now()
);

create index if not exists document_chunks_hnsw on public.document_chunks using hnsw (embedding vector_cosine_ops);

alter table public.documents enable row level security;
alter table public.folders enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists "documents owner" on public.documents;
create policy "documents owner" on public.documents for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "folders owner" on public.folders;
create policy "folders owner" on public.folders for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "chunks owner" on public.document_chunks;
create policy "chunks owner" on public.document_chunks for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create or replace function public.match_document_chunks(
 query_embedding vector(1536),match_threshold float,match_count int
)
returns table(id bigint,document_id uuid,file_name text,content text,similarity float)
language sql stable security invoker
as $$
 select c.id,c.document_id,d.file_name,c.content,
        1-(c.embedding <=> query_embedding) as similarity
 from public.document_chunks c
 join public.documents d on d.id=c.document_id
 where c.user_id=auth.uid()
   and 1-(c.embedding <=> query_embedding)>=match_threshold
 order by c.embedding <=> query_embedding
 limit least(match_count,20);
$$;

insert into storage.buckets(id,name,public)
values('documents','documents',false)
on conflict(id) do nothing;

drop policy if exists "storage read own" on storage.objects;
create policy "storage read own" on storage.objects for select
using(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "storage insert own" on storage.objects;
create policy "storage insert own" on storage.objects for insert
with check(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "storage update own" on storage.objects;
create policy "storage update own" on storage.objects for update
using(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "storage delete own" on storage.objects;
create policy "storage delete own" on storage.objects for delete
using(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);
