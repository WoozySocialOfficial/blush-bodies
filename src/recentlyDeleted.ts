export const RECENTLY_DELETED_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type DeletedAtRecord = { deletedAt: number };

export const recentlyDeletedExpiresAt = (deletedAt: number) =>
  deletedAt + RECENTLY_DELETED_RETENTION_DAYS * DAY_MS;

export const isRecentlyDeletedActive = (
  item: DeletedAtRecord,
  now = Date.now(),
) => recentlyDeletedExpiresAt(item.deletedAt) > now;

export const pruneRecentlyDeleted = <T extends DeletedAtRecord>(
  items: T[],
  now = Date.now(),
) => items.filter((item) => isRecentlyDeletedActive(item, now));

export const recentlyDeletedDaysRemaining = (
  deletedAt: number,
  now = Date.now(),
) =>
  Math.max(
    0,
    Math.ceil((recentlyDeletedExpiresAt(deletedAt) - now) / DAY_MS),
  );

type RestorableScheduleSlot = {
  id: string;
  status: string;
  planId?: string;
};

export const restoreScheduleAssignments = <T extends RestorableScheduleSlot>(
  schedule: T[],
  assignments: Array<{ id: string; status: T["status"] }>,
  planId?: string,
): T[] =>
  schedule.map((slot) => {
    const assignment = assignments.find((candidate) => candidate.id === slot.id);
    if (!assignment || slot.planId) return slot;
    return {
      ...slot,
      status: assignment.status,
      ...(planId ? { planId } : {}),
    };
  });
