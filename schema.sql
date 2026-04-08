-- =========================================================
-- MAGIC DRAFT TOURNAMENT — Schema Supabase
-- Incolla questo nell'SQL Editor di Supabase ed eseguilo
-- =========================================================

-- Tabella tornei
create table if not exists public.tournaments (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  player_count integer not null,
  total_rounds integer not null
);

-- Classifica finale di ogni torneo
create table if not exists public.tournament_standings (
  id uuid default gen_random_uuid() primary key,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  position integer not null,
  player_name text not null,
  points integer default 0,
  wins integer default 0,
  losses integer default 0,
  draws integer default 0,
  games_won integer default 0,
  games_lost integer default 0,
  omwp real default 0
);

-- Turni di ogni torneo
create table if not exists public.tournament_rounds (
  id uuid default gen_random_uuid() primary key,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  round_number integer not null
);

-- Incontri di ogni turno
create table if not exists public.tournament_matches (
  id uuid default gen_random_uuid() primary key,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  round_id uuid references public.tournament_rounds(id) on delete cascade,
  round_number integer not null,
  player1_name text not null,
  player2_name text,
  score_p1 integer,
  score_p2 integer,
  is_bye boolean default false
);

-- =========================================================
-- Row Level Security (RLS)
-- =========================================================

alter table public.tournaments enable row level security;
alter table public.tournament_standings enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.tournament_matches enable row level security;

-- Lettura pubblica per tutti
create policy "Lettura pubblica tornei"
  on public.tournaments for select using (true);
create policy "Lettura pubblica standings"
  on public.tournament_standings for select using (true);
create policy "Lettura pubblica rounds"
  on public.tournament_rounds for select using (true);
create policy "Lettura pubblica matches"
  on public.tournament_matches for select using (true);

-- Scrittura anonima (l'app salva i dati)
create policy "Inserimento anonimo tornei"
  on public.tournaments for insert with check (true);
create policy "Inserimento anonimo standings"
  on public.tournament_standings for insert with check (true);
create policy "Inserimento anonimo rounds"
  on public.tournament_rounds for insert with check (true);
create policy "Inserimento anonimo matches"
  on public.tournament_matches for insert with check (true);

-- Cancellazione anonima (per l'admin, protetta lato client da password)
create policy "Cancellazione anonima tornei"
  on public.tournaments for delete using (true);
