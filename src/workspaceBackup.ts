export const WORKSPACE_BACKUP_FORMAT = "blush-bodies-workspace-backup";
export const WORKSPACE_BACKUP_VERSION = 1;

type BackupAccount = {
  email: string;
  role: string;
};

type BackupEnvelope = {
  format: typeof WORKSPACE_BACKUP_FORMAT;
  version: typeof WORKSPACE_BACKUP_VERSION;
  exportedAt: string;
  workspace: Record<string, unknown>;
};

export type WorkspaceBackupErrorCode =
  | "invalid-json"
  | "unsupported"
  | "wrong-account"
  | "invalid-workspace";

export class WorkspaceBackupError extends Error {
  readonly code: WorkspaceBackupErrorCode;

  constructor(
    code: WorkspaceBackupErrorCode,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "WorkspaceBackupError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string =>
  typeof value === "string";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isPlan = (value: unknown) =>
  isRecord(value) &&
  isString(value.id) &&
  isRecord(value.brief) &&
  isString(value.brief.program) &&
  isString(value.brief.week) &&
  isString(value.brief.day) &&
  Array.isArray(value.movements);

const isScheduleSlot = (value: unknown) =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.date) &&
  isString(value.time) &&
  isString(value.status);

const isSession = (value: unknown) =>
  isRecord(value) &&
  isFiniteNumber(value.startedAt) &&
  isFiniteNumber(value.endedAt) &&
  isFiniteNumber(value.completed) &&
  isFiniteNumber(value.total);

const isBase64 = (value: string) =>
  value.length > 0 &&
  value.length % 4 === 0 &&
  /^[A-Za-z0-9+/]*={0,2}$/.test(value);

const isBackupImage = (value: unknown) =>
  isRecord(value) &&
  isString(value.fileName) &&
  value.fileName.length > 0 &&
  value.fileName.length <= 255 &&
  isString(value.base64) &&
  isBase64(value.base64);

const isLibraryMovement = (value: unknown) =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.position) &&
  isFiniteNumber(value.duration) &&
  Array.isArray(value.cues) &&
  (value.backupImage === undefined || isBackupImage(value.backupImage));

const isRecentlyDeletedItem = (value: unknown) => {
  if (!isRecord(value) || !isString(value.id) || !isString(value.kind))
    return false;
  if (!isFiniteNumber(value.deletedAt)) return false;
  if (value.kind === "movement") return isLibraryMovement(value.movement);
  if (value.kind === "draft" || value.kind === "plan")
    return isPlan(value.plan) && Array.isArray(value.assignments);
  return false;
};

const isPreferences = (value: unknown) =>
  isRecord(value) &&
  (value.teachingMode === "Guided" || value.teachingMode === "Minimal") &&
  typeof value.vibration === "boolean" &&
  typeof value.countdownSound === "boolean" &&
  typeof value.completionSound === "boolean";

const isWorkspace = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  isRecord(value.account) &&
  isString(value.account.email) &&
  isString(value.account.role) &&
  isPlan(value.plan) &&
  typeof value.hasActiveDraft === "boolean" &&
  Array.isArray(value.savedPlans) &&
  value.savedPlans.every(isPlan) &&
  Array.isArray(value.sessionHistory) &&
  value.sessionHistory.every(isSession) &&
  Array.isArray(value.schedule) &&
  value.schedule.every(isScheduleSlot) &&
  Array.isArray(value.libraryMovements) &&
  value.libraryMovements.every(isLibraryMovement) &&
  Array.isArray(value.deletedMovementIds) &&
  value.deletedMovementIds.every(isString) &&
  Array.isArray(value.recentlyDeleted) &&
  value.recentlyDeleted.every(isRecentlyDeletedItem) &&
  Array.isArray(value.favourites) &&
  value.favourites.every(isString) &&
  isPreferences(value.instructorPreferences);

export const parseWorkspaceBackup = <T>(
  raw: string,
  expectedAccount: BackupAccount,
): T => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WorkspaceBackupError(
      "invalid-json",
      "The selected file is not a readable Blush Bodies backup.",
    );
  }

  if (
    !isRecord(parsed) ||
    parsed.format !== WORKSPACE_BACKUP_FORMAT ||
    parsed.version !== WORKSPACE_BACKUP_VERSION
  )
    throw new WorkspaceBackupError(
      "unsupported",
      "This backup version is not supported by this app.",
    );

  if (!isWorkspace(parsed.workspace))
    throw new WorkspaceBackupError(
      "invalid-workspace",
      "This backup is incomplete or damaged.",
    );

  const backupAccount = parsed.workspace.account as BackupAccount;
  if (
    backupAccount.email.toLowerCase() !== expectedAccount.email.toLowerCase() ||
    backupAccount.role !== expectedAccount.role
  )
    throw new WorkspaceBackupError(
      "wrong-account",
      "This backup belongs to a different account.",
    );

  return parsed.workspace as T;
};

export const createWorkspaceBackupEnvelope = <T>(workspace: T): BackupEnvelope => ({
  format: WORKSPACE_BACKUP_FORMAT,
  version: WORKSPACE_BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  workspace: workspace as Record<string, unknown>,
});

export const safeBackupImageFileName = (
  fileName: string,
  fallbackId: string,
) => {
  const safe = fileName
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .slice(0, 120);
  if (safe && safe !== ".") return safe;
  const fallback = fallbackId.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80);
  return `${fallback || "movement"}.jpg`;
};
