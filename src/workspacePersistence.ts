export type WorkspaceSaveStatus = "saving" | "saved" | "error";

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
