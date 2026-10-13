import type { LibraryMovement } from "./planning";

const MOVEMENT_DURATION_SECONDS = 75;

// Bundled entries are curated and can enter class suggestions immediately.
export const additionalMovements: LibraryMovement[] = [
  {
    id: "standing-reach", name: "Standing Reach", position: "Standing", duration: 90,
    phases: ["Warm-up", "Main"],
    cues: ["Reach through the fingertips while keeping the ribs stacked over the pelvis."],
  },
  {
    id: "hip-circles", name: "Hip Circles", position: "Standing", duration: 90,
    phases: ["Warm-up"],
    cues: ["Keep the chest tall as the pelvis traces a smooth, comfortable circle."],
  },
  {
    id: "bridge", name: "Bridge", position: "Supine", duration: 180,
    phases: ["Main"],
    cues: ["Press evenly through both feet and lift the pelvis without flaring the ribs."],
  },
  {
    id: "bird-dog", name: "Bird Dog", position: "Hands & knees", duration: 120,
    phases: ["Main"], sideMode: "paired",
    cues: ["Reach the opposite arm and leg long while keeping the pelvis level."],
  },
  {
    id: "standing-side-bend", name: "Standing Side Bend", position: "Standing", duration: 90,
    phases: ["Main"], sideMode: "paired",
    cues: ["Anchor both feet and lengthen upward before bending to the side."],
  },
  {
    id: "standing-heel-raise", name: "Standing Heel Raise", position: "Standing", duration: 120,
    phases: ["Main"],
    cues: ["Rise straight up through the balls of the feet without rolling the ankles."],
  },
  {
    id: "seated-march", name: "Seated March", position: "Seated", duration: 120,
    phases: ["Main"], sideMode: "alternating",
    cues: ["Sit tall and lift one foot without rocking the pelvis."],
  },
  {
    id: "knee-folds", name: "Knee Folds", position: "Supine", duration: 120,
    phases: ["Main"], sideMode: "paired",
    cues: ["Float one thigh toward tabletop while keeping the pelvis quiet."],
  },
  {
    id: "heel-slides", name: "Heel Slides", position: "Supine", duration: 120,
    phases: ["Main"], sideMode: "paired",
    cues: ["Glide the heel away and back without shifting the pelvis."],
  },
  {
    id: "toe-taps", name: "Toe Taps", position: "Supine", duration: 120,
    phases: ["Main"], sideMode: "alternating",
    cues: ["Lower one foot with control while the ribs and pelvis stay steady."],
  },
  {
    id: "pelvic-curl", name: "Pelvic Curl", position: "Supine", duration: 150,
    phases: ["Warm-up", "Main"],
    cues: ["Tilt the pelvis and peel the spine from the mat one segment at a time."],
  },
  {
    id: "seated-spine-stretch", name: "Seated Spine Stretch", position: "Seated", duration: 120,
    phases: ["Cool-down"],
    cues: ["Exhale to round forward from the top of the spine without collapsing."],
  },
  {
    id: "quadruped-rock-back", name: "Quadruped Rock Back", position: "Hands & knees", duration: 120,
    phases: ["Warm-up", "Main"],
    cues: ["Keep the spine long as the hips travel back toward the heels."],
  },
  {
    id: "mountain-breath", name: "Mountain Breath", position: "Standing", duration: 75,
    phases: ["Warm-up", "Cool-down"],
    cues: ["Stand evenly through both feet and lengthen through the crown.", "Let the ribs expand without lifting the shoulders."],
  },
  {
    id: "arm-circles", name: "Arm Circles", position: "Standing", duration: 75,
    phases: ["Warm-up"],
    cues: ["Keep the ribs quiet as the arms circle.", "Use a comfortable range and keep the neck relaxed."],
  },
  {
    id: "heel-toe-rocks", name: "Heel-Toe Rocks", position: "Standing", duration: 75,
    phases: ["Warm-up"],
    cues: ["Shift smoothly from heels to the balls of the feet.", "Stay tall and keep the movement controlled."],
  },
  {
    id: "standing-hip-hinge", name: "Standing Hip Hinge", position: "Standing", duration: 75,
    phases: ["Warm-up", "Main"],
    cues: ["Send the hips back while keeping the spine long.", "Press through the feet to return to standing."],
  },
  {
    id: "thoracic-rotation", name: "Thoracic Rotation", position: "Hands & knees", duration: 75,
    phases: ["Warm-up", "Main"], sideMode: "paired",
    cues: ["Rotate through the upper back while the pelvis stays steady.", "Follow the moving hand with your eyes."],
  },
  {
    id: "thread-the-needle", name: "Thread the Needle", position: "Hands & knees", duration: 75,
    phases: ["Warm-up", "Cool-down"], sideMode: "paired",
    cues: ["Slide one arm beneath the chest without shifting the hips.", "Keep the supporting hand active and breathe into the upper back."],
  },
  {
    id: "pelvic-tilt", name: "Pelvic Tilt", position: "Supine", duration: 75,
    phases: ["Warm-up"],
    cues: ["Rock the pelvis gently without pressing through the feet.", "Move with the breath and keep the neck relaxed."],
  },
  {
    id: "knee-sways", name: "Knee Sways", position: "Supine", duration: 75,
    phases: ["Warm-up", "Cool-down"], sideMode: "alternating",
    cues: ["Keep both shoulders heavy as the knees move together.", "Use the abdominals to return through centre."],
  },
  {
    id: "chest-lift", name: "Chest Lift", position: "Supine", duration: 75,
    phases: ["Main"],
    cues: ["Nod the chin before lifting the shoulder blades.", "Keep the pelvis neutral and widen across the collarbones."],
  },
  {
    id: "dead-bug", name: "Dead Bug", position: "Supine", duration: 75,
    phases: ["Main"], sideMode: "alternating",
    cues: ["Keep the trunk steady as opposite limbs reach away.", "Only extend as far as the ribs and pelvis remain controlled."],
  },
  {
    id: "swimming", name: "Swimming", position: "Prone", duration: 75,
    phases: ["Main"], sideMode: "alternating", level: "Intermediate",
    cues: ["Reach opposite limbs long before lifting them.", "Keep the front of the pelvis grounded and the neck long."],
  },
  {
    id: "swan-prep", name: "Swan Prep", position: "Prone", duration: 75,
    phases: ["Main"],
    cues: ["Lengthen the chest forward before lifting.", "Keep the shoulders away from the ears and lower with control."],
  },
  {
    id: "forearm-plank", name: "Forearm Plank", position: "Plank", duration: 75,
    phases: ["Main"], level: "Intermediate",
    cues: ["Press the forearms down and reach back through the heels.", "Keep the ribs connected and the back of the neck long."],
  },
  {
    id: "mermaid-stretch", name: "Mermaid Stretch", position: "Seated", duration: 75,
    phases: ["Main", "Cool-down"], sideMode: "paired",
    cues: ["Ground both sitting bones before reaching sideways.", "Create length through both sides of the waist."],
  },
  {
    id: "child-pose", name: "Child's Pose", position: "Kneeling", duration: 75,
    phases: ["Warm-up", "Cool-down"],
    cues: ["Reach the hips toward the heels and lengthen the arms forward.", "Let the breath widen the back of the ribs."],
  },
  {
    id: "happy-baby", name: "Happy Baby", position: "Supine", duration: 75,
    phases: ["Cool-down"],
    cues: ["Keep the back of the pelvis heavy on the mat.", "Hold behind the thighs if reaching the feet changes the spine."],
  },
].map((movement) => ({
  ...movement,
  phases: movement.phases as LibraryMovement["phases"],
  sideMode: ("sideMode" in movement ? movement.sideMode : undefined) as LibraryMovement["sideMode"],
  duration: MOVEMENT_DURATION_SECONDS,
  level: "level" in movement && movement.level ? movement.level : "Beginner",
  equipment: "Mat",
  cues: "cues" in movement && movement.cues ? movement.cues : [],
  reviewStatus: "reviewed",
}));
