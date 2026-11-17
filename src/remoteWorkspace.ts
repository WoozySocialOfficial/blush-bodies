import { requireSupabase } from "./supabase";

export type WorkspaceRole = "owner" | "instructor";

export type RemoteWorkspace = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

export type RemoteWorkspaceState<T> = {
  data: T;
  revision: number;
  updatedAt: string;
};

export const listRemoteWorkspaces = async (): Promise<RemoteWorkspace[]> => {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workspace_members")
    .select("role, workspaces!inner(id, name)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((membership) => {
    const workspace = membership.workspaces as unknown as {
      id: string;
      name: string;
    };
    return {
      id: workspace.id,
      name: workspace.name,
      role: membership.role as WorkspaceRole,
    };
  });
};

export const loadRemoteWorkspaceState = async <T>(
  workspaceId: string,
): Promise<RemoteWorkspaceState<T>> => {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workspace_state")
    .select("data, revision, updated_at")
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw error;
  return {
    data: data.data as T,
    revision: Number(data.revision),
    updatedAt: data.updated_at,
  };
};

export const saveRemoteWorkspaceState = async <T>(
  workspaceId: string,
  expectedRevision: number,
  data: T,
): Promise<number> => {
  const client = requireSupabase();
  const { data: revision, error } = await client.rpc("save_workspace_state", {
    p_workspace_id: workspaceId,
    p_expected_revision: expectedRevision,
    p_data: data,
  });
  if (error) throw error;
  return Number(revision);
};

export const acceptWorkspaceInvite = async (
  inviteCode: string,
): Promise<string> => {
  const client = requireSupabase();
  const { data, error } = await client.rpc("accept_workspace_invite", {
    p_token: inviteCode.trim(),
  });
  if (error) throw error;
  return String(data);
};
