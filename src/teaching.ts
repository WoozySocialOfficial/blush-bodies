export const countdownCueSecond = (
  remainingSeconds: number,
  previousCueSecond: number | null,
  enabled: boolean,
) =>
  enabled &&
  remainingSeconds >= 1 &&
  remainingSeconds <= 3 &&
  remainingSeconds !== previousCueSecond
    ? remainingSeconds
    : null;

type TimedMovement = { duration: number };
type TeachingPosition = {
  movementIndex: number;
  remainingSeconds: number;
  held: boolean;
  savedAt: number;
};

type MovementPosition = Pick<TeachingPosition, "movementIndex" | "remainingSeconds">;

export const teachingTimeRemaining = (
  { movementIndex, remainingSeconds }: MovementPosition,
  movements: TimedMovement[],
) => ({
  movementSeconds: remainingSeconds,
  classSeconds: movements
    .slice(movementIndex + 1)
    .reduce((total, movement) => total + movement.duration, remainingSeconds),
});

export const advanceTeachingPosition = (
  position: MovementPosition,
  movements: TimedMovement[],
  elapsedSeconds: number,
): MovementPosition => {
  let { movementIndex, remainingSeconds } = position;
  while (elapsedSeconds >= remainingSeconds) {
    if (movementIndex === movements.length - 1) return { movementIndex, remainingSeconds: 0 };
    elapsedSeconds -= remainingSeconds;
    movementIndex += 1;
    remainingSeconds = Math.max(1, movements[movementIndex].duration);
  }
  return { movementIndex, remainingSeconds: remainingSeconds - elapsedSeconds };
};

export const recoverTeachingPosition = (
  session: TeachingPosition,
  movements: TimedMovement[],
  now = Date.now(),
) => {
  if (!movements.length) return { movementIndex: 0, remainingSeconds: 0 };
  const movementIndex = Math.max(
    0,
    Math.min(movements.length - 1, Math.floor(session.movementIndex)),
  );
  const remainingSeconds = Math.max(0, session.remainingSeconds);
  const elapsedSeconds = session.held
    ? 0
    : Math.max(0, Math.floor((now - session.savedAt) / 1000));

  return advanceTeachingPosition({ movementIndex, remainingSeconds }, movements, elapsedSeconds);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isRecoverableTeachingSession = (value: unknown) => {
  if (!isRecord(value) || !isRecord(value.plan)) return false;
  const movements = value.plan.movements;
  const validShape =
    typeof value.plan.id === "string" &&
    isRecord(value.plan.brief) &&
    typeof value.plan.brief.program === "string" &&
    Array.isArray(movements) &&
    movements.length > 0 &&
    movements.every(
      (movement) =>
        isRecord(movement) &&
        typeof movement.id === "string" &&
        typeof movement.title === "string" &&
        isFiniteNumber(movement.duration) &&
        movement.duration > 0,
    ) &&
    isFiniteNumber(value.startedAt) &&
    value.startedAt > 0 &&
    isFiniteNumber(value.savedAt) &&
    value.savedAt > 0 &&
    isFiniteNumber(value.movementIndex) &&
    Number.isInteger(value.movementIndex) &&
    value.movementIndex >= 0 &&
    isFiniteNumber(value.remainingSeconds) &&
    value.remainingSeconds >= 0 &&
    typeof value.held === "boolean";
  if (!validShape || !Array.isArray(movements)) return false;
  const movementIndex = value.movementIndex as number;
  const remainingSeconds = value.remainingSeconds as number;
  const currentMovement = movements[movementIndex];
  return (
    isRecord(currentMovement) &&
    isFiniteNumber(currentMovement.duration) &&
    remainingSeconds <= currentMovement.duration
  );
};
