type MovementImage = { imageUri?: string };
type MovementImagePlan = { movements: MovementImage[] };
type DeletedMovementImage =
  | { kind: "movement"; movement: MovementImage }
  | { kind: "draft" | "plan"; plan: MovementImagePlan };

export const isOwnedMovementImageUri = (
  uri: string | undefined,
  documentDirectory: string | null,
) =>
  Boolean(
    uri &&
      documentDirectory &&
      uri.startsWith(`${documentDirectory}movement-images/`) &&
      uri.length > `${documentDirectory}movement-images/`.length,
  );

export const referencedMovementImageUris = ({
  libraryMovements,
  currentPlan,
  draftPlan,
  savedPlans,
  activePlan,
  sequenceHistory = [],
  recentlyDeleted,
}: {
  libraryMovements: MovementImage[];
  currentPlan: MovementImagePlan;
  draftPlan?: MovementImagePlan;
  savedPlans: MovementImagePlan[];
  activePlan?: MovementImagePlan;
  sequenceHistory?: MovementImagePlan[];
  recentlyDeleted: DeletedMovementImage[];
}) => {
  const references = new Set<string>();
  const addMovement = (movement: MovementImage) => {
    if (movement.imageUri) references.add(movement.imageUri);
  };
  const addPlan = (plan: MovementImagePlan | undefined) =>
    plan?.movements.forEach(addMovement);

  libraryMovements.forEach(addMovement);
  addPlan(currentPlan);
  addPlan(draftPlan);
  savedPlans.forEach(addPlan);
  addPlan(activePlan);
  sequenceHistory.forEach(addPlan);
  recentlyDeleted.forEach((item) => {
    if (item.kind === "movement") addMovement(item.movement);
    else addPlan(item.plan);
  });
  return references;
};
