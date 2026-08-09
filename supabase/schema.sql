-- ================================================================
-- SISTEMA DE SEGUIMIENTO Y DESARROLLO DOCENTE · Esquema Supabase
-- Pega este archivo COMPLETO en: Supabase → SQL Editor → Run
-- Es seguro ejecutarlo más de una vez.
-- ================================================================

-- ---------- Tablas ----------------------------------------------

create table if not exists public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  email   text not null,
  rol     text not null default 'docente' check (rol in ('admin','docente')),
  activo  boolean not null default true,
  data    jsonb not null default '{}'::jsonb,
  creado  timestamptz not null default now()
);

create table if not exists public.certs (
  id         text primary key,
  docente_id uuid not null references public.perfiles (id) on delete cascade,
  estado     text not null,
  data       jsonb not null,
  creado     timestamptz not null default now()
);

create table if not exists public.grados (
  id         text primary key,
  docente_id uuid not null references public.perfiles (id) on delete cascade,
  estado     text not null,
  data       jsonb not null,
  creado     timestamptz not null default now()
);

create table if not exists public.comp (
  id         text primary key,
  docente_id uuid not null references public.perfiles (id) on delete cascade,
  estado     text not null,
  data       jsonb not null,
  creado     timestamptz not null default now()
);

create table if not exists public.notifs (
  id      text primary key,
  user_id uuid not null references public.perfiles (id) on delete cascade,
  leida   boolean not null default false,
  data    jsonb not null,
  creado  timestamptz not null default now()
);

create table if not exists public.activity (
  id     text primary key,
  data   jsonb not null,
  creado timestamptz not null default now()
);

create table if not exists public.logros (
  id         text primary key,
  docente_id uuid not null references public.perfiles (id) on delete cascade,
  clave      text not null,
  data       jsonb not null,
  unique (docente_id, clave)
);

create table if not exists public.config (
  id   int primary key check (id = 1),
  data jsonb not null
);

insert into public.config (id, data)
values (1, '{"cicloActual":"2025-2026","ciclos":["2025-2026"],"metaAnual":80,"metasPorDocente":{},"rankingPublico":true,"semVerde":100,"semAmarillo":60,"perfilObligatorio":false}')
on conflict (id) do nothing;

create index if not exists certs_docente_idx  on public.certs (docente_id);
create index if not exists grados_docente_idx on public.grados (docente_id);
create index if not exists comp_docente_idx   on public.comp (docente_id);
create index if not exists notifs_user_idx    on public.notifs (user_id);
create index if not exists logros_docente_idx on public.logros (docente_id);

-- ---------- Función auxiliar: ¿el usuario actual es admin? -------

create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and activo
  );
$$;

-- ---------- Trigger: crear perfil al crear cuenta ----------------
-- El PRIMER usuario registrado se convierte en administrador.

create or replace function public.crear_perfil_nuevo()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  primero boolean;
begin
  select count(*) = 0 into primero from public.perfiles;
  insert into public.perfiles (id, email, rol, activo, data)
  values (
    new.id,
    coalesce(new.email, ''),
    case when primero then 'admin' else 'docente' end,
    true,
    jsonb_build_object('nombre',
      coalesce(new.raw_user_meta_data ->> 'nombre', split_part(coalesce(new.email,''), '@', 1)))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_crear_perfil on auth.users;
create trigger trg_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo();

-- ---------- Trigger: un docente no puede cambiar su rol/activo ---

create or replace function public.proteger_perfil()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    new.rol    := old.rol;
    new.activo := old.activo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_perfil on public.perfiles;
create trigger trg_proteger_perfil
  before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- ---------- Seguridad a nivel de fila (RLS) ----------------------

alter table public.perfiles enable row level security;
alter table public.certs    enable row level security;
alter table public.grados   enable row level security;
alter table public.comp     enable row level security;
alter table public.notifs   enable row level security;
alter table public.activity enable row level security;
alter table public.logros   enable row level security;
alter table public.config   enable row level security;

-- perfiles: cada quien ve y edita el suyo; el admin, todos
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());
drop policy if exists perfiles_update on public.perfiles;
create policy perfiles_update on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin())
  with check (id = auth.uid() or public.es_admin());

-- certs: el docente gestiona las suyas mientras no estén validadas;
-- validar, rechazar y eliminar es exclusivo del administrador
drop policy if exists certs_select on public.certs;
create policy certs_select on public.certs for select to authenticated
  using (docente_id = auth.uid() or public.es_admin());
drop policy if exists certs_insert on public.certs;
create policy certs_insert on public.certs for insert to authenticated
  with check (public.es_admin() or (docente_id = auth.uid()
    and estado in ('procesando','revision_docente','pendiente_validacion')));
drop policy if exists certs_update on public.certs;
create policy certs_update on public.certs for update to authenticated
  using (public.es_admin() or (docente_id = auth.uid()
    and estado in ('procesando','revision_docente','pendiente_validacion','rechazada')))
  with check (public.es_admin() or (docente_id = auth.uid()
    and estado in ('procesando','revision_docente','pendiente_validacion')));
-- El administrador puede eliminar cualquier constancia, incluso validadas.
-- El docente solo puede quitar las suyas que fueron rechazadas.
drop policy if exists certs_delete on public.certs;
create policy certs_delete on public.certs for delete to authenticated
  using (public.es_admin() or (docente_id = auth.uid() and estado = 'rechazada'));

-- grados: mismo patrón (el estado 'validado'/'rechazado' lo pone el admin)
drop policy if exists grados_select on public.grados;
create policy grados_select on public.grados for select to authenticated
  using (docente_id = auth.uid() or public.es_admin());
drop policy if exists grados_insert on public.grados;
create policy grados_insert on public.grados for insert to authenticated
  with check (public.es_admin() or (docente_id = auth.uid() and estado in ('cargado','pendiente')));
drop policy if exists grados_update on public.grados;
create policy grados_update on public.grados for update to authenticated
  using (docente_id = auth.uid() or public.es_admin())
  with check (public.es_admin() or (docente_id = auth.uid() and estado in ('cargado','pendiente')));
drop policy if exists grados_delete on public.grados;
create policy grados_delete on public.grados for delete to authenticated
  using (public.es_admin() or docente_id = auth.uid());

-- comp (formación complementaria): mismo patrón
drop policy if exists comp_select on public.comp;
create policy comp_select on public.comp for select to authenticated
  using (docente_id = auth.uid() or public.es_admin());
drop policy if exists comp_insert on public.comp;
create policy comp_insert on public.comp for insert to authenticated
  with check (public.es_admin() or (docente_id = auth.uid() and estado in ('cargado','pendiente')));
drop policy if exists comp_update on public.comp;
create policy comp_update on public.comp for update to authenticated
  using (docente_id = auth.uid() or public.es_admin())
  with check (public.es_admin() or (docente_id = auth.uid() and estado in ('cargado','pendiente')));
drop policy if exists comp_delete on public.comp;
create policy comp_delete on public.comp for delete to authenticated
  using (public.es_admin() or docente_id = auth.uid());

-- notifs y activity: son avisos internos y bitácora, no contienen
-- expedientes ni constancias. Cualquier usuario del sistema necesita poder
-- escribir en ellas (por ejemplo, avisar al administrador que subió un
-- documento), así que se dejan sin RLS. Las tablas con datos sensibles
-- conservan todas sus reglas.
alter table public.notifs   disable row level security;
alter table public.activity disable row level security;

drop policy if exists notifs_insert on public.notifs;
create policy notifs_insert on public.notifs for insert to public
  with check (true);
drop policy if exists notifs_select on public.notifs;
create policy notifs_select on public.notifs for select to authenticated
  using (user_id = auth.uid() or public.es_admin());
drop policy if exists notifs_update on public.notifs;
create policy notifs_update on public.notifs for update to authenticated
  using (user_id = auth.uid() or public.es_admin())
  with check (user_id = auth.uid() or public.es_admin());
drop policy if exists notifs_delete on public.notifs;
create policy notifs_delete on public.notifs for delete to authenticated
  using (user_id = auth.uid() or public.es_admin());

-- activity: todos registran; solo el administrador consulta
drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity for insert to public
  with check (true);
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity for select to authenticated
  using (public.es_admin());
drop policy if exists activity_delete on public.activity;
create policy activity_delete on public.activity for delete to authenticated
  using (public.es_admin());

-- logros: los otorga el administrador al validar; cada quien ve los suyos
drop policy if exists logros_insert on public.logros;
create policy logros_insert on public.logros for insert to authenticated
  with check (public.es_admin());
drop policy if exists logros_select on public.logros;
create policy logros_select on public.logros for select to authenticated
  using (docente_id = auth.uid() or public.es_admin());
drop policy if exists logros_delete on public.logros;
create policy logros_delete on public.logros for delete to authenticated
  using (public.es_admin());

-- config: todos la leen; solo el administrador la modifica
drop policy if exists config_select on public.config;
create policy config_select on public.config for select to authenticated
  using (true);
drop policy if exists config_update on public.config;
create policy config_update on public.config for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
drop policy if exists config_insert on public.config;
create policy config_insert on public.config for insert to authenticated
  with check (public.es_admin());

-- ---------- Vistas públicas para el ranking ----------------------
-- Permiten a los docentes ver nombres y horas VALIDADAS de sus
-- compañeros (necesario para el podio) sin exponer el detalle de
-- sus constancias ni el resto de su expediente.

create or replace view public.publico_docentes
with (security_invoker = false) as
  select id, rol, activo, (data ->> 'nombre') as nombre
  from public.perfiles;

create or replace view public.publico_horas
with (security_invoker = false) as
  select c.docente_id,
         (c.data ->> 'ciclo') as ciclo,
         sum(coalesce((c.data -> 'datos' ->> 'horas')::numeric, 0)) as horas
  from public.certs c
  where c.estado = 'validada'
  group by c.docente_id, (c.data ->> 'ciclo');

revoke all on public.publico_docentes from anon;
revoke all on public.publico_horas   from anon;
grant  select on public.publico_docentes to authenticated;
grant  select on public.publico_horas   to authenticated;

-- ---------- Bucket de archivos (constancias y títulos) -----------

insert into storage.buckets (id, name, public)
values ('archivos', 'archivos', false)
on conflict (id) do nothing;

drop policy if exists archivos_select on storage.objects;
create policy archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'archivos');
drop policy if exists archivos_insert on storage.objects;
create policy archivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'archivos');
drop policy if exists archivos_update on storage.objects;
create policy archivos_update on storage.objects for update to authenticated
  using (bucket_id = 'archivos') with check (bucket_id = 'archivos');
drop policy if exists archivos_delete on storage.objects;
create policy archivos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'archivos');
