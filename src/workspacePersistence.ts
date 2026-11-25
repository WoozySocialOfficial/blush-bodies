export type WorkspaceSaveStatus = "saving" | "saved" | "error";

export type WorkspaceSync = { workspaceId: string; revision: number; pending: boolean };

export const readWorkspaceSync = (value: string | null): WorkspaceSync | undefined => {
  if (!value) return undefined;
  try {
    const record = JSON.parse(value) as Partial<WorkspaceSync> | null;
    if (record && typeof record.workspaceId === "string" && typeof record.revision === "number" &&
        Number.isSafeInteger(record.revision) && record.revision >= 0 && typeof record.pending === "boolean")
      return { workspaceId: record.workspaceId, revision: record.revision, pending: record.pending };
  } catch {
    return undefined;
  }
};

export const workspaceErrorMessage = (error: unknown) =>
  error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : "";

export const enqueueWorkspaceSave = ({
  previous,
  write,
  key,
  value,
  generation,
  latestGeneration,
  updateStatus,
}: {
  previous: Promise<void>;
  write: (key: string, value: string) => Promise<void>;
  key: string;
  value: string;
  generation: number;
  latestGeneration: () => number;
  updateStatus: (status: WorkspaceSaveStatus) => void;
}) => {
  updateStatus("saving");
  const task = previous.then(() => write(key, value));
  const chain = task.catch(() => undefined);
  void task.then(() => {
    if (generation === latestGeneration()) updateStatus("saved");
  }).catch(() => {
    if (generation === latestGeneration()) updateStatus("error");
  });
  return { task, chain };
};
