create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleting_user_id uuid := auth.uid();
  deleting_email text;
  workspace record;
  next_owner_id uuid;
begin
  if deleting_user_id is null or not exists (
    select 1 from auth.sessions
    where id = (auth.jwt() ->> 'session_id')::uuid
      and user_id = deleting_user_id
  ) then
    raise exception 'Sign in to delete your account' using errcode = '28000';
  end if;

  select lower(email) into deleting_email
  from auth.users where id = deleting_user_id;

  -- Keep shared workspaces before the creator's foreign key cascades.
  for workspace in
    select w.id, w.created_by
    from public.workspaces w
    where w.created_by = deleting_user_id or exists (
      select 1 from public.workspace_members m
      where m.workspace_id = w.id and m.user_id = deleting_user_id and m.role = 'owner'
    )
    order by w.id
    for update of w
  loop
    select user_id into next_owner_id
    from public.workspace_members
    where workspace_id = workspace.id and user_id <> deleting_user_id
    order by (role = 'owner') desc, created_at, user_id
    limit 1
    for update;

    if next_owner_id is not null then
      update public.workspace_members
      set role = 'owner'
      where workspace_id = workspace.id and user_id = next_owner_id and role <> 'owner';

      update public.workspaces
      set created_by = next_owner_id, updated_at = now()
      where id = workspace.id and created_by = deleting_user_id;
    end if;
  end loop;

  -- Older snapshots include an account profile alongside the workspace data.
  -- Keep the account field so the app still loads the saved plans and schedule.
  update public.workspace_state
  set data = jsonb_set(data, '{account}', '{}'::jsonb),
      revision = revision + 1,
      updated_at = now()
  where jsonb_typeof(data -> 'account') = 'object'
    and (lower(data #>> '{account,email}') = deleting_email or updated_by = deleting_user_id);

  delete from auth.users where id = deleting_user_id;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
