import { MOVEMENT_DURATION_SECONDS, type LibraryMovement, type Phase } from "./planning.ts";
// cspell:words footbar

type ReformerExercise = {
  id: string;
  name: string;
  position: string;
  phase: Phase;
  cue: string;
  sideMode?: LibraryMovement["sideMode"];
};

const starterExercises: ReformerExercise[] = [
  {
    id: "carriage-breathing", name: "Carriage Breathing", position: "Supine", phase: "Warm-up",
    cue: "Settle on the carriage with steady foot support. Let the ribs widen as you breathe in and soften as you breathe out.",
  },
  {
    id: "pelvic-tilts", name: "Carriage Pelvic Tilts", position: "Supine", phase: "Warm-up",
    cue: "Rock the pelvis through a small range while the carriage stays still. Finish midway between the two positions.",
  },
  {
    id: "footwork-heels", name: "Parallel Heel Footwork", position: "Supine", phase: "Warm-up",
    cue: "Keep both heels steady on the footbar. Follow the line of your toes with your knees and slow the carriage on its way home.",
  },
  {
    id: "footwork-toes", name: "Parallel Toe Footwork", position: "Supine", phase: "Warm-up",
    cue: "Press through the balls of both feet and keep both heels level as the carriage travels.",
  },
  {
    id: "footwork-v", name: "Pilates V Footwork", position: "Supine", phase: "Main",
    cue: "Choose a small turnout from the hips. Keep the knees over the toes as you press away and return.",
  },
  {
    id: "running", name: "Running on the Reformer", position: "Supine", phase: "Main", sideMode: "alternating",
    cue: "Alternate the heels one at a time. Keep the pelvis quiet and make each change smooth.",
  },
  {
    id: "bridge", name: "Reformer Bridge", position: "Supine", phase: "Main",
    cue: "Confirm the headrest is flat. Keep the carriage steady as you lift the hips and lower them with control.",
  },
  {
    id: "arm-press", name: "Supine Arm Press", position: "Supine", phase: "Main",
    cue: "With the loops secure, press the arms toward your sides. Keep the ribs settled as the hands return.",
  },
  {
    id: "frog-press", name: "Frog Press in Straps", position: "Supine", phase: "Main",
    cue: "Press both feet away evenly in the loops. Bend the knees to return before the pelvis starts to tip.",
  },
  {
    id: "leg-circles", name: "Leg Circles in Straps", position: "Supine", phase: "Main",
    cue: "Draw matching circles with both feet. Choose a range that lets your pelvis stay level.",
  },
  {
    id: "seated-row", name: "Seated Strap Row", position: "Seated", phase: "Main",
    cue: "Sit tall and draw your elbows back as the straps take tension. Release slowly without leaning back.",
  },
  {
    id: "seated-biceps", name: "Seated Biceps Curl", position: "Seated", phase: "Main",
    cue: "Keep your upper arms steady as the elbows bend. Let the arms lengthen at the same pace on both sides.",
  },
  {
    id: "mermaid", name: "Reformer Mermaid", position: "Seated", phase: "Cool-down", sideMode: "paired",
    cue: "Use the footbar for support and reach up before bending to the side. Return upright as the carriage comes in.",
  },
  {
    id: "hip-flexor-stretch", name: "Reformer Hip Flexor Stretch", position: "Standing", phase: "Cool-down", sideMode: "paired",
    cue: "Set up with the instructor's support. Keep the hips facing forward and use a small range you can return from smoothly.",
  },
  {
    id: "calf-stretch", name: "Footbar Calf Stretch", position: "Supine", phase: "Cool-down",
    cue: "Keep your forefeet supported on the bar. Lower the heels gently and bring them back to level before you release.",
  },
  {
    id: "closing-breath", name: "Reformer Closing Breath", position: "Seated", phase: "Cool-down",
    cue: "With the carriage parked, sit tall and let your breathing slow. Check that the carriage is still before stepping off.",
  },
];

export const reformerMovements: LibraryMovement[] = starterExercises.map(({ id, name, position, phase, cue, sideMode }) => ({
  id: `reformer-${id}`,
  name,
  position,
  equipment: "Reformer",
  level: "Beginner",
  duration: MOVEMENT_DURATION_SECONDS,
  phases: [phase],
  cues: [cue],
  sideMode: sideMode ?? "together",
  reviewStatus: "needs-review",
}));
