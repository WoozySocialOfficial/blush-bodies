alter table public.workspaces
  drop constraint if exists workspaces_created_by_fkey;

alter table public.workspaces
  add constraint workspaces_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.workspace_state
  drop constraint if exists workspace_state_updated_by_fkey;

alter table public.workspace_state
  add constraint workspace_state_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.workspace_invites
  drop constraint if exists workspace_invites_created_by_fkey;

alter table public.workspace_invites
  add constraint workspace_invites_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.workspace_invites
  drop constraint if exists workspace_invites_accepted_by_fkey;

alter table public.workspace_invites
  add constraint workspace_invites_accepted_by_fkey
  foreign key (accepted_by) references auth.users(id) on delete set null;
