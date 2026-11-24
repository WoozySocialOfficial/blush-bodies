export type Phase = "Warm-up" | "Main" | "Cool-down";
export type SequenceMode = "auto" | "manual";
export type SideSelection = "both" | "left" | "right";
export type WorkingSide = "left" | "right" | "alternating";
export type ClassLevel = "Beginner" | "Intermediate" | "Advanced";
export const MOVEMENT_DURATION_SECONDS = 75;
const MAX_FITTED_CARD_SECONDS = 5 * 60;
export type PlanBrief = {
  program: string;
  level?: ClassLevel;
  week: string;
  day: string;
  scheduledDate?: string;
  scheduledTime?: string;
  energy: string;
  equipment: string[];
};
export type PlanMovement = {
  id: string;
  sourceMovementId?: string;
  imageUri?: string;
  side?: WorkingSide;
  requiresPair?: boolean;
  pairId?: string;
  title: string;
  position: string;
  duration: number;
  phase: Phase;
  cue: string;
};
export type ClassPlan = {
  id: string;
  version: number;
  brief: PlanBrief;
  movements: PlanMovement[];
  status: "draft" | "saved";
  sequenceMode?: SequenceMode;
};
export type LibraryMovement = {
  id: string;
  name: string;
  imageUri?: string;
  position: string;
  level: string;
  equipment: string;
  duration: number;
  cues: string[];
  phases?: Phase[];
  sideMode?: "together" | "paired" | "alternating";
  reviewStatus?: "needs-review" | "reviewed";
  reviewedBy?: string;
  reviewedAt?: number;
  catalogueVersion?: string;
  aliases?: string[];
  mainLevel?: string;
  manual?: {
    document: string;
    pages: number[];
    units: string[];
    coverage: "detailed" | "reference-only";
    classification: "standard" | "restricted";
    levelNote: string;
    setup?: string;
    movement?: string;
    watchPoints?: string;
    progressions?: string;
    regressions?: string;
    variations?: string;
    additionalWatchPoints?: string;
    muscles?: string;
    purpose?: string;
    notes: string[];
  };
};

export const mergeLibraryCatalog = (
  catalog: LibraryMovement[],
  stored: LibraryMovement[],
  deletedMovementIds: string[] = [],
  retiredMovementIds: string[] = [],
) => {
  const deleted = new Set(deletedMovementIds);
  const retired = new Set(retiredMovementIds);
  // An instructor-edited sample is personal work, even when its bundled default is retired.
  const availableStored = stored.filter((movement) => !deleted.has(movement.id) &&
    (!retired.has(movement.id) || !!movement.reviewedBy));
  const existing = new Set(availableStored.map((movement) => movement.id));
  return [
    ...availableStored.map((movement) => {
      const baseline = catalog.find((item) => item.id === movement.id);
      const storedCues = (movement.cues ?? []).filter((cue) => typeof cue === "string" && cue.trim());
      const cues = storedCues.length ? storedCues : baseline?.cues ?? [];
      // Refresh bundled source data, preserving explicit instructor edits and approvals.
      if (baseline?.manual) return movement.reviewedBy
        ? {
          ...baseline, ...movement, cues,
          reviewStatus: storedCues.length ? movement.reviewStatus ?? baseline.reviewStatus : baseline.reviewStatus,
          manual: baseline.manual, catalogueVersion: baseline.catalogueVersion,
        }
        : { ...baseline, ...(movement.imageUri ? { imageUri: movement.imageUri } : {}) };
      const phases = movement.phases ?? baseline?.phases;
      const sideMode = movement.sideMode ?? baseline?.sideMode;
      const reviewStatus = baseline?.reviewStatus === "reviewed"
        ? "reviewed"
        : movement.reviewStatus ?? baseline?.reviewStatus;
      return baseline ? { ...baseline, ...movement,
        ...(phases ? { phases } : {}),
        ...(sideMode ? { sideMode } : {}),
        cues,
        ...(reviewStatus ? { reviewStatus } : {}),
      } : movement;
    }),
    ...catalog.filter((movement) =>
      !deleted.has(movement.id) && !existing.has(movement.id)),
  ].map((movement) => ({ ...movement, duration: MOVEMENT_DURATION_SECONDS }));
};

export const syncMovementImage = (
  plan: ClassPlan,
  movementId: string,
  imageUri?: string,
): ClassPlan => ({
  ...plan,
  movements: plan.movements.map((movement) =>
    movementSourceId(movement) === movementId
      ? { ...movement, imageUri }
      : movement),
});

export const PHASES: Phase[] = ["Warm-up", "Main", "Cool-down"];
export const phaseTarget = (phase: Phase) => phase === "Main" ? 2100 : 300;
export const phaseTotal = (plan: ClassPlan, phase: Phase) =>
  plan.movements.reduce((sum, move) => sum + (move.phase === phase ? move.duration : 0), 0);
export const phaseRemaining = (plan: ClassPlan, phase: Phase) =>
  phaseTarget(phase) - phaseTotal(plan, phase);
export const nextPlanningPhase = (plan: ClassPlan): Phase =>
  PHASES.find((phase) => phaseRemaining(plan, phase) > 0) ?? "Cool-down";
export const planLevel = (plan: ClassPlan) => {
  if (plan.brief.level) return plan.brief.level;
  const program = plan.brief.program.toLowerCase();
  if (program.includes("advanced") || program.includes("strong")) return "Advanced";
  if (program.includes("intermediate")) return "Intermediate";
  return "Beginner";
};
export const positionGroup = (position: string) => {
  const normalized = position.toLowerCase();
  if (normalized.includes("standing")) return "Standing";
  if (normalized.includes("kneeling") || normalized.includes("knees")) return "Kneeling";
  if (normalized.includes("seated") || normalized.includes("sitting")) return "Seated";
  if (/side-lying|sidelying|lying on (left|right)/.test(normalized)) return "Side-lying";
  if (normalized.includes("back") || normalized.includes("supine")) return "Lying on back";
  if (normalized.includes("front") || normalized.includes("prone") || normalized.includes("plank"))
    return "Lying on front";
  return position;
};
const positionOrder: Record<Phase, string[]> = {
  "Warm-up": ["Standing", "Kneeling", "Seated", "Side-lying", "Lying on back", "Lying on front"],
  Main: ["Standing", "Kneeling", "Side-lying", "Seated", "Lying on front", "Lying on back"],
  "Cool-down": ["Seated", "Kneeling", "Side-lying", "Lying on front", "Lying on back", "Standing"],
};
const positionRank = (position: string, phase: Phase) => {
  const rank = positionOrder[phase].indexOf(positionGroup(position));
  return rank < 0 ? positionOrder[phase].length : rank;
};
export const movementSourceId = (movement: { id: string; sourceMovementId?: string }) => {
  if (movement.sourceMovementId) return movement.sourceMovementId;
  const id = movement.id.replace(/-\d{10,}.*$/, "");
  if (["side-leg-right", "side-leg-left"].includes(id)) return "side-leg-lift";
  if (["clamshell-right", "clamshell-left"].includes(id)) return "clamshell";
  return id === "single-leg" ? "single-leg-stretch" : id;
};

export const fillMissingPlanCues = (plan: ClassPlan, library: LibraryMovement[]): ClassPlan => {
  if (plan.movements.every((move) => move.cue?.trim())) return plan;
  const reviewedCues = new Map(library
    .filter((movement) => movement.reviewStatus !== "needs-review")
    .map((movement) => [movement.id, movement.cues?.find((cue) => typeof cue === "string" && cue.trim())]));
  let changed = false;
  const movements = plan.movements.map((move) => {
    if (move.cue?.trim()) return move;
    const cue = reviewedCues.get(movementSourceId(move));
    if (!cue) return move;
    changed = true;
    return { ...move, cue };
  });
  return changed ? { ...plan, movements } : plan;
};

export const orderMovementsByPosition = (movements: PlanMovement[]) =>
  PHASES.flatMap((phase) => {
    const phaseMoves = movements.filter((move) => move.phase === phase);
    // Keep each movement family together without changing the order of unrelated families.
    const families = new Map<string, number>();
    const groups = new Map<string, number>();
    for (const move of phaseMoves) {
      const family = move.pairId ?? movementSourceId(move);
      if (!families.has(family)) families.set(family, families.size);
      const group = positionGroup(move.position);
      if (!groups.has(group)) groups.set(group, groups.size);
    }
    return [...phaseMoves].sort((a, b) =>
      positionRank(a.position, phase) - positionRank(b.position, phase) ||
      groups.get(positionGroup(a.position))! - groups.get(positionGroup(b.position))! ||
      families.get(a.pairId ?? movementSourceId(a))! -
        families.get(b.pairId ?? movementSourceId(b))!,
    );
  });

export const sequenceForTeaching = (plan: ClassPlan) => {
  if (plan.sequenceMode) return plan.movements;
  // Old checkpoints use the previous position ordering; retain their movement indices.
  return PHASES.flatMap((phase) => plan.movements
    .filter((move) => move.phase === phase)
    .sort((a, b) => positionRank(a.position, phase) - positionRank(b.position, phase) ||
      a.position.localeCompare(b.position)));
};

export const updatePlanSequence = (
  plan: ClassPlan, movements: PlanMovement[], mode: SequenceMode = plan.sequenceMode ?? "auto",
  timestamp = Date.now(),
): ClassPlan => ({
  ...plan,
  id: plan.status === "saved" ? `${plan.id}-v${plan.version + 1}-${timestamp}` : plan.id,
  version: plan.version + 1,
  status: "draft",
  sequenceMode: mode,
  movements,
  brief: plan.status === "saved"
    ? { ...plan.brief, scheduledDate: undefined, scheduledTime: undefined }
    : plan.brief,
});

export const selectionDuration = (movement: LibraryMovement, side: SideSelection = "both") =>
  MOVEMENT_DURATION_SECONDS * (movement.sideMode === "paired" && side === "both" ? 2 : 1);

export const workingSide = (movement: PlanMovement): WorkingSide | undefined => {
  if (movement.side) return movement.side;
  // Legacy cards encode the working limb in the ID/title, not the supporting position.
  if (/(?:-|\s)left$/i.test(movement.title) || /-left$/.test(movement.id)) return "left";
  if (/(?:-|\s)right$/i.test(movement.title) || /-right$/.test(movement.id)) return "right";
  return undefined;
};
export const sideLabel = (movement: PlanMovement) => {
  const side = workingSide(movement);
  return side === "left" ? "Left side" : side === "right" ? "Right side" :
    side === "alternating" ? "Alternating sides" : "";
};

export const movementAddition = (plan: ClassPlan, movement: LibraryMovement, phase: Phase) => {
  const existing = plan.movements.filter((card) => movementSourceId(card) === movement.id);
  if (!existing.length) return { side: "both" as const, seconds: MOVEMENT_DURATION_SECONDS };

  // A single side can be completed in its original phase at the same duration.
  const [card] = existing;
  const side = workingSide(card);
  if (movement.sideMode === "paired" && existing.length === 1 && card.phase === phase &&
      (side === "left" || side === "right"))
    return { side: side === "left" ? "right" as const : "left" as const, seconds: card.duration, pairId: card.pairId };
  return null;
};

export const insertMovement = (
  plan: ClassPlan, movement: LibraryMovement, phase: Phase, id: string, selection: SideSelection = "both",
) => {
  const addition = movementAddition(plan, movement, phase);
  if (!addition) return plan.movements;
  if (addition.side !== "both") selection = addition.side;
  const sides: (WorkingSide | undefined)[] = movement.sideMode === "paired"
    ? selection === "both" ? ["left", "right"] : [selection]
    : [movement.sideMode === "alternating" ? "alternating" : undefined];
  const added = sides.map((side): PlanMovement => ({
    id: sides.length > 1 ? `${id}-${side}` : id,
    sourceMovementId: movement.id,
    imageUri: movement.imageUri,
    title: movement.name,
    position: movement.sideMode === "paired" && positionGroup(movement.position) === "Side-lying"
      ? side === "left" ? "Right side-lying" : "Left side-lying" : movement.position,
    duration: addition.seconds, phase, cue: movement.cues[0] ?? "", side,
    requiresPair: movement.sideMode === "paired",
    pairId: movement.sideMode === "paired" ? addition.pairId ?? id : undefined,
  }));
  const next = [...plan.movements];
  const lastInPhase = next.map((move) => move.phase).lastIndexOf(phase);
  const nextPhase = next.findIndex((move) => PHASES.indexOf(move.phase) > PHASES.indexOf(phase));
  const index = lastInPhase >= 0 ? lastInPhase + 1 : nextPhase >= 0 ? nextPhase : next.length;
  next.splice(index, 0, ...added);
  return plan.sequenceMode === "manual" ? next : orderMovementsByPosition(next);
};

export const fitPhaseTiming = (movements: PlanMovement[], phase: Phase) => {
  const cards = movements.filter((card) => card.phase === phase);
  const target = phaseTarget(phase);
  if (cards.length * MAX_FITTED_CARD_SECONDS < target || cards.length > target ||
      cards.reduce((sum, card) => sum + card.duration, 0) === target) return movements;

  const groups = new Map<string, PlanMovement[]>();
  for (const card of cards) {
    const side = workingSide(card);
    const key = side === "left" || side === "right"
      ? `sides:${movementSourceId(card)}` : `card:${card.id}`;
    const group = groups.get(key) ?? [];
    group.push(card);
    groups.set(key, group);
  }
  const base = Math.floor(target / cards.length);
  let remaining = target % cards.length;
  const durations = new Map<string, number>();
  for (const group of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const extra = remaining >= group.length ? 1 : 0;
    remaining -= extra * group.length;
    for (const card of group) durations.set(card.id, base + extra);
  }
  if (remaining) return movements;
  return movements.map((card) => card.phase === phase
    ? { ...card, duration: durations.get(card.id)! } : card);
};

export const sequenceWarnings = (movements: PlanMovement[]) => {
  const warnings: string[] = [];
  let previousPhase = -1;
  for (const move of movements) {
    const phase = PHASES.indexOf(move.phase);
    if (phase < previousPhase) {
      warnings.push("Phases are out of order.");
      break;
    }
    previousPhase = phase;
  }
  for (const phase of PHASES) {
    const seen = new Set<string>();
    let previous = "";
    for (const move of movements.filter((item) => item.phase === phase)) {
      const group = positionGroup(move.position);
      if (group !== previous && seen.has(group)) {
        warnings.push(`${phase} returns to ${group.toLowerCase()} after a different position.`);
        break;
      }
      seen.add(group);
      previous = group;
    }
  }
  const seen = new Map<string, PlanMovement>();
  const repeated = new Set<string>();
  for (const move of movements) {
    const key = movementSourceId(move);
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, move);
      continue;
    }
    const previousSide = workingSide(previous);
    const side = workingSide(move);
    if (previous.phase === move.phase &&
        ((previousSide === "left" && side === "right") ||
         (previousSide === "right" && side === "left"))) {
      // A third card from the same movement is still a repeat.
      seen.set(key, { ...previous, side: "alternating" });
    } else {
      repeated.add(previous.title);
    }
  }
  for (const title of repeated) warnings.push(`${title} appears more than once in this class.`);
  return warnings;
};

export const suggestMovements = (
  plan: ClassPlan, library: LibraryMovement[], phase: Phase, remaining = phaseRemaining(plan, phase),
) => {
  if (remaining <= 0) return [];
  const levels = ["Beginner", "Intermediate", "Advanced"];
  const level = levels.indexOf(planLevel(plan));
  const equipment = new Set(plan.brief.equipment.map((item) => item.toLowerCase()));
  const phaseMoves = plan.movements.filter((move) => move.phase === phase);
  const last = phaseMoves[phaseMoves.length - 1];
  const used = new Set(plan.movements.map(movementSourceId));
  const candidates = library
    .filter((move) => !used.has(move.id) && (move.phases ?? ["Main"]).includes(phase) &&
      (!move.manual || move.reviewStatus !== "needs-review") &&
      levels.indexOf(move.level) >= 0 && levels.indexOf(move.level) <= level &&
      (phase !== "Main" || !move.mainLevel || levels.indexOf(move.mainLevel) <= level) &&
      move.equipment.split(/[,/&+]/).every((item) =>
        ["none", "bodyweight"].includes(item.trim().toLowerCase()) || equipment.has(item.trim().toLowerCase())) &&
      selectionDuration(move) <= remaining)
    .filter((move) => plan.sequenceMode !== "manual" || !last ||
      positionGroup(move.position) === positionGroup(last.position) ||
      !phaseMoves.some((existing) => positionGroup(existing.position) === positionGroup(move.position)));
  const singles = candidates.filter((move) => move.sideMode !== "paired").length;
  const availableCards = singles + (candidates.length - singles) * 2;
  const scored = candidates
    .map((movement) => {
      const rank = positionRank(movement.position, phase);
      const samePosition = !!last && positionGroup(last.position) === positionGroup(movement.position);
      const backtrack = !!last && rank < positionRank(last.position, phase);
      const paired = movement.sideMode === "paired";
      const cards = paired ? 2 : 1;
      const remainder = remaining / MOVEMENT_DURATION_SECONDS - cards;
      const completesPhase = Number.isInteger(remainder) &&
        remainder <= availableCards - cards && (remainder % 2 === 0 || singles > (paired ? 0 : 1));
      return {
        movement,
        reason: movement.reviewStatus === "needs-review" ? "Review before adding" :
          samePosition ? "Same position group" : backtrack ? "Fits an earlier position group" :
          last ? "Next position group" : "First movement",
        completesPhase,
        score: (samePosition ? 100 : backtrack ? -50 : 0) - rank -
          ((movement.phases?.length ?? 1) - 1) * 10 +
          (selectionDuration(movement) === remaining ? 20 : 0) + (completesPhase ? 1000 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);
  const completable = scored.filter((item) => item.completesPhase);
  return (completable.length ? completable : scored)
    .slice(0, 3);
};

export type ReadinessReport = { errors: string[]; warnings: string[]; ready: boolean };
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const legacyPairedFamilies = new Set(["side-leg-lift", "clamshell", "donkey-kick", "figure-four", "supine-twist"]);

export const classReadiness = (plan: ClassPlan, library: LibraryMovement[] = []): ReadinessReport => {
  const errors: string[] = [];
  const warnings = sequenceWarnings(plan.movements);
  if (warnings.includes("Phases are out of order.")) {
    errors.push("Put warm-up, main and cool-down in that order.");
    warnings.splice(warnings.indexOf("Phases are out of order."), 1);
  }
  for (const phase of PHASES) {
    const moves = plan.movements.filter((move) => move.phase === phase);
    if (!moves.length) errors.push(`${phase} has no movements.`);
    else {
      const difference = phaseRemaining(plan, phase);
      if (Number.isFinite(difference) && difference !== 0)
        errors.push(`${phase} is ${timeLabel(Math.abs(difference))} ${difference > 0 ? "short" : "over target"}.`);
    }
  }
  const balanced = new Map<string, { name: string; phase: Phase; left: number[]; right: number[] }>();
  for (const move of plan.movements) {
    if (!PHASES.includes(move.phase)) errors.push(`${move.title}: choose a valid phase.`);
    if (!Number.isInteger(move.duration) || move.duration <= 0)
      errors.push(`${move.title}: duration must be a positive number of seconds.`);
    if (!move.title.trim() || !move.position.trim() || !move.cue?.trim())
      errors.push(`${move.title || "Unnamed movement"}: complete the name, position and cue.`);
    const family = movementSourceId(move);
    const source = library.find((item) => item.id === family);
    if (source?.reviewStatus === "needs-review") errors.push(`${source.name}: instructor review is still needed.`);
    if (source?.phases?.length && !source.phases.includes(move.phase))
      errors.push(`${source.name}: ${move.phase.toLowerCase()} is not an approved phase.`);
    if (source) {
      const levels = ["Beginner", "Intermediate", "Advanced"];
      const required = move.phase === "Main" ? source.mainLevel ?? source.level : source.level;
      const requiredLevel = levels.indexOf(required);
      if (requiredLevel >= 0 && requiredLevel > levels.indexOf(planLevel(plan)))
        errors.push(
          `${source.name}: this version requires ${required === "Advanced" ? "an" : "a"} ${required.toLowerCase()} class.`,
        );
      const availableEquipment = new Set(
        plan.brief.equipment.map((item) => item.trim().toLowerCase()),
      );
      const missingEquipment = source.equipment
        .split(/[,/&+]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .filter(
          (item) =>
            !["none", "bodyweight"].includes(item.toLowerCase()) &&
            !availableEquipment.has(item.toLowerCase()),
        );
      if (missingEquipment.length)
        errors.push(`${source.name}: add ${missingEquipment.join(" or ")} to the class equipment.`);
    }
    const side = workingSide(move);
    if (move.requiresPair || source?.sideMode === "paired" || legacyPairedFamilies.has(family) || side === "left" || side === "right") {
      if (side === "alternating") continue;
      if (!side) {
        errors.push(`${move.title}: choose the working side or alternating sides.`);
        continue;
      }
      const key = `${move.phase}:${family}`;
      if (!balanced.has(key)) balanced.set(key, { name: source?.name ?? move.title, phase: move.phase, left: [], right: [] });
      balanced.get(key)![side].push(move.duration);
    }
  }
  for (const group of balanced.values()) {
    if (!group.left.length || !group.right.length) {
      errors.push(`${group.name} (${group.phase}): ${group.left.length ? "right" : "left"} side is missing.`);
    } else if (group.left.length !== group.right.length ||
      group.left.reduce((a, b) => a + b, 0) !== group.right.reduce((a, b) => a + b, 0)) {
      errors.push(`${group.name} (${group.phase}): left and right sides need matching time and card counts.`);
    }
  }
  return { errors: [...new Set(errors)], warnings, ready: errors.length === 0 };
};
