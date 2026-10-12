import type { LibraryMovement } from "./planning";

const MOVEMENT_DURATION_SECONDS = 75;

// Sample entries need an instructor's cues and review before they enter suggestions.
export const additionalMovements: LibraryMovement[] = [
  { id: "standing-reach", name: "Standing Reach", position: "Standing", duration: 90, phases: ["Warm-up", "Main"] },
  { id: "hip-circles", name: "Hip Circles", position: "Standing", duration: 90, phases: ["Warm-up"] },
  { id: "bridge", name: "Bridge", position: "Supine", duration: 180, phases: ["Main"] },
  { id: "bird-dog", name: "Bird Dog", position: "Hands & knees", duration: 120, phases: ["Main"], sideMode: "paired" },
  { id: "standing-side-bend", name: "Standing Side Bend", position: "Standing", duration: 90, phases: ["Main"], sideMode: "paired" },
  { id: "standing-heel-raise", name: "Standing Heel Raise", position: "Standing", duration: 120, phases: ["Main"] },
  { id: "seated-march", name: "Seated March", position: "Seated", duration: 120, phases: ["Main"], sideMode: "alternating" },
  { id: "knee-folds", name: "Knee Folds", position: "Supine", duration: 120, phases: ["Main"], sideMode: "paired" },
  { id: "heel-slides", name: "Heel Slides", position: "Supine", duration: 120, phases: ["Main"], sideMode: "paired" },
  { id: "toe-taps", name: "Toe Taps", position: "Supine", duration: 120, phases: ["Main"], sideMode: "alternating" },
  { id: "pelvic-curl", name: "Pelvic Curl", position: "Supine", duration: 150, phases: ["Warm-up", "Main"] },
  { id: "seated-spine-stretch", name: "Seated Spine Stretch", position: "Seated", duration: 120, phases: ["Cool-down"] },
  { id: "quadruped-rock-back", name: "Quadruped Rock Back", position: "Hands & knees", duration: 120, phases: ["Warm-up", "Main"] },
].map((movement) => ({
  ...movement, phases: movement.phases as LibraryMovement["phases"], sideMode: movement.sideMode as LibraryMovement["sideMode"],
  duration: MOVEMENT_DURATION_SECONDS,
  level: "Beginner", equipment: "Mat", cues: [], reviewStatus: "needs-review",
}));
