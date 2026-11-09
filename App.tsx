import { StatusBar } from "expo-status-bar";
import { additionalMovements, retiredMovementIds } from "./src/catalogue";
import { manualArtwork } from "./src/manualArtwork";
import { createCataloguePlan, replaceCatalogueMovement } from "./src/cataloguePlanning";
import {
  filterSchedule,
  isFutureScheduleSlot,
  nextAvailableClassSlot,
  rescheduleSlot,
  scheduleSlotsOverlap,
  scheduleTimeOptions,
  timeFromMinutes,
  type ScheduleFilter,
} from "./src/scheduling";
import {
  classCalendarFileName,
  classCalendarIcs,
  googleCalendarUrl,
} from "./src/calendar";
import {
  pruneRecentlyDeleted,
  recentlyDeletedDaysRemaining,
  restoreScheduleAssignments,
} from "./src/recentlyDeleted";
import {
  MOVEMENT_DURATION_SECONDS, PHASES, insertMovement, mergeLibraryCatalog, movementSourceId, nextPlanningPhase,
  orderMovementsByPosition, phaseRemaining, phaseTarget, phaseTotal,
  planLevel, positionGroup, sequenceForTeaching, sequenceWarnings,
  suggestMovements, syncMovementImage, updatePlanSequence, classReadiness, selectionDuration, sideLabel, workingSide,
  type ClassPlan, type LibraryMovement, type Phase, type PlanBrief,
  type PlanMovement, type SequenceMode, type SideSelection, type WorkingSide, type ReadinessReport,
} from "./src/planning";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { useAudioPlayer } from "expo-audio";
import { useKeepAwake } from "expo-keep-awake";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Calendar, type DateData } from "react-native-calendars";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  House,
  ImagePlus,
  LibraryBig,
  List,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  UserRound,
  X,
  TriangleAlert,
} from "lucide-react-native";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageStyle,
  type ViewStyle,
  type StyleProp,
} from "react-native";

type Tab = "home" | "classes" | "library" | "insights" | "profile";
type Role = "instructor";
type Screen =
  | Tab
  | "welcome"
  | "signin"
  | "signup"
  | "resetPassword"
  | "create"
  | "generated"
  | "editor"
  | "details"
  | "customMovement"
  | "teach"
  | "summary"
  | "sessionDetails"
  | "assign"
  | "schedule"
  | "recentlyDeleted"
  | "managePlan"
  | "dataSettings"
  | "changePassword";
type Account = { name: string; email: string; role: Role; phone?: string };
type SessionResult = {
  startedAt: number;
  endedAt: number;
  completed: number;
  total: number;
  plannedSeconds: number;
  actualSeconds: number;
  planId?: string;
  program?: string;
  scheduledClassId?: string;
  notes?: string;
};
type ActiveTeachingSession = {
  plan: ClassPlan;
  scheduledClassId?: string;
  startedAt: number;
  movementIndex: number;
  remainingSeconds: number;
  held: boolean;
  savedAt: number;
};
type ScheduledClass = {
  id: string;
  date: string;
  time: string;
  level: string;
  lesson: string;
  status:
    | "READY"
    | "NEEDS PLAN"
    | "DRAFT"
    | "IN PROGRESS"
    | "COMPLETED"
    | "CANCELLED";
  planId?: string;
};
type DeletedScheduleAssignment = Pick<ScheduledClass, "id" | "status">;
type RecentlyDeletedItem =
  | {
      id: string;
      kind: "movement";
      deletedAt: number;
      movement: LibraryMovement;
    }
  | {
      id: string;
      kind: "draft" | "plan";
      deletedAt: number;
      plan: ClassPlan;
      assignments: DeletedScheduleAssignment[];
    };
type PendingUndo =
  | { kind: "deleted"; message: string; item: RecentlyDeletedItem }
  | { kind: "cancelled"; message: string; scheduledClass: ScheduledClass };
type InstructorPreferences = {
  teachingMode: "Guided" | "Minimal";
  vibration: boolean;
  countdownSound: boolean;
  completionSound: boolean;
  offline: boolean;
};
type LocalCredential = {
  name: string;
  email: string;
  role: Role;
  salt: string;
  passwordHash: string;
};
type StoredAppData = {
  account: Account;
  plan: ClassPlan;
  hasActiveDraft: boolean;
  savedPlans: ClassPlan[];
  sessionHistory: SessionResult[];
  schedule: ScheduledClass[];
  libraryMovements: LibraryMovement[];
  deletedMovementIds: string[];
  recentlyDeleted: RecentlyDeletedItem[];
  favourites: string[];
  instructorPreferences: InstructorPreferences;
  activeTeachingSession?: ActiveTeachingSession;
};
const LEGACY_STORAGE_KEY = "@blush-bodies/app-data-v1";
const USER_STORAGE_PREFIX = "@blush-bodies/user-data-v2/";
const userStorageKey = (account: Pick<Account, "role" | "email">) =>
  `${USER_STORAGE_PREFIX}${account.role}/${account.email.toLowerCase()}`;
const CREDENTIALS_KEY = "blush-bodies-local-credentials-v1";
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const ALLOW_SANDBOX_PASSWORD_RESET = __DEV__;
const DEMO_ACCOUNT: Account = {
  name: "Blush Bodies Instructor",
  email: "demo@blushbodies.com",
  role: "instructor",
};
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "blush-bodies.credentials",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const INVALID_CREDENTIAL_SALT = "blush-bodies-invalid-credential";
const SIGN_IN_FAILURE_LIMIT = 5;
const SIGN_IN_LOCK_MS = 30_000;
const SESSION_BACKGROUND_LOCK_MS = 5 * 60_000;
const signInAttempts = new Map<
  string,
  { failures: number; blockedUntil: number; lastFailure: number }
>();
const passwordValidationError = (password: string) => {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Use no more than ${PASSWORD_MAX_LENGTH} characters.`;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
    return "Include uppercase, lowercase and a number.";
  return null;
};
const signInAttemptKey = (role: Role, email: string) =>
  `${role}:${email.toLowerCase()}`;
const signInBlockedMessage = (blockedUntil: number) =>
  `Too many sign-in attempts. Try again in ${Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000))} seconds.`;
const recordSignInFailure = (key: string) => {
  const now = Date.now();
  const previous = signInAttempts.get(key);
  const failures =
    previous && now - previous.lastFailure < 15 * 60_000
      ? previous.failures + 1
      : 1;
  const penaltyLevel = Math.max(0, failures - SIGN_IN_FAILURE_LIMIT);
  const blockedUntil =
    failures >= SIGN_IN_FAILURE_LIMIT
      ? now + Math.min(5 * 60_000, SIGN_IN_LOCK_MS * 2 ** penaltyLevel)
      : 0;
  signInAttempts.set(key, { failures, blockedUntil, lastFailure: now });
  return blockedUntil;
};
const hashPassword = (password: string, salt: string) =>
  Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
const readCredentials = async (): Promise<LocalCredential[]> => {
  if (Platform.OS === "web") {
    const raw = await AsyncStorage.getItem(CREDENTIALS_KEY);
    return raw ? (JSON.parse(raw) as LocalCredential[]) : [];
  }
  let raw = await SecureStore.getItemAsync(
    CREDENTIALS_KEY,
    SECURE_STORE_OPTIONS,
  );
  if (!raw) {
    const legacyValue = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    if (legacyValue) {
      await SecureStore.setItemAsync(
        CREDENTIALS_KEY,
        legacyValue,
        SECURE_STORE_OPTIONS,
      );
      await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
      raw = legacyValue;
    }
  }
  return raw ? (JSON.parse(raw) as LocalCredential[]) : [];
};
const writeCredentials = async (
  credentials: LocalCredential[],
): Promise<void> => {
  const value = JSON.stringify(credentials);
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(CREDENTIALS_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(
    CREDENTIALS_KEY,
    value,
    SECURE_STORE_OPTIONS,
  );
};
const deleteCredentials = async (): Promise<void> => {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(CREDENTIALS_KEY);
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(CREDENTIALS_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(CREDENTIALS_KEY),
  ]);
};
const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateKeyFromOffset = (days: number, from = new Date()) => {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};
const dateFromKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};
const classDateLabel = (key: string, long = false) => {
  const target = dateFromKey(key);
  const today = dateFromKey(localDateKey());
  const difference = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  const calendarDate = target.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: long ? "long" : "short",
    year: target.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
  if (difference === 0) return long ? `Today, ${calendarDate}` : "Today";
  if (difference === 1) return long ? `Tomorrow, ${calendarDate}` : "Tomorrow";
  return target.toLocaleDateString("en-ZA", {
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
  });
};
const openGoogleCalendar = async (scheduledClass: ScheduledClass) => {
  const url = googleCalendarUrl(scheduledClass);
  if (!(await Linking.canOpenURL(url)))
    throw new Error("Google Calendar is unavailable.");
  await Linking.openURL(url);
};
const shareCalendarEvent = async (scheduledClass: ScheduledClass) => {
  if (!FileSystem.cacheDirectory)
    throw new Error("Calendar file storage is unavailable.");
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Calendar sharing is unavailable on this device.");
  const path = `${FileSystem.cacheDirectory}${classCalendarFileName(scheduledClass)}`;
  await FileSystem.writeAsStringAsync(path, classCalendarIcs(scheduledClass), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(path, {
    dialogTitle: "Add class to calendar",
    mimeType: "text/calendar",
    UTI: "public.ics",
  });
};
const addClassToCalendar = (scheduledClass: ScheduledClass) => {
  const handleError = () =>
    Alert.alert(
      "Calendar unavailable",
      "The class could not be opened in a calendar. Please try again.",
    );
  if (Platform.OS === "web") {
    void openGoogleCalendar(scheduledClass).catch(handleError);
    return;
  }
  Alert.alert(
    "Add to calendar",
    `${classDateLabel(scheduledClass.date, true)} at ${scheduledClass.time}`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Apple / Other",
        onPress: () => void shareCalendarEvent(scheduledClass).catch(handleError),
      },
      {
        text: "Google Calendar",
        onPress: () => void openGoogleCalendar(scheduledClass).catch(handleError),
      },
    ],
  );
};
const useLiveNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};
const PROGRAM_DAY_OPTIONS = Array.from({ length: 4 }, (_, weekIndex) =>
  Array.from(
    { length: 5 },
    (_, dayIndex) => `Week ${weekIndex + 1} · Day ${dayIndex + 1}`,
  ),
).flat();
const normalizeProgramDay = (value: string) => {
  const week = value.match(/Week\s+\d+/i)?.[0];
  const day = value.match(/Day\s+\d+/i)?.[0];
  if (!week || !day) return PROGRAM_DAY_OPTIONS[0];
  const normalized = `${week.replace(/^week/i, "Week")} · ${day.replace(/^day/i, "Day")}`;
  return PROGRAM_DAY_OPTIONS.includes(normalized)
    ? normalized
    : PROGRAM_DAY_OPTIONS[0];
};
const C = {
  bg: "#FBF8F6",
  card: "#FFFFFF",
  ink: "#373133",
  muted: "#70686A",
  line: "#E9DEDA",
  rose: "#95596B",
  pale: "#EBCFD4",
  sage: "#60796B",
  paleSage: "#EEF4EF",
  gold: "#9A7044",
  dark: "#242022",
  darkCard: "#322C2E",
  white: "#FFFFFF",
};
const MOVEMENT_POSITIONS = [
  "Standing",
  "Seated",
  "Kneeling",
  "Hands & knees",
  "Side-lying",
  "Left side-lying",
  "Right side-lying",
  "Supine",
  "Prone",
];
const confirmAction = ({
  title,
  message,
  confirmText,
  onConfirm,
  cancelText = "Cancel",
  destructive = false,
}: {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  cancelText?: string;
  destructive?: boolean;
}) => {
  if (Platform.OS === "web") {
    if (globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, style: "cancel" },
    {
      text: confirmText,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
};
const initialLibrary: LibraryMovement[] = additionalMovements;
const initialSchedule: ScheduledClass[] = [];
const fmt = (n: number) =>
  String(Math.floor(Math.max(0, n) / 60)).padStart(2, "0") +
  ":" +
  String(Math.max(0, n) % 60).padStart(2, "0");
const planTotal = (plan: ClassPlan) =>
  plan.movements.reduce((total, movement) => total + movement.duration, 0);
const movementLabel = (movement: PlanMovement) =>
  `${movement.title}${sideLabel(movement) ? ` / ${sideLabel(movement)}` : ""}`;
const recoverTeachingPosition = (
  session: ActiveTeachingSession,
  movements: PlanMovement[],
) => {
  if (!movements.length) return { movementIndex: 0, remainingSeconds: 0 };
  let movementIndex = Math.max(
    0,
    Math.min(movements.length - 1, session.movementIndex),
  );
  let remainingSeconds = Math.max(0, session.remainingSeconds);
  let elapsedSeconds = session.held
    ? 0
    : Math.max(0, Math.floor((Date.now() - session.savedAt) / 1000));

  while (remainingSeconds === 0 && movementIndex < movements.length - 1) {
    movementIndex += 1;
    remainingSeconds = Math.max(1, movements[movementIndex].duration);
  }
  while (elapsedSeconds > 0) {
    if (elapsedSeconds < remainingSeconds) {
      remainingSeconds -= elapsedSeconds;
      elapsedSeconds = 0;
      break;
    }
    elapsedSeconds -= remainingSeconds;
    if (movementIndex === movements.length - 1) {
      remainingSeconds = 0;
      break;
    }
    movementIndex += 1;
    remainingSeconds = Math.max(1, movements[movementIndex].duration);
  }

  return { movementIndex, remainingSeconds };
};
const movementArtworkSource = (
  movement: Pick<PlanMovement, "id" | "position" | "sourceMovementId">,
) => {
  const photo = manualArtwork[movementSourceId(movement)];
  if (photo) return photo;
  switch (movementSourceId(movement)) {
    case "breath-centre":
    case "closing-breath":
      return require("./assets/movement-breath-centre.jpg");
    case "shoulder-rolls":
      return require("./assets/movement-shoulder-rolls.jpg");
    case "cat-cow":
      return require("./assets/movement-cat-cow.jpg");
    case "roll-down":
      return require("./assets/movement-roll-down.jpg");
    case "side-leg-lift":
    case "side-leg-right":
    case "side-leg-left":
      return require("./assets/movement-side-leg-lift.jpg");
    case "clamshell":
    case "clamshell-right":
    case "clamshell-left":
      return require("./assets/movement-clamshell.jpg");
    case "hundred":
      return require("./assets/movement-hundred.jpg");
    case "single-leg":
    case "single-leg-stretch":
      return require("./assets/movement-single-leg-stretch.jpg");
    case "donkey-kick":
      return require("./assets/movement-donkey-kick.jpg");
    case "spine-twist":
      return require("./assets/movement-spine-twist.jpg");
    case "figure-four":
      return require("./assets/movement-figure-four.jpg");
    case "supine-twist":
      return require("./assets/movement-supine-twist.jpg");
    case "standing-reach":
      return require("./assets/movement-standing-reach.jpg");
    case "hip-circles":
      return require("./assets/movement-hip-circles.jpg");
    case "bridge":
    case "pelvic-curl":
      return require("./assets/movement-bridge.jpg");
    case "bird-dog":
      return require("./assets/movement-bird-dog.jpg");
    case "standing-side-bend":
      return require("./assets/movement-standing-side-bend.jpg");
    case "standing-heel-raise":
      return require("./assets/movement-standing-heel-raise.jpg");
    case "seated-march":
      return require("./assets/movement-seated-march.jpg");
    case "knee-folds":
      return require("./assets/movement-knee-folds.jpg");
    case "heel-slides":
      return require("./assets/movement-heel-slides.jpg");
    case "toe-taps":
      return require("./assets/movement-toe-taps.jpg");
    case "seated-spine-stretch":
      return require("./assets/movement-seated-spine-stretch.jpg");
    case "quadruped-rock-back":
      return require("./assets/movement-quadruped-rock-back.jpg");
    case "mountain-breath":
      return require("./assets/movement-breath-centre.jpg");
    case "arm-circles":
      return require("./assets/movement-arm-circles.jpg");
    case "heel-toe-rocks":
      return require("./assets/movement-heel-toe-rocks.jpg");
    case "standing-hip-hinge":
      return require("./assets/movement-standing-hip-hinge.jpg");
    case "thoracic-rotation":
      return require("./assets/movement-thoracic-rotation.jpg");
    case "thread-the-needle":
      return require("./assets/movement-thread-the-needle.jpg");
    case "pelvic-tilt":
      return require("./assets/movement-pelvic-tilt.jpg");
    case "knee-sways":
      return require("./assets/movement-knee-sways.jpg");
    case "chest-lift":
      return require("./assets/movement-chest-lift.jpg");
    case "dead-bug":
      return require("./assets/movement-dead-bug.jpg");
    case "swimming":
      return require("./assets/movement-swimming.jpg");
    case "swan-prep":
      return require("./assets/movement-swan-prep.jpg");
    case "forearm-plank":
      return require("./assets/movement-forearm-plank.jpg");
    case "mermaid-stretch":
      return require("./assets/movement-mermaid-stretch.jpg");
    case "child-pose":
      return require("./assets/movement-child-pose.jpg");
    case "happy-baby":
      return require("./assets/movement-happy-baby.jpg");
    default:
      return undefined;
  }
};
const movementArtworkMode = (
  movement: Pick<PlanMovement, "id" | "position" | "sourceMovementId">,
) =>
  movementSourceId(movement).startsWith("manual-") ? "contain" : [
    "breath-centre",
    "closing-breath",
    "shoulder-rolls",
    "roll-down",
    "standing-reach",
    "hip-circles",
    "standing-side-bend",
    "standing-heel-raise",
    "mountain-breath",
    "arm-circles",
    "heel-toe-rocks",
    "standing-hip-hinge",
  ].includes(movementSourceId(movement))
    ? "contain"
    : "cover";
const createPlan = (brief: PlanBrief, library = initialLibrary): ClassPlan =>
  createCataloguePlan(brief, library, `BB-${Crypto.randomUUID()}`);

function MovementVisual({ movement, style, label, resizeMode }: {
  movement: Pick<PlanMovement, "id" | "position" | "sourceMovementId" | "imageUri">;
  style: StyleProp<ImageStyle>;
  label: string;
  resizeMode?: "cover" | "contain";
}) {
  const source = movement.imageUri ? { uri: movement.imageUri } : movementArtworkSource(movement);
  return source ? (
    <Image source={source} style={style}
      resizeMode={resizeMode ?? (movement.imageUri ? "cover" : movementArtworkMode(movement))}
      accessibilityLabel={label} />
  ) : (
    <View style={[style as StyleProp<ViewStyle>, s.pendingVisual]} accessibilityLabel={movementSourceId(movement).startsWith("manual-") ? "No photo supplied in the manual" : "Movement visual pending"}>
      <UserRound size={24} color={C.rose} />
    </View>
  );
}
function TeachingKeepAwake() {
  useKeepAwake("blush-bodies-teaching-session");
  return null;
}
function ReadinessChecks({ report }: { report: ReadinessReport }) {
  return (
    <View style={s.readiness}>
      <View style={s.readinessHeading}>
        {report.ready ? <Check size={18} color={C.sage} /> : <TriangleAlert size={18} color={C.rose} />}
        <Text style={s.blockTitle}>Class readiness</Text>
      </View>
      <Text style={report.ready ? s.sequenceNotice : s.formError}>
        {report.ready ? report.warnings.length ? "Ready with sequence warnings" : "Timing and side checks passed" :
          `${report.errors.length} ${report.errors.length === 1 ? "fix" : "fixes"} needed`}
      </Text>
      {report.errors.map((message) => <Text key={message} style={s.readinessError}>{message}</Text>)}
      {report.warnings.map((message) => <Text key={message} style={s.planningWarning}>{message}</Text>)}
    </View>
  );
}
function Art({ dark = false }: { dark?: boolean }) {
  const ink = dark ? "#F2D7DC" : C.rose;
  return (
    <View style={[s.art, dark && s.artDark]}>
      <View
        style={[s.artDisk, { backgroundColor: dark ? "#765F65" : "#DDBEC5" }]}
      />
      <View style={[s.artHead, { borderColor: ink }]} />
      <View style={[s.artBody, { borderColor: ink }]} />
    </View>
  );
}
function Pill({
  label,
  active = false,
  green = false,
}: {
  label: string;
  active?: boolean;
  green?: boolean;
}) {
  return (
    <View style={[s.pill, active && (green ? s.pillGreen : s.pillRose)]}>
      <Text style={[s.pillText, active && (green ? s.greenText : s.roseText)]}>
        {label}
      </Text>
    </View>
  );
}
function Main({
  label,
  onPress,
  Icon,
}: {
  label: string;
  onPress: () => void;
  Icon?: typeof Plus;
}) {
  return (
    <Pressable onPress={onPress} style={s.main}>
      {Icon ? <Icon size={17} color={C.white} /> : null}
      <Text style={s.mainText}>{label}</Text>
    </Pressable>
  );
}
function Outline({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.outline}>
      <Text style={s.outlineText}>{label}</Text>
    </Pressable>
  );
}
function UndoBanner({
  message,
  undo,
  dismiss,
}: {
  message: string;
  undo: () => void;
  dismiss: () => void;
}) {
  return (
    <View style={s.undoBanner} accessibilityLiveRegion="polite">
      <Text style={s.undoBannerText} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        onPress={undo}
        style={s.undoBannerAction}
        accessibilityRole="button"
        accessibilityLabel="Undo last deletion"
      >
        <Undo2 size={16} color={C.white} />
        <Text style={s.undoBannerActionText}>Undo</Text>
      </Pressable>
      <Pressable
        onPress={dismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss undo"
      >
        <X size={17} color={C.white} />
      </Pressable>
    </View>
  );
}
function Header({
  title,
  back,
  right,
}: {
  title: string;
  back?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      {back ? (
        <Pressable onPress={back}>
          <ArrowLeft size={21} color={C.muted} />
        </Pressable>
      ) : null}
      <Text style={s.headerTitle}>{title}</Text>
      <View style={s.headerRight}>{right}</View>
    </View>
  );
}
function TopSafeArea() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top }} />;
}
function Nav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const items: [Tab, string, typeof House][] = [
    ["home", "Home", House],
    ["classes", "Classes", CalendarDays],
    ["library", "Library", LibraryBig],
    ["insights", "Insights", BarChart3],
    ["profile", "Profile", UserRound],
  ];
  return (
    <View style={s.nav}>
      {items.map(([id, label, Icon]) => (
        <Pressable key={id} onPress={() => setTab(id)} style={s.navItem}>
          <Icon size={22} color={id === tab ? C.rose : C.muted} />
          <Text style={[s.navLabel, id === tab && s.navLabelOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Welcome({
  getStarted,
  logIn,
}: {
  getStarted: () => void;
  logIn: () => void;
}) {
  return (
    <View style={s.welcome}>
      <StatusBar style="dark" />
      <View style={s.brand}>
        <Text style={s.brandTitle}>BLUSH BODIES</Text>
        <Text style={s.brandSub}>MOVE WITH INTENTION</Text>
      </View>
      <Art />
      <View style={s.welcomeCopy}>
        <Text style={s.hero}>Plan with clarity.</Text>
        <Text style={s.hero}>Teach with confidence.</Text>
        <Text style={s.sub}>
          Your instructor workspace for planning, scheduling and teaching.
        </Text>
      </View>
      <View style={s.welcomeActions}>
        <Main label="Get Started" onPress={getStarted} />
        <Outline label="Log In" onPress={logIn} />
      </View>
    </View>
  );
}
function SignIn({
  back,
  complete,
  openDemo,
  signup,
  resetPassword,
  allowSandboxReset,
  role,
}: {
  back: () => void;
  complete: (email: string, password: string) => Promise<string | null>;
  openDemo?: () => Promise<void>;
  signup: () => void;
  resetPassword: (email: string) => void;
  allowSandboxReset: boolean;
  role: Role;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isInstructor = role === "instructor";
  const submit = async () => {
    if (submitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password.trim()) {
      setError("Enter your email and password to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const message = await complete(normalizedEmail, password);
      if (message) setError(message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <View style={s.flex}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.signin}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={back}
        >
          <ArrowLeft size={22} color={C.muted} />
        </Pressable>
        <View style={s.signinBrand}>
          <Text style={s.brandTitle}>BLUSH BODIES</Text>
          <Text style={s.brandSub}>
            {isInstructor ? "INSTRUCTOR" : "CLIENT"}
          </Text>
        </View>
        <View style={s.signinCopy}>
          <Text style={s.signinTitle}>Welcome back</Text>
          <Text style={s.sub}>
            {isInstructor
              ? "Sign in to access your plans, library and teaching schedule."
              : "Sign in to book classes and manage your Blush routine."}
          </Text>
        </View>
        <View style={s.form}>
          <Text style={s.label}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            maxLength={254}
            placeholder={
              isInstructor ? "coach@blushbodies.com" : "you@email.com"
            }
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError("");
            }}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            maxLength={PASSWORD_MAX_LENGTH}
            placeholder="Enter password"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <Main
            label={submitting ? "Checking Account..." : "Sign In"}
            onPress={submit}
          />
          {openDemo ? (
            <Outline
              label="Open Demo Workspace"
              onPress={() => void openDemo()}
            />
          ) : null}
          <Pressable accessibilityRole="button" onPress={signup}>
            <Text style={s.forgot}>Create a new account</Text>
          </Pressable>
          {allowSandboxReset ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => resetPassword(email.trim().toLowerCase())}
            >
              <Text style={s.forgot}>Reset local test password</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={s.demoNote}>
          <Text style={s.whyLabel}>DEMO SESSION</Text>
          <Text style={s.whyCopy}>
            {Platform.OS === "web"
              ? "Browser preview accounts are local demo data and are not production authentication."
              : "Native prototype credentials are protected by this device's secure storage."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
function SandboxPasswordReset({
  back,
  reset,
  role,
  initialEmail,
}: {
  back: () => void;
  reset: (email: string, password: string) => Promise<string | null>;
  role: Role;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter the email used for this local account.");
      return;
    }
    const passwordError = passwordValidationError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const message = await reset(normalizedEmail, password);
      if (message) {
        setError(message);
        return;
      }
      if (Platform.OS === "web") {
        globalThis.alert(
          "Your local test password was updated. You can sign in now.",
        );
        back();
        return;
      }
      Alert.alert(
        "Test password reset",
        "Your local password was updated. You can sign in now.",
        [{ text: "Sign In", onPress: back }],
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <View style={s.flex}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={s.signin}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={back}
        >
          <ArrowLeft size={22} color={C.muted} />
        </Pressable>
        <View style={s.signinBrand}>
          <Text style={s.brandTitle}>BLUSH BODIES</Text>
          <Text style={s.brandSub}>LOCAL TEST RESET</Text>
        </View>
        <View style={s.signinCopy}>
          <Text style={s.signinTitle}>Reset test password</Text>
          <Text style={s.sub}>
            Update the password for an existing {role} account stored on this
            device.
          </Text>
        </View>
        <View style={s.form}>
          <Text style={s.label}>ACCOUNT EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            maxLength={254}
            placeholder="you@email.com"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>NEW PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError("");
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={PASSWORD_MAX_LENGTH}
            placeholder="Create a new password"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>CONFIRM NEW PASSWORD</Text>
          <TextInput
            value={confirmation}
            onChangeText={(value) => {
              setConfirmation(value);
              setError("");
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={PASSWORD_MAX_LENGTH}
            placeholder="Repeat the new password"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <Main
            label={submitting ? "Resetting Password..." : "Reset Test Password"}
            onPress={submit}
          />
        </View>
        <View style={s.demoNote}>
          <Text style={s.whyLabel}>SANDBOX ONLY</Text>
          <Text style={s.whyCopy}>
            No email is sent. Production accounts will require verified reset
            links from a backend service.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
function SignUp({
  back,
  complete,
  role,
}: {
  back: () => void;
  complete: (account: Account, password: string) => Promise<string | null>;
  role: Role;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || !password.trim()) {
      setError("Complete your name, email and password to create an account.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    const passwordError = passwordValidationError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const message = await complete(
        { name: name.trim(), email: normalizedEmail, role },
        password,
      );
      if (message) setError(message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <View style={s.flex}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.signin}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={back}
        >
          <ArrowLeft size={22} color={C.muted} />
        </Pressable>
        <View style={s.signinBrand}>
          <Text style={s.brandTitle}>BLUSH BODIES</Text>
          <Text style={s.brandSub}>
            {role === "instructor" ? "INSTRUCTOR" : "CLIENT"}
          </Text>
        </View>
        <View style={s.signinCopy}>
          <Text style={s.signinTitle}>Create your account</Text>
          <Text style={s.sub}>
            Start your {role === "instructor" ? "teaching" : "movement"}{" "}
            experience.
          </Text>
        </View>
        <View style={s.form}>
          <Text style={s.label}>FULL NAME</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              setError("");
            }}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={100}
            placeholder="Your full name"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            maxLength={254}
            placeholder="you@email.com"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError("");
            }}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={PASSWORD_MAX_LENGTH}
            placeholder="Create password"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>CONFIRM PASSWORD</Text>
          <TextInput
            value={confirmation}
            onChangeText={(value) => {
              setConfirmation(value);
              setError("");
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={PASSWORD_MAX_LENGTH}
            placeholder="Repeat password"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.sub}>
            At least {PASSWORD_MIN_LENGTH} characters with uppercase, lowercase
            and a number.
          </Text>
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <Main
            label={submitting ? "Creating Account..." : "Create Account"}
            onPress={submit}
          />
        </View>
        <View style={s.demoNote}>
          <Text style={s.whyLabel}>PROTOTYPE ACCOUNT</Text>
          <Text style={s.whyCopy}>
            {Platform.OS === "web"
              ? "Browser preview accounts stay in this browser and are for demonstration only."
              : "Your profile stays on this device and credentials are protected by secure storage."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
function InstructorHome({
  schedule,
  account,
  selectedDate,
  setSelectedDate,
  activeSession,
  create,
  assign,
  start,
  resume,
  review,
  modify,
  remove,
  getPlanTitle,
}: {
  schedule: ScheduledClass[];
  account: Account;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  activeSession?: ActiveTeachingSession;
  create: () => void;
  assign: (slot: ScheduledClass) => void;
  start: (slot: ScheduledClass) => void;
  resume: () => void;
  review: (slot: ScheduledClass) => void;
  modify: (slot: ScheduledClass) => void;
  remove: (slot: ScheduledClass) => void;
  getPlanTitle: (slot: ScheduledClass) => string | undefined;
}) {
  const firstName = account.name.split(" ")[0];
  const now = useLiveNow();
  const today = localDateKey(now);
  const swipeBlockedUntil = useRef<Record<string, number>>({});
  const visibleSchedule = schedule.filter(
    (item) => item.date === selectedDate && item.status !== "CANCELLED",
  );
  const readyCount = visibleSchedule.filter(
    (item) => item.planId && item.status === "READY",
  ).length;
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const beginSwipe = (id: string) => {
    swipeBlockedUntil.current[id] = Number.POSITIVE_INFINITY;
  };
  const finishSwipe = (id: string) => {
    swipeBlockedUntil.current[id] = Date.now() + 250;
  };
  const swipeIsBlocked = (id: string) =>
    (swipeBlockedUntil.current[id] ?? 0) > Date.now();
  useEffect(() => {
    if (selectedDate < today) setSelectedDate(today);
  }, [selectedDate, setSelectedDate, today]);
  const upcomingDays = Array.from({ length: 5 }, (_, offset) => {
    const key = dateKeyFromOffset(offset, now);
    const date = dateFromKey(key);
    return {
      key,
      day: date.toLocaleDateString("en-ZA", { weekday: "short" }),
      number: String(date.getDate()),
    };
  });
  return (
    <ScrollView style={s.flex} contentContainerStyle={s.page}>
      <View style={s.row}>
        <View style={s.flex}>
          <Text style={s.title}>
            {greeting}, {firstName}
          </Text>
          <Text style={s.sub}>
            {visibleSchedule.length} scheduled classes / {readyCount} ready to
            teach
          </Text>
        </View>
        <View style={s.avatar}>
          <UserRound size={20} color={C.rose} />
        </View>
      </View>
      {activeSession ? (
        <Pressable onPress={resume} style={s.resumeSession}>
          <View style={s.resumeIcon}>
            <Play size={18} color={C.white} fill={C.white} />
          </View>
          <View style={s.flex}>
            <Text style={s.resumeLabel}>CLASS IN PROGRESS</Text>
            <Text style={s.resumeTitle}>{activeSession.plan.brief.program}</Text>
            <Text style={s.resumeMeta}>
              Step {activeSession.movementIndex + 1} of{" "}
              {activeSession.plan.movements.length} · tap to resume
            </Text>
          </View>
          <ChevronRight size={20} color={C.rose} />
        </Pressable>
      ) : null}
      <View style={s.days}>
        {upcomingDays.map(({ key, day, number }) => {
          const selected = key === selectedDate;
          return (
            <Pressable
              key={key}
              onPress={() => setSelectedDate(key)}
              style={[s.day, selected && s.dayOn]}
            >
              <Text style={[s.dayText, selected && s.roseText]}>{day}</Text>
              <Text style={[s.dayNumber, selected && s.roseText]}>
                {number}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={s.row}>
        <Text style={s.section}>{classDateLabel(selectedDate)} Classes</Text>
        <Pressable onPress={create} style={s.plan}>
          <Plus size={17} color={C.white} />
          <Text style={s.planText}>Plan Class</Text>
        </Pressable>
      </View>
      <View style={s.stack}>
        {visibleSchedule.map((slot) => {
          const planTitle = getPlanTitle(slot);
          const inProgress = slot.status === "IN PROGRESS";
          const completed = slot.status === "COMPLETED";
          const ready = Boolean(
            slot.planId && planTitle && !inProgress && !completed,
          );
          const hasDraft = !ready && slot.status === "DRAFT";
          return (
            <Swipeable
              key={slot.id}
              overshootRight={false}
              rightThreshold={64}
              dragOffsetFromRight={-18}
              onSwipeableOpenStartDrag={() => beginSwipe(slot.id)}
              onSwipeableCloseStartDrag={() => beginSwipe(slot.id)}
              onSwipeableOpen={() => finishSwipe(slot.id)}
              onSwipeableClose={() => finishSwipe(slot.id)}
              renderRightActions={() => (
                <View style={s.swipeActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Reschedule ${slot.level} class`}
                    onPress={() => {
                      if (!swipeIsBlocked(slot.id)) modify(slot);
                    }}
                    style={s.swipeEdit}
                  >
                    <CalendarDays size={18} color={C.white} />
                    <Text style={s.swipeActionText}>Reschedule</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel ${slot.level} class`}
                    onPress={() => {
                      if (!swipeIsBlocked(slot.id)) remove(slot);
                    }}
                    style={s.swipeDelete}
                  >
                    <Trash2 size={18} color={C.white} />
                    <Text style={s.swipeActionText}>Cancel</Text>
                  </Pressable>
                </View>
              )}
            >
              <Pressable
                onPress={() => {
                  if (swipeIsBlocked(slot.id)) return;
                  if (ready || inProgress) start(slot);
                  else if (completed) review(slot);
                  else assign(slot);
                }}
                style={[s.classCard, completed && s.completedClassCard]}
              >
                <View
                  style={[
                    s.rail,
                    ready || inProgress ? s.readyRail : s.planRail,
                    completed && s.completedRail,
                  ]}
                />
                <View style={s.time}>
                  <Text style={s.timeText}>{slot.time}</Text>
                  <Text style={s.duration}>45 min</Text>
                </View>
                <View style={s.flex}>
                  <Text style={s.level}>{slot.level}</Text>
                  <Text style={s.week}>{planTitle ?? slot.lesson}</Text>
                  <Text style={s.duration}>
                    {classDateLabel(slot.date, true)}
                  </Text>
                </View>
                <View style={s.action}>
                  {completed ? (
                    <>
                      <Pill label="COMPLETED" active green />
                      <Pressable
                        onPress={() => review(slot)}
                        style={s.reviewCompact}
                      >
                        <BarChart3 size={13} color={C.rose} />
                        <Text style={s.reviewCompactText}>Review</Text>
                      </Pressable>
                    </>
                  ) : ready || inProgress ? (
                    <>
                      <Pill
                        label={inProgress ? "IN PROGRESS" : "READY"}
                        active
                        green
                      />
                      <Pressable
                        onPress={() => {
                          if (!swipeIsBlocked(slot.id)) start(slot);
                        }}
                        style={s.start}
                      >
                        <Play size={14} color={C.white} fill={C.white} />
                        <Text style={s.startText}>
                          {inProgress ? "Resume" : "Start"}
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <View style={s.planNeededAction}>
                      <Text
                        style={[
                          s.planNeededText,
                          hasDraft && s.planDraftText,
                        ]}
                      >
                        {hasDraft ? "DRAFT AVAILABLE" : "PLAN NEEDED"}
                      </Text>
                      <Pressable
                        onPress={() => {
                          if (!swipeIsBlocked(slot.id)) assign(slot);
                        }}
                        style={s.assignCompact}
                      >
                        <CalendarDays size={13} color={C.white} />
                        <Text style={s.assignCompactText}>Assign</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </Pressable>
            </Swipeable>
          );
        })}
        {!visibleSchedule.length ? (
          <View style={s.emptyCard}>
            <Text style={s.moveTitle}>No classes scheduled</Text>
            <Text style={s.sub}>
              Create a class plan or add a class in My Schedule.
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
function AssignPlan({
  plan,
  library,
  savedPlans,
  schedule,
  targetSlotId,
  back,
  create,
  assign,
  scheduleNext,
  openSchedule,
}: {
  plan: ClassPlan;
  library: LibraryMovement[];
  savedPlans: ClassPlan[];
  schedule: ScheduledClass[];
  targetSlotId?: string;
  back: () => void;
  create: () => void;
  assign: (slotId: string, planId: string) => void;
  scheduleNext: () => void;
  openSchedule: () => void;
}) {
  const now = useLiveNow();
  const target = schedule.find((slot) => slot.id === targetSlotId);
  const reviewedPlans = [plan, ...savedPlans]
    .filter(
      (candidate) =>
        candidate.status === "saved" &&
        classReadiness(candidate, library).ready &&
        (!target || planLevel(candidate) === target.level),
    )
    .filter(
      (candidate, index, candidates) =>
        candidates.findIndex((item) => item.id === candidate.id) === index,
    )
    .sort((a, b) => b.version - a.version);
  const currentAssignment = reviewedPlans.find(
    (candidate) => candidate.id === target?.planId,
  );
  const futureSchedule = schedule.filter(
    (slot) =>
      slot.status !== "CANCELLED" &&
      slot.status !== "COMPLETED" &&
      isFutureScheduleSlot(slot, now) &&
      slot.level === planLevel(plan),
  ).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const nextAvailable = useMemo(
    () => nextAvailableClassSlot(schedule, now),
    [now, schedule],
  );
  const confirmAssignment = (slot: ScheduledClass, selectedPlan: ClassPlan) => {
    if (slot.planId === selectedPlan.id) return;
    const assignedPlan = reviewedPlans.find(
      (candidate) => candidate.id === slot.planId,
    );
    if (assignedPlan) {
      confirmAction({
        title: "Replace assigned plan?",
        message: `${assignedPlan.brief.program} is currently assigned to ${classDateLabel(slot.date, true)} at ${slot.time}.`,
        confirmText: "Replace Plan",
        onConfirm: () => assign(slot.id, selectedPlan.id),
      });
      return;
    }
    assign(slot.id, selectedPlan.id);
  };
  return (
    <ScrollView style={s.flex} contentContainerStyle={s.page}>
      <Header
        title={target ? "Assign a Plan" : "Use for Another Class"}
        back={back}
      />
      {target ? (
        <>
          <Text style={s.sub}>
            Choose the reviewed plan this scheduled class should use.
          </Text>
          <View style={[s.assignmentTarget, s.nextSlotCard]}>
            <CalendarDays size={21} color={C.rose} />
            <View style={s.flex}>
              <Text style={s.moveTitle}>
                {target.level} / {target.lesson}
              </Text>
              <Text style={s.sub}>
                {classDateLabel(target.date, true)} at {target.time}
              </Text>
            </View>
            <Pill
              label={currentAssignment ? "READY" : "PLAN NEEDED"}
              active
              green={Boolean(currentAssignment)}
            />
          </View>
          <Text style={s.group}>REVIEWED PLANS</Text>
          {reviewedPlans.map((candidate) => {
            const selected = candidate.id === target.planId;
            return (
              <Pressable
                key={candidate.id}
                accessibilityRole="button"
                accessibilityLabel={`Assign ${candidate.brief.program}`}
                disabled={selected}
                onPress={() => confirmAssignment(target, candidate)}
                style={[s.savedPlan, selected && s.assignmentSelected]}
              >
                <View style={s.flex}>
                  <Text style={s.moveTitle}>{candidate.brief.program}</Text>
                  <Text style={s.sub}>
                    {candidate.brief.week} / {candidate.brief.day} / v
                    {candidate.version}
                  </Text>
                  <Text style={s.duration}>
                    {fmt(planTotal(candidate))} / {candidate.movements.length} movements
                  </Text>
                </View>
                {selected ? (
                  <Pill label="ASSIGNED" active green />
                ) : (
                  <ChevronRight size={19} color={C.rose} />
                )}
              </Pressable>
            );
          })}
          {!reviewedPlans.length ? (
            <View style={s.emptyCard}>
              <Text style={s.moveTitle}>No reviewed plans yet</Text>
              <Text style={s.sub}>
                Create, review and save a valid 45-minute plan before assigning
                it.
              </Text>
              <Main label="Create Plan" onPress={create} />
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={s.sub}>
            Assign {plan.brief.program} / {plan.brief.week} / {plan.brief.day} to
            another scheduled class.
          </Text>
          <Text style={s.group}>NEXT AVAILABLE SLOT</Text>
          <View style={[s.assignmentTarget, s.nextSlotCard]}>
            <CalendarDays size={21} color={C.rose} />
            <View style={s.flex}>
              <Text style={s.moveTitle}>
                {classDateLabel(nextAvailable.date, true)} at {nextAvailable.time}
              </Text>
              <Text style={s.sub}>
                {planLevel(plan)} / 45 min / based on device time
              </Text>
            </View>
            <Pressable
              onPress={scheduleNext}
              style={s.assignCompact}
              accessibilityRole="button"
              accessibilityLabel={`Schedule next available class ${classDateLabel(nextAvailable.date, true)} at ${nextAvailable.time}`}
            >
              <CalendarDays size={13} color={C.white} />
              <Text style={s.assignCompactText}>Schedule</Text>
            </Pressable>
          </View>
          <Text style={s.group}>UPCOMING CLASS SLOTS</Text>
          {futureSchedule.map((slot) => {
            const occupied = slot.planId === plan.id;
            return (
              <Pressable
                key={slot.id}
                accessibilityRole="button"
                accessibilityLabel={`Assign plan to ${slot.level} class at ${slot.time}`}
                disabled={occupied}
                onPress={() => confirmAssignment(slot, plan)}
                style={[s.assignCard, occupied && s.assignmentSelected]}
              >
                <View style={s.time}>
                  <Text style={s.timeText}>{slot.time}</Text>
                  <Text style={s.duration}>45 min</Text>
                </View>
                <View style={s.flex}>
                  <Text style={s.moveTitle}>{slot.level}</Text>
                  <Text style={s.sub}>{slot.lesson}</Text>
                  <Text style={s.duration}>{classDateLabel(slot.date, true)}</Text>
                </View>
                <Pill
                  label={occupied ? "ASSIGNED" : slot.planId ? "REPLACE" : "ASSIGN"}
                  active
                  green={occupied}
                />
                {!occupied ? <ChevronRight size={19} color={C.muted} /> : null}
              </Pressable>
            );
          })}
          {!futureSchedule.length ? (
            <View style={s.emptyCard}>
              <Text style={s.moveTitle}>No other upcoming classes</Text>
              <Text style={s.sub}>
                Use the next available slot above or choose a date in My Schedule.
              </Text>
              <Outline label="Open My Schedule" onPress={openSchedule} />
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
function ScheduleManager({
  schedule,
  initialEditId,
  back,
  save,
  cancel,
  remove,
}: {
  schedule: ScheduledClass[];
  initialEditId?: string;
  back: () => void;
  save: (slot: ScheduledClass) => void;
  cancel: (slot: ScheduledClass) => void;
  remove: (id: string) => void;
}) {
  const [date, setDate] = useState(dateKeyFromOffset(1));
  const [time, setTime] = useState("09:00");
  const [level, setLevel] = useState("Beginner");
  const [lesson, setLesson] = useState(PROGRAM_DAY_OPTIONS[0]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ScheduleFilter>("Upcoming");
  const now = useLiveNow();
  const timeOptions = useMemo(
    () =>
      scheduleTimeOptions(date, now).filter(
        (option) =>
          !schedule.some(
            (slot) =>
              slot.id !== editingId &&
              slot.status !== "CANCELLED" &&
              scheduleSlotsOverlap({ date, time: option }, slot),
          ),
      ),
    [date, editingId, now, schedule],
  );
  const markedDates = useMemo(
    () => ({
      [date]: {
        selected: true,
        selectedColor: C.rose,
        selectedTextColor: C.white,
      },
    }),
    [date],
  );
  const visibleSchedule = useMemo(
    () => filterSchedule(schedule, filter, now),
    [filter, now, schedule],
  );
  const resetForm = () => {
    setEditingId(null);
    setDate(dateKeyFromOffset(1));
    setTime("09:00");
    setLevel("Beginner");
    setLesson(PROGRAM_DAY_OPTIONS[0]);
    setError("");
  };
  const edit = (slot: ScheduledClass) => {
    setEditingId(slot.id);
    setDate(slot.date);
    setTime(slot.time);
    setLevel(slot.level);
    setLesson(normalizeProgramDay(slot.lesson));
    setError("");
  };
  useEffect(() => {
    if (timeOptions.includes(time)) return;
    setTime(timeOptions[0] ?? "");
  }, [time, timeOptions]);
  useEffect(() => {
    const initialClass = schedule.find((slot) => slot.id === initialEditId);
    if (initialClass) edit(initialClass);
  }, [initialEditId]);
  const submit = () => {
    const clean = time.trim();
    if (!clean) {
      setError("Choose a future date with an available start time.");
      return;
    }
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.test(clean);
    if (!match) {
      setError("Use a 24-hour time such as 09:30.");
      return;
    }
    const startsAt = dateFromKey(date);
    const [hours, minutes] = clean.split(":").map(Number);
    startsAt.setHours(hours, minutes, 0, 0);
    if (startsAt.getTime() <= Date.now()) {
      setError("Choose a future class date and time.");
      return;
    }
    if (
      schedule.some(
        (slot) =>
          slot.id !== editingId &&
          slot.status !== "CANCELLED" &&
          scheduleSlotsOverlap({ date, time: clean }, slot),
      )
    ) {
      setError("This 45-minute class overlaps another scheduled class.");
      return;
    }
    const existing = schedule.find((slot) => slot.id === editingId);
    save(
      existing
        ? rescheduleSlot(
            {
              ...existing,
              level,
              lesson: lesson.trim() || "New class",
            },
            date,
            clean,
          )
        : {
            id: `slot-${clean.replace(":", "")}-${Date.now()}`,
            date,
            time: clean,
            level,
            lesson: lesson.trim() || "New class",
            status: "NEEDS PLAN",
          },
    );
    resetForm();
  };
  const confirmRemove = (slot: ScheduledClass) => {
    if (slot.status === "CANCELLED") {
      confirmAction({
        title: "Delete cancelled class?",
        message: `${classDateLabel(slot.date, true)} at ${slot.time} will be permanently removed.`,
        confirmText: "Delete",
        cancelText: "Keep",
        destructive: true,
        onConfirm: () => remove(slot.id),
      });
      return;
    }
    confirmAction({
      title: "Cancel class?",
      message: `${classDateLabel(slot.date, true)} at ${slot.time} will move to Cancelled. Its assigned plan will remain saved.`,
      confirmText: "Cancel Class",
      cancelText: "Keep Class",
      destructive: true,
      onConfirm: () => cancel(slot),
    });
  };
  const listHeader = (
    <View style={s.scheduleHeader}>
      <Header title="My Schedule" back={back} />
      <View style={s.profileEditor}>
        <View style={s.row}>
          <Text style={s.group}>
            {editingId ? "RESCHEDULE CLASS" : "ADD CLASS"}
          </Text>
          {editingId ? (
            <Pressable onPress={resetForm} hitSlop={10}>
              <Text style={s.link}>Cancel reschedule</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={s.label}>CLASS DATE</Text>
        <Calendar
          current={date}
          minDate={localDateKey()}
          maxDate={dateKeyFromOffset(120)}
          firstDay={1}
          enableSwipeMonths
          markedDates={markedDates}
          onDayPress={(selected: DateData) => {
            setDate(selected.dateString);
            setError("");
          }}
          style={s.bookingCalendar}
          theme={{
            calendarBackground: C.card,
            monthTextColor: C.ink,
            textMonthFontWeight: "800",
            textSectionTitleColor: C.muted,
            dayTextColor: C.ink,
            todayTextColor: C.rose,
            arrowColor: C.rose,
            textDisabledColor: C.line,
          }}
        />
        <ChoiceSelect
          label="START TIME"
          value={time || "No future times today"}
          options={timeOptions}
          onChange={(value) => {
            setTime(value);
            setError("");
          }}
        />
        <Text style={s.sub}>
          {classDateLabel(date, true)} at {time || "--:--"} / Device time{" "}
          {timeFromMinutes(now.getHours() * 60 + now.getMinutes())}
        </Text>
        <Text style={s.label}>LEVEL</Text>
        <View style={s.options}>
          {["Beginner", "Intermediate", "Advanced"].map((option) => (
            <Pressable key={option} onPress={() => setLevel(option)}>
              <Pill label={option} active={level === option} />
            </Pressable>
          ))}
        </View>
        <ChoiceSelect
          label="PROGRAM DAY"
          value={lesson}
          options={PROGRAM_DAY_OPTIONS}
          onChange={(value) => {
            setLesson(value);
            setError("");
          }}
        />
        {error ? <Text style={s.formError}>{error}</Text> : null}
        <Main
          label={editingId ? "Save New Time" : "Add to Schedule"}
          onPress={submit}
        />
      </View>
      <Text style={s.group}>{visibleSchedule.length} CLASSES</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        {(
          [
            "Upcoming",
            "Completed",
            "Needs plan",
            "Drafts",
            "Cancelled",
          ] as ScheduleFilter[]
        ).map((option) => (
          <Pressable key={option} onPress={() => setFilter(option)}>
            <Pill label={option} active={filter === option} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
  return (
    <FlatList
      data={visibleSchedule}
      keyExtractor={(slot) => slot.id}
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      ListHeaderComponent={listHeader}
      renderItem={({ item: slot }) => (
        <View
          style={[
            s.assignCard,
            slot.status === "CANCELLED" && s.cancelledClassCard,
          ]}
        >
          <View style={s.time}>
            <Text style={s.timeText}>{slot.time}</Text>
            <Text style={s.duration}>45 min</Text>
          </View>
          <View style={s.flex}>
            <Text style={s.moveTitle}>{slot.level}</Text>
            <Text style={s.sub}>{slot.lesson}</Text>
            <Text style={s.duration}>{classDateLabel(slot.date, true)}</Text>
          </View>
          <View style={s.scheduleTools}>
            <Pill
              label={slot.status.replace("_", " ")}
              active
              green={slot.status === "READY" || slot.status === "COMPLETED"}
            />
            {slot.status !== "CANCELLED" ? (
              <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add ${slot.level} class to calendar`}
                onPress={() => addClassToCalendar(slot)}
                hitSlop={10}
              >
                <CalendarPlus size={18} color={C.rose} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reschedule ${slot.level} class`}
                onPress={() => edit(slot)}
                hitSlop={10}
              >
                <CalendarDays size={18} color={C.muted} />
              </Pressable>
              </>
            ) : null}
            <Pressable onPress={() => confirmRemove(slot)} hitSlop={10}>
              {slot.status === "CANCELLED" ? (
                <Trash2 size={18} color="#A34848" />
              ) : (
                <X size={18} color={C.rose} />
              )}
            </Pressable>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={s.emptyCard}>
          <Text style={s.sub}>No {filter.toLowerCase()} classes.</Text>
        </View>
      }
    />
  );
}
function ChoiceSelect({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <View style={[s.selectGroup, compact && s.compactSelectGroup]}>
        <Text style={s.label}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}`}
          onPress={() => setOpen(true)} style={s.select}>
          <Text style={s.selectText}>{value}</Text>
          <ChevronDown size={19} color={C.muted} />
        </Pressable>
      </View>
      <Modal transparent visible={open} animationType="fade">
        <Pressable onPress={() => setOpen(false)} style={s.choiceBackdrop}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={s.choiceSheet}
          >
            <View style={s.row}>
              <Text style={s.movementTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <X size={20} color={C.muted} />
              </Pressable>
            </View>
            <ScrollView style={s.choiceList} showsVerticalScrollIndicator
              accessibilityLabel={`${label} options`}>
              {options.map((option) => {
                const selected = option === value;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    style={[s.choiceRow, selected && s.choiceRowSelected]}
                  >
                    <Text style={s.settingText}>{option}</Text>
                    {selected ? <Check size={19} color={C.rose} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
function Create({
  back,
  generate,
  initialClass,
}: {
  back: () => void;
  generate: (brief: PlanBrief, fromScratch: boolean) => void;
  initialClass?: ScheduledClass;
}) {
  const programs = [
    "Beginner Foundations",
    "Intermediate Flow",
    "Strong Pilates",
  ];
  const weeks = ["Week 1", "Week 2", "Week 3", "Week 4"];
  const days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"];
  const initialWeek = initialClass?.lesson.match(/Week\s+\d+/i)?.[0];
  const initialDay = initialClass?.lesson.match(/Day\s+\d+/i)?.[0];
  const [program, setProgram] = useState(
    initialClass?.level === "Intermediate"
      ? programs[1]
      : initialClass?.level === "Advanced"
        ? programs[2]
        : programs[0],
  );
  const [week, setWeek] = useState(
    weeks.find((option) => option.toLowerCase() === initialWeek?.toLowerCase()) ??
      weeks[0],
  );
  const [day, setDay] = useState(
    days.find((option) => option.toLowerCase() === initialDay?.toLowerCase()) ??
      days[0],
  );
  const [scheduledDate, setScheduledDate] = useState(
    initialClass?.date ?? dateKeyFromOffset(1),
  );
  const [scheduledTime, setScheduledTime] = useState(
    initialClass?.time ?? "09:00",
  );
  const [now, setNow] = useState(() => new Date());
  const timeOptions = useMemo(
    () => scheduleTimeOptions(scheduledDate, now),
    [scheduledDate, now],
  );
  const [energy, setEnergy] = useState("Flowing");
  const [fromScratch, setFromScratch] = useState(false);
  const [equipment, setEquipment] = useState<string[]>(["Mat"]);
  const toggleEquipment = (item: string) =>
    setEquipment((current) =>
      current.includes(item)
        ? current.filter((x) => x !== item)
        : [...current, item],
    );
  useEffect(() => {
    if (scheduledDate !== localDateKey()) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [scheduledDate]);
  useEffect(() => {
    if (timeOptions.includes(scheduledTime)) return;
    setScheduledTime(timeOptions[0] ?? "");
  }, [scheduledTime, timeOptions]);
  const submit = () => {
    const cleanTime = scheduledTime.trim();
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(cleanTime)) {
      Alert.alert("Check start time", "Use 24-hour time such as 09:30.");
      return;
    }
    const start = dateFromKey(scheduledDate);
    const [hours, minutes] = cleanTime.split(":").map(Number);
    start.setHours(hours, minutes, 0, 0);
    if (start.getTime() <= Date.now()) {
      Alert.alert("Choose a future class", "Select a future date and time.");
      return;
    }
    if (!equipment.length) {
      Alert.alert(
        "Choose equipment",
        "Select at least one available item before generating the plan.",
      );
      return;
    }
    generate({
      program,
      level: program === programs[1]
        ? "Intermediate"
        : program === programs[2]
          ? "Advanced"
          : "Beginner",
      week,
      day,
      scheduledDate,
      scheduledTime: cleanTime,
      energy,
      equipment,
    }, fromScratch);
  };
  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={s.page}>
        <Header title="Create Class Plan" back={back} />
        <View style={s.sequenceModes}>
          {[true, false].map((scratch) => (
            <Pressable
              key={String(scratch)}
              accessibilityRole="radio"
              aria-checked={fromScratch === scratch}
              onPress={() => setFromScratch(scratch)}
              style={[s.sequenceMode, fromScratch === scratch && s.sequenceModeOn]}
            >
              <Text style={[s.optionText, fromScratch === scratch && s.roseText]}>
                {scratch ? "From scratch" : "Use template"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.sub}>
          Set the lesson brief. You can edit everything before teaching.
        </Text>
        <View style={s.steps}>
          {["Class", "Focus", "Review"].map((x, i) => (
            <View key={x} style={s.stepWrap}>
              <View style={[s.step, i === 0 && s.stepOn]}>
                <Text style={[s.stepNum, i === 0 && s.stepNumOn]}>{i + 1}</Text>
              </View>
              <Text style={[s.stepLabel, i === 0 && s.roseText]}>{x}</Text>
            </View>
          ))}
        </View>
        <ChoiceSelect
          label="PROGRAM"
          value={program}
          options={programs}
          onChange={setProgram}
        />
        <ChoiceSelect
          label="WEEK"
          value={week}
          options={weeks}
          onChange={setWeek}
        />
        <ChoiceSelect
          label="LESSON DAY"
          value={day}
          options={days}
          onChange={setDay}
        />
        <View style={s.selectGroup}>
          <Text style={s.label}>CLASS DATE</Text>
          <Calendar
            current={scheduledDate}
            minDate={localDateKey()}
            maxDate={dateKeyFromOffset(120)}
            firstDay={1}
            enableSwipeMonths
            markedDates={{
              [scheduledDate]: {
                selected: true,
                selectedColor: C.rose,
                selectedTextColor: C.white,
              },
            }}
            onDayPress={(selected: DateData) =>
              setScheduledDate(selected.dateString)
            }
            style={s.bookingCalendar}
            theme={{
              calendarBackground: C.card,
              monthTextColor: C.ink,
              textMonthFontWeight: "800",
              textSectionTitleColor: C.muted,
              dayTextColor: C.ink,
              todayTextColor: C.rose,
              arrowColor: C.rose,
              textDisabledColor: C.line,
            }}
          />
        </View>
        <ChoiceSelect
          label="START TIME"
          value={scheduledTime || "No future times today"}
          options={timeOptions}
          onChange={setScheduledTime}
        />
        <Text style={s.sub}>
          {classDateLabel(scheduledDate, true)} at {scheduledTime || "--:--"}
          {scheduledDate === localDateKey()
            ? ` / Device time ${timeFromMinutes(now.getHours() * 60 + now.getMinutes())}`
            : ""}
        </Text>
        <View style={s.selectGroup}>
          <Text style={s.label}>CLASS ENERGY</Text>
          <View style={s.options}>
            {["Calm", "Energising", "Strong", "Flowing"].map((x) => (
              <Pressable
                key={x}
                onPress={() => setEnergy(x)}
                style={[s.option, energy === x && s.optionOn]}
              >
                <Text style={[s.optionText, energy === x && s.roseText]}>
                  {x}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={s.selectGroup}>
          <Text style={s.label}>EQUIPMENT</Text>
          <View style={s.options}>
            {["Mat", "Band", "Ball", "Ring"].map((x) => {
              const selected = equipment.includes(x);
              return (
                <Pressable
                  key={x}
                  onPress={() => toggleEquipment(x)}
                  style={[s.option, selected && s.optionOn]}
                >
                  <Text style={[s.optionText, selected && s.roseText]}>
                    {x}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={s.structure}>
          <Text style={s.label}>45-MINUTE STRUCTURE</Text>
          <View style={s.structureCard}>
            <View style={s.structureBar}>
              <View style={[s.warm, { flex: 5 }]} />
              <View style={[s.mainPart, { flex: 35 }]} />
              <View style={[s.warm, { flex: 5 }]} />
            </View>
            <View style={s.row}>
              <Text style={s.duration}>5 min warm-up</Text>
              <Text style={s.structureCenter}>35 min main</Text>
              <Text style={s.duration}>5 min cool-down</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <View style={s.sticky}>
        <Main label={fromScratch ? "Build Class" : "Generate Class Plan"} onPress={submit} />
      </View>
    </View>
  );
}
function Generated({
  plan,
  library,
  schedule,
  back,
  edit,
  save,
  schedulePlan,
  teach,
}: {
  plan: ClassPlan;
  library: LibraryMovement[];
  schedule: ScheduledClass[];
  back: () => void;
  edit: () => void;
  save: () => void;
  schedulePlan: () => void;
  teach: () => void;
}) {
  const now = useLiveNow();
  const readiness = classReadiness(plan, library);
  const valid = readiness.ready;
  const nextClass = schedule
    .filter(
      (slot) =>
        slot.planId === plan.id &&
        slot.status !== "CANCELLED" &&
        slot.status !== "COMPLETED" &&
        isFutureScheduleSlot(slot, now),
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const nextAvailable = nextAvailableClassSlot(schedule, now);
  const start = () => {
    if (!valid) {
      Alert.alert(
        "Plan needs review",
        "Resolve the class readiness issues before starting this class.",
      );
      edit();
      return;
    }
    if (plan.status !== "saved") {
      Alert.alert(
        "Save this plan first",
        "Review and save the exact sequence before entering Teach Mode.",
      );
      return;
    }
    teach();
  };
  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={s.page}>
        <Header
          title="Class Plan"
          back={back}
          right={
            <Pill
              label={plan.status === "saved" ? "SAVED" : "DRAFT"}
              active
              green={plan.status === "saved"}
            />
          }
        />
        <Text style={s.planSub}>
          {plan.brief.program} · {plan.brief.week} · {plan.brief.day}
        </Text>
        {plan.status === "saved" ? (
          <Text style={s.sub}>
            {nextClass
              ? `Scheduled: ${classDateLabel(nextClass.date, true)} at ${nextClass.time}`
              : `Next available: ${classDateLabel(nextAvailable.date, true)} at ${nextAvailable.time}`}
          </Text>
        ) : plan.brief.scheduledDate && plan.brief.scheduledTime ? (
          <Text style={s.sub}>
            {classDateLabel(plan.brief.scheduledDate, true)} at{" "}
            {plan.brief.scheduledTime}
          </Text>
        ) : null}
        <Text style={s.sub}>
          {plan.brief.energy} · {plan.brief.equipment.join(", ")} ·{" "}
          {fmt(planTotal(plan))}
        </Text>
        <View style={s.planMeasureRow}>
          <View style={s.planMeasure}>
            <Text style={s.planMeasureValue}>{plan.movements.length}</Text>
            <Text style={s.planMeasureLabel}>MOVEMENT CARDS</Text>
          </View>
          <View style={s.planMeasure}>
            <Text style={s.planMeasureValue}>01:15</Text>
            <Text style={s.planMeasureLabel}>EACH MOVEMENT</Text>
          </View>
          <View style={s.planMeasure}>
            <Text style={s.planMeasureValue}>45:00</Text>
            <Text style={s.planMeasureLabel}>TOTAL CLASS</Text>
          </View>
        </View>
        <View style={s.timing}>
          <View>
            <Text style={s.duration}>Timing check</Text>
            <Text style={s.total}>
              {fmt(planTotal(plan))}{" "}
              <Text style={s.breakdown}>
                {fmt(phaseTotal(plan, "Warm-up"))} +{" "}
                {fmt(phaseTotal(plan, "Main"))} +{" "}
                {fmt(phaseTotal(plan, "Cool-down"))}
              </Text>
            </Text>
          </View>
          <Pill label={valid ? "VALID" : "CHECK"} active green={valid} />
        </View>
        {(["Warm-up", "Main", "Cool-down"] as Phase[]).map((phase) => {
          const phaseMoves = plan.movements.filter(
            (movement) => movement.phase === phase,
          );
          return (
            <Pressable key={phase} onPress={edit} style={s.planBlock}>
              <View style={s.planAccent} />
              <View style={s.flex}>
                <Text style={s.blockTitle}>
                  {phase === "Main" ? "Main sequence" : phase}
                </Text>
                <Text style={s.sub}>{phaseMoves.length} movements</Text>
              </View>
              <Text style={s.planTime}>{fmt(phaseTotal(plan, phase))}</Text>
              <ChevronRight size={19} color={C.muted} />
            </Pressable>
          );
        })}
        <ReadinessChecks report={readiness} />
      </ScrollView>
      <View style={s.dual}>
        <View style={s.flex}>
          <Outline label="Edit Sequence" onPress={edit} />
        </View>
        <View style={s.flex}>
          <Main
            label={
              plan.status === "saved"
                ? nextClass
                  ? "Schedule Another"
                  : "Schedule Class"
                : plan.brief.scheduledDate
                  ? "Save & Schedule"
                  : "Save Plan"
            }
            onPress={plan.status === "saved" ? schedulePlan : save}
          />
        </View>
      </View>
      <View style={s.stickySmall}>
        <Main label="Start Class" onPress={start} />
      </View>
    </View>
  );
}
function Classes({
  plan,
  change,
  open,
  back,
  library,
  add,
  reviewMovement,
  undo,
  canUndo,
  notice,
  filter,
  setFilter,
}: {
  plan: ClassPlan;
  change: (movements: PlanMovement[], mode?: SequenceMode) => void;
  open: (phase: Phase) => void;
  back: () => void;
  library: LibraryMovement[];
  add: (movement: LibraryMovement, phase: Phase) => void;
  reviewMovement: (movement: LibraryMovement, phase: Phase) => void;
  undo: () => void;
  canUndo: boolean;
  notice: string;
  filter: "All" | Phase;
  setFilter: (filter: "All" | Phase) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftMovement, setDraftMovement] = useState<PlanMovement | null>(null);
  const [editorError, setEditorError] = useState("");
  const visible = plan.movements
    .map((movement, index) => ({ movement, index }))
    .filter((item) => filter === "All" || item.movement.phase === filter);
  const valid = classReadiness(plan, library).ready;
  const mode = plan.sequenceMode ?? "auto";
  const phase = filter === "All" ? nextPlanningPhase(plan) : filter;
  const suggestions = suggestMovements(plan, library, phase);
  const editingSource = draftMovement
    ? library.find((item) => item.id === movementSourceId(draftMovement))
    : undefined;
  const allowedPhases = editingSource?.phases?.length
    ? [...new Set<Phase>([draftMovement!.phase, ...editingSource.phases])]
    : PHASES;
  const applyChange = (movements: PlanMovement[], nextMode = mode) =>
    change(nextMode === "auto" ? orderMovementsByPosition(movements) : movements, nextMode);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (
      target < 0 ||
      target >= plan.movements.length ||
      plan.movements[target].phase !== plan.movements[index].phase
    )
      return;
    const next = [...plan.movements];
    [next[index], next[target]] = [next[target], next[index]];
    applyChange(next, "manual");
  };
  const replace = (index: number) => {
    const next = replaceCatalogueMovement(plan, index, library, Crypto.randomUUID());
    if (next === plan.movements) {
      Alert.alert("No replacement available", "Add or review another movement for this phase and class level.");
      return;
    }
    applyChange(next);
  };
  const remove = (index: number) =>
    applyChange(plan.movements.filter((_, i) => i !== index));
  const beginEdit = (index: number) => {
    const movement = plan.movements[index];
    setEditingIndex(index);
    setDraftMovement({ ...movement });
    setEditorError("");
  };
  const closeEditor = () => {
    setEditingIndex(null);
    setDraftMovement(null);
    setEditorError("");
  };
  const saveMovement = () => {
    if (editingIndex === null || !draftMovement) return;
    const title = draftMovement.title.trim();
    const position = draftMovement.position.trim();
    const cue = draftMovement.cue.trim();
    if (!title || !position || !cue) {
      setEditorError("Complete the movement name, position and coaching cue.");
      return;
    }
    applyChange(
      plan.movements.map((movement, index) =>
        index === editingIndex
          ? { ...draftMovement, title, position, cue, duration: MOVEMENT_DURATION_SECONDS }
          : movement,
      ),
    );
    closeEditor();
  };
  const phaseStatus = (phase: Phase) => {
    const difference = phaseTotal(plan, phase) - phaseTarget(phase);
    if (difference === 0) return "On target";
    return `${fmt(Math.abs(difference))} ${difference > 0 ? "over" : "short"}`;
  };
  return (
    <>
      <ScrollView contentContainerStyle={s.page}>
      <View style={s.editorHeader}>
        <View style={s.flex}>
          <Header title="Class Sequence" back={back} />
        </View>
        <Pressable
          onPress={undo}
          disabled={!canUndo}
          style={[s.editorUndo, !canUndo && s.disabled]}
          accessibilityLabel="Undo last sequence change"
          accessibilityRole="button"
        >
          <Undo2 size={18} color={C.rose} />
        </Pressable>
      </View>
      <Main label="Review Class" onPress={back} />
      <ReadinessChecks report={classReadiness(plan, library)} />
      <View style={s.sequenceModes}>
        {(["auto", "manual"] as SequenceMode[]).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            aria-checked={mode === option}
            onPress={() => { if (mode !== option) applyChange(plan.movements, option); }}
            style={[s.sequenceMode, mode === option && s.sequenceModeOn]}
          >
            <Text style={[s.optionText, mode === option && s.roseText]}>
              {option === "auto" ? "Auto order" : "Manual order"}
            </Text>
          </Pressable>
        ))}
      </View>
      {notice ? <Text accessibilityLiveRegion="polite" style={s.sequenceNotice}>{notice}</Text> : null}
      {sequenceWarnings(plan.movements).map((warning) => (
        <Text key={warning} style={s.planningWarning}>{warning}</Text>
      ))}
      <Text
        style={[s.sub, { color: valid ? C.sage : C.gold, fontWeight: "800" }]}
      >
        {fmt(planTotal(plan))} total · {plan.movements.length} movements ·{" "}
        {valid ? "Valid" : "Timing needs review"}
      </Text>
      <View style={s.phaseTimingStrip}>
        {(["Warm-up", "Main", "Cool-down"] as Phase[]).map((phase) => (
          <Pressable key={phase} onPress={() => setFilter(phase)} style={s.phaseTimingItem}
            accessibilityRole="button" accessibilityLabel={`${phase}, ${phaseStatus(phase)}`}>
            <Text style={s.phaseTimingLabel}>
              {phase === "Main" ? "MAIN" : phase.toUpperCase()}
            </Text>
            <Text style={s.phaseTimingValue}>{fmt(phaseTotal(plan, phase))}</Text>
            <Text
              style={[
                s.phaseTimingStatus,
                phaseTotal(plan, phase) === phaseTarget(phase) && s.greenText,
              ]}
            >
              {phaseStatus(phase)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => open(phase)} style={s.addMovementButton} accessibilityRole="button">
        <Plus size={17} color={C.rose} />
        <Text style={s.addMovementText}>Add to {phase.toLowerCase()}</Text>
      </Pressable>
      <View style={s.options}>
        {(["All", "Warm-up", "Main", "Cool-down"] as const).map((x) => (
          <Pressable key={x} onPress={() => setFilter(x)}>
            <Pill label={x} active={filter === x} />
          </Pressable>
        ))}
      </View>
      <View style={s.suggestions}>
        <Text style={s.label}>SUGGESTED FOR {phase.toUpperCase()}</Text>
        {suggestions.map(({ movement, reason }) => (
          <View key={movement.id} style={s.suggestionRow}>
            <MovementVisual movement={movement} style={s.suggestionImage} label={movement.name} />
            <View style={s.flex}>
              <Text style={s.moveTitle}>{movement.name}</Text>
              <Text style={s.sub}>{fmt(selectionDuration(movement))} / {movement.position}</Text>
              {movement.sideMode === "paired" ? <Text style={s.suggestionReason}>Both sides / {fmt(movement.duration)} each</Text> : null}
              <Text style={s.suggestionReason}>{reason}</Text>
            </View>
            <Pressable
              onPress={() => movement.reviewStatus === "needs-review"
                ? reviewMovement(movement, phase) : add(movement, phase)}
              style={s.suggestionAdd} accessibilityRole="button"
              accessibilityLabel={movement.reviewStatus === "needs-review"
                ? `Review ${movement.name}` : `Add ${movement.name} to ${phase}`}>
              {movement.reviewStatus === "needs-review"
                ? <Pencil size={19} color={C.rose} /> : <Plus size={20} color={C.rose} />}
            </Pressable>
          </View>
        ))}
        {!suggestions.length ? (
          <Text style={s.sub}>{phaseRemaining(plan, phase) === 0 ? "Phase timing complete." :
            phaseRemaining(plan, phase) < 0 ? "Phase is over time. Review movement durations." :
              "No matching suggestions for the remaining time."}</Text>
        ) : null}
      </View>
      <Text style={s.group}>
        {filter.toUpperCase()} · {visible.length} MOVEMENTS
      </Text>
      {visible.map(({ movement, index }) => (
        <View key={`${movement.id}-${index}`} style={s.move}>
          <Pressable onPress={() => beginEdit(index)} style={s.editorMain}
            accessibilityRole="button" accessibilityLabel={`Edit ${movementLabel(movement)}`}>
            <View style={s.sequenceThumbnail}>
              <MovementVisual
                movement={movement}
                style={s.sequenceThumbnailImage}
                label={`${movementLabel(movement)} sequence preview`}
                resizeMode="cover"
              />
            </View>
            <View style={s.flex}>
              <Text style={s.moveTitle}>{movement.title}</Text>
              {sideLabel(movement) ? <Text style={s.suggestionReason}>{sideLabel(movement)}</Text> : null}
              <Text style={s.sub}>
                {movement.position} · {fmt(movement.duration)}
              </Text>
            </View>
          </Pressable>
          <View style={s.editorTools}>
            <Pressable onPress={() => move(index, -1)} hitSlop={7}
              disabled={index === 0 || plan.movements[index - 1].phase !== movement.phase}
              accessibilityRole="button" accessibilityLabel={`Move ${movementLabel(movement)} earlier`}>
              <ArrowUp size={17} color={C.muted} />
            </Pressable>
            <Pressable onPress={() => move(index, 1)} hitSlop={7}
              disabled={index === plan.movements.length - 1 || plan.movements[index + 1].phase !== movement.phase}
              accessibilityRole="button" accessibilityLabel={`Move ${movementLabel(movement)} later`}>
              <ArrowDown size={17} color={C.muted} />
            </Pressable>
            <Pressable onPress={() => replace(index)} hitSlop={7}
              accessibilityRole="button" accessibilityLabel={`Replace ${movementLabel(movement)}`}>
              <RefreshCw size={17} color={C.rose} />
            </Pressable>
            <Pressable onPress={() => remove(index)} hitSlop={7}
              accessibilityRole="button" accessibilityLabel={`Remove ${movementLabel(movement)}`}>
              <Trash2 size={17} color={C.rose} />
            </Pressable>
          </View>
        </View>
      ))}
      {!visible.length ? <Text style={s.empty}>No movements in {filter === "All" ? "this class" : phase.toLowerCase()} yet.</Text> : null}
      </ScrollView>
      <Modal
        visible={draftMovement !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEditor}
      >
        <View style={s.movementEditorBackdrop}>
          <View style={s.movementEditorSheet}>
            <View style={s.row}>
              <View style={s.flex}>
                <Text style={s.headerTitle}>Edit Movement</Text>
                <Text style={s.sub}>Update what the instructor sees in class.</Text>
              </View>
              <Pressable onPress={closeEditor} style={s.modalClose}>
                <X size={20} color={C.ink} />
              </Pressable>
            </View>
            {draftMovement ? (
              <ScrollView contentContainerStyle={s.movementEditorForm}>
                <Text style={s.label}>MOVEMENT IMAGE</Text>
                <MovementVisual
                  movement={draftMovement}
                  style={s.movementEditorImage}
                  label={`Preview image for ${draftMovement.title}`}
                />
                <Text style={s.label}>MOVEMENT NAME</Text>
                <TextInput
                  value={draftMovement.title}
                  accessibilityLabel="Movement name"
                  onChangeText={(title) => {
                    setDraftMovement({ ...draftMovement, title });
                    setEditorError("");
                  }}
                  style={s.formInput}
                />
                {(draftMovement.requiresPair || workingSide(draftMovement) ||
                  library.find((item) => item.id === movementSourceId(draftMovement))?.sideMode === "paired") ? (
                  <>
                    <Text style={s.label}>PARTICIPANT WORKING SIDE</Text>
                    <View style={s.options}>
                      {(["left", "right", "alternating"] as WorkingSide[]).map((side) => (
                        <Pressable key={side} accessibilityRole="radio" aria-checked={workingSide(draftMovement) === side}
                          onPress={() => setDraftMovement({ ...draftMovement, side,
                            position: positionGroup(draftMovement.position) === "Side-lying" && side !== "alternating"
                              ? side === "left" ? "Right side-lying" : "Left side-lying" : draftMovement.position })}>
                          <Pill label={side === "alternating" ? "Alternating" : side === "left" ? "Left" : "Right"}
                            active={workingSide(draftMovement) === side} />
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <Text style={s.label}>PHASE</Text>
                <View style={s.options}>
                  {allowedPhases.map(
                    (phase) => (
                      <Pressable
                        key={phase}
                        onPress={() =>
                          setDraftMovement({ ...draftMovement, phase })
                        }
                      >
                        <Pill
                          label={phase}
                          active={draftMovement.phase === phase}
                        />
                      </Pressable>
                    ),
                  )}
                </View>
                <View style={s.movementEditorColumns}>
                  <View style={s.flex}>
                    <ChoiceSelect
                      label="POSITION"
                      value={draftMovement.position}
                      options={MOVEMENT_POSITIONS.includes(draftMovement.position)
                        ? MOVEMENT_POSITIONS : [draftMovement.position, ...MOVEMENT_POSITIONS]}
                      onChange={(position) => {
                        setDraftMovement({ ...draftMovement, position });
                        setEditorError("");
                      }}
                    />
                  </View>
                  <View style={s.durationField}>
                    <Text style={s.label}>DURATION</Text>
                    <View style={s.fixedDurationField}>
                      <Text style={s.fixedDurationValue}>01:15</Text>
                      <Text style={s.fixedDurationNote}>Fixed</Text>
                    </View>
                  </View>
                </View>
                <Text style={s.label}>COACHING CUE</Text>
                <TextInput
                  value={draftMovement.cue}
                  onChangeText={(cue) => {
                    setDraftMovement({ ...draftMovement, cue });
                    setEditorError("");
                  }}
                  multiline
                  textAlignVertical="top"
                  style={[s.formInput, s.cueInput]}
                />
                {editorError ? <Text style={s.formError}>{editorError}</Text> : null}
                <Main label="Save Movement" onPress={saveMovement} />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
function Plans({
  plan,
  hasActiveDraft,
  savedPlans,
  schedule,
  lastSession,
  create,
  open,
  duplicate,
  removeDraft,
  select,
  deletedCount,
  openDeleted,
}: {
  plan: ClassPlan;
  hasActiveDraft: boolean;
  savedPlans: ClassPlan[];
  schedule: ScheduledClass[];
  lastSession: SessionResult | null;
  create: () => void;
  open: () => void;
  duplicate: () => void;
  removeDraft: () => void;
  select: (plan: ClassPlan) => void;
  deletedCount: number;
  openDeleted: () => void;
}) {
  const now = useLiveNow();
  const confirmDeleteDraft = () =>
    confirmAction({
      title: "Delete draft?",
      message: `${plan.brief.program} will move to Recently Deleted for 30 days. Saved plans will stay unchanged.`,
      confirmText: "Delete Draft",
      cancelText: "Keep Draft",
      destructive: true,
      onConfirm: removeDraft,
    });
  const reusablePlans =
    plan.status === "saved"
      ? [plan, ...savedPlans.filter((saved) => saved.id !== plan.id)]
      : savedPlans;
  const upcomingSchedule = useMemo(
    () => schedule
      .filter(
        (slot) =>
          slot.status !== "CANCELLED" &&
          slot.status !== "COMPLETED" &&
          isFutureScheduleSlot(slot, now),
      )
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [now, schedule],
  );
  const nextAvailable = useMemo(
    () => nextAvailableClassSlot(schedule, now),
    [now, schedule],
  );
  const nextClassForPlan = (planId: string) =>
    upcomingSchedule.find((slot) => slot.planId === planId);
  const scheduleLabelForPlan = (planId: string) => {
    const nextClass = nextClassForPlan(planId);
    return nextClass
      ? `Next class: ${classDateLabel(nextClass.date, true)} at ${nextClass.time}`
      : `Next available: ${classDateLabel(nextAvailable.date, true)} at ${nextAvailable.time}`;
  };
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.row}>
        <View>
          <Text style={s.headerTitle}>Plans</Text>
          <Text style={s.sub}>Prepare and reuse reviewed lessons.</Text>
        </View>
        <View style={s.headerActions}>
          <Pressable
            onPress={openDeleted}
            style={s.avatar}
            accessibilityRole="button"
            accessibilityLabel={`Recently deleted, ${deletedCount} items`}
          >
            <Trash2 size={19} color={C.rose} />
            {deletedCount ? (
              <View style={s.deletedCountBadge}>
                <Text style={s.deletedCountText}>{deletedCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={create} style={s.avatar}>
            <Plus size={22} color={C.rose} />
          </Pressable>
        </View>
      </View>
      {hasActiveDraft && plan.status === "draft" ? (
        <>
          <Text style={s.group}>DRAFT IN PROGRESS</Text>
          <Pressable onPress={open} style={s.currentPlan}>
            <View style={s.row}>
              <View style={s.flex}>
                <Text style={s.moveTitle}>{plan.brief.program}</Text>
                <Text style={s.sub}>
                  {plan.brief.week} · {plan.brief.day} · v{plan.version}
                </Text>
                {plan.brief.scheduledDate && plan.brief.scheduledTime ? (
                  <Text style={s.duration}>
                    {classDateLabel(plan.brief.scheduledDate, true)} at{" "}
                    {plan.brief.scheduledTime}
                  </Text>
                ) : null}
              </View>
              <Pill label="DRAFT" active />
            </View>
            <View style={s.planDivider} />
            <View style={s.row}>
              <Text style={s.duration}>
                {plan.brief.energy} · {plan.brief.equipment.join(", ")}
              </Text>
              <Text style={s.planTime}>{fmt(planTotal(plan))}</Text>
            </View>
          </Pressable>
          <View style={s.planActions}>
            <View style={s.flex}>
              <Outline label="Continue Plan" onPress={open} />
            </View>
            <Pressable onPress={duplicate} style={s.iconAction}>
              <RefreshCw size={18} color={C.rose} />
            </Pressable>
            <Pressable
              onPress={confirmDeleteDraft}
              style={[s.iconAction, s.deleteDraftAction]}
              accessibilityRole="button"
              accessibilityLabel="Delete draft"
            >
              <Trash2 size={18} color="#A34848" />
            </Pressable>
          </View>
        </>
      ) : null}
      <Text style={s.group}>SAVED PLANS</Text>
      {reusablePlans.length ? (
        reusablePlans.map((saved) => (
          <Pressable
            key={saved.id}
            onPress={() => select(saved)}
            style={s.savedPlan}
          >
            <View style={s.flex}>
              <Text style={s.moveTitle}>{saved.brief.program}</Text>
              <Text style={s.sub}>
                {saved.brief.week} · {saved.brief.day} · v{saved.version}
              </Text>
              <Text style={s.duration}>
                {scheduleLabelForPlan(saved.id)}
              </Text>
            </View>
            <View style={s.savedPlanRight}>
              <Text style={s.duration}>{fmt(planTotal(saved))}</Text>
              <ChevronRight size={19} color={C.muted} />
            </View>
          </Pressable>
        ))
      ) : (
        <View style={[s.emptyCard, s.calendarEmpty]}>
          <Text style={s.sub}>
            Save a reviewed plan to reuse it in another class.
          </Text>
        </View>
      )}
      <Text style={s.group}>RECENT DELIVERY</Text>
      {lastSession ? (
        <View style={s.recentSession}>
          <View style={s.flex}>
            <Text style={s.moveTitle}>
              {lastSession.completed === lastSession.total
                ? "Class complete"
                : "Class ended early"}
            </Text>
            <Text style={s.sub}>
              {lastSession.completed}/{lastSession.total} movements ·{" "}
              {fmt(lastSession.actualSeconds)} actual
            </Text>
            {lastSession.notes ? (
              <Text style={s.sessionNote}>{lastSession.notes}</Text>
            ) : null}
          </View>
          <Check size={20} color={C.sage} />
        </View>
      ) : (
        <View style={s.emptyCard}>
          <Text style={s.sub}>
            No completed class has been recorded in this session.
          </Text>
        </View>
      )}
      <Text style={s.group}>QUICK ACTIONS</Text>
      <View style={s.quickGrid}>
        <Pressable onPress={create} style={s.quickAction}>
          <Plus size={19} color={C.rose} />
          <Text style={s.quickText}>New plan</Text>
        </Pressable>
        <Pressable onPress={duplicate} style={s.quickAction}>
          <RefreshCw size={19} color={C.rose} />
          <Text style={s.quickText}>Duplicate</Text>
        </Pressable>
        <Pressable onPress={open} style={s.quickAction}>
          <List size={19} color={C.rose} />
          <Text style={s.quickText}>Edit sequence</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
function RecentlyDeleted({
  items,
  notice,
  back,
  restore,
  remove,
}: {
  items: RecentlyDeletedItem[];
  notice: string;
  back: () => void;
  restore: (item: RecentlyDeletedItem) => void;
  remove: (id: string) => void;
}) {
  const now = useLiveNow().getTime();
  const visible = useMemo(
    () =>
      pruneRecentlyDeleted(items, now).sort(
        (first, second) => second.deletedAt - first.deletedAt,
      ),
    [items, now],
  );
  const itemName = (item: RecentlyDeletedItem) =>
    item.kind === "movement" ? item.movement.name : item.plan.brief.program;
  const itemKind = (item: RecentlyDeletedItem) =>
    item.kind === "movement"
      ? "MOVEMENT"
      : item.kind === "draft"
        ? "CLASS DRAFT"
        : "SAVED PLAN";
  const confirmPermanentDelete = (item: RecentlyDeletedItem) =>
    confirmAction({
      title: "Delete permanently?",
      message: `${itemName(item)} cannot be restored after this.`,
      confirmText: "Delete Forever",
      cancelText: "Keep",
      destructive: true,
      onConfirm: () => remove(item.id),
    });

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="Recently Deleted" back={back} />
      <Text style={s.sub}>Items are kept for 30 days before permanent removal.</Text>
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={s.sequenceNotice}>
          {notice}
        </Text>
      ) : null}
      <Text style={s.group}>{visible.length} ITEMS</Text>
      {visible.map((item) => {
        const remaining = recentlyDeletedDaysRemaining(item.deletedAt, now);
        return (
          <View key={item.id} style={s.deletedItemCard}>
            <View style={s.row}>
              {item.kind === "movement" ? (
                <View style={s.deletedMovementImage}>
                  <MovementVisual
                    movement={item.movement}
                    style={s.deletedMovementImage}
                    label={`${item.movement.name} deleted movement preview`}
                  />
                </View>
              ) : (
                <View style={s.deletedPlanIcon}>
                  <List size={21} color={C.rose} />
                </View>
              )}
              <View style={s.flex}>
                <Text style={s.label}>{itemKind(item)}</Text>
                <Text style={s.moveTitle}>{itemName(item)}</Text>
                <Text style={s.sub}>
                  Deleted {new Date(item.deletedAt).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "short",
                  })} / {remaining} {remaining === 1 ? "day" : "days"} left
                </Text>
              </View>
            </View>
            <View style={s.deletedItemActions}>
              <Pressable
                onPress={() => restore(item)}
                style={s.restoreAction}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${itemName(item)}`}
              >
                <Undo2 size={16} color={C.white} />
                <Text style={s.restoreActionText}>Restore</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmPermanentDelete(item)}
                style={s.deleteForeverAction}
                accessibilityRole="button"
                accessibilityLabel={`Permanently delete ${itemName(item)}`}
              >
                <Trash2 size={17} color="#A34848" />
              </Pressable>
            </View>
          </View>
        );
      })}
      {!visible.length ? (
        <View style={s.emptyCard}>
          <Text style={s.moveTitle}>Nothing recently deleted</Text>
          <Text style={s.sub}>Deleted movements, drafts and plans will appear here.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
function ManualReference({ movement }: { movement: LibraryMovement }) {
  const [expanded, setExpanded] = useState(false);
  const manual = movement.manual!;
  const sections = [
    ["Set-up", manual.setup],
    ["Movement & breath", manual.movement],
    ["Watch points", manual.watchPoints],
    ["Progressions", manual.progressions],
    ["Regressions / preparations", manual.regressions],
    ["Variations", manual.variations],
    ["Additional watch points", manual.additionalWatchPoints],
    ["Muscles", manual.muscles],
    ["Purpose", manual.purpose],
  ];
  return (
    <View>
      <Text style={s.group}>FROM THE MANUAL</Text>
      <Text style={s.sub}>{manual.document} / pages {manual.pages.join(", ")}</Text>
      <Text style={s.sub}>{manual.units.join(" / ")}</Text>
      {manual.coverage === "reference-only" ? (
        <Text style={s.planningWarning}>Reference only: no complete written teaching sequence is supplied.</Text>
      ) : null}
      {!movement.imageUri && !manualArtwork[movement.id] ? <Text style={s.sub}>No photo supplied in the manual.</Text> : null}
      {manual.notes.map((note, index) => <Text key={index} style={s.sequenceNotice}>{note}</Text>)}
      <Text style={s.sub}>1:15 is the app's planning block, not a duration prescribed by the manual.</Text>
      <Pressable onPress={() => setExpanded(!expanded)} accessibilityRole="button"
        accessibilityState={{ expanded }} style={s.cue}>
        <Text style={s.cueText}>{expanded ? "Hide source details" : "Show source details"}</Text>
        <ChevronDown size={18} color={C.rose} />
      </Pressable>
      {expanded ? <>
        <Text style={s.sub}>{manual.levelNote}</Text>
        {movement.mainLevel ? <Text style={s.sub}>Main phase: {movement.mainLevel} and above.</Text> : null}
        {sections.filter(([, value]) => value).map(([label, value]) => (
          <View key={label}>
            <Text style={s.label}>{label}</Text>
            <Text style={s.cueText}>{value}</Text>
          </View>
        ))}
      </> : null}
    </View>
  );
}

function Details({
  movement,
  plan,
  initialPhase,
  planning,
  favourite,
  back,
  toggle,
  add,
  review,
  remove,
}: {
  movement: LibraryMovement;
  plan: ClassPlan;
  initialPhase?: Phase;
  planning: boolean;
  favourite: boolean;
  back: () => void;
  toggle: () => void;
  add: (phase: Phase, side: SideSelection) => void;
  review: () => void;
  remove: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(initialPhase ?? movement.phases?.[0] ?? "Main");
  const [side, setSide] = useState<SideSelection>("both");
  const remaining = phaseRemaining(plan, phase);
  const duration = selectionDuration(movement, side);
  const confirmDeleteMovement = () =>
    confirmAction({
      title: "Delete movement?",
      message: `${movement.name} will move to Recently Deleted for 30 days. Existing class plans will keep their saved copy.`,
      confirmText: "Delete Movement",
      cancelText: "Keep Movement",
      destructive: true,
      onConfirm: remove,
    });
  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={s.page}>
        <Header
          title="Movement Details"
          back={back}
          right={
            <Pressable onPress={toggle} hitSlop={12}>
              <Heart
                size={21}
                color={C.rose}
                fill={favourite ? C.rose : "transparent"}
              />
            </Pressable>
          }
        />
        <View style={s.detailArtwork}>
          <MovementVisual
            movement={movement}
            style={s.detailArtworkImage}
            label={`${movement.name} movement demonstration`}
          />
          <Text style={s.detailArtworkPosition}>{movement.position}</Text>
        </View>
        <Text style={s.movementTitle}>{movement.name}</Text>
        <View style={s.options}>
          <Pill label={movement.level} active />
          <Pill label={movement.equipment} />
          <Pill label={movement.position} />
        </View>
        <View style={s.row}>
          <Clock3 size={19} color={C.rose} />
          <Text style={s.detailTime}>{fmt(movement.duration)} {movement.sideMode === "paired" ? "per side" : "planned"}</Text>
        </View>
        <Text style={s.group}>TEACHING CUES</Text>
        {movement.reviewStatus === "needs-review" ? <Text style={s.planningWarning}>Instructor review required</Text> : null}
        {movement.reviewedBy ? <Text style={s.sequenceNotice}>Reviewed by {movement.reviewedBy}</Text> : null}
        {movement.cues.map((cue, index) => (
          <View key={`${movement.id}-${index}`} style={s.cue}>
            <View style={s.cueNum}>
              <Text style={s.cueNumText}>{index + 1}</Text>
            </View>
            <Text style={s.cueText}>{cue}</Text>
          </View>
        ))}
        {movement.manual ? <ManualReference movement={movement} /> : null}
        {planning && movement.sideMode === "paired" ? (
          <>
            <Text style={s.label}>PARTICIPANT WORKING SIDE</Text>
            <View style={s.options}>
              {(["both", "left", "right"] as SideSelection[]).map((option) => (
                <Pressable key={option} accessibilityRole="radio" aria-checked={side === option} onPress={() => setSide(option)}>
                  <Pill label={option === "both" ? "Both sides" : option === "left" ? "Left only" : "Right only"} active={side === option} />
                </Pressable>
              ))}
            </View>
            <Text style={s.sub}>{side === "both" ? "2 cards" : "1 card"} / {fmt(duration)} total</Text>
          </>
        ) : null}
        {planning ? (
          <>
            <Text style={s.label}>ADD TO PHASE</Text>
            <View style={s.options}>
              {PHASES.map((option) => (
                <Pressable key={option} onPress={() => setPhase(option)} accessibilityRole="radio"
                  aria-checked={phase === option}>
                  <Pill label={option} active={phase === option} />
                </Pressable>
              ))}
            </View>
            <Text style={s.sub}>{plan.brief.program} / {phase}</Text>
            <Text style={remaining < duration ? s.planningWarning : s.sequenceNotice}>
              {remaining < duration
                ? `Adding this movement puts ${phase.toLowerCase()} ${fmt(duration - remaining)} over target.`
                : `${fmt(remaining - duration)} remaining after this movement.`}
            </Text>
          </>
        ) : null}
      </ScrollView>
      <View style={s.sticky}>
        <Main
          label={movement.reviewStatus === "needs-review"
            ? "Review Movement"
            : planning ? "Add to Plan" : "Edit Movement"}
          onPress={() => movement.reviewStatus === "needs-review" || !planning
            ? review() : add(phase, side)}
        />
        {!planning ? (
          <Pressable
            onPress={confirmDeleteMovement}
            style={[s.dangerAction, s.detailDeleteAction]}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${movement.name} from movement library`}
          >
            <Trash2 size={17} color="#A34848" />
            <Text style={s.dangerText}>Delete from Library</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
function Summary({
  plan,
  result,
  done,
}: {
  plan: ClassPlan;
  result: SessionResult;
  done: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(result.notes ?? "");
  const complete = result.completed === result.total;
  return (
    <View style={s.flex}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.page}>
        <Header title="Session Summary" />
        <View style={s.summaryHero}>
          <View style={s.summaryCheck}>
            <Check size={28} color={C.white} />
          </View>
          <Text style={s.summaryTitle}>
            {complete ? "Class complete" : "Class ended early"}
          </Text>
          <Text style={s.sub}>
            {plan.brief.program} · {plan.brief.week} · {plan.brief.day}
          </Text>
        </View>
        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statBig}>
              {result.completed}/{result.total}
            </Text>
            <Text style={s.duration}>MOVEMENTS</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statBig}>{fmt(result.actualSeconds)}</Text>
            <Text style={s.duration}>ACTUAL TIME</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statBig}>{fmt(result.plannedSeconds)}</Text>
            <Text style={s.duration}>PLANNED TIME</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statBig}>{complete ? "DONE" : "EARLY"}</Text>
            <Text style={s.duration}>STATUS</Text>
          </View>
        </View>
        <View style={s.why}>
          <Text style={s.whyLabel}>DELIVERY RECORD</Text>
          <Text style={s.whyCopy}>
            Started{" "}
            {new Date(result.startedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <Text style={s.whyCopy}>
            Ended{" "}
            {new Date(result.endedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <Text style={s.whyCopy}>
            {complete
              ? "The full reviewed sequence was delivered."
              : "The original plan remains unchanged and this early finish is recorded separately."}
          </Text>
        </View>
        <View style={s.selectGroup}>
          <Text style={s.label}>GENERAL TEACHING NOTES</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Add a note about the session"
            placeholderTextColor={C.muted}
            style={s.notes}
          />
        </View>
      </ScrollView>
      <View style={s.sticky}>
        <Main label="Save Summary" onPress={() => done(notes.trim())} />
      </View>
    </View>
  );
}
function SessionDetails({
  result,
  scheduledClass,
  back,
}: {
  result: SessionResult;
  scheduledClass?: ScheduledClass;
  back: () => void;
}) {
  const complete = result.completed === result.total;
  const completion = result.total
    ? Math.round((result.completed / result.total) * 100)
    : 0;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="Session Details" back={back} />
      <View style={s.sessionDetailHero}>
        <View style={s.summaryCheck}>
          <Check size={28} color={C.white} />
        </View>
        <View style={s.flex}>
          <Text style={s.summaryTitle}>
            {result.program ?? scheduledClass?.level ?? "Class session"}
          </Text>
          <Text style={s.sub}>
            {new Date(result.endedAt).toLocaleDateString("en-ZA", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {scheduledClass ? ` at ${scheduledClass.time}` : ""}
          </Text>
        </View>
        <Pill label={complete ? "COMPLETE" : "ENDED EARLY"} active green={complete} />
      </View>
      <View style={s.sessionCompletion}>
        <View style={s.row}>
          <Text style={s.moveTitle}>Movement completion</Text>
          <Text style={s.planTime}>{completion}%</Text>
        </View>
        <View style={s.sessionCompletionTrack}>
          <View
            style={[
              s.sessionCompletionFill,
              { width: `${completion}%` },
            ]}
          />
        </View>
      </View>
      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={s.statBig}>
            {result.completed}/{result.total}
          </Text>
          <Text style={s.duration}>MOVEMENTS</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statBig}>{fmt(result.actualSeconds)}</Text>
          <Text style={s.duration}>ACTUAL</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statBig}>{fmt(result.plannedSeconds)}</Text>
          <Text style={s.duration}>PLANNED</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statBig}>
            {Math.max(0, Math.round(result.actualSeconds / 60))}
          </Text>
          <Text style={s.duration}>MINUTES</Text>
        </View>
      </View>
      <View style={s.sessionTimeline}>
        <Text style={s.group}>SESSION TIMELINE</Text>
        <View style={s.sessionTimelineRow}>
          <Clock3 size={18} color={C.rose} />
          <View style={s.flex}>
            <Text style={s.moveTitle}>Started</Text>
            <Text style={s.sub}>
              {new Date(result.startedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <View style={s.flex}>
            <Text style={s.moveTitle}>Ended</Text>
            <Text style={s.sub}>
              {new Date(result.endedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>
      </View>
      <View style={s.sessionNotes}>
        <Text style={s.group}>INSTRUCTOR NOTES</Text>
        <Text style={result.notes ? s.whyCopy : s.sub}>
          {result.notes || "No notes were added for this session."}
        </Text>
      </View>
    </ScrollView>
  );
}
function Library({
  movements,
  favourites,
  notice,
  open,
  create,
  toggle,
  back,
  deletedCount,
  openDeleted,
}: {
  movements: LibraryMovement[];
  favourites: string[];
  notice?: string;
  open: (movement: LibraryMovement) => void;
  create: () => void;
  toggle: (id: string) => void;
  back?: () => void;
  deletedCount: number;
  openDeleted: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const deferredQuery = useDeferredValue(query);
  const favouriteIds = useMemo(() => new Set(favourites), [favourites]);
  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return movements.filter(
      (movement) =>
        (filter === "All" ||
          (filter === "Favourites" && favouriteIds.has(movement.id)) ||
          (filter === "Needs review" && movement.reviewStatus === "needs-review") ||
          (PHASES.includes(filter as Phase) &&
            (movement.phases ?? ["Main"]).includes(filter as Phase)) ||
          positionGroup(movement.position) === positionGroup(filter)) &&
        (!needle ||
          [
            movement.name,
            ...(movement.aliases ?? []),
            ...(movement.manual?.units ?? []),
            movement.position,
            movement.equipment,
            movement.level,
          ].some((value) => value.toLowerCase().includes(needle))),
    );
  }, [deferredQuery, favouriteIds, filter, movements]);
  const header = (
    <View style={s.libraryHeader}>
      <View style={s.row}>
        {back ? <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back to class sequence" style={s.libraryBack}>
          <ArrowLeft size={22} color={C.ink} />
        </Pressable> : null}
        <Text style={s.headerTitle}>Movement Library</Text>
        <View style={s.headerActions}>
          <Pressable
            onPress={openDeleted}
            style={s.avatar}
            accessibilityRole="button"
            accessibilityLabel={`Recently deleted, ${deletedCount} items`}
          >
            <Trash2 size={19} color={C.rose} />
            {deletedCount ? (
              <View style={s.deletedCountBadge}>
                <Text style={s.deletedCountText}>{deletedCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={create} style={s.avatar}>
            <Plus size={23} color={C.rose} />
          </Pressable>
        </View>
      </View>
      <View style={s.search}>
        <Search size={20} color={C.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search movement, series or position"
          placeholderTextColor={C.muted}
          style={s.input}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        {[
          "All",
          "Favourites",
          "Needs review",
          "Warm-up",
          "Main",
          "Cool-down",
          "Standing",
          "Side-lying",
          "Supine",
          "Prone",
          "Seated",
          "Kneeling",
        ].map((option) => (
          <Pressable key={option} onPress={() => setFilter(option)}>
            <Pill label={option} active={filter === option} />
          </Pressable>
        ))}
      </ScrollView>
      {notice ? <Text style={s.sequenceNotice}>{notice}</Text> : null}
      <Text style={s.group}>{visible.length} MOVEMENTS</Text>
    </View>
  );
  return (
    <FlatList
      data={visible}
      keyExtractor={(movement) => movement.id}
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      extraData={favourites}
      ListHeaderComponent={header}
      renderItem={({ item: movement }) => (
        <Pressable
          onPress={() => open(movement)}
          style={s.libraryRow}
        >
          <View style={s.thumb}>
            <MovementVisual
              movement={movement}
              style={s.thumbImage}
              label={`${movement.name} movement preview`}
            />
          </View>
          <View style={s.flex}>
            <Text style={s.moveTitle}>{movement.name}</Text>
            {movement.reviewStatus === "needs-review" ? <Text style={s.reviewBadge}>NEEDS REVIEW</Text> : null}
            <Text style={s.libraryPhase}>{(movement.phases ?? ["Main"]).join(" / ")}</Text>
            <Text style={s.sub}>
              {movement.level} / {movement.position} / {movement.equipment}
            </Text>
          </View>
          <View style={s.libraryDuration}>
            <Text style={s.duration}>{fmt(movement.duration)}</Text>
            {movement.sideMode === "paired" ? <Text style={s.suggestionReason}>/ side</Text> : null}
          </View>
          <Pressable onPress={() => toggle(movement.id)} hitSlop={10}>
            <Heart
              size={20}
              color={C.rose}
              fill={favouriteIds.has(movement.id) ? C.rose : "transparent"}
            />
          </Pressable>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={s.empty}>No movements match your search.</Text>
      }
    />
  );
}
function CustomMovement({
  back,
  save,
  initialPhase,
  initialMovement,
}: {
  back: () => void;
  save: (movement: LibraryMovement) => void;
  initialPhase?: Phase;
  initialMovement?: LibraryMovement;
}) {
  const [name, setName] = useState(initialMovement?.name ?? "");
  const [position, setPosition] = useState(initialMovement?.position ?? "Standing");
  const [level, setLevel] = useState(initialMovement?.level ?? "Beginner");
  const [equipment, setEquipment] = useState(initialMovement?.equipment ?? "Mat");
  const [cue, setCue] = useState(initialMovement?.cues.join("\n") ?? "");
  const [phases, setPhases] = useState<Phase[]>(initialMovement?.phases ?? [initialPhase ?? "Main"]);
  const [sideMode, setSideMode] = useState<"together" | "paired" | "alternating">(initialMovement?.sideMode ?? "together");
  const [imageUri, setImageUri] = useState(initialMovement?.imageUri);
  const [error, setError] = useState("");
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: Platform.OS !== "web",
        aspect: [4, 3],
        quality: 0.82,
        base64: Platform.OS === "web",
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (Platform.OS === "web") {
        setImageUri(asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri);
        setError("");
        return;
      }
      if (!FileSystem.documentDirectory) throw new Error("Movement photo storage is unavailable.");
      const directory = `${FileSystem.documentDirectory}movement-images/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const mimeExtension = asset.mimeType?.split("/")[1]?.replace("jpeg", "jpg");
      const uriExtension = asset.uri.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase();
      const extension = mimeExtension || uriExtension || "jpg";
      const movementId = (initialMovement?.id || name.trim() || "movement")
        .replace(/[^a-z0-9-]/gi, "-").toLowerCase();
      const destination = `${directory}${movementId}-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: asset.uri, to: destination });
      setImageUri(destination);
      setError("");
    } catch {
      setError("That photo could not be saved. Please choose another image.");
    }
  };
  const submit = () => {
    if (!name.trim()) {
      setError("Enter a movement name.");
      return;
    }
    if (!cue.trim() || !phases.length) {
      setError("Add teaching cues and select at least one phase before saving.");
      return;
    }
    if (!imageUri && !initialMovement) {
      setError("Add a movement photo before saving this movement.");
      return;
    }
    save({
      ...initialMovement,
      id: initialMovement?.id ?? `custom-${Crypto.randomUUID()}`,
      name: name.trim(),
      imageUri,
      position,
      level,
      equipment: equipment.trim() || "None",
      duration: MOVEMENT_DURATION_SECONDS,
      cues: cue.split("\n").map((line) => line.trim()).filter(Boolean),
      phases,
      sideMode,
      reviewStatus: "reviewed",
    });
  };
  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={s.page}>
        <Header title={initialMovement
          ? initialMovement.reviewStatus === "needs-review" ? "Review Movement" : "Edit Movement"
          : "New Movement"} back={back} />
        <View style={s.form}>
          <Text style={s.label}>MOVEMENT PHOTO</Text>
          <View style={s.customImageFrame}>
            {imageUri || initialMovement ? (
              <MovementVisual
                movement={{
                  id: initialMovement?.id ?? "custom-preview",
                  sourceMovementId: initialMovement?.id,
                  position,
                  imageUri,
                }}
                style={s.customImage}
                label={name ? `${name} movement photo` : "Movement photo preview"}
              />
            ) : (
              <View style={s.customImagePlaceholder}>
                <ImagePlus size={30} color={C.rose} />
                <Text style={s.sub}>Add a clear 4:3 movement photo</Text>
              </View>
            )}
          </View>
          <View style={s.customImageActions}>
            <Pressable onPress={pickImage} style={s.imageAction}
              accessibilityRole="button" accessibilityLabel={imageUri || initialMovement ? "Change movement photo" : "Add movement photo"}>
              <ImagePlus size={17} color={C.rose} />
              <Text style={s.imageActionText}>{imageUri || initialMovement ? "Change photo" : "Add photo"}</Text>
            </Pressable>
            {imageUri ? (
              <Pressable onPress={() => setImageUri(undefined)} style={s.imageAction}
                accessibilityRole="button" accessibilityLabel="Remove movement photo">
                <Trash2 size={17} color={C.rose} />
                <Text style={s.imageActionText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={s.label}>MOVEMENT NAME</Text>
          <TextInput
            value={name}
            accessibilityLabel="Movement name"
            onChangeText={setName}
            placeholder="e.g. Standing Side Bend"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>POSITION</Text>
          <View style={s.options}>
            {["Standing", "Side-lying", "Supine", "Seated", "Kneeling", "Hands & knees", "Prone"].map(
              (option) => (
                <Pressable key={option} onPress={() => setPosition(option)}>
                  <Pill label={option} active={position === option} />
                </Pressable>
              ),
            )}
          </View>
          <Text style={s.label}>LEVEL</Text>
          <View style={s.options}>
            {["Beginner", "Intermediate", "Advanced"].map((option) => (
              <Pressable key={option} onPress={() => setLevel(option)}>
                <Pill label={option} active={level === option} />
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>EQUIPMENT</Text>
          <TextInput
            value={equipment}
            onChangeText={setEquipment}
            placeholder="Mat, band or none"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>{sideMode === "paired" ? "TIME PER SIDE" : "MOVEMENT TIME"}</Text>
          <View style={s.fixedDurationField}>
            <Text style={s.fixedDurationValue}>01:15</Text>
            <Text style={s.fixedDurationNote}>Standard class timing</Text>
          </View>
          <Text style={s.label}>SIDES</Text>
          <View style={s.options}>
            {(["together", "paired", "alternating"] as const).map((option) => (
              <Pressable key={option} onPress={() => setSideMode(option)} accessibilityRole="radio" aria-checked={sideMode === option}>
                <Pill label={option === "together" ? "Together" : option === "paired" ? "Separate sides" : "Alternating"} active={sideMode === option} />
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>PHASES</Text>
          <View style={s.options}>
            {PHASES.map((option) => (
              <Pressable key={option} onPress={() => setPhases((current) => current.includes(option)
                ? current.filter((item) => item !== option) : [...current, option])} accessibilityRole="checkbox"
                aria-checked={phases.includes(option)}>
                <Pill label={option} active={phases.includes(option)} />
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>PRIMARY TEACHING CUE</Text>
          <TextInput
            value={cue}
            accessibilityLabel="Teaching cues"
            onChangeText={setCue}
            multiline
            placeholder="What should the instructor say?"
            placeholderTextColor={C.muted}
            style={s.notes}
          />
          {error ? <Text style={s.formError}>{error}</Text> : null}
        </View>
      </ScrollView>
      <View style={s.sticky}>
        <Main label="Save to Library" onPress={submit} />
      </View>
    </View>
  );
}
function Insights({
  sessions,
  schedule,
  openSession,
}: {
  sessions: SessionResult[];
  schedule: ScheduledClass[];
  openSession: (session: SessionResult) => void;
}) {
  const [period, setPeriod] = useState<"7 days" | "30 days" | "All">("7 days");
  const days = period === "7 days" ? 7 : period === "30 days" ? 30 : Infinity;
  const cutoff = Number.isFinite(days) ? Date.now() - days * 86400000 : 0;
  const visible = sessions.filter((session) => session.endedAt >= cutoff);
  const minutes = Math.round(
    visible.reduce((sum, session) => sum + session.actualSeconds, 0) / 60,
  );
  const plans = new Set(
    visible.map((session) => session.planId).filter(Boolean),
  ).size;
  const movementRate = visible.length
    ? Math.round(
        (visible.reduce(
          (sum, session) => sum + session.completed / session.total,
          0,
        ) /
          visible.length) *
          100,
      )
    : 0;
  const activeSchedule = schedule.filter(
    (slot) => slot.status !== "CANCELLED",
  );
  const readyRate = activeSchedule.length
    ? Math.round(
        (activeSchedule.filter((slot) => slot.planId).length /
          activeSchedule.length) * 100,
      )
    : 0;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.row}>
        <View>
          <Text style={s.headerTitle}>Insights</Text>
          <Text style={s.sub}>Your recorded teaching activity</Text>
        </View>
        <BarChart3 size={24} color={C.rose} />
      </View>
      <View style={s.options}>
        {(["7 days", "30 days", "All"] as const).map((option) => (
          <Pressable key={option} onPress={() => setPeriod(option)}>
            <Pill label={option} active={period === option} />
          </Pressable>
        ))}
      </View>
      <View style={s.stats}>
        {[
          [String(visible.length), "Classes"],
          [String(minutes), "Minutes"],
          [String(plans), "Plans used"],
          [`${readyRate}%`, "Schedule ready"],
        ].map((metric) => (
          <View key={metric[1]} style={s.stat}>
            <Text style={s.statBig}>{metric[0]}</Text>
            <Text style={s.duration}>{metric[1]}</Text>
          </View>
        ))}
      </View>
      <Text style={s.group}>DELIVERY COMPLETION</Text>
      <View style={s.chartCard}>
        <View style={s.row}>
          <Text style={s.moveTitle}>Movement completion</Text>
          <Text style={s.planTime}>{movementRate}%</Text>
        </View>
        {visible.length ? (
          <View style={s.chart}>
            {visible
              .slice(0, 5)
              .reverse()
              .map((session, index) => {
                const height = Math.max(
                  12,
                  Math.round((session.completed / session.total) * 105),
                );
                return (
                  <View key={`${session.endedAt}-${index}`} style={s.chartCol}>
                    <View
                      style={[
                        s.bar,
                        {
                          height,
                          backgroundColor:
                            session.completed === session.total
                              ? C.sage
                              : C.pale,
                        },
                      ]}
                    />
                    <Text style={s.duration}>
                      {new Date(session.endedAt).toLocaleDateString([], {
                        weekday: "short",
                      })}
                    </Text>
                  </View>
                );
              })}
          </View>
        ) : (
          <View style={s.insightsEmpty}>
            <BarChart3 size={28} color={C.pale} />
            <Text style={s.sub}>
              Complete a class to begin building insights.
            </Text>
          </View>
        )}
      </View>
      <Text style={s.group}>RECENT SESSIONS</Text>
      {visible.length ? (
        visible.slice(0, 5).map((session) => (
          <Pressable
            key={session.endedAt}
            onPress={() => openSession(session)}
            style={s.recentSession}
          >
            <View style={s.flex}>
              <Text style={s.moveTitle}>
                {session.program ?? "Class session"}
              </Text>
              <Text style={s.sub}>
                {new Date(session.endedAt).toLocaleDateString()} /{" "}
                {session.completed}/{session.total} movements /{" "}
                {fmt(session.actualSeconds)}
              </Text>
              {session.notes ? (
                <Text style={s.sessionNote}>{session.notes}</Text>
              ) : null}
            </View>
            <Pill
              label={session.completed === session.total ? "COMPLETE" : "EARLY"}
              active
              green={session.completed === session.total}
            />
            <ChevronRight size={18} color={C.muted} />
          </Pressable>
        ))
      ) : (
        <View style={s.emptyCard}>
          <Text style={s.sub}>No sessions recorded for this period.</Text>
        </View>
      )}
    </ScrollView>
  );
}
function Profile({
  account,
  preferences,
  updateAccount,
  updatePreferences,
  navigate,
  manageData,
  openSecurity,
  logout,
  saveStatus,
}: {
  account: Account;
  preferences: InstructorPreferences;
  updateAccount: (account: Account) => Promise<string | null>;
  updatePreferences: (preferences: InstructorPreferences) => void;
  navigate: (screen: Tab) => void;
  manageData: () => void;
  openSecurity: () => void;
  logout: () => void;
  saveStatus: "saved" | "saving" | "error";
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const saveAccount = async () => {
    if (submitting) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    const updateError = await updateAccount({
      ...account,
      name: name.trim(),
      email: cleanEmail,
    });
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    setError("");
    setEditing(false);
  };
  const toggle = (
    key: "vibration" | "countdownSound" | "completionSound" | "offline",
  ) =>
    updatePreferences({ ...preferences, [key]: !preferences[key] });
  const Toggle = ({
    value,
    onPress,
  }: {
    value: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={onPress}
      style={[s.switchTrack, value && s.switchOn]}
    >
      <View style={[s.switchKnob, value && s.switchKnobOn]} />
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.headerTitle}>Profile & Settings</Text>
      <Pressable
        onPress={() => setEditing((value) => !value)}
        style={s.profileCard}
      >
        <View style={s.largeAvatar}>
          <UserRound size={28} color={C.rose} />
        </View>
        <View style={s.flex}>
          <Text style={s.moveTitle}>{account.name}</Text>
          <Text style={s.sub}>{account.email}</Text>
          <Pill label="INSTRUCTOR" active green />
        </View>
        <ChevronRight size={20} color={C.muted} />
      </Pressable>
      {editing ? (
        <View style={s.profileEditor}>
          <Text style={s.label}>FULL NAME</Text>
          <TextInput value={name} onChangeText={setName} style={s.formInput} />
          <Text style={s.label}>EMAIL ADDRESS</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={s.formInput}
          />
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <View style={s.planActions}>
            <View style={s.flex}>
              <Outline
                label="Cancel"
                onPress={() => {
                  setName(account.name);
                  setEmail(account.email);
                  setError("");
                  setEditing(false);
                }}
              />
            </View>
            <View style={s.flex}>
              <Main
                label={submitting ? "Saving..." : "Save Details"}
                onPress={() => void saveAccount()}
              />
            </View>
          </View>
        </View>
      ) : null}
      <View>
        <Text style={s.group}>TEACHING</Text>
        <View style={s.settings}>
          <Pressable onPress={() => navigate("home")} style={s.setting}>
            <Text style={s.settingText}>My Schedule</Text>
            <ChevronRight size={20} color={C.muted} />
          </Pressable>
          <Pressable onPress={() => navigate("classes")} style={s.setting}>
            <Text style={s.settingText}>Programs & Templates</Text>
            <ChevronRight size={20} color={C.muted} />
          </Pressable>
          <Pressable onPress={() => navigate("library")} style={s.setting}>
            <Text style={s.settingText}>Movement Library</Text>
            <ChevronRight size={20} color={C.muted} />
          </Pressable>
        </View>
      </View>
      <View>
        <Text style={s.group}>TEACHING MODE</Text>
        <View style={s.modeControl}>
          {(["Guided", "Minimal"] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() =>
                updatePreferences({ ...preferences, teachingMode: mode })
              }
              style={[
                s.modeOption,
                preferences.teachingMode === mode && s.modeOptionOn,
              ]}
            >
              <Text
                style={[
                  s.modeText,
                  preferences.teachingMode === mode && s.modeTextOn,
                ]}
              >
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.sub}>
          {preferences.teachingMode === "Guided"
            ? "Shows step-by-step cues while teaching."
            : "Shows movement names and timers with fewer prompts."}
        </Text>
      </View>
      <View>
        <Text style={s.group}>PREFERENCES</Text>
        <View style={s.settings}>
          <View style={s.setting}>
            <Text style={s.settingText}>Vibration cues</Text>
            <Toggle
              value={preferences.vibration}
              onPress={() => toggle("vibration")}
            />
          </View>
          <View style={s.setting}>
            <View style={s.flex}>
              <Text style={s.settingText}>Countdown sound</Text>
              <Text style={s.duration}>Short cue at 3, 2 and 1 seconds</Text>
            </View>
            <Toggle
              value={preferences.countdownSound}
              onPress={() => toggle("countdownSound")}
            />
          </View>
          <View style={s.setting}>
            <View style={s.flex}>
              <Text style={s.settingText}>Class completion sound</Text>
              <Text style={s.duration}>Final chime after the last movement</Text>
            </View>
            <Toggle
              value={preferences.completionSound}
              onPress={() => toggle("completionSound")}
            />
          </View>
        </View>
      </View>
      <View>
        <Text style={s.group}>ACCOUNT SECURITY</Text>
        <View style={s.settings}>
          <Pressable onPress={openSecurity} style={s.setting}>
            <Text style={s.settingText}>Change Password</Text>
            <ChevronRight size={20} color={C.muted} />
          </Pressable>
        </View>
      </View>
      <View>
        <Text style={s.group}>SUPPORT</Text>
        <View style={s.settings}>
          <Pressable onPress={manageData} style={s.setting}>
            <Text style={s.settingText}>App Data & Reset</Text>
            <ChevronRight size={20} color={C.muted} />
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert(
                "Help & Support",
                "Email support@blushbodies.com for assistance.",
              )
            }
            style={s.setting}
          >
            <Text style={s.settingText}>Help & Support</Text>
            <ChevronRight size={20} color={C.muted} />
          </Pressable>
        </View>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={saveStatus === "error" ? s.formError : s.duration}
      >
        {saveStatus === "saving"
          ? "Saving changes..."
          : saveStatus === "error"
            ? "Changes are not saved. Keep the app open and try again."
            : "All changes saved on this device."}
      </Text>
      <Outline label="Log Out" onPress={logout} />
    </ScrollView>
  );
}
function ChangePassword({
  back,
  update,
}: {
  back: () => void;
  update: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<string | null>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    if (!currentPassword || !newPassword || !confirmation) {
      setError("Complete all password fields.");
      return;
    }
    const passwordError = passwordValidationError(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a password different from the current password.");
      return;
    }
    setSubmitting(true);
    try {
      const message = await update(currentPassword, newPassword);
      if (message) {
        setError(message);
        return;
      }
      if (Platform.OS === "web") {
        globalThis.alert(
          "Password updated. Use your new password the next time you sign in.",
        );
        back();
        return;
      }
      Alert.alert(
        "Password updated",
        "Use your new password the next time you sign in.",
        [{ text: "Done", onPress: back }],
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <View style={s.flex}>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        <Header title="Change Password" back={back} />
        <View style={s.why}>
          <Text style={s.whyLabel}>ACCOUNT SECURITY</Text>
          <Text style={s.whyCopy}>
            Confirm your current password before creating a new one.
          </Text>
        </View>
        <View style={s.form}>
          <Text style={s.label}>CURRENT PASSWORD</Text>
          <TextInput
            value={currentPassword}
            onChangeText={(value) => {
              setCurrentPassword(value);
              setError("");
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            maxLength={PASSWORD_MAX_LENGTH}
            style={s.formInput}
          />
          <Text style={s.label}>NEW PASSWORD</Text>
          <TextInput
            value={newPassword}
            onChangeText={(value) => {
              setNewPassword(value);
              setError("");
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={PASSWORD_MAX_LENGTH}
            style={s.formInput}
          />
          <Text style={s.label}>CONFIRM NEW PASSWORD</Text>
          <TextInput
            value={confirmation}
            onChangeText={(value) => {
              setConfirmation(value);
              setError("");
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={PASSWORD_MAX_LENGTH}
            style={s.formInput}
          />
          <Text style={s.sub}>
            At least {PASSWORD_MIN_LENGTH} characters with uppercase, lowercase
            and a number.
          </Text>
          {error ? <Text style={s.formError}>{error}</Text> : null}
        </View>
      </ScrollView>
      <View style={s.sticky}>
        <Main
          label={submitting ? "Updating Password..." : "Update Password"}
          onPress={submit}
        />
      </View>
    </View>
  );
}

function DataSettings({
  savedPlans,
  schedule,
  sessions,
  customMovements,
  back,
  reset,
}: {
  savedPlans: number;
  schedule: number;
  sessions: number;
  customMovements: number;
  back: () => void;
  reset: () => void;
}) {
  const confirmReset = () =>
    confirmAction({
      title: "Delete this account and its data?",
      message:
        "This permanently removes this account, saved plans, schedules, custom movements, insights, profile details and preferences from this device.",
      confirmText: "Delete account",
      destructive: true,
      onConfirm: reset,
    });
  const counts = [
    [savedPlans, "Saved plans"],
    [schedule, "Classes"],
    [sessions, "Sessions"],
    [customMovements, "Custom movements"],
  ] as const;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="App Data" back={back} />
      <Text style={s.sub}>
        Your app content is stored locally on this device so it remains after
        closing or reloading Expo.
      </Text>
      <View style={s.stats}>
        {counts.map(([count, label]) => (
          <View key={label} style={s.stat}>
            <Text style={s.statBig}>{count}</Text>
            <Text style={s.duration}>{label.toUpperCase()}</Text>
          </View>
        ))}
      </View>
      <View style={s.why}>
        <Text style={s.whyLabel}>STORED ON THIS DEVICE</Text>
        <Text style={s.whyCopy}>
          Plans, schedule assignments, session summaries, custom movements,
          favourites and preferences.
        </Text>
        <Text style={s.whyCopy}>Passwords are never stored here.</Text>
      </View>
      <Text style={s.group}>DELETE ACCOUNT</Text>
      <Pressable onPress={confirmReset} style={s.dangerAction}>
        <Trash2 size={19} color="#A34848" />
        <Text style={s.dangerText}>Delete account and local data</Text>
      </Pressable>
    </ScrollView>
  );
}

function ManagePlan({
  plan,
  schedule,
  back,
  open,
  duplicate,
  assign,
  rename,
  remove,
}: {
  plan: ClassPlan;
  schedule: ScheduledClass[];
  back: () => void;
  open: () => void;
  duplicate: () => void;
  assign: () => void;
  rename: (name: string) => void;
  remove: () => void;
}) {
  const now = useLiveNow();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.brief.program);
  const [error, setError] = useState("");
  const nextClass = schedule
    .filter(
      (slot) =>
        slot.planId === plan.id &&
        slot.status !== "CANCELLED" &&
        slot.status !== "COMPLETED" &&
        isFutureScheduleSlot(slot, now),
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const nextAvailable = nextAvailableClassSlot(schedule, now);
  const saveName = () => {
    if (!name.trim()) {
      setError("Enter a plan name.");
      return;
    }
    rename(name.trim());
    setError("");
    setEditing(false);
  };
  const confirmDelete = () =>
    confirmAction({
      title: "Delete saved plan?",
      message: `${plan.brief.program} will move to Recently Deleted for 30 days. Assigned classes will need another plan until it is restored.`,
      confirmText: "Delete",
      cancelText: "Keep plan",
      destructive: true,
      onConfirm: remove,
    });
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="Plan Details" back={back} />
      <View style={s.manageHero}>
        <View style={s.row}>
          <View style={s.flex}>
            <Text style={s.movementTitle}>{plan.brief.program}</Text>
            <Text style={s.sub}>
              {plan.brief.week} / {plan.brief.day} / Version {plan.version}
            </Text>
          </View>
          <Pill
            label={plan.status.toUpperCase()}
            active
            green={plan.status === "saved"}
          />
        </View>
        <View style={s.planDivider} />
        <View style={s.row}>
          <Text style={s.settingText}>{plan.brief.energy}</Text>
          <Text style={s.planTime}>{fmt(planTotal(plan))}</Text>
        </View>
        <Text style={s.sub}>
          {plan.movements.length} movements / {plan.brief.equipment.join(", ")}
        </Text>
      </View>
      {editing ? (
        <View style={s.profileEditor}>
          <Text style={s.label}>PLAN NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            style={s.formInput}
          />
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <View style={s.planActions}>
            <View style={s.flex}>
              <Outline
                label="Cancel"
                onPress={() => {
                  setName(plan.brief.program);
                  setError("");
                  setEditing(false);
                }}
              />
            </View>
            <View style={s.flex}>
              <Main label="Save Name" onPress={saveName} />
            </View>
          </View>
        </View>
      ) : null}
      <Text style={s.group}>PLAN ACTIONS</Text>
      <View style={s.manageActions}>
        <Pressable onPress={open} style={s.manageAction}>
          <List size={21} color={C.rose} />
          <View style={s.flex}>
            <Text style={s.settingText}>Review sequence</Text>
            <Text style={s.sub}>Open timing and movement editor</Text>
          </View>
          <ChevronRight size={19} color={C.muted} />
        </Pressable>
        <Pressable onPress={() => setEditing(true)} style={s.manageAction}>
          <Pencil size={21} color={C.rose} />
          <View style={s.flex}>
            <Text style={s.settingText}>Rename plan</Text>
            <Text style={s.sub}>Change the title shown in your library</Text>
          </View>
          <ChevronRight size={19} color={C.muted} />
        </Pressable>
        <Pressable onPress={duplicate} style={s.manageAction}>
          <RefreshCw size={21} color={C.rose} />
          <View style={s.flex}>
            <Text style={s.settingText}>Duplicate as draft</Text>
            <Text style={s.sub}>Keep this plan and edit a new copy</Text>
          </View>
          <ChevronRight size={19} color={C.muted} />
        </Pressable>
        <Pressable onPress={assign} style={s.manageAction}>
          <CalendarDays size={21} color={C.rose} />
          <View style={s.flex}>
            <Text style={s.settingText}>
              {nextClass ? "Use for another class" : "Schedule class"}
            </Text>
            <Text style={s.sub}>
              {nextClass
                ? `Next: ${classDateLabel(nextClass.date, true)} at ${nextClass.time}`
                : `Next available: ${classDateLabel(nextAvailable.date, true)} at ${nextAvailable.time}`}
            </Text>
          </View>
          <ChevronRight size={19} color={C.muted} />
        </Pressable>
      </View>
      <Pressable onPress={confirmDelete} style={s.dangerAction}>
        <Trash2 size={19} color="#A34848" />
        <Text style={s.dangerText}>Delete saved plan</Text>
      </Pressable>
    </ScrollView>
  );
}

function TeachingSession({
  session,
  preferences,
  exit,
  checkpoint,
  finish,
}: {
  session: ActiveTeachingSession;
  preferences: InstructorPreferences;
  exit: () => void;
  checkpoint: (session: ActiveTeachingSession) => void;
  finish: (result: SessionResult) => void;
}) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const safeArea = useSafeAreaInsets();
  const compactTeachingView = viewportHeight < 760 || viewportWidth < 380;
  const plan = session.plan;
  const movements = useMemo(
    () => sequenceForTeaching(plan),
    [plan.movements, plan.sequenceMode],
  );
  const restored = useMemo(
    () => recoverTeachingPosition(session, movements),
    [session, movements],
  );
  const [held, setHeld] = useState(session.held);
  const [index, setIndex] = useState(restored.movementIndex);
  const [startedAt] = useState(session.startedAt);
  const [moveTime, setMoveTime] = useState(restored.remainingSeconds);
  const countdownPlayer = useAudioPlayer(
    require("./assets/countdown-beep.wav"),
  );
  const completionPlayer = useAudioPlayer(
    require("./assets/class-complete.wav"),
  );
  const lastCountdownCue = useRef("");
  const endingRef = useRef(false);
  const indexRef = useRef(restored.movementIndex);
  const moveTimeRef = useRef(restored.remainingSeconds);
  const lastTickAt = useRef(Date.now());
  const cardOffset = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const transitioning = useRef(false);
  const current = movements[index];
  const movementProgress =
    current.duration > 0
      ? Math.min(1, Math.max(0, (current.duration - moveTime) / current.duration))
      : 1;
  const sequenceProgress = movements.length > 0 ? (index + 1) / movements.length : 0;
  const saveCheckpoint = (
    movementIndex: number,
    remainingSeconds: number,
    isHeld: boolean,
  ) =>
    checkpoint({
      ...session,
      plan,
      startedAt,
      movementIndex,
      remainingSeconds,
      held: isHeld,
      savedAt: Date.now(),
    });
  const go = (next: number) => {
    const safe = Math.max(0, Math.min(movements.length - 1, next));
    if (safe === indexRef.current || transitioning.current) return;
    transitioning.current = true;
    Animated.parallel([
      Animated.timing(cardOffset, {
        toValue: -70,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      indexRef.current = safe;
      moveTimeRef.current = movements[safe].duration;
      setIndex(safe);
      setMoveTime(movements[safe].duration);
      lastTickAt.current = Date.now();
      saveCheckpoint(safe, movements[safe].duration, held);
      cardOffset.setValue(52);
      Animated.parallel([
        Animated.timing(cardOffset, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        transitioning.current = false;
      });
    });
  };
  const end = (completed: boolean) => {
    if (endingRef.current) return;
    endingRef.current = true;
    if (preferences.vibration)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const result: SessionResult = {
      startedAt,
      endedAt: Date.now(),
      completed: completed ? movements.length : index,
      total: movements.length,
      plannedSeconds: planTotal(plan),
      actualSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
      planId: plan.id,
      program: plan.brief.program,
      scheduledClassId: session.scheduledClassId,
    };
    if (!completed || !preferences.completionSound) {
      finish(result);
      return;
    }
    setHeld(true);
    void completionPlayer
      .seekTo(0)
      .then(() => completionPlayer.play())
      .catch(() => undefined);
    setTimeout(() => finish(result), 800);
  };
  const confirmEnd = () => {
    const completed = index === movements.length - 1;
    const title = completed ? "Complete class?" : "End class early?";
    const message = completed
      ? "This will create the session summary."
      : "The unfinished movements will be recorded in the summary.";

    if (Platform.OS === "web") {
      if (globalThis.confirm(`${title}\n\n${message}`)) end(completed);
      return;
    }

    Alert.alert(title, message, [
      { text: "Keep teaching", style: "cancel" },
      {
        text: completed ? "Complete" : "End early",
        style: "destructive",
        onPress: () => end(completed),
      },
    ]);
  };
  useEffect(() => {
    lastTickAt.current = Date.now();
    if (held) return;
    const tick = () => {
      const now = Date.now();
      let elapsedSeconds = Math.floor((now - lastTickAt.current) / 1000);
      if (elapsedSeconds < 1) return;
      lastTickAt.current += elapsedSeconds * 1000;
      let nextIndex = indexRef.current;
      let remainingSeconds = moveTimeRef.current;

      while (elapsedSeconds > 0) {
        if (elapsedSeconds < remainingSeconds) {
          remainingSeconds -= elapsedSeconds;
          elapsedSeconds = 0;
          break;
        }
        elapsedSeconds -= remainingSeconds;
        if (nextIndex === movements.length - 1) {
          remainingSeconds = 0;
          break;
        }
        nextIndex += 1;
        remainingSeconds = Math.max(1, movements[nextIndex].duration);
      }

      const movementChanged = nextIndex !== indexRef.current;
      indexRef.current = nextIndex;
      moveTimeRef.current = remainingSeconds;
      if (movementChanged) {
        setIndex(nextIndex);
        saveCheckpoint(nextIndex, remainingSeconds, false);
      }
      setMoveTime(remainingSeconds);
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [held, movements]);
  useEffect(() => {
    if (preferences.vibration)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [index, preferences.vibration]);
  useEffect(() => {
    if (!preferences.countdownSound || held || moveTime < 1 || moveTime > 3)
      return;
    const cue = `${index}:${moveTime}`;
    if (lastCountdownCue.current === cue) return;
    lastCountdownCue.current = cue;
    void countdownPlayer
      .seekTo(0)
      .then(() => countdownPlayer.play())
      .catch(() => undefined);
  }, [countdownPlayer, held, index, moveTime, preferences.countdownSound]);
  const nextStep = () => {
    if (index < movements.length - 1) go(index + 1);
    else confirmEnd();
  };
  const toggleHold = () => {
    const nextHeld = !held;
    setHeld(nextHeld);
    lastTickAt.current = Date.now();
    saveCheckpoint(indexRef.current, moveTimeRef.current, nextHeld);
  };
  const pauseAndExit = () => {
    setHeld(true);
    saveCheckpoint(indexRef.current, moveTimeRef.current, true);
    exit();
  };
  const upcoming = movements[index + 1];
  const classLevel = planLevel(plan);
  return (
    <View style={[s.teach, { paddingTop: safeArea.top }]}>
      <StatusBar style="dark" />
      {Platform.OS !== "web" ? <TeachingKeepAwake /> : null}
      <View style={[s.teachContent, compactTeachingView && s.teachContentCompact]}>
      <View style={[s.teachTop, compactTeachingView && s.teachTopCompact]}>
        <Pressable
          onPress={pauseAndExit}
          style={[s.avatar, s.teachClose]}
          accessibilityRole="button"
          accessibilityLabel="Pause and leave class"
        >
          <X size={20} color={C.rose} />
        </Pressable>
        <View style={s.flex}>
          <Text style={s.outlineText}>
            {classLevel}
          </Text>
          <Text style={[s.sub, s.teachSequence]}>
            {plan.brief.week} · {plan.brief.day}
          </Text>
        </View>
      </View>
      <View style={[s.teachTimerBlock, compactTeachingView && s.teachTimerBlockCompact]}>
        <View style={s.teachTimerHeading}>
          <Text style={s.label}>{held ? "PAUSED" : "TIME REMAINING"}</Text>
          <Text style={s.teachStepLabel}>
            Step {index + 1} of {movements.length}
          </Text>
        </View>
        <View style={s.teachTimerRow}>
          <Text style={[s.teachTimer, compactTeachingView && s.teachTimerCompact]}>{fmt(moveTime)}</Text>
          <Text style={s.teachTimerTotal}>of {fmt(current.duration)}</Text>
        </View>
        <View style={s.teachTimerTrack}>
          <View
            style={[
              s.teachTimerFill,
              { width: `${movementProgress * 100}%` },
            ]}
          />
        </View>
      </View>
      <Animated.View
        style={[
          s.movementCard,
          compactTeachingView && s.movementCardCompact,
          {
            opacity: cardOpacity,
            transform: [{ translateY: cardOffset }],
          },
        ]}
      >
        <View style={s.movementCardHeader}>
          <Pill label={current.phase === "Main" ? "Main sequence" : current.phase} active />
          <Pill label={current.position} active green />
        </View>
        <Text style={[s.headerTitle, s.movementCardTitle, compactTeachingView && s.movementCardTitleCompact]}>{current.title}</Text>
        {sideLabel(current) ? <Text style={[s.sub, s.movementWorkingSide]}>Participant · {sideLabel(current)}</Text> : null}
        <View style={s.movementProgressRow}>
          <Text style={s.movementCardCount}>
            Class progress
          </Text>
          <Text style={s.movementProgressValue}>
            {Math.round(sequenceProgress * 100)}%
          </Text>
        </View>
        <View style={s.movementProgressTrack}>
          <View
            style={[
              s.movementProgressFill,
              { width: `${sequenceProgress * 100}%` },
            ]}
          />
        </View>
        <View style={s.movementArtwork}>
          <MovementVisual
            movement={current}
            style={s.movementArtworkImage}
            label={`Demonstration image for ${current.title}`}
          />
        </View>
        {preferences.teachingMode === "Guided" ? (
          <View style={s.movementCue}>
            <Text style={[s.label, s.movementCueLabel]}>COACHING CUE</Text>
            <Text style={s.movementCueText}>{current.cue}</Text>
          </View>
        ) : null}
      </Animated.View>
      <View style={[s.controls, compactTeachingView && s.controlsCompact]}>
        <View style={s.teachControlGroup}>
          <Pressable
            onPress={() => go(index - 1)}
            disabled={index === 0}
            style={[s.iconAction, s.navControl, index === 0 && s.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Previous movement"
            accessibilityState={{ disabled: index === 0 }}
          >
            <ChevronLeft size={22} color={C.ink} />
          </Pressable>
          <Text style={[s.stepLabel, s.controlLabel]}>Previous</Text>
        </View>
        <View style={s.teachControlGroup}>
          <Pressable
            onPress={toggleHold}
            style={[s.main, s.hold]}
            accessibilityRole="button"
            accessibilityLabel={held ? "Resume timer" : "Pause timer"}
          >
            {held ? (
              <Play size={21} color={C.white} fill={C.white} />
            ) : (
              <Pause size={21} color={C.white} fill={C.white} />
            )}
          </Pressable>
          <Text style={[s.stepLabel, s.controlLabel]}>{held ? "Resume" : "Pause"}</Text>
        </View>
        <View style={s.teachControlGroup}>
          <Pressable
            onPress={nextStep}
            style={[s.iconAction, s.navControl]}
            accessibilityRole="button"
            accessibilityLabel={upcoming ? "Next movement" : "Finish class"}
          >
            {upcoming ? <ChevronRight size={22} color={C.ink} /> : <Check size={22} color={C.ink} />}
          </Pressable>
          <Text style={[s.stepLabel, s.controlLabel]}>{upcoming ? "Next" : "Finish"}</Text>
        </View>
      </View>
      <Pressable
        onPress={() => (upcoming ? go(index + 1) : confirmEnd())}
        style={[s.upNext, !upcoming && s.upNextComplete]}
        accessibilityRole="button"
        accessibilityLabel={upcoming ? `Next movement: ${upcoming.title}` : "Finish class and view summary"}
      >
        <View style={s.flex}>
          <Text style={s.label}>
            {upcoming ? "UP NEXT" : "FINAL MOVEMENT"}
          </Text>
          <Text style={[s.outlineText, s.upText]} numberOfLines={1}>
            {upcoming
              ? upcoming.title
              : "Finish & View Summary"}
          </Text>
          {upcoming && sideLabel(upcoming) ? <Text style={s.upNextSide} numberOfLines={1}>{sideLabel(upcoming)}</Text> : null}
          {upcoming ? (
            <View style={s.upNextMeta}>
              <Text style={s.upTime}>{fmt(upcoming.duration)}</Text>
              <Text style={s.upNextDot}>·</Text>
              <Text style={s.upTime}>{upcoming.position}</Text>
            </View>
          ) : null}
        </View>
        {upcoming ? (
          <View style={[s.upNextVisual, compactTeachingView && s.upNextVisualCompact]}>
            <MovementVisual
              movement={upcoming}
              style={s.upNextVisualImage}
              label={`Preview image for ${upcoming.title}`}
            />
            <View style={s.upNextArrow}>
              <ChevronRight size={16} color={C.ink} />
            </View>
          </View>
        ) : (
          <ChevronRight size={20} color={C.rose} />
        )}
      </Pressable>
      <Pressable onPress={confirmEnd} style={s.endClass} accessibilityRole="button">
        <Text style={[s.stepLabel, s.endClassText]}>End Class</Text>
      </Pressable>
      </View>
    </View>
  );
}

function BlushBodiesApp() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [signupReturnScreen, setSignupReturnScreen] = useState<
    "welcome" | "signin"
  >("welcome");
  const [tab, setTab] = useState<Tab>("home");
  const [account, setAccount] = useState<Account>({
    name: "Blush Bodies Instructor",
    email: "coach@blushbodies.com",
    role: "instructor",
  });
  const [plan, setPlan] = useState<ClassPlan>(() =>
    createPlan({
      program: "Beginner Foundations",
      level: "Beginner",
      week: "Week 2",
      day: "Day 4",
      energy: "Flowing",
      equipment: ["Mat"],
    }),
  );
  const [savedPlans, setSavedPlans] = useState<ClassPlan[]>([]);
  const [hasActiveDraft, setHasActiveDraft] = useState(true);
  const [sequenceHistory, setSequenceHistory] = useState<ClassPlan[]>([]);
  const [sequenceNotice, setSequenceNotice] = useState("");
  const [libraryPlanPhase, setLibraryPlanPhase] = useState<Phase | undefined>();
  const [libraryNotice, setLibraryNotice] = useState("");
  const [editorPhase, setEditorPhase] = useState<"All" | Phase>("All");
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(
    null,
  );
  const [selectedSession, setSelectedSession] = useState<SessionResult | null>(
    null,
  );
  const [sessionDetailsReturn, setSessionDetailsReturn] = useState<
    "home" | "insights"
  >("home");
  const [sessionHistory, setSessionHistory] = useState<SessionResult[]>([]);
  const [activeTeachingSession, setActiveTeachingSession] = useState<
    ActiveTeachingSession | undefined
  >();
  const [schedule, setSchedule] = useState<ScheduledClass[]>(initialSchedule);
  const [homeDate, setHomeDate] = useState(localDateKey());
  const [scheduleEditId, setScheduleEditId] = useState<string | undefined>();
  const [scheduleReturnScreen, setScheduleReturnScreen] = useState<
    "profile" | "home" | "assign"
  >("profile");
  const [assignmentSlotId, setAssignmentSlotId] = useState<
    string | undefined
  >();
  const [libraryMovements, setLibraryMovements] =
    useState<LibraryMovement[]>(initialLibrary);
  const [deletedMovementIds, setDeletedMovementIds] = useState<string[]>([]);
  const [recentlyDeleted, setRecentlyDeleted] = useState<RecentlyDeletedItem[]>([]);
  const [recentlyDeletedReturn, setRecentlyDeletedReturn] = useState<
    "classes" | "library"
  >("classes");
  const [recentlyDeletedNotice, setRecentlyDeletedNotice] = useState("");
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [favourites, setFavourites] = useState<string[]>([
    "manual-clam",
    "manual-shoulder-bridge",
  ]);
  const [selectedMovement, setSelectedMovement] = useState<LibraryMovement>(
    initialLibrary[0],
  );
  const [movementToReview, setMovementToReview] = useState<LibraryMovement | undefined>();
  const [instructorPreferences, setInstructorPreferences] =
    useState<InstructorPreferences>({
      teachingMode: "Guided",
      vibration: true,
      countdownSound: false,
      completionSound: true,
      offline: false,
    });
  const [signedIn, setSignedIn] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [persistenceError, setPersistenceError] = useState("");
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveGeneration = useRef(0);
  const latestStoredData = useRef<StoredAppData | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );
  useEffect(() => {
    void AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => undefined);
  }, []);
  const storedData = (owner: Account = account): StoredAppData => ({
      account: owner,
      plan,
      hasActiveDraft,
      savedPlans,
      sessionHistory,
      schedule,
      libraryMovements,
      deletedMovementIds,
      recentlyDeleted: pruneRecentlyDeleted(recentlyDeleted),
      favourites,
      instructorPreferences,
      activeTeachingSession,
    });
  const queueWorkspaceSave = (
    stored: StoredAppData,
    key = userStorageKey(stored.account),
  ) => {
    const generation = ++saveGeneration.current;
    setSaveStatus("saving");
    const task = saveChain.current.then(() =>
      AsyncStorage.setItem(key, JSON.stringify(stored)),
    );
    saveChain.current = task.catch(() => undefined);
    void task.then(() => {
      if (generation !== saveGeneration.current) return;
      setPersistenceError("");
      setSaveStatus("saved");
    }).catch(() => {
      if (generation !== saveGeneration.current) return;
      setPersistenceError(
        "Your latest changes could not be saved. Keep the app open and try again.",
      );
      setSaveStatus("error");
    });
    return task;
  };
  useEffect(() => {
    if (!signedIn) return;
    const stored = storedData();
    latestStoredData.current = stored;
    void queueWorkspaceSave(stored).catch(() => undefined);
  }, [
    signedIn,
    account,
    plan,
    hasActiveDraft,
    savedPlans,
    sessionHistory,
    schedule,
    libraryMovements,
    deletedMovementIds,
    recentlyDeleted,
    favourites,
    instructorPreferences,
    activeTeachingSession,
  ]);
  useEffect(() => {
    if (!persistenceError) return;
    Alert.alert("Changes not saved", persistenceError);
  }, [persistenceError]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (
          signedIn &&
          !activeTeachingSession &&
          backgroundedAt.current !== null &&
          Date.now() - backgroundedAt.current >= SESSION_BACKGROUND_LOCK_MS
        ) {
          setSignedIn(false);
          setScreen("signin");
        }
        backgroundedAt.current = null;
        return;
      }
      backgroundedAt.current ??= Date.now();
    });
    return () => subscription.remove();
  }, [signedIn, activeTeachingSession]);
  const select = (next: Tab) => {
    setLibraryPlanPhase(undefined);
    setTab(next);
    setScreen(next);
  };
  const duplicatePlan = () => {
    setEditorPhase("All");
    setSequenceHistory([]);
    setSequenceNotice("");
    setPlan((current) => ({
      ...current,
      id: `${current.id}-copy-${Date.now()}`,
      version: current.version + 1,
      status: "draft",
      brief: {
        ...current.brief,
        scheduledDate: undefined,
        scheduledTime: undefined,
      },
    }));
    setHasActiveDraft(true);
    setScreen("generated");
  };
  const persistPlan = () => {
    setSequenceHistory([]);
    setSequenceNotice("");
    const saved = { ...plan, status: "saved" as const };
    setPlan(saved);
    setHasActiveDraft(false);
    setSavedPlans((current) => [
      saved,
      ...current.filter((item) => item.id !== saved.id),
    ]);
    if (saved.brief.scheduledDate && saved.brief.scheduledTime) {
      const scheduledDate = saved.brief.scheduledDate;
      const scheduledTime = saved.brief.scheduledTime;
      setSchedule((current) => {
        const matching = current.find(
          (slot) =>
            slot.date === scheduledDate &&
            slot.time === scheduledTime &&
            slot.status !== "CANCELLED",
        );
        const scheduled: ScheduledClass = {
          id:
            matching?.id ??
            `slot-${scheduledDate}-${scheduledTime.replace(":", "")}`,
          date: scheduledDate,
          time: scheduledTime,
          level: planLevel(saved),
          lesson: `${saved.brief.week} / ${saved.brief.day}`,
          status: "READY",
          planId: saved.id,
        };
        return [
          ...current.filter((slot) => slot.id !== matching?.id),
          scheduled,
        ].sort((a, b) =>
          `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
        );
      });
      setAssignmentSlotId(undefined);
    }
  };
  const savePlan = () => {
    if (plan.brief.scheduledDate && plan.brief.scheduledTime) {
      const proposed = {
        date: plan.brief.scheduledDate,
        time: plan.brief.scheduledTime,
      };
      const conflict = schedule.find(
        (slot) =>
          slot.status !== "CANCELLED" &&
          slot.id !== assignmentSlotId &&
          !(
            slot.date === proposed.date &&
            slot.time === proposed.time &&
            (!slot.planId || slot.planId === plan.id)
          ) &&
          scheduleSlotsOverlap(proposed, slot),
      );
      if (conflict) {
        setSequenceNotice(
          `This class overlaps the ${conflict.time} class on ${classDateLabel(conflict.date, true)}.`,
        );
        return;
      }
    }
    const report = classReadiness(plan, libraryMovements);
    if (!report.ready) {
      setSequenceNotice("Resolve the class readiness issues before saving.");
      setScreen("editor");
      return;
    }
    if (report.warnings.length) {
      confirmAction({ title: "Save with sequence warnings?", message: report.warnings.join("\n"),
        confirmText: "Save Plan", cancelText: "Review", onConfirm: persistPlan });
    } else persistPlan();
  };
  const renamePlan = (name: string) => {
    setPlan((current) => ({
      ...current,
      version: current.version + 1,
      brief: { ...current.brief, level: planLevel(current), program: name },
    }));
    setSavedPlans((current) =>
      current.map((saved) =>
        saved.id === plan.id
          ? {
              ...saved,
              version: saved.version + 1,
              brief: { ...saved.brief, level: planLevel(saved), program: name },
            }
          : saved,
      ),
    );
  };
  const deletedItemSourceKey = (item: RecentlyDeletedItem) =>
    item.kind === "movement"
      ? `${item.kind}:${item.movement.id}`
      : `${item.kind}:${item.plan.id}`;
  const keepRecentlyDeleted = (item: RecentlyDeletedItem) => {
    const sourceKey = deletedItemSourceKey(item);
    setRecentlyDeleted((current) => [
      item,
      ...pruneRecentlyDeleted(current).filter(
        (candidate) => deletedItemSourceKey(candidate) !== sourceKey,
      ),
    ]);
  };
  const showUndo = (undo: PendingUndo) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingUndo(undo);
    undoTimer.current = setTimeout(() => {
      setPendingUndo(null);
      undoTimer.current = null;
    }, 6000);
  };
  const dismissUndo = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setPendingUndo(null);
  };
  const deletePlan = () => {
    setSequenceHistory([]);
    setSequenceNotice("");
    const deletedId = plan.id;
    const deletedItem: RecentlyDeletedItem = {
      id: `deleted-plan-${deletedId}-${Date.now()}`,
      kind: "plan",
      deletedAt: Date.now(),
      plan,
      assignments: schedule
        .filter((slot) => slot.planId === deletedId)
        .map((slot) => ({ id: slot.id, status: slot.status })),
    };
    keepRecentlyDeleted(deletedItem);
    showUndo({
      kind: "deleted",
      message: `${plan.brief.program} deleted.`,
      item: deletedItem,
    });
    const remainingPlans = savedPlans.filter((saved) => saved.id !== deletedId);
    setSavedPlans(remainingPlans);
    setSchedule((current) =>
      current.map((slot) =>
        slot.planId === deletedId
          ? { ...slot, planId: undefined, status: "NEEDS PLAN" }
          : slot,
      ),
    );
    setPlan(remainingPlans[0] ?? createDefaultPlan());
    setHasActiveDraft(false);
    setScreen("classes");
  };
  const deleteDraft = () => {
    if (!hasActiveDraft || plan.status !== "draft") return;
    const draftDate = plan.brief.scheduledDate;
    const draftTime = plan.brief.scheduledTime;
    setSequenceHistory([]);
    setSequenceNotice("");
    setLibraryPlanPhase(undefined);
    const deletedItem: RecentlyDeletedItem = {
      id: `deleted-draft-${plan.id}-${Date.now()}`,
      kind: "draft",
      deletedAt: Date.now(),
      plan,
      assignments: schedule
        .filter(
          (slot) =>
            slot.status === "DRAFT" &&
            slot.date === draftDate &&
            slot.time === draftTime,
        )
        .map((slot) => ({ id: slot.id, status: slot.status })),
    };
    keepRecentlyDeleted(deletedItem);
    showUndo({
      kind: "deleted",
      message: `${plan.brief.program} draft deleted.`,
      item: deletedItem,
    });
    setHasActiveDraft(false);
    if (draftDate && draftTime) {
      setSchedule((current) =>
        current.map((slot) =>
          slot.status === "DRAFT" &&
          slot.date === draftDate &&
          slot.time === draftTime
            ? { ...slot, status: "NEEDS PLAN" }
            : slot,
        ),
      );
    }
    setPlan(savedPlans[0] ?? createDefaultPlan());
    setScreen("classes");
  };
  const assignPlan = (slotId: string, planId: string) => {
    const targetSlot = schedule.find((slot) => slot.id === slotId);
    const selectedPlan =
      savedPlans.find((saved) => saved.id === planId) ??
      (plan.id === planId && plan.status === "saved" ? plan : undefined);
    if (!selectedPlan || !classReadiness(selectedPlan, libraryMovements).ready) return;
    setSequenceHistory([]);
    setSequenceNotice("");
    setSchedule((current) =>
      current.map((slot) =>
        slot.id === slotId
          ? { ...slot, status: "READY", planId: selectedPlan.id }
          : slot,
      ),
    );
    setPlan(selectedPlan);
    if (targetSlot) setHomeDate(targetSlot.date);
    setHasActiveDraft(false);
    setAssignmentSlotId(undefined);
    setScreen("home");
  };
  const schedulePlanAt = () => {
    if (plan.status !== "saved" || !classReadiness(plan, libraryMovements).ready)
      return;
    const { date, time } = nextAvailableClassSlot(schedule, new Date());
    const slot: ScheduledClass = {
      id: `slot-${date}-${time.replace(":", "")}-${Date.now()}`,
      date,
      time,
      level: planLevel(plan),
      lesson: `${plan.brief.week} · ${plan.brief.day}`,
      status: "READY",
      planId: plan.id,
    };
    setSchedule((current) =>
      [...current, slot].sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      ),
    );
    setHomeDate(date);
    setHasActiveDraft(false);
    setAssignmentSlotId(undefined);
    setScreen("home");
  };
  const findPlan = (planId?: string) =>
    savedPlans.find((saved) => saved.id === planId) ??
    (planId === plan.id && plan.status === "saved" ? plan : undefined);
  const openActiveTeachingSession = () => {
    if (!activeTeachingSession) return;
    setSequenceHistory([]);
    setSequenceNotice("");
    setPlan(activeTeachingSession.plan);
    setHasActiveDraft(false);
    setScreen("teach");
  };
  const openSessionDetails = (
    result: SessionResult,
    returnScreen: "home" | "insights",
  ) => {
    setSelectedSession(result);
    setSessionDetailsReturn(returnScreen);
    setScreen("sessionDetails");
  };
  const reviewScheduledClass = (slot: ScheduledClass) => {
    const result = sessionHistory.find(
      (session) => session.scheduledClassId === slot.id,
    );
    if (!result) {
      Alert.alert(
        "Session record unavailable",
        "This class was completed before detailed session records were enabled.",
      );
      return;
    }
    openSessionDetails(result, "home");
  };
  const beginTeachingSession = (
    selectedPlan: ClassPlan,
    scheduledClassId?: string,
  ) => {
    if (activeTeachingSession) {
      Alert.alert(
        "Class already in progress",
        "Resume or end the current class before starting another one.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Resume class", onPress: openActiveTeachingSession },
        ],
      );
      return;
    }
    if (!classReadiness(selectedPlan, libraryMovements).ready) {
      setPlan(selectedPlan);
      setHasActiveDraft(false);
      setSequenceHistory([]);
      setSequenceNotice("Resolve the class readiness issues before teaching.");
      setScreen("editor");
      return;
    }
    const ordered = sequenceForTeaching(selectedPlan);
    if (!ordered.length) {
      Alert.alert("Plan is empty", "Add at least one movement before teaching.");
      return;
    }
    const startedAt = Date.now();
    const active: ActiveTeachingSession = {
      plan: selectedPlan,
      scheduledClassId,
      startedAt,
      movementIndex: 0,
      remainingSeconds: ordered[0].duration,
      held: false,
      savedAt: startedAt,
    };
    setActiveTeachingSession(active);
    setSequenceHistory([]);
    setSequenceNotice("");
    setPlan(selectedPlan);
    setHasActiveDraft(false);
    if (scheduledClassId) {
      setSchedule((current) =>
        current.map((slot) =>
          slot.id === scheduledClassId
            ? { ...slot, status: "IN PROGRESS" }
            : slot,
        ),
      );
    }
    setScreen("teach");
  };
  const startScheduledClass = (slot: ScheduledClass) => {
    if (activeTeachingSession?.scheduledClassId === slot.id) {
      openActiveTeachingSession();
      return;
    }
    const assignedPlan = findPlan(slot.planId);
    if (!assignedPlan || planLevel(assignedPlan) !== slot.level) {
      setAssignmentSlotId(slot.id);
      setScreen("assign");
      return;
    }
    if (!classReadiness(assignedPlan, libraryMovements).ready) {
      setPlan(assignedPlan);
      setHasActiveDraft(false);
      Alert.alert(
        "Plan needs review",
        "Review the timing, sides and movement content before teaching.",
      );
      setScreen("generated");
      return;
    }
    beginTeachingSession(assignedPlan, slot.id);
  };
  const toggleFavourite = (id: string) =>
    setFavourites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const changeSequence = (movements: PlanMovement[], mode?: SequenceMode) => {
    setSequenceHistory((history) => [...history.slice(-19), plan]);
    setPlan(updatePlanSequence(plan, movements, mode));
    setHasActiveDraft(true);
    setSequenceNotice("");
  };
  const undoSequence = () => {
    const previous = sequenceHistory[sequenceHistory.length - 1];
    if (!previous) return;
    setPlan(previous);
    setHasActiveDraft(previous.status === "draft");
    setSequenceHistory((history) => history.slice(0, -1));
    setSequenceNotice("Last sequence change undone.");
  };
  const addMovementToPlan = (movement: LibraryMovement, phase: Phase, side: SideSelection = "both") => {
    if (movement.reviewStatus === "needs-review") return;
    const movements = insertMovement(plan, movement, phase, `${movement.id}-${Crypto.randomUUID()}`, side);
    changeSequence(movements);
    setSequenceNotice(`${movement.name} added to ${phase.toLowerCase()}.`);
    setLibraryPlanPhase(undefined);
    setScreen("editor");
  };
  const saveCustomMovement = (movement: LibraryMovement) => {
    const reviewed = { ...movement, reviewedBy: account.name, reviewedAt: Date.now() };
    setLibraryMovements((current) => [reviewed, ...current.filter((item) => item.id !== movement.id)]);
    setDeletedMovementIds((current) => current.filter((id) => id !== movement.id));
    setPlan((current) => syncMovementImage(current, movement.id, movement.imageUri));
    setSavedPlans((current) => current.map((saved) =>
      syncMovementImage(saved, movement.id, movement.imageUri)));
    setActiveTeachingSession((current) => current ? {
      ...current,
      plan: syncMovementImage(current.plan, movement.id, movement.imageUri),
    } : current);
    setSelectedMovement(reviewed);
    setMovementToReview(undefined);
    setLibraryNotice(`${movement.name} saved to the library.`);
    setScreen(libraryPlanPhase ? "details" : "library");
  };
  const deleteLibraryMovement = (movement: LibraryMovement) => {
    const deletedItem: RecentlyDeletedItem = {
      id: `deleted-movement-${movement.id}-${Date.now()}`,
      kind: "movement",
      deletedAt: Date.now(),
      movement,
    };
    keepRecentlyDeleted(deletedItem);
    showUndo({
      kind: "deleted",
      message: `${movement.name} deleted.`,
      item: deletedItem,
    });
    setLibraryMovements((current) => current.filter((item) => item.id !== movement.id));
    setDeletedMovementIds((current) =>
      current.includes(movement.id) ? current : [...current, movement.id],
    );
    setFavourites((current) => current.filter((id) => id !== movement.id));
    setMovementToReview(undefined);
    setSelectedMovement(
      libraryMovements.find((item) => item.id !== movement.id) ?? initialLibrary[0],
    );
    setLibraryNotice(
      `${movement.name} moved to Recently Deleted. Existing class plans were not changed.`,
    );
    setScreen("library");
  };
  const removeRecentlyDeletedItem = (id: string) =>
    setRecentlyDeleted((current) => current.filter((item) => item.id !== id));
  const restoreDeletedItem = (item: RecentlyDeletedItem) => {
    const restore = () => {
      if (item.kind === "movement") {
        setLibraryMovements((current) => [
          item.movement,
          ...current.filter((movement) => movement.id !== item.movement.id),
        ]);
        setDeletedMovementIds((current) =>
          current.filter((id) => id !== item.movement.id),
        );
        setSelectedMovement(item.movement);
        setLibraryNotice(`${item.movement.name} restored to the library.`);
        setRecentlyDeletedNotice(`${item.movement.name} restored.`);
      } else if (item.kind === "draft") {
        setPlan({ ...item.plan, status: "draft" });
        setHasActiveDraft(true);
        setSchedule((current) =>
          restoreScheduleAssignments(current, item.assignments),
        );
        setRecentlyDeletedNotice(`${item.plan.brief.program} draft restored.`);
      } else {
        const restoredPlan = { ...item.plan, status: "saved" as const };
        setSavedPlans((current) => [
          restoredPlan,
          ...current.filter((saved) => saved.id !== restoredPlan.id),
        ]);
        if (!hasActiveDraft || plan.status !== "draft") {
          setPlan(restoredPlan);
          setHasActiveDraft(false);
        }
        setSchedule((current) =>
          restoreScheduleAssignments(
            current,
            item.assignments,
            restoredPlan.id,
          ),
        );
        setRecentlyDeletedNotice(`${restoredPlan.brief.program} restored.`);
      }
      removeRecentlyDeletedItem(item.id);
    };

    if (
      item.kind === "draft" &&
      hasActiveDraft &&
      plan.status === "draft" &&
      plan.id !== item.plan.id
    ) {
      confirmAction({
        title: "Replace current draft?",
        message: `Restoring ${item.plan.brief.program} will move the current draft to Recently Deleted.`,
        confirmText: "Restore Draft",
        cancelText: "Keep Current",
        onConfirm: () => {
          keepRecentlyDeleted({
            id: `deleted-draft-${plan.id}-${Date.now()}`,
            kind: "draft",
            deletedAt: Date.now(),
            plan,
            assignments: schedule
              .filter(
                (slot) =>
                  slot.status === "DRAFT" &&
                  slot.date === plan.brief.scheduledDate &&
                  slot.time === plan.brief.scheduledTime,
              )
              .map((slot) => ({ id: slot.id, status: slot.status })),
          });
          restore();
        },
      });
      return;
    }
    restore();
  };
  const cancelScheduledClass = (scheduledClass: ScheduledClass) => {
    setSchedule((current) =>
      current.map((slot) =>
        slot.id === scheduledClass.id
          ? { ...slot, status: "CANCELLED" }
          : slot,
      ),
    );
    showUndo({
      kind: "cancelled",
      message: `${scheduledClass.level} class cancelled.`,
      scheduledClass,
    });
  };
  const undoPendingDeletion = () => {
    const undo = pendingUndo;
    dismissUndo();
    if (!undo) return;
    if (undo.kind === "deleted") {
      restoreDeletedItem(undo.item);
      return;
    }
    setSchedule((current) =>
      current.map((slot) =>
        slot.id === undo.scheduledClass.id ? undo.scheduledClass : slot,
      ),
    );
  };
  const createDefaultPlan = (library = libraryMovements) =>
    createPlan({
      program: "Beginner Foundations",
      level: "Beginner",
      week: "Week 2",
      day: "Day 4",
      energy: "Flowing",
      equipment: ["Mat"],
    }, library);
  const resetWorkspace = (owner: Account) => {
    setEditorPhase("All");
    setSequenceHistory([]);
    setSequenceNotice("");
    setLibraryPlanPhase(undefined);
    setAccount(owner);
    setPlan(createDefaultPlan(initialLibrary));
    setHasActiveDraft(true);
    setSavedPlans([]);
    setSessionResult(null);
    setSelectedSession(null);
    setSessionHistory([]);
    setActiveTeachingSession(undefined);
    setSchedule(initialSchedule);
    setHomeDate(localDateKey());
    setAssignmentSlotId(undefined);
    setLibraryMovements(initialLibrary);
    setDeletedMovementIds([]);
    setRecentlyDeleted([]);
    setRecentlyDeletedNotice("");
    setFavourites(["manual-clam", "manual-shoulder-bridge"]);
    setSelectedMovement(initialLibrary[0]);
    setInstructorPreferences({
      teachingMode: "Guided",
      vibration: true,
      countdownSound: false,
      completionSound: true,
      offline: false,
    });
  };
  const loadWorkspace = async (owner: Account) => {
    setEditorPhase("All");
    setSequenceHistory([]);
    setSequenceNotice("");
    setLibraryPlanPhase(undefined);
    setHomeDate(localDateKey());
    const raw = await AsyncStorage.getItem(userStorageKey(owner));
    if (!raw) {
      resetWorkspace(owner);
      return;
    }
    const stored = JSON.parse(raw) as Partial<StoredAppData>;
    setAccount({
      ...owner,
      name: stored.account?.name ?? owner.name,
      phone: stored.account?.phone,
    });
    setHasActiveDraft(
      stored.hasActiveDraft ?? (stored.plan ? stored.plan.status === "draft" : true),
    );
    setSavedPlans(stored.savedPlans ?? []);
    setSessionResult(null);
    setSelectedSession(null);
    setSessionHistory(stored.sessionHistory ?? []);
    setActiveTeachingSession(
      stored.activeTeachingSession?.plan.movements.length
        ? stored.activeTeachingSession
        : undefined,
    );
    setSchedule(
      (stored.schedule ?? initialSchedule).map((slot) => ({
        ...slot,
        date: slot.date ?? localDateKey(),
      })),
    );
    const removedMovementIds = stored.deletedMovementIds ?? [];
    const retainedDeletedItems = pruneRecentlyDeleted(
      stored.recentlyDeleted ?? [],
    );
    const mergedLibrary = mergeLibraryCatalog(
      initialLibrary,
      stored.libraryMovements ?? [],
      removedMovementIds,
      retiredMovementIds,
    );
    setPlan(stored.plan ?? createDefaultPlan(mergedLibrary));
    setDeletedMovementIds(removedMovementIds);
    setRecentlyDeleted(retainedDeletedItems);
    setRecentlyDeletedNotice("");
    setLibraryMovements(mergedLibrary);
    setFavourites(
      (stored.favourites ?? ["manual-clam", "manual-shoulder-bridge"]).filter(
        (id) => mergedLibrary.some((movement) => movement.id === id),
      ),
    );
    setSelectedMovement(mergedLibrary[0] ?? initialLibrary[0]);
    setInstructorPreferences({
        teachingMode: "Guided",
        vibration: true,
        countdownSound: false,
        completionSound: true,
        offline: false,
        ...stored.instructorPreferences,
      });
  };
  const authenticate = async (
    chosen: Role,
    email: string,
    password: string,
  ): Promise<string | null> => {
    const attemptKey = signInAttemptKey(chosen, email);
    const attempt = signInAttempts.get(attemptKey);
    if (attempt?.blockedUntil && attempt.blockedUntil > Date.now())
      return signInBlockedMessage(attempt.blockedUntil);
    try {
      const credentials = await readCredentials();
      const credential = credentials.find(
        (item) => item.role === chosen && item.email === email,
      );
      const passwordHash = await hashPassword(
        password,
        credential?.salt ?? INVALID_CREDENTIAL_SALT,
      );
      if (!credential || passwordHash !== credential.passwordHash) {
        const blockedUntil = recordSignInFailure(attemptKey);
        return blockedUntil
          ? signInBlockedMessage(blockedUntil)
          : "The email or password is incorrect.";
      }
      signInAttempts.delete(attemptKey);
      await loadWorkspace({
        name: credential.name,
        email: credential.email,
        role: credential.role,
      });
      setSignedIn(true);
      setScreen("home");
      return null;
    } catch {
      return "Account verification is unavailable. Please try again.";
    }
  };
  const openDemoWorkspace = async () => {
    try {
      await loadWorkspace(DEMO_ACCOUNT);
    } catch {
      resetWorkspace(DEMO_ACCOUNT);
    }
    setSignedIn(true);
    setTab("home");
    setScreen("home");
  };
  const register = async (
    newAccount: Account,
    password: string,
  ): Promise<string | null> => {
    const passwordError = passwordValidationError(password);
    if (passwordError) return passwordError;
    try {
      const credentials = await readCredentials();
      if (
        credentials.some(
          (item) =>
            item.role === newAccount.role && item.email === newAccount.email,
        )
      )
        return "An account already exists for this email and role.";
      const salt = Crypto.randomUUID();
      const passwordHash = await hashPassword(password, salt);
      await writeCredentials([
        ...credentials,
        { ...newAccount, salt, passwordHash },
      ]);
      signInAttempts.delete(
        signInAttemptKey(newAccount.role, newAccount.email),
      );
      resetWorkspace(newAccount);
      setSignedIn(true);
      setScreen("home");
      return null;
    } catch {
      return "The account could not be created. Please try again.";
    }
  };
  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<string | null> => {
    const passwordError = passwordValidationError(newPassword);
    if (passwordError) return passwordError;
    try {
      const credentials = await readCredentials();
      const credentialIndex = credentials.findIndex(
        (credential) =>
          credential.role === account.role &&
          credential.email === account.email,
      );
      if (credentialIndex < 0) return "Account credentials could not be found.";
      const credential = credentials[credentialIndex];
      const currentHash = await hashPassword(currentPassword, credential.salt);
      if (currentHash !== credential.passwordHash)
        return "The current password is incorrect.";
      const salt = Crypto.randomUUID();
      const passwordHash = await hashPassword(newPassword, salt);
      const nextCredentials = [...credentials];
      nextCredentials[credentialIndex] = {
        ...credential,
        salt,
        passwordHash,
      };
      await writeCredentials(nextCredentials);
      signInAttempts.delete(signInAttemptKey(account.role, account.email));
      return null;
    } catch {
      return "The password could not be updated. Please try again.";
    }
  };
  const resetSandboxPassword = async (
    chosenRole: Role,
    email: string,
    newPassword: string,
  ): Promise<string | null> => {
    if (!ALLOW_SANDBOX_PASSWORD_RESET)
      return "Local password reset is available only in development builds.";
    const passwordError = passwordValidationError(newPassword);
    if (passwordError) return passwordError;
    try {
      const credentials = await readCredentials();
      const credentialIndex = credentials.findIndex(
        (credential) =>
          credential.role === chosenRole && credential.email === email,
      );
      if (credentialIndex < 0)
        return `No ${chosenRole} account was found for this email.`;
      const salt = Crypto.randomUUID();
      const passwordHash = await hashPassword(newPassword, salt);
      const nextCredentials = [...credentials];
      nextCredentials[credentialIndex] = {
        ...nextCredentials[credentialIndex],
        salt,
        passwordHash,
      };
      await writeCredentials(nextCredentials);
      signInAttempts.delete(signInAttemptKey(chosenRole, email));
      return null;
    } catch {
      return "The local password could not be reset. Please try again.";
    }
  };
  const updateAccountDetails = async (
    nextAccount: Account,
  ): Promise<string | null> => {
    const previous = account;
    const oldKey = userStorageKey(previous);
    const nextKey = userStorageKey(nextAccount);
    try {
      await saveChain.current;
      const credentials = await readCredentials();
      const credentialIndex = credentials.findIndex(
        (credential) =>
          credential.role === previous.role &&
          credential.email === previous.email,
      );
      if (credentialIndex < 0)
        return "Account credentials could not be found.";
      const emailTaken = credentials.some(
        (credential, index) =>
          index !== credentialIndex &&
          credential.role === nextAccount.role &&
          credential.email === nextAccount.email,
      );
      if (emailTaken) return "An account already exists for this email.";

      const nextStored = storedData(nextAccount);
      await AsyncStorage.setItem(nextKey, JSON.stringify(nextStored));
      const nextCredentials = [...credentials];
      nextCredentials[credentialIndex] = {
        ...nextCredentials[credentialIndex],
        name: nextAccount.name,
        email: nextAccount.email,
      };
      try {
        await writeCredentials(nextCredentials);
      } catch (error) {
        if (nextKey !== oldKey)
          await AsyncStorage.removeItem(nextKey).catch(() => undefined);
        throw error;
      }
      if (nextKey !== oldKey)
        await AsyncStorage.removeItem(oldKey).catch(() => undefined);
      latestStoredData.current = nextStored;
      setAccount(nextAccount);
      setPersistenceError("");
      setSaveStatus("saved");
      signInAttempts.delete(signInAttemptKey(previous.role, previous.email));
      return null;
    } catch {
      return "Account details could not be saved. Please try again.";
    }
  };
  const logout = async () => {
    const stored = latestStoredData.current ?? storedData();
    try {
      await queueWorkspaceSave(stored);
      setSessionResult(null);
      setSignedIn(false);
      setScreen("welcome");
    } catch {
      Alert.alert(
        "Could not log out safely",
        "Your latest changes are not saved yet. Please try again.",
      );
    }
  };
  const resetAppData = async () => {
    try {
      await saveChain.current;
      await AsyncStorage.removeItem(userStorageKey(account));
      const credentials = await readCredentials();
      await writeCredentials(
        credentials.filter(
          (credential) =>
            !(
              credential.role === account.role &&
              credential.email === account.email
            ),
        ),
      );
      signInAttempts.delete(signInAttemptKey(account.role, account.email));
      latestStoredData.current = null;
      resetWorkspace({
        name: "Blush Bodies Instructor",
        email: "coach@blushbodies.com",
        role: "instructor",
      });
      setSignedIn(false);
      setTab("home");
      setScreen("welcome");
    } catch {
      Alert.alert(
        "Account not deleted",
        "Your account and local data could not be removed. Please try again.",
      );
    }
  };
  const recentlyDeletedCount = pruneRecentlyDeleted(recentlyDeleted).length;
  if (screen === "welcome")
    return (
      <Welcome
        getStarted={() => {
          setSignupReturnScreen("welcome");
          setScreen("signup");
        }}
        logIn={() => {
          setScreen("signin");
        }}
      />
    );
  if (screen === "signin")
    return (
      <SignIn
        role="instructor"
        allowSandboxReset={ALLOW_SANDBOX_PASSWORD_RESET}
        openDemo={
          ALLOW_SANDBOX_PASSWORD_RESET ? openDemoWorkspace : undefined
        }
        back={() => setScreen("welcome")}
        signup={() => {
          setSignupReturnScreen("signin");
          setScreen("signup");
        }}
        resetPassword={(email) => {
          setResetEmail(email);
          setScreen("resetPassword");
        }}
        complete={(email, password) =>
          authenticate("instructor", email, password)
        }
      />
    );
  if (screen === "resetPassword")
    return (
      <SandboxPasswordReset
        role="instructor"
        initialEmail={resetEmail}
        back={() => setScreen("signin")}
        reset={(email, password) =>
          resetSandboxPassword("instructor", email, password)
        }
      />
    );
  if (screen === "signup")
    return (
      <SignUp
        role="instructor"
        back={() => setScreen(signupReturnScreen)}
        complete={register}
      />
    );
  if (screen === "teach" && activeTeachingSession)
    return (
      <TeachingSession
        session={activeTeachingSession}
        preferences={instructorPreferences}
        exit={() => setScreen("generated")}
        checkpoint={setActiveTeachingSession}
        finish={(result) => {
          setActiveTeachingSession(undefined);
          if (result.scheduledClassId) {
            setSchedule((current) =>
              current.map((slot) =>
                slot.id === result.scheduledClassId
                  ? { ...slot, status: "COMPLETED" }
                  : slot,
              ),
            );
          }
          setSessionResult(result);
          setSessionHistory((current) => [
            result,
            ...current.filter((session) => session.startedAt !== result.startedAt),
          ]);
          setScreen("summary");
        }}
      />
    );
  if (screen === "summary" && sessionResult)
    return (
      <View style={s.app}>
        <TopSafeArea />
        <Summary
          plan={plan}
          result={sessionResult}
          done={(notes) => {
            const completed = { ...sessionResult, notes };
            setSessionResult(completed);
            setSessionHistory((current) => [
              completed,
              ...current.filter(
                (session) => session.startedAt !== completed.startedAt,
              ),
            ]);
            setScreen("home");
          }}
        />
      </View>
    );
  if (screen === "sessionDetails" && selectedSession)
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <TopSafeArea />
        <SessionDetails
          result={selectedSession}
          scheduledClass={schedule.find(
            (slot) => slot.id === selectedSession.scheduledClassId,
          )}
          back={() => setScreen(sessionDetailsReturn)}
        />
      </View>
    );
  if (screen === "assign")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <TopSafeArea />
        <AssignPlan
          plan={plan}
          library={libraryMovements}
          savedPlans={savedPlans}
          schedule={schedule}
          targetSlotId={assignmentSlotId}
          back={() => {
            setAssignmentSlotId(undefined);
            setScreen(assignmentSlotId ? "home" : "managePlan");
          }}
          create={() => setScreen("create")}
          assign={assignPlan}
          scheduleNext={schedulePlanAt}
          openSchedule={() => {
            setScheduleReturnScreen("assign");
            setScheduleEditId(undefined);
            setScreen("schedule");
          }}
        />
      </View>
    );
  if (screen === "schedule")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <TopSafeArea />
        <ScheduleManager
          schedule={schedule}
          initialEditId={scheduleEditId}
          back={() => {
            const destination = scheduleEditId ? "home" : scheduleReturnScreen;
            setScheduleEditId(undefined);
            setScreen(destination);
          }}
          save={(slot) => {
            const returnHome = Boolean(scheduleEditId);
            setSchedule((current) =>
              [...current.filter((item) => item.id !== slot.id), slot].sort(
                (a, b) =>
                  `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
              ),
            );
            setScheduleEditId(undefined);
            if (returnHome) setScreen("home");
            else if (scheduleReturnScreen === "assign") setScreen("assign");
          }}
          remove={(id) =>
            setSchedule((current) => current.filter((slot) => slot.id !== id))
          }
          cancel={cancelScheduledClass}
        />
        {pendingUndo ? (
          <UndoBanner
            message={pendingUndo.message}
            undo={undoPendingDeletion}
            dismiss={dismissUndo}
          />
        ) : null}
      </View>
    );
  if (screen === "recentlyDeleted")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <TopSafeArea />
        <RecentlyDeleted
          items={recentlyDeleted}
          notice={recentlyDeletedNotice}
          back={() => {
            setRecentlyDeletedNotice("");
            setScreen(recentlyDeletedReturn);
          }}
          restore={restoreDeletedItem}
          remove={(id) => {
            removeRecentlyDeletedItem(id);
            setRecentlyDeletedNotice("Item permanently deleted.");
          }}
        />
      </View>
    );
  if (screen === "managePlan")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <TopSafeArea />
        <ManagePlan
          plan={plan}
          schedule={schedule}
          back={() => setScreen("classes")}
          open={() => setScreen("generated")}
          duplicate={duplicatePlan}
          assign={() => {
            setAssignmentSlotId(undefined);
            setScreen("assign");
          }}
          rename={renamePlan}
          remove={deletePlan}
        />
      </View>
    );
  if (screen === "dataSettings")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <TopSafeArea />
        <DataSettings
          savedPlans={savedPlans.length}
          schedule={schedule.length}
          sessions={sessionHistory.length}
          customMovements={
            libraryMovements.filter((movement) =>
              movement.id.startsWith("custom-"),
            ).length
          }
          back={() => setScreen("profile")}
          reset={resetAppData}
        />
      </View>
    );
  if (screen === "changePassword")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <TopSafeArea />
        <ChangePassword
          back={() => setScreen("profile")}
          update={changePassword}
        />
      </View>
    );
  return (
    <View style={s.app}>
      <StatusBar style="dark" />
      <TopSafeArea />
      <View style={s.flex}>
        {screen === "home" ? (
          <InstructorHome
            schedule={schedule}
            account={account}
            selectedDate={homeDate}
            setSelectedDate={setHomeDate}
            activeSession={activeTeachingSession}
            create={() => {
              setAssignmentSlotId(undefined);
              setScreen("create");
            }}
            assign={(slot) => {
              setAssignmentSlotId(slot.id);
              setScreen("assign");
            }}
            start={startScheduledClass}
            resume={openActiveTeachingSession}
            review={reviewScheduledClass}
            modify={(slot) => {
              setScheduleReturnScreen("home");
              setScheduleEditId(slot.id);
              setScreen("schedule");
            }}
            remove={(slot) =>
              confirmAction({
                title: "Cancel class?",
                message: `${classDateLabel(slot.date, true)} at ${slot.time} will move to Cancelled. Its assigned plan will remain saved.`,
                confirmText: "Cancel Class",
                cancelText: "Keep class",
                destructive: true,
                onConfirm: () => cancelScheduledClass(slot),
              })
            }
            getPlanTitle={(slot) => {
              const assignedPlan = findPlan(slot.planId);
              return assignedPlan &&
                classReadiness(assignedPlan, libraryMovements).ready &&
                planLevel(assignedPlan) === slot.level
                ? assignedPlan.brief.program
                : undefined;
            }}
          />
        ) : null}
        {screen === "create" ? (
          <Create
            initialClass={schedule.find(
              (slot) => slot.id === assignmentSlotId,
            )}
            back={() => setScreen(assignmentSlotId ? "assign" : "home")}
            generate={(brief, fromScratch) => {
              setEditorPhase("All");
              const created = createPlan(brief, libraryMovements);
              setPlan(fromScratch ? { ...created, movements: [] } : created);
              setHasActiveDraft(true);
              setSequenceHistory([]);
              setSequenceNotice("");
              setLibraryPlanPhase(undefined);
              setScreen(fromScratch ? "editor" : "generated");
            }}
          />
        ) : null}
        {screen === "generated" ? (
          <Generated
            plan={plan}
            library={libraryMovements}
            schedule={schedule}
            back={() => setScreen("classes")}
            edit={() => setScreen("editor")}
            save={savePlan}
            schedulePlan={() => {
              setAssignmentSlotId(undefined);
              setScreen("assign");
            }}
            teach={() => beginTeachingSession(plan)}
          />
        ) : null}
        {screen === "classes" ? (
          <Plans
            plan={plan}
            hasActiveDraft={hasActiveDraft}
            savedPlans={savedPlans}
            schedule={schedule}
            lastSession={sessionResult}
            create={() => setScreen("create")}
            open={() => setScreen("generated")}
            duplicate={duplicatePlan}
            removeDraft={deleteDraft}
            deletedCount={recentlyDeletedCount}
            openDeleted={() => {
              setRecentlyDeletedReturn("classes");
              setRecentlyDeletedNotice("");
              setScreen("recentlyDeleted");
            }}
            select={(selected) => {
              setEditorPhase("All");
              setSequenceHistory([]);
              setSequenceNotice("");
              setPlan(selected);
              setHasActiveDraft(false);
              setScreen("managePlan");
            }}
          />
        ) : null}
        {screen === "editor" ? (
          <Classes
            plan={plan}
            change={changeSequence}
            library={libraryMovements}
            add={addMovementToPlan}
            reviewMovement={(movement, phase) => {
              setSelectedMovement(movement);
              setMovementToReview(movement);
              setLibraryPlanPhase(phase);
              setScreen("customMovement");
            }}
            undo={undoSequence}
            canUndo={sequenceHistory.length > 0}
            notice={sequenceNotice}
            filter={editorPhase}
            setFilter={setEditorPhase}
            back={() => setScreen("generated")}
            open={(phase) => {
              setLibraryPlanPhase(phase);
              setScreen("library");
            }}
          />
        ) : null}
        {screen === "details" ? (
          <Details
            key={selectedMovement.id}
            movement={selectedMovement}
            plan={plan}
            initialPhase={libraryPlanPhase}
            planning={Boolean(libraryPlanPhase)}
            favourite={favourites.includes(selectedMovement.id)}
            back={() => setScreen("library")}
            toggle={() => toggleFavourite(selectedMovement.id)}
            add={(phase, side) => addMovementToPlan(selectedMovement, phase, side)}
            review={() => {
              setMovementToReview(selectedMovement);
              setScreen("customMovement");
            }}
            remove={() => deleteLibraryMovement(selectedMovement)}
          />
        ) : null}
        {screen === "customMovement" ? (
          <CustomMovement
            key={movementToReview?.id ?? "new"}
            initialMovement={movementToReview}
            initialPhase={libraryPlanPhase}
            back={() => setScreen(movementToReview ? "details" : "library")}
            save={saveCustomMovement}
          />
        ) : null}
        {screen === "library" ? (
          <Library
            back={libraryPlanPhase ? () => {
              setLibraryPlanPhase(undefined);
              setScreen("editor");
            } : undefined}
            movements={libraryMovements}
            favourites={favourites}
            notice={libraryNotice}
            open={(movement) => {
              setLibraryNotice("");
              setSelectedMovement(movement);
              setScreen("details");
            }}
            create={() => {
              setLibraryNotice("");
              setMovementToReview(undefined);
              setScreen("customMovement");
            }}
            toggle={toggleFavourite}
            deletedCount={recentlyDeletedCount}
            openDeleted={() => {
              setRecentlyDeletedReturn("library");
              setRecentlyDeletedNotice("");
              setScreen("recentlyDeleted");
            }}
          />
        ) : null}
        {screen === "insights" ? (
          <Insights
            sessions={sessionHistory}
            schedule={schedule}
            openSession={(session) => openSessionDetails(session, "insights")}
          />
        ) : null}
        {screen === "profile" ? (
          <Profile
            account={account}
            preferences={instructorPreferences}
            updateAccount={updateAccountDetails}
            updatePreferences={setInstructorPreferences}
            navigate={(target) => {
              if (target === "home") {
                setScheduleReturnScreen("profile");
                setScheduleEditId(undefined);
                setScreen("schedule");
              } else select(target);
            }}
            manageData={() => setScreen("dataSettings")}
            openSecurity={() => setScreen("changePassword")}
            logout={logout}
            saveStatus={saveStatus}
          />
        ) : null}
      </View>
      {(
        ["home", "classes", "library", "insights", "profile"] as Screen[]
      ).includes(screen) ? (
        <Nav tab={tab} setTab={select} />
      ) : null}
      {pendingUndo ? (
        <UndoBanner
          message={pendingUndo.message}
          undo={undoPendingDeletion}
          dismiss={dismissUndo}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  readiness: { gap: 10, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.line },
  readinessHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  readinessError: { color: C.rose, fontSize: 13, lineHeight: 20 },
  pendingVisual: { alignItems: "center", justifyContent: "center", backgroundColor: C.pale },
  reviewBadge: { color: C.gold, fontSize: 10, fontWeight: "800", marginVertical: 3 },
  libraryPhase: { color: C.rose, fontSize: 10, fontWeight: "800", marginTop: 2 },
  libraryDuration: { alignItems: "flex-end", minWidth: 42 },
  sideCheckbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: C.rose,
    alignItems: "center", justifyContent: "center" },
  sideCheckboxOn: { backgroundColor: C.rose },
  workingSide: { color: C.rose, fontSize: 12, fontWeight: "800", marginTop: 3 },
  sequenceModes: {
    flexDirection: "row", backgroundColor: C.paleSage, padding: 4, borderRadius: 8,
  },
  sequenceMode: {
    flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", padding: 8, borderRadius: 6,
  },
  sequenceModeOn: { backgroundColor: C.white },
  sequenceNotice: { color: C.sage, fontSize: 13, lineHeight: 20 },
  planningWarning: { color: C.gold, fontSize: 13, lineHeight: 20 },
  suggestions: { gap: 12 },
  suggestionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.line },
  suggestionImage: { width: 54, height: 54, borderRadius: 6, backgroundColor: C.pale },
  suggestionReason: { color: C.sage, fontSize: 12, lineHeight: 18, marginTop: 3 },
  suggestionAdd: { width: 44, height: 44, borderRadius: 8, backgroundColor: C.pale,
    alignItems: "center", justifyContent: "center" },
  libraryBack: { padding: 8, marginRight: 4 },
  appRoot: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    backgroundColor: Platform.OS === "web" ? "#EDE7E5" : C.bg,
    alignItems: Platform.OS === "web" ? "center" : "stretch",
    overflow: "hidden",
  },
  appViewport: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    maxWidth: Platform.OS === "web" ? 480 : undefined,
    backgroundColor: C.bg,
    overflow: "hidden",
  },
  app: { flex: 1, minWidth: 0, backgroundColor: C.bg },
  flex: { flex: 1, minWidth: 0 },
  page: { paddingHorizontal: 24, paddingBottom: 28, gap: 20 },
  row: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stack: { gap: 10 },
  welcome: {
    flex: 1,
    backgroundColor: C.bg,
    padding: 24,
    paddingTop: 66,
    paddingBottom: 84,
    justifyContent: "space-between",
  },
  brand: { alignItems: "center", gap: 10 },
  brandTitle: { color: C.rose, fontSize: 14, fontWeight: "800" },
  brandSub: { color: C.muted, fontSize: 11, fontWeight: "800" },
  art: {
    height: 300,
    borderRadius: 26,
    backgroundColor: "#EFDADD",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  artDark: { backgroundColor: "#594B4F", height: 145, borderRadius: 20 },
  artDisk: {
    position: "absolute",
    width: 116,
    height: 116,
    borderRadius: 58,
    top: 72,
  },
  artHead: {
    position: "absolute",
    top: 70,
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
  },
  artBody: {
    position: "absolute",
    top: 165,
    width: 135,
    height: 72,
    borderTopLeftRadius: 80,
    borderTopRightRadius: 80,
    borderWidth: 3,
    borderBottomWidth: 0,
  },
  welcomeCopy: { alignItems: "center", gap: 4 },
  hero: {
    color: C.ink,
    textAlign: "center",
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "800",
  },
  sub: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  welcomeActions: { gap: 12 },
  main: {
    height: 49,
    borderRadius: 14,
    backgroundColor: C.rose,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  mainText: { color: C.white, fontSize: 14, fontWeight: "800" },
  outline: {
    height: 49,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4D7D3",
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineText: { color: C.ink, fontSize: 14, fontWeight: "800" },
  signin: {
    flexGrow: 1,
    backgroundColor: C.bg,
    padding: 24,
    paddingTop: 68,
    gap: 32,
  },
  signinBrand: { alignItems: "center", gap: 9, marginTop: 18 },
  signinCopy: { gap: 4 },
  signinTitle: { color: C.ink, fontSize: 30, fontWeight: "800" },
  form: { gap: 10 },
  formInput: {
    height: 53,
    borderWidth: 1,
    borderColor: "#E4D7D3",
    borderRadius: 14,
    backgroundColor: C.card,
    paddingHorizontal: 16,
    fontSize: 14,
    color: C.ink,
    marginBottom: 8,
  },
  formError: {
    color: "#A34848",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  forgot: {
    alignSelf: "center",
    color: C.rose,
    fontSize: 13,
    fontWeight: "800",
    paddingVertical: 10,
  },
  demoNote: {
    backgroundColor: "#F4E3E3",
    borderRadius: 16,
    padding: 17,
    gap: 7,
  },
  title: { color: C.ink, fontSize: 24, fontWeight: "800" },
  header: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  headerTitle: { color: C.ink, fontSize: 23, fontWeight: "800" },
  headerRight: { marginLeft: "auto", minWidth: 30, alignItems: "flex-end" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3E3E5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  deletedCountBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: C.rose,
    borderWidth: 2,
    borderColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  deletedCountText: { color: C.white, fontSize: 8, fontWeight: "900" },
  days: {
    height: 70,
    borderRadius: 18,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  day: {
    width: 46,
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  dayOn: { backgroundColor: "#E5C9CF" },
  dayText: { fontSize: 10, color: C.muted, fontWeight: "700" },
  dayNumber: { fontSize: 18, color: C.ink, fontWeight: "800" },
  roseText: { color: C.rose },
  section: { color: C.ink, fontSize: 19, fontWeight: "800" },
  plan: {
    height: 39,
    borderRadius: 20,
    backgroundColor: C.rose,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  planText: { color: C.white, fontSize: 12, fontWeight: "800" },
  resumeSession: {
    width: "100%",
    minHeight: 82,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#DFC8CE",
    backgroundColor: "#FFF8F8",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  resumeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.rose,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeLabel: { color: C.rose, fontSize: 9, fontWeight: "900" },
  resumeTitle: { color: C.ink, fontSize: 15, fontWeight: "900", marginTop: 3 },
  resumeMeta: { color: C.muted, fontSize: 10, marginTop: 3 },
  classCard: {
    width: "100%",
    minWidth: 0,
    minHeight: 86,
    borderRadius: 15,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    gap: 11,
    paddingRight: 16,
  },
  completedClassCard: { opacity: 0.72 },
  swipeActions: {
    width: 156,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 8,
  },
  swipeEdit: {
    flex: 1,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  swipeDelete: {
    flex: 1,
    backgroundColor: "#A34848",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  swipeActionText: { color: C.white, fontSize: 11, fontWeight: "800" },
  rail: { width: 4, alignSelf: "stretch" },
  readyRail: { backgroundColor: C.sage },
  planRail: { backgroundColor: C.gold },
  completedRail: { backgroundColor: "#9DAAA3" },
  time: { width: 50, alignItems: "center" },
  timeText: { color: C.ink, fontSize: 14, fontWeight: "800" },
  duration: { color: C.muted, fontSize: 10, fontWeight: "700" },
  level: { color: C.ink, fontSize: 14, fontWeight: "800" },
  week: { color: C.muted, fontSize: 11, marginTop: 5 },
  action: { width: 108, alignItems: "center", gap: 7 },
  planNeededAction: { width: "100%", alignItems: "center", gap: 7 },
  planNeededText: {
    color: C.rose,
    fontSize: 9,
    fontWeight: "900",
  },
  planDraftText: { color: C.gold },
  assignCompact: {
    height: 32,
    minWidth: 92,
    borderRadius: 16,
    backgroundColor: C.rose,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  assignCompactText: { color: C.white, fontSize: 11, fontWeight: "800" },
  reviewCompact: {
    minHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#DFC8CE",
    backgroundColor: "#FFF8F8",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  reviewCompactText: { color: C.rose, fontSize: 10, fontWeight: "900" },
  pill: {
    minHeight: 25,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  pillRose: { backgroundColor: "#F3E3E5" },
  pillGreen: { backgroundColor: C.paleSage },
  pillText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  greenText: { color: C.sage },
  start: {
    height: 29,
    minWidth: 74,
    borderRadius: 15,
    backgroundColor: C.rose,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  startText: { color: C.white, fontSize: 11, fontWeight: "800" },
  nav: {
    minHeight: 72,
    paddingBottom: Platform.OS === "ios" ? 13 : 4,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  navLabel: { color: C.muted, fontSize: 10, fontWeight: "600" },
  navLabelOn: { color: C.rose, fontWeight: "800" },
  steps: { height: 48, flexDirection: "row", justifyContent: "space-around" },
  stepWrap: { alignItems: "center", gap: 4 },
  step: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E4D7D3",
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  stepOn: { backgroundColor: C.rose, borderColor: C.rose },
  stepNum: { color: C.muted, fontSize: 12, fontWeight: "800" },
  stepNumOn: { color: C.white },
  stepLabel: { color: C.muted, fontSize: 10, fontWeight: "700" },
  label: { color: C.muted, fontSize: 10, fontWeight: "800" },
  selectGroup: { gap: 8 },
  compactSelectGroup: { minWidth: 0 },
  select: {
    height: 54,
    borderWidth: 1,
    borderColor: "#E4D7D3",
    borderRadius: 14,
    backgroundColor: C.card,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: { color: C.ink, fontSize: 14, fontWeight: "700" },
  choiceBackdrop: {
    flex: 1,
    backgroundColor: "rgba(36, 32, 34, 0.45)",
    justifyContent: "flex-end",
    padding: 20,
  },
  choiceSheet: {
    backgroundColor: C.card,
    borderRadius: 8,
    padding: 20,
    gap: 8,
    maxHeight: "70%",
  },
  choiceList: { maxHeight: 420 },
  choiceRow: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    borderRadius: 6,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  choiceRowSelected: { backgroundColor: C.paleSage },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    minHeight: 28,
    borderRadius: 15,
    backgroundColor: C.card,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  optionOn: { backgroundColor: "#E8CBD1" },
  optionText: { fontSize: 11, color: C.muted, fontWeight: "700" },
  structure: { gap: 8 },
  structureCard: {
    backgroundColor: C.card,
    borderRadius: 15,
    padding: 18,
    gap: 12,
  },
  structureBar: {
    height: 12,
    flexDirection: "row",
    gap: 1,
    overflow: "hidden",
    borderRadius: 8,
  },
  warm: { backgroundColor: "#E8CBD1" },
  mainPart: { backgroundColor: C.rose },
  structureCenter: { fontSize: 10, color: C.rose, fontWeight: "800" },
  sticky: {
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
  },
  planSub: { color: C.ink, fontSize: 14, fontWeight: "800" },
  planMeasureRow: {
    minHeight: 76,
    borderRadius: 14,
    backgroundColor: "#F6ECEB",
    flexDirection: "row",
    paddingVertical: 12,
  },
  planMeasure: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#E4D5D2",
  },
  planMeasureValue: { color: C.ink, fontSize: 16, fontWeight: "900" },
  planMeasureLabel: {
    color: C.rose,
    fontSize: 7,
    fontWeight: "900",
    marginTop: 4,
  },
  timing: {
    backgroundColor: C.card,
    borderRadius: 17,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  total: { fontSize: 27, color: C.ink, fontWeight: "800" },
  breakdown: { fontSize: 15, color: C.rose },
  planBlock: {
    minHeight: 101,
    borderRadius: 18,
    backgroundColor: C.card,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingRight: 15,
  },
  planAccent: { width: 8, alignSelf: "stretch", backgroundColor: "#E8CBD1" },
  blockTitle: { color: C.ink, fontSize: 16, fontWeight: "800" },
  planTime: { color: C.rose, fontSize: 17, fontWeight: "800" },
  currentPlan: {
    borderRadius: 18,
    backgroundColor: C.card,
    padding: 18,
    gap: 14,
  },
  planDivider: { height: 1, backgroundColor: C.line },
  planActions: { flexDirection: "row", gap: 12 },
  iconAction: {
    width: 49,
    height: 49,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4D7D3",
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteDraftAction: {
    borderColor: "#E7C5C5",
    backgroundColor: "#FFF3F3",
  },
  savedPlan: {
    minHeight: 66,
    borderRadius: 15,
    backgroundColor: C.card,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  assignCard: {
    minHeight: 72,
    borderRadius: 15,
    backgroundColor: C.card,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  cancelledClassCard: {
    backgroundColor: "#F7F2F1",
    opacity: 0.64,
  },
  scheduleTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  assignmentTarget: {
    minHeight: 84,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.pale,
    backgroundColor: C.card,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nextSlotCard: { flexWrap: "wrap" },
  assignmentSelected: {
    borderWidth: 1,
    borderColor: C.sage,
    backgroundColor: C.paleSage,
  },
  savedPlanRight: { alignItems: "flex-end", gap: 3 },
  recentSession: {
    minHeight: 78,
    borderRadius: 16,
    backgroundColor: C.card,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  sessionDetailHero: {
    minHeight: 100,
    borderRadius: 16,
    backgroundColor: C.card,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  sessionCompletion: {
    borderRadius: 16,
    backgroundColor: C.card,
    padding: 16,
    gap: 12,
  },
  sessionCompletionTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EEE7E5",
    overflow: "hidden",
  },
  sessionCompletionFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: C.sage,
  },
  sessionTimeline: {
    borderRadius: 16,
    backgroundColor: C.card,
    padding: 16,
    gap: 12,
  },
  sessionTimelineRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  sessionNotes: {
    minHeight: 92,
    borderRadius: 16,
    backgroundColor: "#FBF3F3",
    padding: 16,
    gap: 10,
  },
  sessionNote: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  emptyCard: {
    minHeight: 70,
    borderRadius: 16,
    backgroundColor: C.card,
    padding: 16,
    justifyContent: "center",
    gap: 8,
  },
  deletedItemCard: {
    borderRadius: 8,
    backgroundColor: C.card,
    padding: 16,
    gap: 14,
  },
  deletedMovementImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.pale,
    overflow: "hidden",
  },
  deletedPlanIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  deletedItemActions: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  restoreAction: {
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: C.rose,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  restoreActionText: { color: C.white, fontSize: 12, fontWeight: "800" },
  deleteForeverAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#E7C5C5",
    backgroundColor: "#FFF3F3",
    alignItems: "center",
    justifyContent: "center",
  },
  quickGrid: { flexDirection: "row", gap: 10 },
  quickAction: {
    flex: 1,
    minHeight: 80,
    borderRadius: 15,
    backgroundColor: C.card,
    padding: 13,
    justifyContent: "space-between",
  },
  quickText: { color: C.ink, fontSize: 11, fontWeight: "800" },
  why: { backgroundColor: "#F4E3E3", borderRadius: 18, padding: 18, gap: 9 },
  whyLabel: { color: C.rose, fontSize: 10, fontWeight: "800" },
  whyCopy: { color: C.ink, fontSize: 12 },
  dual: { flexDirection: "row", gap: 14, paddingHorizontal: 24, paddingTop: 8 },
  stickySmall: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
  },
  editorHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  editorUndo: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  phaseTimingStrip: {
    minHeight: 76,
    borderRadius: 15,
    backgroundColor: C.card,
    flexDirection: "row",
    paddingVertical: 12,
  },
  phaseTimingItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
  phaseTimingLabel: { color: C.muted, fontSize: 8, fontWeight: "900" },
  phaseTimingValue: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  phaseTimingStatus: {
    color: C.gold,
    fontSize: 8,
    fontWeight: "800",
    marginTop: 3,
  },
  addMovementButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#DFC8CE",
    borderRadius: 12,
    backgroundColor: "#FFF8F8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  addMovementText: { color: C.rose, fontSize: 12, fontWeight: "900" },
  group: { color: C.muted, fontSize: 10, fontWeight: "800", marginTop: 4 },
  move: {
    minHeight: 69,
    borderRadius: 15,
    backgroundColor: C.card,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  editorMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  editorTools: { flexDirection: "row", alignItems: "center", gap: 13 },
  moveNum: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: "#F4E4E5",
    alignItems: "center",
    justifyContent: "center",
  },
  moveNumText: { fontSize: 11, color: C.rose, fontWeight: "800" },
  sequenceThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F4E4E5",
    overflow: "hidden",
  },
  sequenceThumbnailImage: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
  },
  moveTitle: { color: C.ink, fontSize: 14, fontWeight: "800" },
  movementEditorBackdrop: {
    flex: 1,
    backgroundColor: "rgba(36,32,34,0.45)",
    justifyContent: "flex-end",
  },
  movementEditorSheet: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "92%",
    alignSelf: "center",
    backgroundColor: C.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    gap: 18,
  },
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EEE7E5",
    alignItems: "center",
    justifyContent: "center",
  },
  movementEditorForm: { gap: 11, paddingBottom: 20 },
  movementEditorImage: {
    width: "100%",
    height: 170,
    borderRadius: 14,
    backgroundColor: "#F4E3E3",
    overflow: "hidden",
  },
  movementEditorColumns: { flexDirection: "row", gap: 10 },
  durationField: { width: 112 },
  fixedDurationField: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    backgroundColor: "#F7F1EF",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  fixedDurationValue: { color: C.ink, fontSize: 15, fontWeight: "900" },
  fixedDurationNote: { color: C.muted, fontSize: 9, marginTop: 2 },
  cueInput: { minHeight: 92, paddingTop: 14 },
  detailArtwork: {
    width: "100%",
    aspectRatio: 1.6,
    borderRadius: 18,
    backgroundColor: "#F4E3E3",
    overflow: "hidden",
  },
  detailArtworkImage: { width: "100%", height: "100%" },
  detailArtworkPosition: {
    position: "absolute",
    left: 12,
    bottom: 12,
    color: C.ink,
    fontSize: 10,
    fontWeight: "800",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  movementTitle: { color: C.ink, fontSize: 28, fontWeight: "800" },
  detailTime: { color: C.ink, fontSize: 14, fontWeight: "800" },
  cue: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 34 },
  cueNum: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#F6E6E7",
    alignItems: "center",
    justifyContent: "center",
  },
  cueNumText: { color: C.rose, fontSize: 11, fontWeight: "800" },
  cueText: { color: C.ink, fontSize: 13, flex: 1 },
  teach: {
    flex: 1,
    backgroundColor: C.bg,
  },
  teachContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
  },
  teachContentCompact: { paddingHorizontal: 14, paddingBottom: 8 },
  teachTop: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teachTopCompact: { minHeight: 44 },
  teachClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  teachSequence: { fontSize: 11 },
  teachTimerBlock: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  teachTimerBlockCompact: { paddingVertical: 4 },
  teachTimerHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teachStepLabel: { color: C.muted, fontSize: 11, fontWeight: "500" },
  teachTimerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 7,
    marginTop: 2,
  },
  teachTimer: { color: C.ink, fontSize: 40, fontWeight: "800", fontVariant: ["tabular-nums"] },
  teachTimerCompact: { fontSize: 34 },
  teachTimerTotal: { color: C.muted, fontSize: 12, fontWeight: "400" },
  teachTimerTrack: {
    height: 3,
    borderRadius: 3,
    backgroundColor: "#EEE5E2",
    overflow: "hidden",
    marginTop: 6,
  },
  teachTimerFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: C.rose,
  },
  movementCard: {
    flex: 1,
    minHeight: 0,
    marginTop: 6,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    overflow: "hidden",
  },
  movementCardCompact: { paddingHorizontal: 12, paddingVertical: 12, marginTop: 5 },
  movementCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  movementCardCount: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "500",
  },
  movementProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  movementProgressValue: { color: C.sage, fontSize: 10, fontWeight: "600" },
  movementProgressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#F0E7E5",
    overflow: "hidden",
    marginTop: 5,
  },
  movementProgressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: C.sage,
  },
  movementArtwork: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    borderRadius: 13,
    backgroundColor: "#F4E3E3",
    marginTop: 14,
    overflow: "hidden",
  },
  movementArtworkImage: { width: "100%", height: "100%" },
  movementCardTitle: { marginTop: 12 },
  movementCardTitleCompact: { fontSize: 20, marginTop: 6 },
  movementWorkingSide: { marginTop: 4 },
  movementCue: {
    minHeight: 66,
    justifyContent: "center",
    backgroundColor: "#FBF3F3",
    borderLeftWidth: 2,
    borderLeftColor: C.rose,
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  movementCueLabel: {
    color: C.rose,
    marginBottom: 4,
  },
  movementCueText: {
    color: C.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginTop: 8,
  },
  controlsCompact: { marginTop: 7 },
  teachControlGroup: { width: 76, alignItems: "center", gap: 6 },
  navControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  controlLabel: { fontSize: 11 },
  hold: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  upNext: {
    height: 76,
    flexShrink: 0,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingLeft: 14,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    overflow: "hidden",
  },
  upNextComplete: { paddingRight: 14 },
  upText: { fontSize: 13, marginTop: 3 },
  upNextSide: { color: C.muted, fontSize: 10, marginTop: 2 },
  upNextMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  upTime: { color: C.muted, fontSize: 10 },
  upNextDot: { color: C.muted, fontSize: 10 },
  upNextVisual: {
    width: 128,
    height: 76,
    marginVertical: -6,
    backgroundColor: "#F4E3E3",
    overflow: "hidden",
  },
  upNextVisualCompact: { width: 108 },
  upNextVisualImage: { width: "100%", height: "100%" },
  upNextArrow: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  endClass: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  endClassText: { fontSize: 11 },
  summaryHero: {
    minHeight: 170,
    backgroundColor: C.card,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  summaryCheck: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: { fontSize: 24, color: C.ink, fontWeight: "800" },
  notes: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#E4D7D3",
    borderRadius: 14,
    backgroundColor: C.card,
    padding: 15,
    fontSize: 13,
    color: C.ink,
    textAlignVertical: "top",
  },
  search: {
    height: 49,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4D7D3",
    backgroundColor: C.card,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: { flex: 1, fontSize: 12, color: C.ink, paddingVertical: 0 },
  libraryHeader: { gap: 20 },
  scheduleHeader: { gap: 20 },
  filterRow: { gap: 8, paddingRight: 20 },
  undoBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 82,
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: C.ink,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  undoBannerText: { color: C.white, fontSize: 12, fontWeight: "700", flex: 1, minWidth: 0 },
  undoBannerAction: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: C.rose,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  undoBannerActionText: { color: C.white, fontSize: 12, fontWeight: "900" },
  libraryRow: {
    minHeight: 72,
    borderRadius: 15,
    backgroundColor: C.card,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  thumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: "#E9D3D5",
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
  customImageFrame: {
    width: "100%",
    aspectRatio: 4 / 3,
    maxHeight: 260,
    borderRadius: 8,
    backgroundColor: C.pale,
    overflow: "hidden",
  },
  customImage: { width: "100%", height: "100%" },
  customImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  customImageActions: { flexDirection: "row", gap: 10 },
  imageAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    backgroundColor: C.card,
  },
  imageActionText: { color: C.rose, fontSize: 13, fontWeight: "800" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  stat: {
    width: "47%",
    height: 76,
    borderRadius: 17,
    backgroundColor: C.card,
    padding: 16,
    justifyContent: "center",
  },
  statBig: { fontSize: 25, color: C.rose, fontWeight: "800" },
  chartCard: {
    height: 189,
    borderRadius: 18,
    backgroundColor: C.card,
    padding: 18,
  },
  chart: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  chartCol: {
    height: 115,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  bar: { width: 28, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  profileCard: {
    minHeight: 104,
    borderRadius: 18,
    backgroundColor: C.card,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  profileEditor: {
    borderRadius: 16,
    backgroundColor: C.card,
    padding: 16,
    gap: 8,
  },
  largeAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#E8CBD1",
    alignItems: "center",
    justifyContent: "center",
  },
  settings: { backgroundColor: C.card },
  setting: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingHorizontal: 20,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingText: { fontSize: 13, color: C.ink, fontWeight: "700" },
  modeControl: {
    height: 45,
    borderRadius: 14,
    backgroundColor: C.card,
    padding: 4,
    flexDirection: "row",
  },
  modeOption: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modeOptionOn: { backgroundColor: "#E8CBD1" },
  modeText: { color: C.muted, fontSize: 12, fontWeight: "800" },
  modeTextOn: { color: C.rose },
  switchTrack: {
    width: 46,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#D8CFCC",
    padding: 3,
    justifyContent: "center",
  },
  switchOn: { backgroundColor: C.sage },
  switchKnob: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: C.white,
  },
  switchKnobOn: { alignSelf: "flex-end" },
  link: { color: C.rose, fontSize: 12, fontWeight: "800" },
  bookingCalendar: {
    borderRadius: 8,
    overflow: "hidden",
    paddingBottom: 8,
  },
  calendarEmpty: {
    minHeight: 130,
    alignItems: "center",
    gap: 8,
  },
  insightsEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  disabled: { opacity: 0.3 },
  empty: {
    color: C.muted,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 28,
  },
  manageHero: {
    borderRadius: 18,
    backgroundColor: C.card,
    padding: 18,
    gap: 14,
  },
  manageActions: {
    borderRadius: 16,
    backgroundColor: C.card,
    overflow: "hidden",
  },
  manageAction: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  dangerAction: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7C9C9",
    backgroundColor: "#FFF8F8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  detailDeleteAction: { marginTop: 10 },
  dangerText: { color: "#A34848", fontSize: 13, fontWeight: "800" },
});

export default function App() {
  const { width } = useWindowDimensions();
  const webPreviewWidth = Platform.OS === "web" ? Math.min(width, 480) : null;
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={s.appRoot}>
        <View
          style={[
            s.appViewport,
            webPreviewWidth !== null && { width: webPreviewWidth },
          ]}
        >
          <BlushBodiesApp />
        </View>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
