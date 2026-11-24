import {
  MOVEMENT_DURATION_SECONDS, fitPhaseTiming, insertMovement, movementSourceId,
  phaseRemaining, suggestMovements, workingSide,
  type ClassPlan, type LibraryMovement, type Phase, type PlanBrief,
} from "./planning.ts";

// Build from the live library so deleted or unreviewed movements cannot reappear.
export const createCataloguePlan = (
  brief: PlanBrief, library: LibraryMovement[], id: string,
): ClassPlan => {
  let plan: ClassPlan = { id, version: 1, brief, status: "draft", sequenceMode: "auto", movements: [] };
  const reviewed = library.filter((move) => move.reviewStatus === "reviewed" && move.cues.length);
  const energyOffset: Record<string, number> = {
    Flowing: 0,
    Calm: 1,
    Energising: 2,
    Strong: 2,
  };
  let count = 0;
  // Reserve warm-up and cool-down movements before filling the larger main phase.
  const phases: Phase[] = ["Warm-up", "Cool-down", "Main"];
  for (const phase of phases) {
    while (phaseRemaining(plan, phase) > 0) {
      const suggestions = suggestMovements(plan, reviewed, phase);
      if (!suggestions.length) break;
      const offset = energyOffset[brief.energy] ?? 0;
      const energyIndex = brief.energy === "Strong" ? count * 2 + 1 : offset + count;
      const choice = suggestions[energyIndex % suggestions.length].movement;
      plan = { ...plan, movements: insertMovement(plan, choice, phase, `${id}-${++count}`) };
    }
    plan = { ...plan, movements: fitPhaseTiming(plan.movements, phase) };
  }
  return plan;
};

export const replaceCatalogueMovement = (
  plan: ClassPlan, index: number, library: LibraryMovement[], id: string,
) => {
  const current = plan.movements[index];
  if (!current) return plan.movements;
  const family = movementSourceId(current);
  const side = workingSide(current);
  const paired = side === "left" || side === "right";
  const isPartner = (move: ClassPlan["movements"][number]) =>
    move.phase === current.phase && movementSourceId(move) === family &&
    workingSide(move) === (side === "left" ? "right" : "left");
  const linkedPartner = paired && current.pairId
    ? plan.movements.findIndex((move) => isPartner(move) && move.pairId === current.pairId) : -1;
  const partnerIndex = paired && linkedPartner < 0
    ? plan.movements.findIndex(isPartner) : linkedPartner;
  const replacing = (i: number) => i === index || i === partnerIndex;
  const remaining = plan.movements.filter((_, i) => !replacing(i));
  const candidates = library.filter((move) => move.id !== family &&
    move.reviewStatus === "reviewed" && move.cues.length &&
    (move.sideMode === "paired") === paired);
  const choice = suggestMovements(
    { ...plan, movements: remaining, sequenceMode: "auto" }, candidates, current.phase,
    MOVEMENT_DURATION_SECONDS * (paired ? 2 : 1),
  )[0]?.movement;
  if (!choice) return plan.movements;
  return plan.movements.map((move, i) => {
    if (!replacing(i)) return move;
    const selectedSide = workingSide(move);
    const [replacement] = insertMovement({ ...plan, movements: [] }, choice, move.phase,
      `${id}-${i}`, selectedSide === "left" || selectedSide === "right" ? selectedSide : "both");
    return { ...replacement, duration: move.duration, pairId: paired ? id : undefined };
  });
};
