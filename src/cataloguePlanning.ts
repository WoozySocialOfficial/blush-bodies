import {
  MOVEMENT_DURATION_SECONDS, classTypeForEquipment, fitPhaseTiming, insertMovement, movementSourceId,
  phaseRemaining, suggestMovements, workingSide,
  type ClassPlan, type LibraryMovement, type Phase, type PlanBrief,
} from "./planning.ts";

// Reformer starter drafts can include pending cards. Readiness still requires instructor approval.
export const createCataloguePlan = (
  brief: PlanBrief, library: LibraryMovement[], id: string,
  { draftForReview = false }: { draftForReview?: boolean } = {},
): ClassPlan => {
  let plan: ClassPlan = { id, version: 1, brief, status: "draft", sequenceMode: "auto", movements: [] };
  const includePending = draftForReview && classTypeForEquipment(brief.equipment) === "Reformer";
  const eligible = library.filter((move) => (includePending || move.reviewStatus === "reviewed") && move.cues.length);
  const energyOffset: Record<string, number> = {
    Flowing: 0,
    Calm: 1,
    Energising: 2,
    Strong: 2,
  };
  const week = Number(/^Week (\d+)$/.exec(brief.week)?.[1] ?? 1);
  const day = Number(/^Day (\d+)$/.exec(brief.day)?.[1] ?? 1);
  const lesson = Math.max(0, week - 1) * 5 + Math.max(0, day - 1);
  let count = 0;
  // Reserve warm-up and cool-down movements before filling the larger main phase.
  const phases: Phase[] = ["Warm-up", "Cool-down", "Main"];
  for (const phase of phases) {
    while (phaseRemaining(plan, phase) > 0) {
      const suggestions = suggestMovements(plan, eligible, phase);
      if (!suggestions.length) break;
      const offset = energyOffset[brief.energy] ?? 0;
      const energyIndex = brief.energy === "Strong" ? count * 2 + 1 : offset + count;
      const lessonOffset = Math.floor(lesson / 3 ** (count % 3)) % 3;
      const choice = suggestions[(energyIndex + lessonOffset) % suggestions.length].movement;
      plan = { ...plan, movements: insertMovement(plan, choice, phase, `${id}-${++count}`) };
    }
    plan = { ...plan, movements: fitPhaseTiming(plan.movements, phase) };
  }
  return plan;
};

const replacementContext = (plan: ClassPlan, index: number, library: LibraryMovement[]) => {
  const current = plan.movements[index];
  if (!current) return;
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
  const choices = suggestMovements(
    { ...plan, movements: remaining, sequenceMode: "auto" }, candidates, current.phase,
    MOVEMENT_DURATION_SECONDS * (paired ? 2 : 1),
  ).map(({ movement }) => movement);
  return { choices, replacing, paired };
};

export const catalogueReplacementChoices = (plan: ClassPlan, index: number, library: LibraryMovement[]) =>
  replacementContext(plan, index, library)?.choices ?? [];

export const replaceCatalogueMovement = (
  plan: ClassPlan, index: number, library: LibraryMovement[], id: string, choiceId?: string,
) => {
  const context = replacementContext(plan, index, library);
  if (!context) return plan.movements;
  const { choices, replacing, paired } = context;
  const choice = choiceId ? choices.find((movement) => movement.id === choiceId) : choices[0];
  if (!choice) return plan.movements;
  return plan.movements.map((move, i) => {
    if (!replacing(i)) return move;
    const selectedSide = workingSide(move);
    const [replacement] = insertMovement({ ...plan, movements: [] }, choice, move.phase,
      `${id}-${i}`, selectedSide === "left" || selectedSide === "right" ? selectedSide : "both");
    return { ...replacement, duration: move.duration, pairId: paired ? id : undefined };
  });
};
