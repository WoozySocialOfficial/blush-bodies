import test from "node:test";
import assert from "node:assert/strict";
import {
  insertMovement, mergeLibraryCatalog, movementSourceId, nextPlanningPhase,
  orderMovementsByPosition, phaseRemaining, phaseTotal, positionGroup,
  sequenceForTeaching, sequenceWarnings, suggestMovements, updatePlanSequence,
  classReadiness, selectionDuration, sideLabel, workingSide, MOVEMENT_DURATION_SECONDS,
} from "../src/planning.ts";
import { additionalMovements } from "../src/catalogue.ts";
import { scheduleTimeOptions } from "../src/scheduling.ts";

const movement = (id, position = "Standing", phase = "Main", duration = MOVEMENT_DURATION_SECONDS) => ({
  id, title: id, position, phase, duration, cue: "Test cue",
});
const libraryMovement = (id, options = {}) => ({
  id, name: id, position: "Standing", level: "Beginner", equipment: "Mat",
  duration: MOVEMENT_DURATION_SECONDS, cues: ["Test cue"], ...options,
});
const plan = (movements = [], options = {}) => ({
  id: "test-plan", version: 1, status: "draft", sequenceMode: "auto",
  brief: { program: "Beginner Foundations", week: "Week 1", day: "Day 1",
    equipment: ["Mat"], energy: "Flowing" },
  movements, ...options,
});
const ids = (moves) => moves.map((move) => move.id);

test("today's class times begin at the next quarter hour", () => {
  const now = new Date(2026, 9, 2, 16, 42, 0);
  const today = scheduleTimeOptions("2026-10-02", now);
  assert.equal(today[0], "16:45");
  assert(!today.includes("08:00"));
  assert.equal(scheduleTimeOptions("2026-10-03", now)[0], "00:00");
});

test("auto order groups positions and phases without mutating the input", () => {
  const input = [movement("sitting-a", "Seated"), movement("standing-a"),
    movement("cool", "Supine", "Cool-down"), movement("sitting-b", "Seated"),
    movement("standing-b"), movement("warm", "Standing", "Warm-up")];
  const original = structuredClone(input);
  const sorted = orderMovementsByPosition(input);
  assert.deepEqual(ids(sorted), ["warm", "standing-a", "standing-b", "sitting-a", "sitting-b", "cool"]);
  assert.deepEqual(input, original);
  assert.deepEqual(sequenceWarnings(sorted), []);
  assert.equal(sorted.reduce((sum, item) => sum + item.duration, 0), 450);
});

test("matching left and right variants stay together", () => {
  const sorted = orderMovementsByPosition([
    movement("side-leg-right", "Lying on right"), movement("clamshell-right", "Lying on right"),
    movement("side-leg-left", "Lying on left"), movement("clamshell-left", "Lying on left"),
  ]);
  assert.deepEqual(ids(sorted), ["side-leg-right", "side-leg-left", "clamshell-right", "clamshell-left"]);
});

test("position aliases and unknown groups do not lose movements", () => {
  assert.equal(positionGroup("Supine"), positionGroup("Lying on back"));
  assert.equal(positionGroup("Hands & knees"), positionGroup("Kneeling"));
  assert.equal(positionGroup("Sitting"), positionGroup("Seated"));
  assert.equal(positionGroup("Side-lying"), positionGroup("Lying on left"));
  const sorted = orderMovementsByPosition([movement("custom", "Custom position"), movement("stand")]);
  assert.deepEqual(ids(sorted), ["stand", "custom"]);
});

test("auto order groups custom positions consistently", () => {
  const sorted = orderMovementsByPosition([
    movement("a", "Custom one"), movement("b", "Custom two"), movement("c", "Custom one"),
  ]);
  assert.deepEqual(ids(sorted), ["a", "c", "b"]);
  assert.deepEqual(sequenceWarnings(sorted), []);
});

test("library additions insert into the phase and position group", () => {
  const original = plan([movement("warm", "Standing", "Warm-up"), movement("seated", "Seated"),
    movement("cool", "Supine", "Cool-down")]);
  const next = insertMovement(original, libraryMovement("reach"), "Main", "new-instance");
  assert.deepEqual(ids(next), ["warm", "new-instance", "seated", "cool"]);
  assert.equal(next[1].sourceMovementId, "reach");
  assert.equal(next[1].duration, 75);
  assert.equal(original.movements.length, 3);
});

test("manual addition and teaching preserve instructor order", () => {
  const original = plan([movement("seated", "Seated"), movement("stand"),
    movement("cool", "Supine", "Cool-down")], { sequenceMode: "manual" });
  const next = insertMovement(original, libraryMovement("reach"), "Main", "new");
  assert.deepEqual(ids(next), ["seated", "stand", "new", "cool"]);
  assert.strictEqual(sequenceForTeaching({ ...original, movements: next }), next);
  assert.strictEqual(sequenceForTeaching(plan(next)), next);
});

test("legacy teaching checkpoints retain their original ordering", () => {
  const legacy = plan([movement("right", "Lying on right"), movement("left", "Lying on left"),
    movement("stand")], { sequenceMode: undefined });
  assert.deepEqual(ids(sequenceForTeaching(legacy)), ["stand", "left", "right"]);
  assert.deepEqual(ids(legacy.movements), ["right", "left", "stand"]);
});

test("edits fork a saved plan and retain the original for undo and scheduled classes", () => {
  const saved = plan([movement("old")], { status: "saved" });
  saved.brief.scheduledDate = "2026-10-31";
  saved.brief.scheduledTime = "09:00";
  const snapshot = structuredClone(saved);
  const updated = updatePlanSequence(saved, [movement("new")], "manual", 123);
  assert.equal(updated.id, "test-plan-v2-123");
  assert.equal(updated.version, 2);
  assert.equal(updated.status, "draft");
  assert.equal(updated.sequenceMode, "manual");
  assert.equal(updated.brief.scheduledDate, undefined);
  assert.deepEqual(saved, snapshot);
  assert.equal(updatePlanSequence(updated, []).id, updated.id);
});

test("draft edits preserve their schedule and survive a storage round trip", () => {
  const draft = plan([]);
  draft.brief.scheduledDate = "2026-10-31";
  const updated = updatePlanSequence(draft, [movement("new")]);
  assert.equal(updated.id, draft.id);
  assert.equal(updated.brief.scheduledDate, draft.brief.scheduledDate);
  assert.deepEqual(sequenceForTeaching(JSON.parse(JSON.stringify(updated))), updated.movements);
});

test("phase progress advances only when the target is met", () => {
  assert.equal(nextPlanningPhase(plan()), "Warm-up");
  const draft = plan([movement("warm", "Standing", "Warm-up", 300)]);
  assert.equal(phaseRemaining(draft, "Warm-up"), 0);
  assert.equal(nextPlanningPhase(draft), "Main");
  draft.movements.push(movement("main", "Seated", "Main", 2100));
  assert.equal(nextPlanningPhase(draft), "Cool-down");
  assert.equal(phaseTotal(draft, "Main"), 2100);
});

test("suggestions respect phase, level, equipment and remaining time", () => {
  const draft = plan([{ ...movement("already-added", "Standing", "Warm-up", 225), sourceMovementId: "used" }]);
  const options = { phases: ["Warm-up"] };
  const library = [libraryMovement("valid", options), libraryMovement("used", options),
    libraryMovement("advanced", { ...options, level: "Advanced" }),
    libraryMovement("wrong-phase"), libraryMovement("band", { ...options, equipment: "Mat & Band" }),
    libraryMovement("unknown-level", { ...options, level: "Expert" })];
  const suggested = suggestMovements(draft, library, "Warm-up").map((item) => item.movement.id);
  assert.equal(suggested[0], "valid");
  assert(suggested.includes("used"));
  assert.deepEqual(suggestMovements(draft, library, "Cool-down"), []);
});

test("suggestions prefer the current position, cap at three and stop at the phase limit", () => {
  const draft = plan([movement("existing", "Side-lying")]);
  const library = [libraryMovement("stand"), libraryMovement("sit", { position: "Seated" }),
    libraryMovement("side", { position: "Side-lying" }), libraryMovement("back", { position: "Supine" })];
  const suggestions = suggestMovements(draft, library, "Main");
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0].movement.id, "side");
  assert.equal(suggestions[0].reason, "Same position group");
  assert.equal(suggestMovements(plan([movement("full", "Standing", "Main", 2100)]), library, "Main").length, 0);
  assert.equal(suggestMovements(plan([movement("over", "Standing", "Main", 2101)]), library, "Main").length, 0);
});

test("bodyweight and all listed equipment are recognised", () => {
  const draft = plan();
  draft.brief.equipment = ["Mat", "Band"];
  assert.equal(suggestMovements(draft, [libraryMovement("band", { equipment: "mat, BAND" }),
    libraryMovement("body", { equipment: "Bodyweight" })], "Main").length, 2);
});

test("manual suggestions do not reopen a previous position group", () => {
  const draft = plan([movement("standing"), movement("seated", "Seated")], { sequenceMode: "manual" });
  const library = [libraryMovement("new-standing"), libraryMovement("new-seated", { position: "Seated" })];
  assert.deepEqual(suggestMovements(draft, library, "Main").map((item) => item.movement.id), ["new-seated"]);
  assert.equal(suggestMovements({ ...draft, sequenceMode: "auto" }, library, "Main").length, 2);
});

test("legacy and new movement identities support suggestions and artwork", () => {
  assert.equal(movementSourceId({ id: "shoulder-rolls-1790841600000" }), "shoulder-rolls");
  assert.equal(movementSourceId({ id: "instance", sourceMovementId: "clamshell" }), "clamshell");
  assert.equal(movementSourceId({ id: "single-leg" }), "single-leg-stretch");
});

test("manual warnings flag repeated position transitions and phase reversals", () => {
  assert.match(sequenceWarnings([movement("a"), movement("b", "Seated"), movement("c")])[0], /returns to standing/);
  assert.match(sequenceWarnings([movement("a"), movement("b", "Standing", "Warm-up")])[0], /Phases/);
  assert.deepEqual(sequenceWarnings([movement("a"), movement("b", "Seated")]), []);
});

test("existing libraries receive new catalogue entries without replacing custom data", () => {
  const catalog = [libraryMovement("old", { phases: ["Warm-up"] }), libraryMovement("new")];
  const stored = [libraryMovement("old", { name: "My version", duration: 150 }), libraryMovement("custom")];
  const merged = mergeLibraryCatalog(catalog, stored);
  assert.deepEqual(merged.map((item) => item.id), ["old", "custom", "new"]);
  assert.equal(merged[0].name, "My version");
  assert.equal(merged[0].duration, 75);
  assert.deepEqual(merged[0].phases, ["Warm-up"]);
  assert.deepEqual(mergeLibraryCatalog(catalog, merged), merged);
  assert.equal(stored[0].phases, undefined);
});

test("both sides produce linked cards with the correct supporting positions and total", () => {
  const source = libraryMovement("side-leg-lift", { position: "Side-lying", duration: 120, sideMode: "paired" });
  const next = insertMovement(plan(), source, "Main", "pair-one");
  assert.equal(selectionDuration(source), 150);
  assert.deepEqual(next.map((item) => [item.side, item.position, item.duration]), [
    ["left", "Right side-lying", 75], ["right", "Left side-lying", 75],
  ]);
  assert.equal(next[0].pairId, next[1].pairId);
  assert.notEqual(next[0].id, next[1].id);
  assert.equal(sideLabel(next[0]), "Left side");
  assert.equal(phaseTotal(plan(next), "Main"), 150);
});

test("a single side keeps its duration and remains repairable with the other side", () => {
  const source = libraryMovement("clamshell", { position: "Side-lying", sideMode: "paired" });
  const left = insertMovement(plan(), source, "Main", "left-instance", "left");
  assert.equal(selectionDuration(source, "left"), 75);
  assert.equal(left.length, 1);
  assert(classReadiness(plan(left)).errors.some((message) => message.includes("right side is missing")));
  const repaired = insertMovement(plan(left), source, "Main", "right-instance", "right");
  assert(!classReadiness(plan(repaired)).errors.some((message) => message.includes("side is missing")));
});

test("alternating movements add one card and are not doubled", () => {
  const source = libraryMovement("alternating", { sideMode: "alternating" });
  const next = insertMovement(plan(), source, "Main", "a");
  assert.equal(next.length, 1);
  assert.equal(phaseTotal(plan(next), "Main"), 75);
  assert.equal(sideLabel(next[0]), "Alternating sides");
});

test("working side never comes from the supporting side", () => {
  assert.equal(workingSide(movement("side-leg-left", "Right side-lying")), "left");
  assert.equal(workingSide(movement("unknown", "Left side-lying")), undefined);
  assert.equal(workingSide({ ...movement("legacy"), title: "Clamshell - Right" }), "right");
});

test("suggestions budget for both sides and surface pending review content", () => {
  const draft = plan([movement("existing", "Standing", "Main", 2025)]);
  const paired = libraryMovement("pair", { sideMode: "paired", duration: 60 });
  const sample = libraryMovement("sample", { reviewStatus: "needs-review" });
  const pending = suggestMovements(draft, [paired, sample], "Main");
  assert.deepEqual(pending.map((item) => item.movement.id), ["sample"]);
  assert.equal(pending[0].reason, "Review before adding");
  assert.equal(suggestMovements(draft, [{ ...paired, duration: 45 }], "Main").length, 0);
  assert.equal(suggestMovements(draft, [{ ...sample, reviewStatus: "reviewed" }], "Main").length, 1);
});

test("suggestions can build a complete 35 minute beginner main phase", () => {
  const base = [
    libraryMovement("side-leg-lift", { position: "Side-lying", duration: 120, sideMode: "paired" }),
    libraryMovement("clamshell", { position: "Side-lying", duration: 120, sideMode: "paired" }),
    libraryMovement("spine-twist", { position: "Seated", duration: 120 }),
  ];
  const library = [...base, ...additionalMovements];
  let draft = plan();
  let additions = 0;
  while (phaseRemaining(draft, "Main") > 0 && additions < 28) {
    const suggestion = suggestMovements(draft, library, "Main")[0];
    assert(suggestion, `No suggestion with ${phaseRemaining(draft, "Main")} seconds remaining`);
    const reviewed = { ...suggestion.movement, reviewStatus: "reviewed" };
    const movements = insertMovement(draft, reviewed, "Main", `suggested-${additions}`);
    draft = updatePlanSequence(draft, movements);
    additions += 1;
  }
  assert.equal(phaseTotal(draft, "Main"), 2100);
  assert(additions > 3);
});

const completePlan = () => plan([
  ...Array.from({ length: 4 }, (_, index) =>
    movement(index ? `warm-${index}` : "warm", "Standing", "Warm-up")),
  ...Array.from({ length: 28 }, (_, index) =>
    movement(index ? `main-${index}` : "main", "Seated", "Main")),
  ...Array.from({ length: 4 }, (_, index) =>
    movement(index ? `cool-${index}` : "cool", "Supine", "Cool-down")),
]);

test("readiness checks every phase, invalid durations and incomplete cues", () => {
  assert.deepEqual(classReadiness(completePlan()), { ready: true, errors: [], warnings: [] });
  assert.equal(classReadiness(plan()).errors.length, 3);
  const draft = completePlan();
  draft.movements[4].duration = 74;
  assert(classReadiness(draft).errors.includes("Main is 0:01 short."));
  draft.movements[4].duration = NaN;
  draft.movements[4].cue = "";
  assert.equal(classReadiness(draft).ready, false);
  assert(classReadiness(draft).errors.some((message) => message.includes("positive number")));
  assert(classReadiness(draft).errors.some((message) => message.includes("complete the name")));
});

test("balanced cards are required even when total class timing is correct", () => {
  const draft = completePlan();
  draft.movements.splice(4, 2,
    { ...movement("left", "Side-lying", "Main", 60), sourceMovementId: "pair", side: "left", requiresPair: true },
    { ...movement("right", "Side-lying", "Main", 90), sourceMovementId: "pair", side: "right", requiresPair: true });
  assert.equal(phaseTotal(draft, "Main"), 2100);
  assert(classReadiness(draft).errors.some((message) => message.includes("matching time")));
  draft.movements[4].duration = 75;
  draft.movements[5].duration = 75;
  assert.equal(classReadiness(draft).ready, true);
  assert.equal(classReadiness(JSON.parse(JSON.stringify(draft))).ready, true);
});

test("a side in a different phase does not hide a missing counterpart", () => {
  const source = libraryMovement("paired", { sideMode: "paired" });
  const next = insertMovement(plan(), source, "Main", "pair");
  next[1].phase = "Cool-down";
  const errors = classReadiness(plan(next)).errors;
  assert(errors.some((message) => message.includes("right side is missing")));
  assert(errors.some((message) => message.includes("left side is missing")));
});

test("readiness separates sequence warnings from blocking phase order errors", () => {
  const draft = completePlan();
  draft.movements[4].position = "Standing";
  draft.movements[5].position = "Seated";
  draft.movements[6].position = "Standing";
  assert.equal(classReadiness(draft).ready, true);
  assert.equal(classReadiness(draft).warnings.length, 1);
  [draft.movements[0], draft.movements[35]] = [draft.movements[35], draft.movements[0]];
  assert(classReadiness(draft).errors.some((message) => message.includes("in that order")));
});

test("unreviewed library content cannot pass readiness", () => {
  const source = libraryMovement("main", { reviewStatus: "needs-review" });
  assert.equal(classReadiness(completePlan(), [source]).ready, false);
  assert.equal(classReadiness(completePlan(), [{ ...source, reviewStatus: "reviewed" }]).ready, true);
});

test("readiness blocks a movement assigned outside its approved phases", () => {
  const draft = completePlan();
  const source = libraryMovement("main", { phases: ["Warm-up"] });
  const report = classReadiness(draft, [source]);
  assert.equal(report.ready, false);
  assert(report.errors.includes("main: main is not an approved phase."));
  source.phases = ["Main"];
  assert.equal(classReadiness(draft, [source]).ready, true);
});

test("catalogue additions stay samples with standard movement timing", () => {
  assert.equal(additionalMovements.length, 13);
  assert(additionalMovements.every((item) => item.reviewStatus === "needs-review"));
  assert.equal(new Set(additionalMovements.map((item) => item.id)).size, additionalMovements.length);
  assert(additionalMovements.every((item) => item.duration === MOVEMENT_DURATION_SECONDS));
  assert(additionalMovements.some((item) => item.phases.includes("Main")));
});

test("catalogue merges preserve instructor approvals and explicit side choices", () => {
  const sample = libraryMovement("paired", { sideMode: "paired", reviewStatus: "needs-review" });
  const reviewed = { ...sample, sideMode: "together", reviewStatus: "reviewed", reviewedBy: "Test instructor", reviewedAt: 123 };
  const merged = mergeLibraryCatalog([sample], [reviewed]);
  const normalized = [{ ...reviewed, duration: MOVEMENT_DURATION_SECONDS }];
  assert.deepEqual(merged, normalized);
  assert.deepEqual(mergeLibraryCatalog([sample], JSON.parse(JSON.stringify(merged))), normalized);
});
