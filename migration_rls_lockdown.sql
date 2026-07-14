-- Ejecutar una sola vez en Supabase → SQL Editor.
--
-- Problema que cierra: hoy cualquiera con la anon key pública (visible en
-- app.js, la usa el propio front) puede leer y modificar preguntas/exam_configs/
-- activity_log/practice_sessions directamente por la API REST de Supabase,
-- SIN loguearse — el login que ves en pantalla es solo una puerta del front,
-- no algo que la base de datos exija. Se confirmó con un curl sin sesión.
--
-- Qué hace este script:
--   1. Borra cualquier política existente en estas 4 tablas (para no dejar
--      una política vieja demasiado permisiva conviviendo con las nuevas —
--      en Postgres, políticas del mismo tipo se combinan con OR).
--   2. Activa Row Level Security en las 4 tablas.
--   3. Crea políticas que reflejan exactamente cómo la app usa cada tabla hoy
--      (revisado línea por línea en app.js):
--        - preguntas:        cualquier usuario logueado LEE todo el banco;
--                             solo el auditor (profiles.is_admin) inserta/
--                             edita/borra.
--        - exam_configs:     cualquier usuario logueado LEE (para ver qué
--                             exámenes hay disponibles); solo el auditor
--                             escribe.
--        - activity_log:     solo el auditor lee y escribe (es su historial
--                             editorial).
--        - practice_sessions: cada usuario lee/inserta sus propias sesiones
--                             (comparadas por profiles.display_name, que es
--                             como se guardan hoy); el auditor además puede
--                             leer las de todos ("Resultados por persona").
--
-- Nota: la migración de flags heredados de localStorage (migrateLocalFlags,
-- un puente de una sola vez para navegadores con datos muy viejos) deja de
-- poder escribir en `preguntas.status` para usuarios no-auditores. No rompe
-- nada visible — solo falla en silencio (console.error) para ese caso ya
-- residual; si algún usuario normal tuviera flags viejos sin migrar, pídele
-- al auditor que temporalmente revise su caso.

begin;

do $$
declare pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('preguntas', 'exam_configs', 'activity_log', 'practice_sessions')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table public.preguntas         enable row level security;
alter table public.exam_configs      enable row level security;
alter table public.activity_log      enable row level security;
alter table public.practice_sessions enable row level security;

-- preguntas ------------------------------------------------------------
create policy "preguntas_select_authenticated" on public.preguntas
  for select to authenticated using (true);

create policy "preguntas_insert_admin" on public.preguntas
  for insert to authenticated with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

create policy "preguntas_update_admin" on public.preguntas
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true));

create policy "preguntas_delete_admin" on public.preguntas
  for delete to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

-- exam_configs ---------------------------------------------------------
create policy "exam_configs_select_authenticated" on public.exam_configs
  for select to authenticated using (true);

create policy "exam_configs_insert_admin" on public.exam_configs
  for insert to authenticated with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

create policy "exam_configs_update_admin" on public.exam_configs
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true));

create policy "exam_configs_delete_admin" on public.exam_configs
  for delete to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

-- activity_log -----------------------------------------------------------
create policy "activity_log_select_admin" on public.activity_log
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

create policy "activity_log_insert_admin" on public.activity_log
  for insert to authenticated with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

-- practice_sessions ------------------------------------------------------
create policy "practice_sessions_select_own_or_admin" on public.practice_sessions
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and (p.display_name = practice_sessions.user_name or p.is_admin = true)
    )
  );

create policy "practice_sessions_insert_own" on public.practice_sessions
  for insert to authenticated with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.display_name = practice_sessions.user_name
    )
  );

commit;
