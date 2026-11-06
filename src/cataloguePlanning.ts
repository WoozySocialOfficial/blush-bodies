import {
  PHASES, insertMovement, movementSourceId, orderMovementsByPosition,
  phaseRemaining, suggestMovements, workingSide,
  type ClassPlan, type LibraryMovement, type PlanBrief,
} from "./planning.ts";

// Build from the live library so deleted or unreviewed movements cannot reappear.
export const createCataloguePlan = (
  brief: PlanBrief, library: LibraryMovement[], id: string,
): ClassPlan => {
  let plan: ClassPlan = { id, version: 1, brief, status: "draft", sequenceMode: "auto", movements: [] };
  const reviewed = library.filter((move) => move.reviewStatus === "reviewed" && move.cues.length);
  let count = 0;
  for (const phase of PHASES) {
    while (phaseRemaining(plan, phase) > 0) {
      const choice = suggestMovements(plan, reviewed, phase)[0]?.movement;
      if (!choice) break; // An incomplete draft explains missing time in the existing readiness checks.
      plan = { ...plan, movements: insertMovement(plan, choice, phase, `${id}-${++count}`) };
    }
  }
  return { ...plan, movements: orderMovementsByPosition(plan.movements) };
};

export const replaceCatalogueMovement = (
  plan: ClassPlan, index: number, library: LibraryMovement[], id: string,
) => {
  const current = plan.movements[index];
  if (!current) return plan.movements;
  const family = movementSourceId(current);
  const side = workingSide(current);
  const paired = current.requiresPair || side === "left" || side === "right";
  // Replace every instance of a paired family in this phase to retain balance, including legacy cards.
  const replacing = (move: ClassPlan["movements"][number], i: number) => paired
    ? move.phase === current.phase && movementSourceId(move) === family
    : i === index;
  const remaining = plan.movements.filter((move, i) => !replacing(move, i));
  const candidates = library.filter((move) => move.id !== family &&
    move.reviewStatus === "reviewed" && move.cues.length &&
    (move.sideMode === "paired") === !!paired);
  const choice = suggestMovements({ ...plan, movements: remaining }, candidates, current.phase)[0]?.movement;
  if (!choice) return plan.movements;
  return plan.movements.map((move, i) => {
    if (!replacing(move, i)) return move;
    const selectedSide = workingSide(move);
    const [replacement] = insertMovement({ ...plan, movements: [] }, choice, move.phase,
      `${id}-${i}`, selectedSide === "left" || selectedSide === "right" ? selectedSide : "both");
    return replacement;
  });
};
