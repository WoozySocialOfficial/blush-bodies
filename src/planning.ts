export type Phase = "Warm-up" | "Main" | "Cool-down";
export type SequenceMode = "auto" | "manual";
export type SideSelection = "both" | "left" | "right";
export type WorkingSide = "left" | "right" | "alternating";
export const MOVEMENT_DURATION_SECONDS = 75;
export type PlanBrief = {
  program: string;
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
      // Refresh bundled source data, preserving explicit instructor edits and approvals.
      if (baseline?.manual) return movement.reviewedBy
        ? { ...baseline, ...movement, manual: baseline.manual, catalogueVersion: baseline.catalogueVersion }
        : { ...baseline, ...(movement.imageUri ? { imageUri: movement.imageUri } : {}) };
      const phases = movement.phases ?? baseline?.phases;
      const sideMode = movement.sideMode ?? baseline?.sideMode;
      const cues = movement.cues?.length ? movement.cues : baseline?.cues ?? [];
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

export const insertMovement = (
  plan: ClassPlan, movement: LibraryMovement, phase: Phase, id: string, selection: SideSelection = "both",
) => {
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
    duration: MOVEMENT_DURATION_SECONDS, phase, cue: movement.cues[0] ?? "", side,
    requiresPair: movement.sideMode === "paired",
    pairId: movement.sideMode === "paired" ? id : undefined,
  }));
  const next = [...plan.movements];
  const lastInPhase = next.map((move) => move.phase).lastIndexOf(phase);
  const nextPhase = next.findIndex((move) => PHASES.indexOf(move.phase) > PHASES.indexOf(phase));
  const index = lastInPhase >= 0 ? lastInPhase + 1 : nextPhase >= 0 ? nextPhase : next.length;
  next.splice(index, 0, ...added);
  return plan.sequenceMode === "manual" ? next : orderMovementsByPosition(next);
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
  return warnings;
};

export const suggestMovements = (plan: ClassPlan, library: LibraryMovement[], phase: Phase) => {
  const remaining = phaseRemaining(plan, phase);
  if (remaining <= 0) return [];
  const levels = ["Beginner", "Intermediate", "Advanced"];
  const level = levels.indexOf(planLevel(plan));
  const equipment = new Set(plan.brief.equipment.map((item) => item.toLowerCase()));
  const phaseMoves = plan.movements.filter((move) => move.phase === phase);
  const last = phaseMoves[phaseMoves.length - 1];
  const used = new Set(phaseMoves.map(movementSourceId));
  const candidates = library
    .filter((move) => (move.phases ?? ["Main"]).includes(phase) &&
      (!move.manual || move.reviewStatus !== "needs-review") &&
      levels.indexOf(move.level) >= 0 && levels.indexOf(move.level) <= level &&
      (phase !== "Main" || !move.mainLevel || levels.indexOf(move.mainLevel) <= level) &&
      move.equipment.split(/[,/&+]/).every((item) =>
        ["none", "bodyweight"].includes(item.trim().toLowerCase()) || equipment.has(item.trim().toLowerCase())) &&
      selectionDuration(move) <= remaining)
    .filter((move) => plan.sequenceMode !== "manual" || !last ||
      positionGroup(move.position) === positionGroup(last.position) ||
      !phaseMoves.some((existing) => positionGroup(existing.position) === positionGroup(move.position)));
  const canFill = (target: number, choices: LibraryMovement[]) => {
    if (target === 0) return true;
    if (target < 0) return false;
    let totals = new Set([0]);
    for (const choice of choices) {
      const duration = selectionDuration(choice);
      for (let total = duration; total <= target; total += duration)
        totals.add(total);
    }
    return totals.has(target);
  };
  const scored = candidates
    .map((movement) => {
      const rank = positionRank(movement.position, phase);
      const samePosition = !!last && positionGroup(last.position) === positionGroup(movement.position);
      const backtrack = !!last && rank < positionRank(last.position, phase);
      const remainder = remaining - selectionDuration(movement);
      const completesPhase = canFill(remainder, candidates);
      return {
        movement,
        reason: movement.reviewStatus === "needs-review" ? "Review before adding" :
          used.has(movement.id) ? "Useful repeat block" :
          samePosition ? "Same position group" : backtrack ? "Fits an earlier position group" :
          last ? "Next position group" : "First movement",
        completesPhase,
        score: (samePosition ? 100 : backtrack ? -50 : 0) - rank -
          (used.has(movement.id) ? 250 : 0) +
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
    else if (move.duration !== MOVEMENT_DURATION_SECONDS)
      errors.push(`${move.title}: movement time must be 1:15.`);
    if (!move.title.trim() || !move.position.trim() || !move.cue.trim())
      errors.push(`${move.title || "Unnamed movement"}: complete the name, position and cue.`);
    const family = movementSourceId(move);
    const source = library.find((item) => item.id === family);
    if (source?.reviewStatus === "needs-review") errors.push(`${source.name}: instructor review is still needed.`);
    if (source?.phases?.length && !source.phases.includes(move.phase))
      errors.push(`${source.name}: ${move.phase.toLowerCase()} is not an approved phase.`);
    if (source?.manual) {
      const levels = ["Beginner", "Intermediate", "Advanced"];
      const required = move.phase === "Main" ? source.mainLevel ?? source.level : source.level;
      if (levels.indexOf(required) > levels.indexOf(planLevel(plan)))
        errors.push(`${source.name}: this version requires a ${required.toLowerCase()} class.`);
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
