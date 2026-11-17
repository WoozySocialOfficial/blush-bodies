create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'instructor')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.workspace_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  role text not null default 'instructor' check (role in ('instructor')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);

create index workspace_members_user_id_idx
  on public.workspace_members(user_id);
create index workspace_invites_workspace_id_idx
  on public.workspace_invites(workspace_id);

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.shares_workspace(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_state enable row level security;
alter table public.workspace_invites enable row level security;

create policy "Profiles are visible to workspace teammates"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_workspace(id));
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Members can view workspaces"
  on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy "Owners can update workspaces"
  on public.workspaces for update to authenticated
  using (public.is_workspace_owner(id))
  with check (public.is_workspace_owner(id));

create policy "Members can view memberships"
  on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "Owners can manage memberships"
  on public.workspace_members for all to authenticated
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

create policy "Members can read workspace state"
  on public.workspace_state for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Owners can view invites"
  on public.workspace_invites for select to authenticated
  using (public.is_workspace_owner(workspace_id));
create policy "Owners can create invites"
  on public.workspace_invites for insert to authenticated
  with check (
    public.is_workspace_owner(workspace_id) and created_by = auth.uid()
  );
create policy "Owners can remove invites"
  on public.workspace_invites for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  insert into public.workspaces (name, created_by)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'workspace_name', ''), 'My Workspace'),
    new.id
  )
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  insert into public.workspace_state (workspace_id, updated_by)
  values (new_workspace_id, new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.save_workspace_state(
  p_workspace_id uuid,
  p_expected_revision bigint,
  p_data jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_revision bigint;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access denied';
  end if;

  update public.workspace_state
  set data = p_data,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where workspace_id = p_workspace_id
    and revision = p_expected_revision
  returning revision into next_revision;

  if next_revision is null then
    raise exception 'Workspace changed on another device';
  end if;
  return next_revision;
end;
$$;

create or replace function public.accept_workspace_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_invite public.workspace_invites%rowtype;
begin
  select * into selected_invite
  from public.workspace_invites
  where token = p_token
    and accepted_at is null
    and expires_at > now()
  for update;

  if selected_invite.id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (selected_invite.workspace_id, auth.uid(), selected_invite.role)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role;

  update public.workspace_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = selected_invite.id;

  return selected_invite.workspace_id;
end;
$$;

revoke all on function public.save_workspace_state(uuid, bigint, jsonb) from public;
revoke all on function public.accept_workspace_invite(text) from public;
grant execute on function public.save_workspace_state(uuid, bigint, jsonb) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
