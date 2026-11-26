import { StatusBar } from "expo-status-bar";
import { additionalMovements, retiredMovementIds } from "./src/catalogue";
import { manualMovementArtwork } from "./src/manualMovementArtwork";
import { catalogueReplacementChoices, createCataloguePlan, replaceCatalogueMovement } from "./src/cataloguePlanning";
import {
  advanceTeachingPosition,
  countdownCueSecond,
  isRecoverableTeachingSession,
  recoverTeachingPosition,
  teachingTimeRemaining,
} from "./src/teaching";
import { enqueueWorkspaceSave, readWorkspaceSync, workspaceErrorMessage } from "./src/workspacePersistence";
import {
  listRemoteWorkspaces,
  loadRemoteWorkspaceState,
  saveRemoteWorkspaceState,
} from "./src/remoteWorkspace";
import {
  deleteCurrentAccount,
  requireSupabase,
  supabase,
  supabaseConfigured,
  takeInitialWebAuthUrl,
} from "./src/supabase";
import {
  authRedirectUrl,
  authTokensFromUrl,
  isExpiredAuthLink,
  passwordResetErrorMessage,
} from "./src/authLinks";
import {
  isOwnedMovementImageUri,
  referencedMovementImageUris,
} from "./src/movementImages";
import {
  createWorkspaceBackupEnvelope,
  parseWorkspaceBackup,
  safeBackupImageFileName,
} from "./src/workspaceBackup";
import {
  assignSchedulePlan,
  filterSchedule,
  isFinishedClass,
  isFutureScheduleSlot,
  nextAvailableClassSlot,
  removeScheduleSlot,
  rescheduleSlot,
  scheduleSlotsOverlap,
  scheduleSlotStartsAt,
  scheduleTimeOptions,
  setScheduleStatus,
  timeFromMinutes,
  upsertScheduleSlot,
  type ScheduleFilter,
} from "./src/scheduling";
import {
  classCalendarEvent,
  classCalendarFileName,
  classCalendarIcs,
  googleCalendarUrl,
} from "./src/calendar";
import { downloadBrowserFile } from "./src/browserDownload";
import {
  pruneRecentlyDeleted,
  recentlyDeletedDaysRemaining,
  restoreScheduleAssignments,
} from "./src/recentlyDeleted";
import {
  MOVEMENT_DURATION_SECONDS, PHASES, fillMissingPlanCues, fitPhaseTiming, insertMovement, mergeLibraryCatalog, movementAddition, movementCompatibility, movementEquipment, movementSourceId, nextPlanningPhase,
  orderMovementsByPosition, phaseRemaining, phaseTarget, phaseTotal,
  planLevel, positionGroup, sequenceForTeaching,
  suggestMovements, syncMovementImage, updatePlanSequence, classReadiness, inspectClassReadiness, selectionDuration, sideLabel, workingSide,
  type ClassPlan, type LibraryMovement, type Phase, type PlanBrief,
  type PlanMovement, type SequenceMode, type SideSelection, type WorkingSide, type ReadinessReport,
} from "./src/planning";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
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
  Ellipsis,
  Heart,
  House,
  ImagePlus,
  Info,
  LibraryBig,
  List,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Timer,
  Trash2,
  Undo2,
  UserRound,
  X,
  TriangleAlert,
} from "lucide-react-native";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
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
  | "forgotPassword"
  | "resetPassword"
  | "recoverPassword"
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
  practice?: boolean;
};
type ActiveTeachingSession = {
  plan: ClassPlan;
  scheduledClassId?: string;
  practice?: boolean;
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
    | "ENDED EARLY"
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
type BackupLibraryMovement = LibraryMovement & {
  backupImage?: { fileName: string; base64: string };
};
type WorkspaceBackupData = Omit<StoredAppData, "libraryMovements"> & {
  libraryMovements: BackupLibraryMovement[];
};
const LEGACY_STORAGE_KEY = "@blush-bodies/app-data-v1";
const USER_STORAGE_PREFIX = "@blush-bodies/user-data-v2/";
const WORKSPACE_RECOVERY_PREFIX = "@blush-bodies/workspace-recovery-v1/";
const userStorageKey = (account: Pick<Account, "role" | "email">) =>
  `${USER_STORAGE_PREFIX}${account.role}/${account.email.toLowerCase()}`;
const workspaceSyncKey = (key: string) => `${key}/cloud-sync`;
const legacyWalkthroughStorageKey = (account: Pick<Account, "role" | "email">) =>
  `@blush-bodies/walkthrough-v1/${account.role}/${account.email.toLowerCase()}`;
const CREDENTIALS_KEY = "blush-bodies-local-credentials-v1";
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const ALLOW_SANDBOX_PASSWORD_RESET = __DEV__;
const currentAuthRedirectUrl = () => {
  const location = (globalThis as { location?: { origin?: string } }).location;
  return authRedirectUrl(
    Platform.OS === "web" ? "web" : "native",
    location?.origin,
  );
};
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
  await Linking.openURL(googleCalendarUrl(scheduledClass));
};
const shareCalendarEvent = async (scheduledClass: ScheduledClass) => {
  if (Platform.OS === "web") {
    downloadBrowserFile(classCalendarFileName(scheduledClass), classCalendarIcs(scheduledClass), "text/calendar");
    return;
  }
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
let openingDeviceCalendar = false;
const addClassToCalendar = async (
  scheduledClass: ScheduledClass,
  showAlert: AppDialogControls["showAlert"],
) => {
  const handleError = () =>
    showAlert(
      "Calendar unavailable",
      "The class could not be opened in a calendar. Please try again.",
    );
  if (Platform.OS === "ios" || Platform.OS === "android") {
    if (openingDeviceCalendar) return;
    openingDeviceCalendar = true;
    try {
      const calendar = await import("expo-calendar/legacy");
      // iOS 16 requires authorization to open the system event editor.
      if (Platform.OS !== "ios" || Number.parseInt(String(Platform.Version), 10) >= 17 ||
          (await calendar.requestCalendarPermissionsAsync()).granted) {
        await calendar.createEventInCalendarAsync(classCalendarEvent(scheduledClass));
        return;
      }
    } catch {
      // The export options are also available in builds without the native module.
    } finally {
      openingDeviceCalendar = false;
    }
  }
  showAlert(
    "Add to calendar",
    `${classDateLabel(scheduledClass.date, true)} at ${scheduledClass.time}`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: Platform.OS === "web" ? "Download Calendar File" : "Share Calendar File",
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
type DialogAction = {
  text: string;
  style?: "cancel" | "destructive";
  onPress?: () => void;
};
type ConfirmationRequest = {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  cancelText?: string;
  destructive?: boolean;
  Icon?: typeof Trash2;
};
type AppDialogControls = {
  showAlert: (
    title: string,
    message: string,
    actions?: DialogAction[],
    Icon?: typeof Trash2,
  ) => void;
  confirmAction: (request: ConfirmationRequest) => void;
};
type AppDialogContent = {
  title: string;
  message: string;
  actions: DialogAction[];
  Icon: typeof Trash2;
};
const AppDialogContext = createContext<AppDialogControls | null>(null);
const useAppDialog = () => {
  const controls = useContext(AppDialogContext);
  if (!controls) throw new Error("AppDialogProvider is required.");
  return controls;
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
const movementArtworkSource = (
  movement: Pick<PlanMovement, "id" | "position" | "sourceMovementId">,
) => {
  const sourceId = movementSourceId(movement);
  const photo = manualMovementArtwork[sourceId];
  if (photo) return photo;
  switch (movementSourceId(movement)) {
    case "breath-centre":
    case "closing-breath":
      return require("./assets/movement-breath-centre.png");
    case "shoulder-rolls":
      return require("./assets/movement-shoulder-rolls.png");
    case "cat-cow":
      return require("./assets/movement-cat-cow.png");
    case "roll-down":
      return require("./assets/movement-roll-down.png");
    case "side-leg-lift":
    case "side-leg-right":
    case "side-leg-left":
      return require("./assets/movement-side-leg-lift.png");
    case "clamshell":
    case "clamshell-right":
    case "clamshell-left":
      return require("./assets/movement-clamshell.png");
    case "hundred":
      return require("./assets/movement-hundred.png");
    case "single-leg":
    case "single-leg-stretch":
      return require("./assets/movement-single-leg-stretch.png");
    case "donkey-kick":
      return require("./assets/movement-donkey-kick.png");
    case "spine-twist":
      return require("./assets/movement-spine-twist.png");
    case "figure-four":
      return require("./assets/movement-figure-four.png");
    case "supine-twist":
      return require("./assets/movement-supine-twist.png");
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
  movementSourceId(movement).startsWith("manual-") ? "cover" : [
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

const deleteOwnedMovementImage = async (imageUri: string | undefined) => {
  if (!isOwnedMovementImageUri(imageUri, FileSystem.documentDirectory)) return;
  await FileSystem.deleteAsync(imageUri!, { idempotent: true }).catch(
    () => undefined,
  );
};

function MovementVisual({ movement, style, label, resizeMode }: {
  movement: Pick<PlanMovement, "id" | "position" | "sourceMovementId" | "imageUri">;
  style: StyleProp<ImageStyle>;
  label: string;
  resizeMode?: "cover" | "contain";
}) {
  const sourceId = movementSourceId(movement);
  const usesManualArtwork = !movement.imageUri && sourceId.startsWith("manual-");
  const source = movement.imageUri ? { uri: movement.imageUri } : movementArtworkSource(movement);
  return source ? (
    <Image source={source} style={[style, usesManualArtwork && s.manualMovementVisual]}
      resizeMode={resizeMode ?? (movement.imageUri ? "cover" : movementArtworkMode(movement))}
      accessibilityLabel={label} />
  ) : (
    <View style={[style as StyleProp<ViewStyle>, s.pendingVisual]} accessibilityLabel={sourceId.startsWith("manual-") ? "No photo supplied in the manual" : "Movement visual pending"}>
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
function Art({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const ink = dark ? "#F2D7DC" : C.rose;
  return (
    <View style={[s.art, dark && s.artDark, compact && s.artCompact]}>
      <View
        style={[s.artDisk, compact && s.artDiskCompact, { backgroundColor: dark ? "#765F65" : "#DDBEC5" }]}
      />
      <View style={[s.artHead, compact && s.artHeadCompact, { borderColor: ink }]} />
      <View style={[s.artBody, compact && s.artBodyCompact, { borderColor: ink }]} />
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
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  Icon?: typeof Plus;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.main, disabled && s.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      {Icon ? <Icon size={17} color={C.white} /> : null}
      <Text style={s.mainText}>{label}</Text>
    </Pressable>
  );
}
function Outline({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={s.outline}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={s.outlineText}>{label}</Text>
    </Pressable>
  );
}
function ClassCalendarOffer({ slot, dismiss }: { slot: ScheduledClass; dismiss: () => void }) {
  const { showAlert } = useAppDialog();
  return (
    <View style={s.calendarOffer} accessibilityLiveRegion="polite">
      <View style={s.row}>
        <View style={s.flex}>
          <Text style={s.moveTitle}>Class booked</Text>
          <Text style={s.sub}>{classDateLabel(slot.date, true)} at {slot.time}</Text>
        </View>
        <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss calendar suggestion" style={s.calendarOfferDismiss}>
          <X size={20} color={C.muted} />
        </Pressable>
      </View>
      <Outline label="Add to Calendar" onPress={() => {
        dismiss();
        void addClassToCalendar(slot, showAlert);
      }} />
    </View>
  );
}
function AppDialog({
  content: { title, message, actions, Icon },
  onSelect,
}: {
  content: AppDialogContent;
  onSelect: (action?: DialogAction) => void;
}) {
  const destructive = actions.some((action) => action.style === "destructive");
  const close = () => onSelect(
    actions.find((action) => action.style === "cancel") ??
    (actions.length === 1 ? actions[0] : undefined),
  );
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={close}
      accessibilityLabel={title}
    >
      <View style={[s.choiceBackdrop, s.confirmationBackdrop]}>
        <ScrollView
          style={s.confirmationCard}
          contentContainerStyle={s.confirmationContent}
          onAccessibilityEscape={close}
          accessibilityViewIsModal
          bounces={false}
        >
          <View style={s.confirmationIcon}>
            <Icon size={21} color={destructive ? "#A34848" : C.rose} />
          </View>
          <View style={s.signinCopy}>
            <Text accessibilityRole="header" style={s.headerTitle}>
              {title}
            </Text>
            {message ? <Text style={s.confirmationCopy}>{message}</Text> : null}
          </View>
          <View style={s.form}>
            {actions.map((action) =>
              action.style === "cancel" ? (
                <Outline
                  key={action.text}
                  label={action.text}
                  onPress={() => onSelect(action)}
                />
              ) : (
                <Pressable
                  key={action.text}
                  accessibilityRole="button"
                  onPress={() => onSelect(action)}
                  style={[
                    s.main,
                    action.style === "destructive" && s.confirmationDestructive,
                  ]}
                >
                  <Text style={s.mainText}>{action.text}</Text>
                </Pressable>
              ),
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const queue = useRef<AppDialogContent[]>([]);
  const [visible, setVisible] = useState<AppDialogContent | null>(null);
  const controls = useMemo<AppDialogControls>(() => {
    const showAlert: AppDialogControls["showAlert"] = (
      title, message, actions = [{ text: "OK" }], Icon = Info,
    ) => {
      const pending = queue.current;
      if (pending.some((dialog) => dialog.title === title && dialog.message === message)) return;
      const content = { title, message, actions, Icon };
      pending.push(content);
      if (pending.length === 1) setVisible(content);
    };
    return {
      showAlert,
      confirmAction: ({
        title, message, confirmText, onConfirm, cancelText = "Cancel", destructive, Icon,
      }) => showAlert(
        title,
        message,
        [
          { text: cancelText, style: "cancel" },
          { text: confirmText, style: destructive ? "destructive" : undefined, onPress: onConfirm },
        ],
        Icon ?? TriangleAlert,
      ),
    };
  }, []);
  return (
    <AppDialogContext.Provider value={controls}>
      {children}
      {visible ? (
        <AppDialog
          content={visible}
          onSelect={(action) => {
            const pending = queue.current;
            if (pending[0] !== visible) return;
            pending.shift();
            setVisible(pending[0] ?? null);
            action?.onPress?.();
          }}
        />
      ) : null}
    </AppDialogContext.Provider>
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
  compact = false,
}: {
  title: string;
  back?: () => void;
  right?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={s.header}>
      {back ? (
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={21} color={C.muted} />
        </Pressable>
      ) : null}
      <Text style={[s.headerTitle, compact && s.compactHeaderTitle]}>{title}</Text>
      {right ? <View style={s.headerRight}>{right}</View> : null}
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
        <Pressable
          key={id}
          onPress={() => setTab(id)}
          style={s.navItem}
          accessibilityRole="tab"
          accessibilityLabel={label}
          aria-selected={id === tab}
        >
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
  const { height } = useWindowDimensions();
  const compact = height < 710;
  return (
    <ScrollView contentContainerStyle={[s.welcome, compact && s.welcomeCompact]}>
      <StatusBar style="dark" />
      <View style={s.brand}>
        <Text style={s.brandTitle}>BLUSH BODIES</Text>
        <Text style={s.brandSub}>MOVE WITH INTENTION</Text>
      </View>
      <Art compact={compact} />
      <View style={s.welcomeCopy}>
        <Text style={[s.hero, compact && s.heroCompact]}>Plan with clarity.</Text>
        <Text style={[s.hero, compact && s.heroCompact]}>Teach with confidence.</Text>
        <Text style={s.sub}>
          Your instructor workspace for planning, scheduling and teaching.
        </Text>
      </View>
      <View style={s.welcomeActions}>
        <Main label="Get Started" onPress={getStarted} />
        <Outline label="Log In" onPress={logIn} />
      </View>
    </ScrollView>
  );
}
type SignInNotice = { title: string; message: string; email?: string; verification?: boolean };

function SignIn({
  back,
  complete,
  notice,
  openDemo,
  signup,
  resendVerification,
  resetPassword,
  allowSandboxReset,
  role,
}: {
  back: () => void;
  complete: (email: string, password: string) => Promise<string | null>;
  notice?: SignInNotice;
  openDemo?: () => Promise<void>;
  signup: () => void;
  resendVerification: (email: string) => Promise<string | null>;
  resetPassword: (email: string) => void;
  allowSandboxReset: boolean;
  role: Role;
}) {
  const [email, setEmail] = useState(notice?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const resend = async () => {
    if (resending) return;
    setResending(true);
    setError("");
    try {
      const message = await resendVerification(email.trim().toLowerCase());
      if (message) setError(message);
    } finally {
      setResending(false);
    }
  };
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
        {notice ? (
          <View style={s.demoNote} accessibilityLiveRegion="polite">
            <Text style={s.whyLabel}>{notice.title}</Text>
            <Text style={s.whyCopy}>{notice.message}</Text>
          </View>
        ) : null}
        <View style={s.form}>
          <Text style={s.label}>EMAIL</Text>
          <TextInput
            accessibilityLabel="Email address"
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
          <View style={s.row}>
            <Text style={s.label}>PASSWORD</Text>
            <Pressable onPress={() => setPasswordVisible((visible) => !visible)}
              accessibilityRole="button" style={s.syncRetry}>
              <Text style={s.link}>{passwordVisible ? "Hide password" : "Show password"}</Text>
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError("");
            }}
            secureTextEntry={!passwordVisible}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            autoComplete="current-password"
            textContentType="password"
            maxLength={PASSWORD_MAX_LENGTH}
            placeholder="Enter password"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              allowSandboxReset
                ? "Reset local test password"
                : "Forgot password"
            }
            onPress={() => resetPassword(email.trim().toLowerCase())}
            style={s.forgotPasswordAction}
          >
            <Text style={s.forgotPasswordText}>
              {allowSandboxReset
                ? "Reset local test password"
                : "Forgot password?"}
            </Text>
          </Pressable>
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <Main
            label={submitting ? "Checking Account..." : "Sign In"}
            onPress={submit}
            disabled={submitting || resending}
          />
          {notice?.verification ? (
            <Outline label={resending ? "Requesting verification..." : "Resend verification"} onPress={() => void resend()} />
          ) : null}
          {openDemo ? (
            <Outline
              label="Open Demo Workspace"
              onPress={() => void openDemo()}
            />
          ) : null}
          <Pressable accessibilityRole="button" onPress={signup}>
            <Text style={s.forgot}>Create a new account</Text>
          </Pressable>
        </View>
        <View style={s.demoNote}>
          <Text style={s.whyLabel}>YOUR WORKSPACE</Text>
          <Text style={s.whyCopy}>
            {supabaseConfigured
              ? "Your account and shared workspace are securely synced through Supabase."
              : Platform.OS === "web"
                ? "Browser accounts are stored in this browser."
                : "Your workspace and account are protected by this device's secure storage."}
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
  const { showAlert } = useAppDialog();
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
      showAlert(
        "Test password reset",
        "Your local password was updated. You can sign in now.",
        [{ text: "Sign In", onPress: back }],
        Check,
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
            accessibilityLabel="Account email"
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
            accessibilityLabel="New password"
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
            accessibilityLabel="Confirm new password"
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

function PasswordResetRequest({
  back,
  initialEmail,
  send,
  signup,
}: {
  back: () => void;
  initialEmail?: string;
  send: (email: string) => Promise<string | null>;
  signup: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState("");
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter the email address used for your account.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const message = await send(normalizedEmail);
      if (message) {
        setError(message);
        return;
      }
      setRequestedEmail(normalizedEmail);
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
          accessibilityLabel="Go back to sign in"
          onPress={back}
        >
          <ArrowLeft size={22} color={C.muted} />
        </Pressable>
        <View style={s.signinBrand}>
          <Text style={s.brandTitle}>BLUSH BODIES</Text>
          <Text style={s.brandSub}>SECURE ACCOUNT RECOVERY</Text>
        </View>
        <View style={s.signinCopy}>
          <Text style={s.signinTitle}>
            {requestedEmail ? "Request received" : "Reset your password"}
          </Text>
          <Text style={s.sub}>
            {requestedEmail
              ? `A reset link is sent only if ${requestedEmail} belongs to a Blush Bodies account.`
              : "Enter the email address you used to sign up."}
          </Text>
        </View>
        <View style={s.form}>
          {requestedEmail ? (
            <Main label="Back to Sign In" onPress={back} />
          ) : (
            <>
              <Text style={s.label}>ACCOUNT EMAIL</Text>
              <TextInput
                accessibilityLabel="Account email"
                editable={!submitting}
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
              {error ? <Text style={s.formError}>{error}</Text> : null}
              <Main
                label={submitting ? "Requesting Reset Link..." : "Send Reset Link"}
                onPress={submit}
              />
            </>
          )}
          <Outline
            label="Create an account"
            onPress={() => signup(email.trim().toLowerCase())}
          />
          {requestedEmail ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setRequestedEmail(null);
                setError("");
              }}
            >
              <Text style={s.forgot}>Use a different email</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function RecoveryPasswordReset({
  back,
  complete,
}: {
  back: () => void;
  complete: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
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
      const message = await complete(password);
      if (message) setError(message);
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
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back}>
          <ArrowLeft size={22} color={C.muted} />
        </Pressable>
        <View style={s.signinBrand}>
          <Text style={s.brandTitle}>BLUSH BODIES</Text>
          <Text style={s.brandSub}>SECURE ACCOUNT RECOVERY</Text>
        </View>
        <View style={s.signinCopy}>
          <Text style={s.signinTitle}>Choose a new password</Text>
          <Text style={s.sub}>
            Your recovery link has been verified. Set the password you will use
            to sign in from now on.
          </Text>
        </View>
        <View style={s.form}>
          <Text style={s.label}>NEW PASSWORD</Text>
          <TextInput
            accessibilityLabel="New password"
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
            accessibilityLabel="Confirm new password"
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
          <Text style={s.sub}>
            At least {PASSWORD_MIN_LENGTH} characters with uppercase, lowercase
            and a number.
          </Text>
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <Main
            label={submitting ? "Updating Password..." : "Update Password"}
            onPress={submit}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function SignUp({
  back,
  complete,
  initialEmail,
  role,
}: {
  back: () => void;
  complete: (account: Account, password: string) => Promise<string | null>;
  initialEmail?: string;
  role: Role;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
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
            accessibilityLabel="Full name"
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
            accessibilityLabel="Email address"
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
            accessibilityLabel="Password"
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
            accessibilityLabel="Confirm password"
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
          <Text style={s.whyLabel}>PRIVATE WORKSPACE</Text>
          <Text style={s.whyCopy}>
            {supabaseConfigured
              ? "Your private workspace syncs across your signed-in devices."
              : Platform.OS === "web"
                ? "Your account and workspace stay in this browser."
                : "Your account and workspace stay private to this device."}
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
  openSchedule,
  openProfile,
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
  openSchedule: () => void;
  openProfile: () => void;
}) {
  const firstName = account.name.split(" ")[0];
  const now = useLiveNow();
  const today = localDateKey(now);
  const swipeBlockedUntil = useRef<Record<string, number>>({});
  const visibleSchedule = schedule.filter(
    (item) => item.date === selectedDate && item.status !== "CANCELLED",
  );
  const readyCount = visibleSchedule.filter(
    (item) => item.status === "READY" && getPlanTitle(item),
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
        <Pressable onPress={openProfile} style={s.avatar} accessibilityRole="button" accessibilityLabel="Open profile">
          <UserRound size={20} color={C.rose} />
        </Pressable>
      </View>
      {activeSession ? (
        <Pressable
          onPress={resume}
          style={s.resumeSession}
          accessibilityRole="button"
          accessibilityLabel={`Resume ${activeSession.plan.brief.program} class, step ${activeSession.movementIndex + 1} of ${activeSession.plan.movements.length}`}
        >
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
              accessibilityRole="radio"
              accessibilityLabel={classDateLabel(key, true)}
              accessibilityState={{ checked: selected }}
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
        <Text style={[s.section, s.flex]}>{selectedDate === today ? "Today's classes" : classDateLabel(selectedDate, true)}</Text>
        <Pressable
          onPress={create}
          style={s.plan}
          accessibilityRole="button"
          accessibilityLabel="Plan a class"
        >
          <Plus size={17} color={C.white} />
          <Text style={s.planText}>Plan Class</Text>
        </Pressable>
      </View>
      <Outline label="My Schedule" onPress={openSchedule} />
      <View style={s.stack}>
        {visibleSchedule.map((slot) => {
          const planTitle = getPlanTitle(slot);
          const inProgress = slot.status === "IN PROGRESS";
          const completed = isFinishedClass(slot);
          const ready = Boolean(
            slot.planId && planTitle && !inProgress && !completed,
          );
          const hasDraft = !ready && slot.status === "DRAFT";
          const card = (
            <Pressable
              key={slot.id}
              onPress={() => {
                if (completed) {
                  review(slot);
                } else if (!swipeIsBlocked(slot.id)) {
                  if (ready || inProgress) start(slot);
                  else assign(slot);
                }
              }}
              style={[s.classCard, s.classCardShape]}
              accessibilityRole="button"
              accessibilityLabel={`${slot.level} class at ${slot.time}, ${planTitle ?? slot.lesson}, ${completed ? "completed" : ready || inProgress ? inProgress ? "in progress" : "ready to teach" : hasDraft ? "draft available" : "plan needed"}`}
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
                    <Pill label={slot.status} active green={slot.status === "COMPLETED"} />
                    <View style={s.reviewCompact}>
                      <BarChart3 size={13} color={C.rose} />
                      <Text style={s.reviewCompactText}>Review</Text>
                    </View>
                  </>
                ) : ready || inProgress ? (
                  <>
                    <Pill
                      label={inProgress ? "IN PROGRESS" : "READY"}
                      active
                      green
                    />
                    <View style={s.start}>
                      <Play size={14} color={C.white} fill={C.white} />
                      <Text style={s.startText}>
                        {inProgress ? "Resume" : "Start"}
                      </Text>
                    </View>
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
          );
          if (completed) return card;
          return (
            <Swipeable
              key={slot.id}
              containerStyle={s.classCardShape}
              childrenContainerStyle={s.swipeCardContent}
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
              {card}
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
}: {
  plan: ClassPlan;
  library: LibraryMovement[];
  savedPlans: ClassPlan[];
  schedule: ScheduledClass[];
  targetSlotId?: string;
  back: () => void;
  create: () => void;
  assign: (slotId: string, planId: string) => void;
  scheduleNext: (slot?: { date: string; time: string }) => void;
}) {
  const { confirmAction } = useAppDialog();
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
      !isFinishedClass(slot) && slot.status !== "IN PROGRESS" &&
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
              onPress={() => scheduleNext()}
              style={s.assignCompact}
              accessibilityRole="button"
              accessibilityLabel={`Schedule next available class ${classDateLabel(nextAvailable.date, true)} at ${nextAvailable.time}`}
            >
              <CalendarDays size={13} color={C.white} />
              <Text style={s.assignCompactText}>Schedule</Text>
            </Pressable>
          </View>
          <PlanDate brief={plan.brief} change={(slot) => slot && scheduleNext(slot)} booking schedule={schedule} />
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
              <Text style={s.sub}>Choose a date and time above to add a booking.</Text>
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
  const { confirmAction, showAlert } = useAppDialog();
  const list = useRef<FlatList<ScheduledClass>>(null);
  const [date, setDate] = useState(dateKeyFromOffset(1));
  const [time, setTime] = useState("09:00");
  const [level, setLevel] = useState("Beginner");
  const [lesson, setLesson] = useState(PROGRAM_DAY_OPTIONS[0]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(Boolean(initialEditId));
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
    setShowForm(false);
    setEditingId(null);
    setDate(dateKeyFromOffset(1));
    setTime("09:00");
    setLevel("Beginner");
    setLesson(PROGRAM_DAY_OPTIONS[0]);
    setError("");
  };
  const edit = (slot: ScheduledClass) => {
    setShowForm(true);
    list.current?.scrollToOffset({ offset: 0, animated: true });
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
              ...(level !== existing.level
                ? { planId: undefined, status: "NEEDS PLAN" as const }
                : {}),
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
      {!showForm ? <Main label="Add Class" Icon={Plus} onPress={() => setShowForm(true)} /> : null}
      {showForm ? <View style={s.profileEditor}>
        <View style={s.row}>
          <Text style={s.group}>
            {editingId ? "RESCHEDULE CLASS" : "ADD CLASS"}
          </Text>
          <Pressable onPress={resetForm} accessibilityRole="button" hitSlop={10}>
            <Text style={s.link}>{editingId ? "Cancel reschedule" : "Cancel"}</Text>
          </Pressable>
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
            <Pressable
              key={option}
              onPress={() => setLevel(option)}
              accessibilityRole="radio"
              accessibilityState={{ checked: level === option }}
              accessibilityLabel={`${option} class level`}
            >
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
      </View> : null}
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
          <Pressable
            key={option}
            onPress={() => setFilter(option)}
            accessibilityRole="radio"
            accessibilityState={{ checked: filter === option }}
            accessibilityLabel={`${option} schedule filter`}
          >
            <Pill label={option} active={filter === option} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
  return (
    <FlatList
      ref={list}
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
            {slot.status !== "CANCELLED" && slot.status !== "IN PROGRESS" && !isFinishedClass(slot) ? (
              <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add ${slot.level} class to calendar`}
                onPress={() => void addClassToCalendar(slot, showAlert)}
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
            {slot.status !== "IN PROGRESS" && !isFinishedClass(slot) ? <Pressable
              onPress={() => confirmRemove(slot)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                slot.status === "CANCELLED"
                  ? `Permanently delete cancelled ${slot.level} class`
                  : `Cancel ${slot.level} class`
              }
            >
              {slot.status === "CANCELLED" ? (
                <Trash2 size={18} color="#A34848" />
              ) : (
                <X size={18} color={C.rose} />
              )}
            </Pressable> : null}
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
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={s.choiceBackdrop}
          accessible={false}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={s.choiceSheet}
          >
            <View style={s.row}>
              <Text style={s.movementTitle}>{label}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Close ${label} options`}
              >
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
                    accessibilityRole="radio"
                    aria-checked={selected}
                    accessibilityLabel={option}
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
function PlanDisclosure({
  title,
  detail,
  expanded,
  toggle,
  children,
}: {
  title: string;
  detail?: string;
  expanded: boolean;
  toggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={s.planDisclosure}>
      <Pressable
        onPress={toggle}
        style={s.planDisclosureButton}
        accessibilityRole="button"
        accessibilityLabel={detail ? `${title}, ${detail}` : title}
        aria-expanded={expanded}
      >
        <View style={s.flex}>
          <Text style={s.moveTitle}>{title}</Text>
          {detail ? <Text style={s.sub}>{detail}</Text> : null}
        </View>
        {expanded ? <ChevronDown size={18} color={C.rose} /> : <ChevronRight size={18} color={C.rose} />}
      </Pressable>
      {expanded ? <View style={s.planDisclosureBody}>{children}</View> : null}
    </View>
  );
}
function Create({
  back,
  generate,
  initialClass,
  library,
}: {
  back: () => void;
  generate: (brief: PlanBrief, fromScratch: boolean) => void;
  initialClass?: ScheduledClass;
  library: LibraryMovement[];
}) {
  const { showAlert } = useAppDialog();
  const programs = {
    Beginner: "Beginner Foundations",
    Intermediate: "Intermediate Flow",
    Advanced: "Strong Pilates",
  };
  const levels = ["Beginner", "Intermediate", "Advanced"] as const;
  const weeks = ["Week 1", "Week 2", "Week 3", "Week 4"];
  const days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"];
  const initialWeek = initialClass?.lesson.match(/Week\s+\d+/i)?.[0];
  const initialDay = initialClass?.lesson.match(/Day\s+\d+/i)?.[0];
  const [level, setLevel] = useState<(typeof levels)[number]>(
    levels.find((option) => option === initialClass?.level) ?? "Beginner",
  );
  const [week, setWeek] = useState(
    weeks.find((option) => option.toLowerCase() === initialWeek?.toLowerCase()) ?? weeks[0],
  );
  const [day, setDay] = useState(
    days.find((option) => option.toLowerCase() === initialDay?.toLowerCase()) ?? days[0],
  );
  const [energy, setEnergy] = useState("Flowing");
  const [fromScratch, setFromScratch] = useState(false);
  const [equipment, setEquipment] = useState<string[]>(["Mat"]);
  const [showDetails, setShowDetails] = useState(false);
  const supportedEquipment = new Set(library.filter((movement) =>
    movement.reviewStatus === "reviewed" && levels.indexOf(movement.level as typeof level) <= levels.indexOf(level),
  ).flatMap((movement) => movementEquipment(movement.equipment).map((item) => item.toLowerCase())));
  const equipmentOptions = ["Mat", "Band", "Ball", "Ring"].filter((item) =>
    fromScratch || supportedEquipment.has(item.toLowerCase()));
  const availableEquipment = equipment.filter((item) => equipmentOptions.includes(item));

  const submit = () => {
    if (!availableEquipment.length) {
      showAlert("Choose equipment", "Select an available item or switch to From scratch.");
      return;
    }
    generate({
      program: programs[level],
      level,
      week,
      day,
      scheduledDate: initialClass?.date,
      scheduledTime: initialClass?.time,
      energy,
      equipment: availableEquipment,
    }, fromScratch);
  };

  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={s.page}>
        <Header title="Create Class Plan" back={back} compact />
        <View style={s.selectGroup}>
          <Text style={s.label}>START WITH</Text>
          <View style={s.sequenceModes}>
            {[false, true].map((scratch) => (
              <Pressable
                key={String(scratch)}
                accessibilityRole="radio"
                aria-checked={fromScratch === scratch}
                onPress={() => setFromScratch(scratch)}
                style={[s.sequenceMode, fromScratch === scratch && s.sequenceModeOn]}
              >
                <Text style={[s.planOptionText, fromScratch === scratch && s.roseText]}>
                  {scratch ? "From scratch" : "Use template"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.sub}>
            {fromScratch ? "Choose each movement yourself." : "Review and edit a ready-made sequence."}
          </Text>
        </View>
        <View style={s.selectGroup}>
          <Text style={s.label}>CLASS LEVEL</Text>
          <View style={s.sequenceModes}>
            {levels.map((option) => (
              <Pressable
                key={option}
                onPress={() => setLevel(option)}
                style={[s.sequenceMode, level === option && s.sequenceModeOn]}
                accessibilityRole="radio"
                aria-checked={level === option}
              >
                <Text style={[s.planOptionText, level === option && s.roseText]}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={s.selectGroup}>
          <Text style={s.label}>EQUIPMENT</Text>
          <View style={s.options}>
            {equipmentOptions.map((item) => {
              const selected = equipment.includes(item);
              return (
                <Pressable
                  key={item}
                  onPress={() => setEquipment((current) => current.includes(item)
                    ? current.filter((option) => option !== item) : [...current, item])}
                  style={[s.option, s.planOption, selected && s.optionOn]}
                  accessibilityRole="checkbox"
                  aria-checked={selected}
                >
                  <Text style={[s.planOptionText, selected && s.roseText]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          {!equipmentOptions.length ? <Text style={s.sub}>No reviewed equipment options for this level.</Text> : null}
        </View>
        <PlanDisclosure
          title="Lesson details"
          detail={`${week} · ${day} · ${energy}`}
          expanded={showDetails}
          toggle={() => setShowDetails(!showDetails)}
        >
          <View style={s.planDetailFields}>
            <View style={s.flex}>
              <ChoiceSelect label="WEEK" value={week} options={weeks} onChange={setWeek} />
            </View>
            <View style={s.flex}>
              <ChoiceSelect label="LESSON DAY" value={day} options={days} onChange={setDay} />
            </View>
          </View>
          <View style={s.selectGroup}>
            <Text style={s.label}>CLASS ENERGY</Text>
            <View style={s.options}>
              {["Calm", "Energising", "Strong", "Flowing"].map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setEnergy(option)}
                  style={[s.option, s.planOption, energy === option && s.optionOn]}
                  accessibilityRole="radio"
                  aria-checked={energy === option}
                >
                  <Text style={[s.planOptionText, energy === option && s.roseText]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </PlanDisclosure>
      </ScrollView>
      <View style={s.sticky}>
        <Main label={fromScratch ? "Build Sequence" : "Review Sequence"} onPress={submit} />
      </View>
    </View>
  );
}
function PlanDate({
  brief,
  change,
  booking = false,
  schedule,
}: {
  brief: PlanBrief;
  change: (slot?: { date: string; time: string }) => void;
  booking?: boolean;
  schedule?: ScheduledClass[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [date, setDate] = useState(brief.scheduledDate ?? dateKeyFromOffset(1));
  const [time, setTime] = useState(brief.scheduledTime ?? "09:00");
  const now = useLiveNow();
  const options = scheduleTimeOptions(date, now).filter((time) =>
    !schedule?.some((slot) => slot.status !== "CANCELLED" && scheduleSlotsOverlap({ date, time }, slot)));
  const startTime = options.includes(time) ? time : options[0] ?? "";
  const dateLabel = !booking && brief.scheduledDate && brief.scheduledTime
    ? `${classDateLabel(brief.scheduledDate, true)} at ${brief.scheduledTime}` : undefined;
  const done = (slot?: { date: string; time: string }) => {
    change(slot);
    setExpanded(false);
  };

  return (
    <PlanDisclosure
      title={booking ? "Choose date and time" : "Class date and time"}
      detail={booking ? undefined : dateLabel ?? "Optional"}
      expanded={expanded}
      toggle={() => {
        if (!expanded) {
          setDate(brief.scheduledDate && brief.scheduledDate >= localDateKey()
            ? brief.scheduledDate : dateKeyFromOffset(1));
          setTime(brief.scheduledTime ?? "09:00");
        }
        setExpanded(!expanded);
      }}
    >
      <Calendar
        current={date}
        minDate={localDateKey()}
        maxDate={dateKeyFromOffset(120)}
        firstDay={1}
        enableSwipeMonths
        markedDates={{ [date]: { selected: true, selectedColor: C.rose, selectedTextColor: C.white } }}
        onDayPress={(selected: DateData) => setDate(selected.dateString)}
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
        value={startTime || "No available times"}
        options={options}
        onChange={setTime}
      />
      <Main label={booking ? "Schedule Class" : "Use Date & Time"} onPress={() => done({ date, time: startTime })} disabled={!startTime} />
      {dateLabel ? <Outline label="Schedule Later" onPress={() => done()} /> : null}
    </PlanDisclosure>
  );
}
function Generated({
  plan,
  library,
  schedule,
  back,
  edit,
  rebuild,
  save,
  schedulePlan,
  teach,
}: {
  plan: ClassPlan;
  library: LibraryMovement[];
  schedule: ScheduledClass[];
  back: () => void;
  edit: (phase?: Phase) => void;
  rebuild: () => void;
  save: () => void;
  schedulePlan: (slotId?: string) => void;
  teach: () => void;
}) {
  const now = useLiveNow();
  const readiness = classReadiness(plan, library);
  const valid = readiness.ready;
  const saved = plan.status === "saved";
  const durationMs = planTotal(plan) * 1000;
  const nextClass = schedule
    .filter(
      (slot) =>
        slot.planId === plan.id &&
        slot.status !== "CANCELLED" &&
        !isFinishedClass(slot) &&
        scheduleSlotStartsAt(slot).getTime() + durationMs > now.getTime(),
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const nextAvailable = nextAvailableClassSlot(schedule, now);
  const scheduleLabel = nextClass ? "Schedule Another" : "Schedule Class";
  const versionBooking = plan.sourcePlanId && schedule.find((slot) =>
    slot.planId === plan.sourcePlanId && slot.status !== "CANCELLED" && slot.status !== "IN PROGRESS" &&
    !isFinishedClass(slot) && isFutureScheduleSlot(slot, now));
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
        {saved && (nextClass || valid) ? (
          <Text style={s.sub}>
            {nextClass
              ? `Scheduled: ${classDateLabel(nextClass.date, true)} at ${nextClass.time}`
              : `Next available: ${classDateLabel(nextAvailable.date, true)} at ${nextAvailable.time}`}
          </Text>
        ) : !saved && plan.brief.scheduledDate && plan.brief.scheduledTime ? (
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
            <Text style={s.planMeasureValue}>{fmt(planTotal(plan))}</Text>
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
            <Pressable key={phase} onPress={() => edit(phase)} style={s.planBlock}
              accessibilityRole="button" accessibilityLabel={`Review ${phase.toLowerCase()} sequence`}>
              <View style={s.planAccent} />
              <View style={s.flex}>
                <Text style={s.blockTitle}>
                  {phase === "Main" ? "Main sequence" : phase}
                </Text>
                <Text style={s.sub}>{phaseMoves.length} movement cards</Text>
              </View>
              <Text style={s.planTime}>{fmt(phaseTotal(plan, phase))}</Text>
              <ChevronRight size={19} color={C.muted} />
            </Pressable>
          );
        })}
        <ReadinessChecks report={readiness} />
        {saved && valid && versionBooking ? (
          <Outline label="Use This Version for a Booking" onPress={() => schedulePlan(versionBooking.id)} />
        ) : null}
        {saved && valid && readiness.warnings.length > 0 ? (
          <Outline label="Rebuild as Draft" onPress={rebuild} />
        ) : null}
      </ScrollView>
      {!valid && !saved ? (
        <View style={s.sticky}>
          <Main label="Fix Sequence" onPress={() => edit()} />
        </View>
      ) : (
        <View style={s.dual}>
          <View style={s.flex}>
            <Outline label="Edit Sequence" onPress={() => edit()} />
          </View>
          <View style={s.flex}>
            <Main
              label={
                saved
                  ? valid ? scheduleLabel : "Rebuild as Draft"
                  : plan.brief.scheduledDate
                    ? "Save & Schedule"
                    : "Save Plan"
              }
              onPress={saved ? (valid ? () => schedulePlan() : rebuild) : save}
            />
          </View>
        </View>
      )}
      {saved && valid ? (
        <View style={s.stickySmall}>
          <Outline label="Practise Plan" onPress={teach} />
        </View>
      ) : null}
    </View>
  );
}
function Classes({
  plan,
  change,
  open,
  back,
  save,
  setClassDate,
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
  save: () => void;
  setClassDate: (slot?: { date: string; time: string }) => void;
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
  const [showChecks, setShowChecks] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const sequenceScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const visible = plan.movements
    .map((movement, index) => ({ movement, index }))
    .filter((item) => filter === "All" || item.movement.phase === filter);
  const { showAlert } = useAppDialog();
  const { report: readiness, issues } = inspectClassReadiness(plan, library);
  const valid = readiness.ready;
  const mode = plan.sequenceMode ?? "auto";
  useEffect(() => {
    if (!valid) setShowChecks(true);
  }, [valid]);
  const phase = filter === "All" ? nextPlanningPhase(plan) : filter;
  const suggestions = suggestMovements(plan, library, phase);
  const fittedPhase = fitPhaseTiming(plan.movements, phase);
  const phaseIssues = issues.filter((issue) => filter === "All" || issue.phase === phase);
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
    const choices = catalogueReplacementChoices(plan, index, library);
    if (!choices.length) {
      showAlert("No replacement available", "Add or review another movement for this phase and class level.");
      return;
    }
    showAlert("Choose a replacement", "The replacement keeps the time and working sides of this movement.",
      [
        ...choices.map((movement) => ({
          text: movement.name,
          onPress: () => applyChange(replaceCatalogueMovement(plan, index, library, Crypto.randomUUID(), movement.id)),
        })),
        { text: "Cancel", style: "cancel" },
      ], List);
  };
  const remove = (index: number) =>
    applyChange(plan.movements.filter((_, i) => i !== index));
  const canMoveEarlier = (index: number) =>
    index > 0 && plan.movements[index - 1].phase === plan.movements[index].phase;
  const canMoveLater = (index: number) =>
    index < plan.movements.length - 1 && plan.movements[index + 1].phase === plan.movements[index].phase;
  const openMovementActions = (index: number) => {
    const actions: DialogAction[] = [];
    if (canMoveEarlier(index)) actions.push({ text: "Move Earlier", onPress: () => move(index, -1) });
    if (canMoveLater(index)) actions.push({ text: "Move Later", onPress: () => move(index, 1) });
    actions.push(
      { text: "Replace Movement", onPress: () => replace(index) },
      { text: "Remove Movement", onPress: () => remove(index), style: "destructive" },
      { text: "Cancel", style: "cancel" },
    );
    showAlert(movementLabel(plan.movements[index]), "", actions, List);
  };
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
          ? { ...draftMovement, title, position, cue }
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
  const selectPhase = (next: "All" | Phase) => {
    setFilter(next);
    sequenceScroll.current?.scrollTo({ y: 0, animated: false });
  };
  return (
    <View style={s.flex}>
      <View style={s.sequenceHeader}>
        <Header title="Class Sequence" back={back} compact
          right={
            <Pressable
              onPress={undo}
              disabled={!canUndo}
              style={[s.editorUndo, !canUndo && s.disabled]}
              accessibilityLabel="Undo last sequence change"
              accessibilityRole="button"
            >
              <Undo2 size={18} color={C.rose} />
            </Pressable>
          }
        />
        <Text style={s.sub}>{plan.brief.program} · {fmt(planTotal(plan))} total</Text>
        <View style={s.phaseTimingStrip} accessibilityRole="tablist">
          {(["All", ...PHASES] as const).map((option) => {
            const selected = filter === option;
            const time = option === "All" ? planTotal(plan) : phaseTotal(plan, option);
            return (
              <Pressable key={option} onPress={() => selectPhase(option)}
                style={[s.phaseTimingItem, selected && s.phaseTimingItemOn]}
                accessibilityRole="tab" aria-selected={selected}
                accessibilityLabel={option === "All" ? "All phases" : option}>
                <Text style={[s.phaseTimingLabel, selected && s.roseText]}>{option}</Text>
                <Text style={[s.phaseTimingValue, selected && s.roseText]}>{fmt(time)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView ref={sequenceScroll} style={s.flex} contentContainerStyle={s.sequencePage}>
        <View style={s.row}>
          <Text style={s.blockTitle}>{filter === "All" ? "All movements" : phase}</Text>
          {filter !== "All" ? (
            <Text style={[s.sub, phaseRemaining(plan, phase) === 0 && s.greenText]}>{phaseStatus(phase)}</Text>
          ) : null}
        </View>
        {notice ? <Text accessibilityLiveRegion="polite" style={s.sequenceNotice}>{notice}</Text> : null}
        {phaseIssues.map(({ message, movementId }) => {
          const index = movementId ? plan.movements.findIndex((movement) => movement.id === movementId) : -1;
          return index < 0 ? <Text key={message} style={s.readinessError}>{message}</Text>
            : <Pressable key={message} onPress={() => beginEdit(index)} accessibilityRole="button" style={s.syncRetry}>
              <Text style={s.readinessError}>{message}</Text>
            </Pressable>;
        })}
        <View style={s.planDetailFields}>
          <Pressable onPress={() => open(phase)}
            style={[s.addMovementButton, s.flex]} accessibilityRole="button">
            <Plus size={17} color={C.rose} />
            <Text style={s.addMovementText}>Add to {phase.toLowerCase()}</Text>
          </Pressable>
          {fittedPhase !== plan.movements ? (
            <Pressable onPress={() => applyChange(fittedPhase)}
              style={s.addMovementButton} accessibilityRole="button"
              accessibilityLabel={`Fit ${phase.toLowerCase()} to ${fmt(phaseTarget(phase))}`}>
              <Text style={s.addMovementText}>Fit to {fmt(phaseTarget(phase))}</Text>
            </Pressable>
          ) : null}
        </View>
        {plan.status === "draft" ? <PlanDate brief={plan.brief} change={setClassDate} /> : null}
        {!visible.length ? <Text style={s.empty}>No movements in {filter === "All" ? "this class" : phase.toLowerCase()} yet.</Text> : null}
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
              <Pressable onPress={() => openMovementActions(index)} style={s.editorUndo}
                accessibilityRole="button" accessibilityLabel={`Actions for ${movementLabel(movement)}`}>
                <Ellipsis size={20} color={C.rose} />
              </Pressable>
          </View>
        ))}
        {suggestions.length > 0 ? (
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
        </View>
        ) : null}
        <PlanDisclosure title="Sequence order"
          detail={mode === "auto" ? "Auto order" : "Manual order"}
          expanded={showOrder} toggle={() => setShowOrder(!showOrder)}>
          <View style={s.sequenceModes}>
            {(["auto", "manual"] as const).map((option) => (
              <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: mode === option }}
                onPress={() => { if (mode !== option) applyChange(plan.movements, option); }}
                style={[s.sequenceMode, mode === option && s.sequenceModeOn]}>
                <Text style={[s.optionText, mode === option && s.roseText]}>
                  {option === "auto" ? "Auto order" : "Manual order"}
                </Text>
              </Pressable>
            ))}
          </View>
        </PlanDisclosure>
      </ScrollView>
      <View style={s.sequenceFooter}>
        <PlanDisclosure
          title="Class checks"
          detail={valid ? readiness.warnings.length ? "Ready with warnings" : "Ready to save" :
            `${readiness.errors.length} to fix`}
          expanded={showChecks}
          toggle={() => setShowChecks(!showChecks)}
        >
          <ScrollView style={s.sequenceChecks} nestedScrollEnabled>
            {readiness.errors.map((message) => <Text key={message} style={s.readinessError}>{message}</Text>)}
            {readiness.warnings.map((message) => <Text key={message} style={s.planningWarning}>{message}</Text>)}
            {!readiness.errors.length && !readiness.warnings.length ? (
              <Text style={s.sequenceNotice}>Timing and side checks passed.</Text>
            ) : null}
          </ScrollView>
        </PlanDisclosure>
        {plan.status === "draft" ? (
          <Main label={plan.brief.scheduledDate ? "Save & Schedule" : "Save Plan"}
            disabled={!valid} onPress={save} />
        ) : <Main label="Done" onPress={back} />}
      </View>
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
              <Pressable
                onPress={closeEditor}
                style={s.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close movement editor"
              >
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
                        <Pressable key={side} accessibilityRole="radio" accessibilityState={{ checked: workingSide(draftMovement) === side }}
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
                        accessibilityRole="radio"
                        accessibilityState={{ checked: draftMovement.phase === phase }}
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
                      <Text style={s.fixedDurationValue}>{fmt(draftMovement.duration)}</Text>
                    </View>
                  </View>
                </View>
                <Text style={s.label}>COACHING CUE</Text>
                <TextInput
                  value={draftMovement.cue}
                  accessibilityLabel="Coaching cue"
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
    </View>
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
  const { confirmAction } = useAppDialog();
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
          !isFinishedClass(slot) &&
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
          <Pressable
            onPress={create}
            style={s.avatar}
            accessibilityRole="button"
            accessibilityLabel="Create class plan"
          >
            <Plus size={22} color={C.rose} />
          </Pressable>
        </View>
      </View>
      {hasActiveDraft && plan.status === "draft" ? (
        <>
          <Text style={s.group}>DRAFT IN PROGRESS</Text>
          <Pressable
            onPress={open}
            style={s.currentPlan}
            accessibilityRole="button"
            accessibilityLabel={`Continue draft ${plan.brief.program}`}
          >
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
            <Pressable
              onPress={duplicate}
              style={s.iconAction}
              accessibilityRole="button"
              accessibilityLabel="Duplicate draft"
            >
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
            accessibilityRole="button"
            accessibilityLabel={`Open saved plan ${saved.brief.program}, ${saved.brief.week}, ${saved.brief.day}`}
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
  const { confirmAction } = useAppDialog();
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
      {!movement.imageUri && !manualMovementArtwork[movement.id] ? <Text style={s.sub}>No photo supplied in the manual.</Text> : null}
      {manual.notes.map((note, index) => <Text key={index} style={s.sequenceNotice}>{note}</Text>)}
      <Text style={s.sub}>New cards start at 1:15. The class plan can adjust their timing.</Text>
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
  const { confirmAction } = useAppDialog();
  const [phase, setPhase] = useState<Phase>(initialPhase ?? movement.phases?.[0] ?? "Main");
  const [selectedSide, setSide] = useState<SideSelection>("both");
  const remaining = phaseRemaining(plan, phase);
  const addition = movementAddition(plan, movement, phase);
  const side = addition && addition.side !== "both" ? addition.side : selectedSide;
  const duration = addition?.side === "both" ? selectionDuration(movement, side) : addition?.seconds ?? 0;
  const compatibility = planning ? movementCompatibility(plan, movement, phase) : [];
  const planIssue = compatibility[0];
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
        />
        <View style={s.detailCard}>
          <View style={s.detailCardAccent} />
          <View style={s.detailCardTop}>
            <View>
              <Text style={s.detailCardEyebrow}>MOVEMENT CARD</Text>
              <Text style={s.detailCardStatus}>
                {movement.reviewStatus === "needs-review" ? "Review pending" : "Instructor reviewed"}
              </Text>
            </View>
            <Pressable
              onPress={toggle}
              style={s.detailFavourite}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={favourite ? `Remove ${movement.name} from favourites` : `Add ${movement.name} to favourites`}
              accessibilityState={{ selected: favourite }}
            >
              <Heart
                size={21}
                color={C.rose}
                fill={favourite ? C.rose : "transparent"}
              />
            </Pressable>
          </View>
          <View style={s.detailArtwork}>
            <MovementVisual
              movement={movement}
              style={s.detailArtworkImage}
              label={`${movement.name} movement demonstration`}
              resizeMode="contain"
            />
            <Text style={s.detailArtworkPosition}>{movement.position}</Text>
            <View style={s.detailArtworkStep}>
              <Text style={s.detailArtworkStepText}>DEMONSTRATION</Text>
            </View>
          </View>
          <View style={s.detailCardBody}>
            <Text style={s.movementTitle}>{movement.name}</Text>
            <View style={s.options}>
              <Pill label={movement.level} active />
              <Pill label={movement.equipment} />
              <Pill label={movement.position} />
            </View>
            <View style={s.detailFactRow}>
              <View style={s.detailFactIcon}>
                <Clock3 size={17} color={C.rose} />
              </View>
              <View style={s.flex}>
                <Text style={s.detailFactLabel}>DEFAULT TIME</Text>
                <Text style={s.detailTime}>
                  {fmt(movement.duration)} {movement.sideMode === "paired" ? "per side" : "per movement"}
                </Text>
              </View>
            </View>
            <View style={s.primaryCueCard}>
              <Text style={s.primaryCueLabel}>
                {movement.reviewStatus === "needs-review" ? "TEACHING CUE FOR REVIEW" : "PRIMARY TEACHING CUE"}
              </Text>
              <Text style={movement.cues[0] ? s.primaryCueText : s.primaryCuePending}>
                {movement.cues[0] ?? "Add a clear teaching cue during instructor review."}
              </Text>
            </View>
          </View>
        </View>
        {movement.reviewStatus === "needs-review" ? <Text style={s.planningWarning}>Instructor review required</Text> : null}
        {movement.reviewStatus === "reviewed" && movement.reviewedBy ? (
          <Text style={s.sequenceNotice}>Reviewed by {movement.reviewedBy}</Text>
        ) : null}
        {movement.cues.length > 1 ? (
          <>
            <Text style={s.group}>MORE TEACHING CUES</Text>
            {movement.cues.slice(1).map((cue, index) => (
              <View key={`${movement.id}-${index + 1}`} style={s.cue}>
                <View style={s.cueNum}>
                  <Text style={s.cueNumText}>{index + 2}</Text>
                </View>
                <Text style={s.cueText}>{cue}</Text>
              </View>
            ))}
          </>
        ) : null}
        {movement.manual ? <ManualReference movement={movement} /> : null}
        {planning && movement.sideMode === "paired" && addition ? (
          <>
            <Text style={s.label}>PARTICIPANT WORKING SIDE</Text>
            <View style={s.options}>
              {(addition.side === "both" ? ["both", "left", "right"] as const : [addition.side]).map((option) => (
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
              {(movement.phases?.length ? [...new Set([phase, ...movement.phases])] : PHASES).map((option) => (
                <Pressable key={option} onPress={() => setPhase(option)} accessibilityRole="radio"
                  aria-checked={phase === option}>
                  <Pill label={option} active={phase === option} />
                </Pressable>
              ))}
            </View>
            <Text style={s.sub}>{plan.brief.program} / {phase}</Text>
            <Text style={planIssue || !addition ? s.planningWarning : s.sequenceNotice}>
              {planIssue ? `${movement.name}: ${planIssue}` : !addition ? "This movement is already in the class." : remaining < duration
                ? `The app will adjust ${phase.toLowerCase()} timing to keep the phase on target.`
                : `${fmt(remaining - duration)} remaining after this movement.`}
            </Text>
          </>
        ) : null}
      </ScrollView>
      <View style={s.sticky}>
        {planning && planIssue && movement.reviewStatus !== "needs-review" ? (
          <Text style={s.readinessError}>{movement.name}: {planIssue}</Text>
        ) : null}
        {planning && !addition ? <Outline label="Back to Library" onPress={back} /> : <Main
          label={movement.reviewStatus === "needs-review"
            ? "Review Movement"
            : planning ? remaining < duration ? "Add & Fit Phase" : "Add to Plan" : "Edit Movement"}
          disabled={planning && Boolean(planIssue) && movement.reviewStatus !== "needs-review"}
          onPress={() => movement.reviewStatus === "needs-review" || !planning
            ? review() : add(phase, side)}
        />}
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
          <View style={[s.summaryCheck, !complete && s.summaryEarly]}>
            {complete ? <Check size={28} color={C.white} /> : <Clock3 size={28} color={C.rose} />}
          </View>
          <Text style={s.summaryTitle}>
            {result.practice ? "Practice ended" : complete ? "Class complete" : "Class ended early"}
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
        {!result.practice ? <View style={s.why}>
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
        </View> : null}
        {!result.practice ? <View style={s.selectGroup}>
          <Text style={s.label}>GENERAL TEACHING NOTES</Text>
          <TextInput
            value={notes}
            accessibilityLabel="General teaching notes"
            onChangeText={setNotes}
            multiline
            placeholder="Add a note about the session"
            placeholderTextColor={C.muted}
            style={s.notes}
          />
        </View> : null}
      </ScrollView>
      <View style={s.sticky}>
        <Main label={result.practice ? "Done" : "Save Summary"} onPress={() => done(notes.trim())} />
      </View>
    </View>
  );
}
function SessionDetails({
  result,
  scheduledClass,
  back,
  saveNotes,
}: {
  result: SessionResult;
  scheduledClass?: ScheduledClass;
  back: () => void;
  saveNotes: (notes: string) => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(result.notes ?? "");
  const complete = result.completed === result.total;
  const completion = result.total
    ? Math.round((result.completed / result.total) * 100)
    : 0;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="Session Details" back={back} />
      <View style={s.sessionDetailHero}>
        <View style={[s.summaryCheck, !complete && s.summaryEarly]}>
          {complete ? <Check size={28} color={C.white} /> : <Clock3 size={28} color={C.rose} />}
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
        {editingNotes ? <>
          <TextInput value={notes} onChangeText={setNotes} accessibilityLabel="Instructor notes"
            multiline style={s.notes} />
          <Main label="Save Notes" onPress={() => {
            saveNotes(notes.trim());
            setEditingNotes(false);
          }} />
          <Outline label="Cancel" onPress={() => setEditingNotes(false)} />
        </> : <>
          <Text style={result.notes ? s.whyCopy : s.sub}>
            {result.notes || "No notes were added for this session."}
          </Text>
          <Outline label={result.notes ? "Edit Notes" : "Add Notes"} onPress={() => {
            setNotes(result.notes ?? "");
            setEditingNotes(true);
          }} />
        </>}
      </View>
    </ScrollView>
  );
}
const LibraryMovementRow = memo(function LibraryMovementRow({
  movement,
  favourite,
  open,
  toggle,
}: {
  movement: LibraryMovement;
  favourite: boolean;
  open: (movement: LibraryMovement) => void;
  toggle: (id: string) => void;
}) {
  return (
    <View style={s.libraryRow}>
      <Pressable
        onPress={() => open(movement)}
        style={s.libraryRowMain}
        accessibilityRole="button"
        accessibilityLabel={`${movement.name}, ${movement.level}, ${movement.position}`}
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
          {movement.reviewStatus === "needs-review" ? (
            <Text style={s.reviewBadge}>NEEDS REVIEW</Text>
          ) : null}
          <Text style={s.libraryPhase}>
            {(movement.phases ?? ["Main"]).join(" / ")}
          </Text>
          <Text style={s.sub}>
            {movement.level} / {movement.position} / {movement.equipment}
          </Text>
        </View>
        <View style={s.libraryDuration}>
          <Text style={s.duration}>{fmt(movement.duration)}</Text>
          {movement.sideMode === "paired" ? (
            <Text style={s.suggestionReason}>/ side</Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        onPress={() => toggle(movement.id)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`${favourite ? "Remove" : "Add"} ${movement.name} ${favourite ? "from" : "to"} favourites`}
        accessibilityState={{ selected: favourite }}
      >
        <Heart
          size={20}
          color={C.rose}
          fill={favourite ? C.rose : "transparent"}
        />
      </Pressable>
    </View>
  );
});
function Library({
  movements,
  favourites,
  planningPhase,
  planningPlan,
  query,
  setQuery,
  filter,
  setFilter,
  scrollOffset,
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
  planningPhase?: Phase;
  planningPlan: ClassPlan;
  query: string;
  setQuery: (query: string) => void;
  filter: string;
  setFilter: (filter: string) => void;
  scrollOffset: React.RefObject<number>;
  notice?: string;
  open: (movement: LibraryMovement) => void;
  create: () => void;
  toggle: (id: string) => void;
  back?: () => void;
  deletedCount: number;
  openDeleted: () => void;
}) {
  const list = useRef<FlatList<LibraryMovement>>(null);
  const restoreOffset = useRef(scrollOffset.current);
  const deferredQuery = useDeferredValue(query);
  const favouriteIds = useMemo(() => new Set(favourites), [favourites]);
  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return movements.filter(
      (movement) =>
        (!planningPhase || !movementCompatibility(planningPlan, movement, planningPhase).length) &&
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
  }, [deferredQuery, favouriteIds, filter, movements, planningPhase, planningPlan]);
  const resetScroll = () => {
    restoreOffset.current = 0;
    scrollOffset.current = 0;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const renderMovement = useCallback(
    ({ item }: { item: LibraryMovement }) => (
      <LibraryMovementRow
        movement={item}
        favourite={favouriteIds.has(item.id)}
        open={open}
        toggle={toggle}
      />
    ),
    [favouriteIds, open, toggle],
  );
  const header = (
    <View style={s.libraryHeader}>
      <View style={s.row}>
        {back ? <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back to class sequence" style={s.libraryBack}>
          <ArrowLeft size={22} color={C.ink} />
        </Pressable> : null}
        <Text style={[s.headerTitle, s.flex]}>{planningPhase ? `Add to ${planningPhase.toLowerCase()}` : "Movement Library"}</Text>
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
          <Pressable
            onPress={create}
            style={s.avatar}
            accessibilityRole="button"
            accessibilityLabel="Add movement"
          >
            <Plus size={23} color={C.rose} />
          </Pressable>
        </View>
      </View>
      {planningPhase ? <Text style={s.sub}>Movements for this phase and class level.</Text> : null}
      <View style={s.search}>
        <Search size={20} color={C.muted} />
        <TextInput
          value={query}
          onChangeText={(value) => { resetScroll(); setQuery(value); }}
          placeholder="Search movement, series or position"
          placeholderTextColor={C.muted}
          style={s.input}
          accessibilityLabel="Search movement library"
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
          ...(planningPhase ? [] : ["Needs review"]),
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
          <Pressable
            key={option}
            onPress={() => { resetScroll(); setFilter(option); }}
            accessibilityRole="radio"
            accessibilityState={{ checked: filter === option }}
            accessibilityLabel={`${option} movements`}
          >
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
      ref={list}
      onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={100}
      onContentSizeChange={(_, height) => {
        const offset = restoreOffset.current;
        if (offset <= 0 || height <= offset) return;
        restoreOffset.current = 0;
        list.current?.scrollToOffset({ offset, animated: false });
      }}
      data={visible}
      keyExtractor={(movement) => movement.id}
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      ListHeaderComponent={header}
      renderItem={renderMovement}
      ListEmptyComponent={
        <View style={s.emptyCard}>
          <Text style={s.sub}>No movements match your search.</Text>
          {query || filter !== "All" ? <Outline label="Clear filters" onPress={() => {
            resetScroll();
            setQuery("");
            setFilter("All");
          }} /> : null}
        </View>
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
  const pendingImageUri = useRef<string | undefined>(undefined);
  const pendingImageCommitted = useRef(false);
  useEffect(
    () => () => {
      if (!pendingImageCommitted.current && pendingImageUri.current)
        void deleteOwnedMovementImage(pendingImageUri.current);
    },
    [],
  );
  const pickImage = async () => {
    try {
      if (Platform.OS !== "web") {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError("Allow photo access to add a movement image.");
          return;
        }
      }
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
      const previousPendingImage = pendingImageUri.current;
      pendingImageUri.current = destination;
      setImageUri(destination);
      setError("");
      if (previousPendingImage)
        await deleteOwnedMovementImage(previousPendingImage);
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
    pendingImageCommitted.current = true;
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
              <Pressable onPress={() => {
                const pending = pendingImageUri.current;
                pendingImageUri.current = undefined;
                setImageUri(undefined);
                if (pending) void deleteOwnedMovementImage(pending);
              }} style={s.imageAction}
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
                <Pressable key={option} onPress={() => setPosition(option)} accessibilityRole="radio"
                  accessibilityState={{ checked: position === option }}>
                  <Pill label={option} active={position === option} />
                </Pressable>
              ),
            )}
          </View>
          <Text style={s.label}>LEVEL</Text>
          <View style={s.options}>
            {["Beginner", "Intermediate", "Advanced"].map((option) => (
              <Pressable key={option} onPress={() => setLevel(option)} accessibilityRole="radio"
                accessibilityState={{ checked: level === option }}>
                <Pill label={option} active={level === option} />
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>EQUIPMENT</Text>
          <TextInput
            value={equipment}
            accessibilityLabel="Equipment"
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
              <Pressable key={option} onPress={() => setSideMode(option)} accessibilityRole="radio" accessibilityState={{ checked: sideMode === option }}>
                <Pill label={option === "together" ? "Together" : option === "paired" ? "Separate sides" : "Alternating"} active={sideMode === option} />
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>PHASES</Text>
          <View style={s.options}>
            {PHASES.map((option) => (
              <Pressable key={option} onPress={() => setPhases((current) => current.includes(option)
                ? current.filter((item) => item !== option) : [...current, option])} accessibilityRole="checkbox"
                accessibilityState={{ checked: phases.includes(option) }}>
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
  readyForSlot,
}: {
  sessions: SessionResult[];
  schedule: ScheduledClass[];
  openSession: (session: SessionResult) => void;
  readyForSlot: (slot: ScheduledClass) => boolean;
}) {
  const now = useLiveNow();
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
  const upcoming = schedule.filter((slot) =>
    slot.status !== "CANCELLED" && !isFinishedClass(slot) && slot.status !== "IN PROGRESS" &&
    isFutureScheduleSlot(slot, now));
  const readyCount = upcoming.filter(readyForSlot).length;
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
          [`${readyCount}/${upcoming.length}`, "Upcoming ready"],
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
  const { showAlert } = useAppDialog();
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
    key: "vibration" | "countdownSound" | "completionSound",
  ) =>
    updatePreferences({ ...preferences, [key]: !preferences[key] });
  const Toggle = ({
    label,
    value,
    onPress,
  }: {
    label: string;
    value: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
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
        accessibilityRole="button"
        accessibilityLabel="Edit profile details"
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
          <TextInput accessibilityLabel="Full name" value={name} onChangeText={setName} style={s.formInput} />
          <Text style={s.label}>EMAIL ADDRESS</Text>
          <TextInput
            accessibilityLabel="Email address"
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
              accessibilityRole="radio"
              accessibilityState={{ checked: preferences.teachingMode === mode }}
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
            : "Shows movement names with fewer prompts."}
        </Text>
      </View>
      <View>
        <Text style={s.group}>PREFERENCES</Text>
        <View style={s.settings}>
          <View style={s.setting}>
            <Text style={s.settingText}>Vibration cues</Text>
            <Toggle
              label="Vibration cues"
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
              label="Countdown sound"
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
              label="Class completion sound"
              value={preferences.completionSound}
              onPress={() => toggle("completionSound")}
            />
          </View>
          <View style={s.setting}>
            <View style={s.flex}>
              <Text style={s.settingText}>Saved copy on this device</Text>
              <Text style={s.duration}>
                Recently opened workspace data is cached here
              </Text>
            </View>
            <Check size={20} color={C.sage} />
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
            onPress={() => void Linking.openURL("mailto:support@blushbodies.com").catch(() =>
              showAlert("Help & Support", "Email support@blushbodies.com for assistance."))}
            style={s.setting}
            accessibilityRole="button"
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
            ? "Changes need attention."
            : supabaseConfigured ? "Workspace synced." : "Changes saved on this device."}
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
  const { showAlert } = useAppDialog();
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
      showAlert(
        "Password updated",
        "Use your new password the next time you sign in.",
        [{ text: "Done", onPress: back }],
        Check,
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
            accessibilityLabel="Current password"
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
            accessibilityLabel="New password"
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
            accessibilityLabel="Confirm new password"
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
  backup,
  restoreBackup,
  reset,
  deleteAccount,
  sharedWorkspace,
}: {
  savedPlans: number;
  schedule: number;
  sessions: number;
  customMovements: number;
  back: () => void;
  backup: () => Promise<void>;
  restoreBackup: () => Promise<void>;
  reset: () => void;
  deleteAccount?: () => Promise<string | null>;
  sharedWorkspace: boolean;
}) {
  const { confirmAction } = useAppDialog();
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const confirmReset = () => confirmAction({
    title: sharedWorkspace ? "Clear local cache?" : "Permanently delete your account?",
    message: sharedWorkspace
      ? "This clears the cache on this device and signs you out. Sign in again to reload your workspace."
      : "This permanently removes this account, saved plans, schedules, custom movements, insights, profile details and preferences from this device.",
    confirmText: sharedWorkspace ? "Clear and sign out" : "Delete Account",
    onConfirm: reset,
    Icon: Trash2,
    destructive: true,
  });
  const confirmDelete = () => {
    if (!deleteAccount || deleting || backingUp || restoring) return;
    confirmAction({
      title: "Permanently delete your account?",
      message: "Your Blush Bodies account and private workspaces will be permanently deleted. Shared workspaces will stay available to their remaining instructors.",
      confirmText: "Delete Account",
      onConfirm: () => {
        setDeleting(true);
        setDeleteError("");
        void deleteAccount()
          .then((message) => setDeleteError(message ?? ""))
          .finally(() => setDeleting(false));
      },
      Icon: Trash2,
      destructive: true,
    });
  };
  const counts = [
    [savedPlans, "Saved plans"],
    [schedule, "Classes"],
    [sessions, "Sessions"],
    [customMovements, "Custom movements"],
  ] as const;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="App Data & Reset" back={deleting ? undefined : back} />
      <Text style={s.sub}>
        {sharedWorkspace
          ? "Your shared workspace syncs through Supabase and keeps an offline cache on this device."
          : "Your app content is stored locally on this device so it remains after closing or reloading Expo."}
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
      <Text style={s.group}>BACKUP</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Export a backup of this workspace"
        disabled={backingUp || deleting}
        onPress={() => {
          if (backingUp) return;
          setBackingUp(true);
          void backup().finally(() => setBackingUp(false));
        }}
        style={[s.backupAction, backingUp && s.actionDisabled]}
      >
        <ArrowDown size={19} color={C.rose} />
        <View style={s.flex}>
          <Text style={s.backupTitle}>
            {backingUp ? "Preparing backup..." : "Export workspace backup"}
          </Text>
          <Text style={s.backupCopy}>
            Save plans, classes, sessions, library changes and custom photos.
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Restore this workspace from a backup file"
        disabled={restoring || deleting}
        onPress={() => {
          if (restoring) return;
          setRestoring(true);
          void restoreBackup().finally(() => setRestoring(false));
        }}
        style={[s.backupAction, restoring && s.actionDisabled]}
      >
        <ArrowUp size={19} color={C.rose} />
        <View style={s.flex}>
          <Text style={s.backupTitle}>
            {restoring ? "Checking backup..." : "Restore workspace backup"}
          </Text>
          <Text style={s.backupCopy}>
            Preview a backup before replacing your workspace.
          </Text>
        </View>
      </Pressable>
      <Text style={s.group}>{sharedWorkspace ? "LOCAL CACHE" : "DELETE ACCOUNT"}</Text>
      {sharedWorkspace ? (
        <Outline label="Clear local cache and sign out" onPress={() => { if (!deleting) confirmReset(); }} />
      ) : <Pressable
        accessibilityRole="button"
        disabled={deleting}
        onPress={confirmReset}
        style={s.dangerAction}
      >
        <Trash2 size={19} color="#A34848" />
        <Text style={s.dangerText}>Delete account and local data</Text>
      </Pressable>}
      {deleteAccount ? (
        <>
          <Text style={s.group}>DELETE ACCOUNT</Text>
          <Pressable
            accessibilityRole="button"
            disabled={deleting || backingUp || restoring}
            onPress={confirmDelete}
            style={[s.dangerAction, deleting && s.actionDisabled]}
          >
            <Trash2 size={19} color="#A34848" />
            <Text style={s.dangerText}>{deleting ? "Deleting Account..." : "Delete Account"}</Text>
          </Pressable>
          {deleteError ? (
            <Text style={s.formError} accessibilityLiveRegion="polite">{deleteError}</Text>
          ) : null}
        </>
      ) : null}
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
  assign?: () => void;
  rename: (name: string) => void;
  remove: () => void;
}) {
  const { confirmAction } = useAppDialog();
  const now = useLiveNow();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.brief.program);
  const [error, setError] = useState("");
  const nextClass = schedule
    .filter(
      (slot) =>
        slot.planId === plan.id &&
        slot.status !== "CANCELLED" &&
        !isFinishedClass(slot) &&
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
            accessibilityLabel="Plan name"
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
        {assign ? (
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
        ) : null}
      </View>
      <Pressable onPress={confirmDelete} style={s.dangerAction}>
        <Trash2 size={19} color="#A34848" />
        <Text style={s.dangerText}>Delete saved plan</Text>
      </Pressable>
    </ScrollView>
  );
}

type TeachingTime = ReturnType<typeof teachingTimeRemaining>;
type UpdateTeachingTime = (time: TeachingTime) => void;

function TeachingCountdowns({
  initialTime,
  compact,
  ref,
}: {
  initialTime: TeachingTime;
  compact: boolean;
  ref: React.Ref<UpdateTeachingTime>;
}) {
  const [time, setTime] = useState(initialTime);
  // Only the countdowns need to render on every tick.
  useImperativeHandle(ref, () => setTime, []);
  return (
    <View style={s.teachTimerRow}>
      <View style={[s.teachTimerBlock, s.teachTimerMovement, compact && s.teachTimerBlockCompact]}>
        <View style={[s.teachTimerIcon, s.teachTimerMovementIcon]}>
          <Timer size={16} color={C.rose} />
        </View>
        <View style={s.teachTimerCopy}>
          <Text style={s.teachTimerLabel}>Movement left</Text>
          <Text style={[s.teachTimer, s.teachMovementTime]}>{fmt(Math.ceil(time.movementSeconds))}</Text>
        </View>
      </View>
      <View style={[s.teachTimerBlock, compact && s.teachTimerBlockCompact]}>
        <View style={s.teachTimerIcon}>
          <Clock3 size={16} color={C.sage} />
        </View>
        <View style={s.teachTimerCopy}>
          <Text style={s.teachTimerLabel}>Class left</Text>
          <Text style={s.teachTimer}>{fmt(Math.ceil(time.classSeconds))}</Text>
        </View>
      </View>
    </View>
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
  const { confirmAction } = useAppDialog();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const safeArea = useSafeAreaInsets();
  const veryCompactTeachingView = viewportHeight < 700 || viewportWidth < 350;
  const compactTeachingView = viewportHeight < 820 || viewportWidth < 390;
  const largeTeachingView = viewportWidth >= 600 && viewportHeight >= 820;
  const teachingArtworkMinHeight = veryCompactTeachingView
    ? 96
    : compactTeachingView
      ? 152
      : largeTeachingView
        ? 270
        : 210;
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
  const completionPlayer = useAudioPlayer(
    require("./assets/class-complete.wav"),
  );
  const countdownPlayer = useAudioPlayer(
    require("./assets/countdown-beep.wav"),
  );
  const endingRef = useRef(false);
  const lastCountdownCue = useRef<number | null>(null);
  const indexRef = useRef(restored.movementIndex);
  const moveTimeRef = useRef(restored.remainingSeconds);
  const lastTickAt = useRef(Date.now());
  const updateCountdowns = useRef<UpdateTeachingTime>(null);
  const cardOffset = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const transitioning = useRef(false);
  const current = movements[index];
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
      const remainingSeconds = movements[safe].duration;
      indexRef.current = safe;
      moveTimeRef.current = remainingSeconds;
      updateCountdowns.current?.(teachingTimeRemaining({ movementIndex: safe, remainingSeconds }, movements));
      setIndex(safe);
      lastTickAt.current = Date.now();
      saveCheckpoint(safe, remainingSeconds, held);
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
      practice: session.practice,
    };
    if (!completed || session.practice || !preferences.completionSound) {
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
    confirmAction({
      title: completed ? "Complete class?" : "End class early?",
      message: completed
        ? "This will create the session summary."
        : "The unfinished movements will be recorded in the summary.",
      confirmText: completed ? "Complete Class" : "End Class",
      cancelText: "Keep teaching",
      onConfirm: () => end(completed),
      Icon: completed ? Check : TriangleAlert,
      destructive: !completed,
    });
  };
  useEffect(() => {
    lastTickAt.current = Date.now();
    if (held) return;
    const tick = () => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastTickAt.current) / 1000);
      if (elapsedSeconds < 1) return;
      lastTickAt.current += elapsedSeconds * 1000;
      const { movementIndex: nextIndex, remainingSeconds } = advanceTeachingPosition({
        movementIndex: indexRef.current, remainingSeconds: moveTimeRef.current,
      }, movements, elapsedSeconds);

      const movementChanged = nextIndex !== indexRef.current;
      if (movementChanged || remainingSeconds !== moveTimeRef.current) {
        updateCountdowns.current?.(teachingTimeRemaining({ movementIndex: nextIndex, remainingSeconds }, movements));
      }
      indexRef.current = nextIndex;
      moveTimeRef.current = remainingSeconds;
      if (movementChanged) {
        lastCountdownCue.current = null;
        setIndex(nextIndex);
        saveCheckpoint(nextIndex, remainingSeconds, false);
      }
      const cueSecond = countdownCueSecond(
        remainingSeconds,
        lastCountdownCue.current,
        preferences.countdownSound,
      );
      if (cueSecond !== null) {
        lastCountdownCue.current = cueSecond;
        void countdownPlayer
          .seekTo(0)
          .then(() => countdownPlayer.play())
          .catch(() => undefined);
      } else if (remainingSeconds > 3) {
        lastCountdownCue.current = null;
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [countdownPlayer, held, movements, preferences.countdownSound]);
  useEffect(() => {
    if (preferences.vibration)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [index, preferences.vibration]);
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
  const currentUsesManualArtwork =
    !current.imageUri && movementSourceId(current).startsWith("manual-");
  const upcomingUsesManualArtwork = upcoming
    ? !upcoming.imageUri && movementSourceId(upcoming).startsWith("manual-")
    : false;
  return (
    <View style={[s.teach, { paddingTop: safeArea.top }]}>
      <StatusBar style="dark" />
      {Platform.OS !== "web" ? <TeachingKeepAwake /> : null}
      <View
        style={[
          s.teachContent,
          compactTeachingView && s.teachContentCompact,
          veryCompactTeachingView && s.teachContentVeryCompact,
          largeTeachingView && s.teachContentLarge,
          { paddingBottom: Math.max(safeArea.bottom, veryCompactTeachingView ? 4 : 8) },
        ]}
      >
      <View style={[
        s.teachTop,
        compactTeachingView && s.teachTopCompact,
        veryCompactTeachingView && s.teachTopVeryCompact,
      ]}>
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
        <View style={s.teachProgress}>
          <View style={[s.teachStatus, held && s.teachStatusPaused]}>
            <View style={[s.teachStatusDot, held && s.teachStatusDotPaused]} />
            <Text style={[s.teachStatusLabel, held && s.teachStatusLabelPaused]}>
              {held ? "Paused" : "In progress"}
            </Text>
          </View>
          <Text style={s.teachStepLabel}>
            Step {index + 1} of {movements.length}
          </Text>
        </View>
      </View>
      <TeachingCountdowns
        ref={updateCountdowns}
        initialTime={teachingTimeRemaining(restored, movements)}
        compact={veryCompactTeachingView}
      />
      <Animated.View
        style={[
          s.movementCard,
          compactTeachingView && s.movementCardCompact,
          veryCompactTeachingView && s.movementCardVeryCompact,
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
        <Text style={[
          s.headerTitle,
          s.movementCardTitle,
          compactTeachingView && s.movementCardTitleCompact,
          veryCompactTeachingView && s.movementCardTitleVeryCompact,
        ]}>{current.title}</Text>
        {sideLabel(current) ? <Text style={[s.sub, s.movementWorkingSide]}>Participant · {sideLabel(current)}</Text> : null}
        <View
          style={[
            s.movementArtwork,
            currentUsesManualArtwork && s.movementArtworkManual,
            currentUsesManualArtwork && compactTeachingView && s.movementArtworkManualCompact,
            { minHeight: teachingArtworkMinHeight },
            veryCompactTeachingView && s.movementArtworkVeryCompact,
          ]}
        >
          <MovementVisual
            movement={current}
            style={s.movementArtworkImage}
            label={`Demonstration image for ${current.title}`}
            resizeMode="contain"
          />
        </View>
        {preferences.teachingMode === "Guided" ? (
          <View style={[s.movementCue, veryCompactTeachingView && s.movementCueVeryCompact]}>
            <Text style={[s.label, s.movementCueLabel]}>COACHING CUE</Text>
            <Text style={[s.movementCueText, veryCompactTeachingView && s.movementCueTextVeryCompact]}>
              {current.cue}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <View style={[
        s.controls,
        compactTeachingView && s.controlsCompact,
        veryCompactTeachingView && s.controlsVeryCompact,
      ]}>
        <View style={s.teachControlGroup}>
          <Pressable
            onPress={() => go(index - 1)}
            disabled={index === 0}
            style={[
              s.iconAction,
              s.navControl,
              veryCompactTeachingView && s.navControlVeryCompact,
              index === 0 && s.disabled,
            ]}
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
            style={[s.main, s.hold, veryCompactTeachingView && s.holdVeryCompact]}
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
            style={[s.iconAction, s.navControl, veryCompactTeachingView && s.navControlVeryCompact]}
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
        style={[
          s.upNext,
          veryCompactTeachingView && s.upNextVeryCompact,
          !upcoming && s.upNextComplete,
        ]}
        accessibilityRole="button"
        accessibilityLabel={upcoming ? `Next movement: ${upcoming.title}` : "Finish class and view summary"}
      >
        <View style={s.flex}>
          <Text style={[s.label, veryCompactTeachingView && s.upNextTextVeryCompact]}>
            {upcoming ? "UP NEXT" : "FINAL MOVEMENT"}
          </Text>
          <Text style={[s.outlineText, s.upText, veryCompactTeachingView && s.upTextVeryCompact]} numberOfLines={1}>
            {upcoming
              ? upcoming.title
              : "Finish & View Summary"}
          </Text>
          {upcoming && sideLabel(upcoming) ? (
            <Text style={[s.upNextSide, veryCompactTeachingView && s.upNextSideVeryCompact]} numberOfLines={1}>
              {sideLabel(upcoming)}
            </Text>
          ) : null}
          {upcoming ? (
            <View style={[s.upNextMeta, veryCompactTeachingView && s.upNextMetaVeryCompact]}>
              <Text style={[s.upTime, veryCompactTeachingView && s.upNextTextVeryCompact]}>{fmt(upcoming.duration)}</Text>
              <Text style={[s.upTime, veryCompactTeachingView && s.upNextTextVeryCompact]}>·</Text>
              <Text style={[s.upTime, veryCompactTeachingView && s.upNextTextVeryCompact]}>{upcoming.position}</Text>
            </View>
          ) : null}
        </View>
        {upcoming ? (
          <View
            style={[
              s.upNextVisual,
              compactTeachingView && s.upNextVisualCompact,
              veryCompactTeachingView && s.upNextVisualVeryCompact,
              upcomingUsesManualArtwork && s.upNextVisualManual,
            ]}
          >
            <MovementVisual
              movement={upcoming}
              style={s.upNextVisualImage}
              label={`Preview image for ${upcoming.title}`}
              resizeMode={upcomingUsesManualArtwork ? "cover" : "contain"}
            />
            <View style={s.upNextArrow}>
              <ChevronRight size={16} color={C.ink} />
            </View>
          </View>
        ) : (
          <ChevronRight size={20} color={C.rose} />
        )}
      </Pressable>
      <Pressable
        onPress={confirmEnd}
        style={[s.endClass, veryCompactTeachingView && s.endClassVeryCompact]}
        accessibilityRole="button"
        accessibilityLabel="End class"
      >
        <Text style={[s.stepLabel, s.endClassText]}>End Class</Text>
      </Pressable>
      </View>
    </View>
  );
}

function BlushBodiesApp({ setWideLayout }: { setWideLayout: (wide: boolean) => void }) {
  const { confirmAction, showAlert } = useAppDialog();
  const { width } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [signupReturnScreen, setSignupReturnScreen] = useState<
    "welcome" | "signin" | "forgotPassword"
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
  const [draftPlan, setDraftPlan] = useState<ClassPlan>();
  const [sequenceHistory, setSequenceHistory] = useState<ClassPlan[]>([]);
  const [sequenceNotice, setSequenceNotice] = useState("");
  const [libraryPlanPhase, setLibraryPlanPhase] = useState<Phase | undefined>();
  const [libraryNotice, setLibraryNotice] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("All");
  const libraryScrollOffset = useRef(0);
  const desktop = Platform.OS === "web" && width >= 1080;
  const showLibraryPane = desktop && screen === "details";
  const showPlansPane = desktop && screen === "editor";
  useEffect(() => {
    setWideLayout(showLibraryPane || showPlansPane);
  }, [setWideLayout, showLibraryPane, showPlansPane]);
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
  const [calendarOfferId, setCalendarOfferId] = useState<string>();
  const displaySchedule = useMemo(() => schedule.map((slot) => {
    if (slot.status !== "COMPLETED") return slot;
    const result = sessionHistory.find((session) => session.scheduledClassId === slot.id);
    return result && result.completed < result.total ? { ...slot, status: "ENDED EARLY" as const } : slot;
  }), [schedule, sessionHistory]);
  const [homeDate, setHomeDate] = useState(localDateKey());
  const [scheduleEditId, setScheduleEditId] = useState<string | undefined>();
  const [scheduleReturnScreen, setScheduleReturnScreen] = useState<
    "profile" | "home"
  >("profile");
  const [assignmentSlotId, setAssignmentSlotId] = useState<
    string | undefined
  >();
  const [schedulePlanReturn, setSchedulePlanReturn] = useState<"managePlan" | "generated" | "home">("home");
  const [classCreatorReturn, setClassCreatorReturn] = useState<"home" | "classes" | "assign">("home");
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
    });
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [signInNotice, setSignInNotice] = useState<SignInNotice>();
  const [resetEmail, setResetEmail] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [persistenceError, setPersistenceError] = useState("");
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const accountDeletionInProgress = useRef(false);
  const saveGeneration = useRef(0);
  const workspaceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStoredData = useRef<StoredAppData | null>(null);
  const remoteWorkspaceId = useRef<string | null>(null);
  const remoteWorkspaceRevision = useRef(0);
  const remoteWorkspaceHydrated = useRef<"saved" | "error" | null>(null);
  const lastRemoteSave = useRef<{ workspaceId: string; key: string; value: string } | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
      const latest = latestStoredData.current;
      if (latest) {
        saveChain.current = saveChain.current
          .then(() =>
            AsyncStorage.setItem(userStorageKey(latest.account), JSON.stringify(latest)),
          )
          .catch(() => undefined);
      }
    },
    [],
  );
  useEffect(() => {
    void AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => undefined);
  }, []);
  const saveScheduledClass = (slot: ScheduledClass) => {
    setSchedule((current) => upsertScheduleSlot(current, slot));
    if (!schedule.some((current) => current.id === slot.id) &&
        slot.status !== "CANCELLED" && !isFinishedClass(slot) &&
        isFutureScheduleSlot(slot, new Date())) setCalendarOfferId(slot.id);
  };
  const removeScheduledClass = (id: string) => {
    setSchedule((current) => removeScheduleSlot(current, id));
  };
  const storedData = (owner: Account = account): StoredAppData => ({
      account: owner,
      plan: draftPlan ?? plan,
      hasActiveDraft: Boolean(draftPlan),
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
    const workspaceId = remoteWorkspaceId.current;
    const writeWorkspace = async (storageKey: string, value: string) => {
      if (!workspaceId || workspaceId !== remoteWorkspaceId.current) {
        await AsyncStorage.setItem(storageKey, value);
        return;
      }
      const last = lastRemoteSave.current;
      if (last?.workspaceId === workspaceId && last.key === storageKey && last.value === value) return;
      const syncKey = workspaceSyncKey(storageKey);
      const revisionBeforeSave = remoteWorkspaceRevision.current;
      await AsyncStorage.multiSet([
        [syncKey, JSON.stringify({ workspaceId, revision: revisionBeforeSave, pending: true })],
        [storageKey, value],
      ]);
      let revision: number;
      try {
        revision = await saveRemoteWorkspaceState(workspaceId, revisionBeforeSave, JSON.parse(value) as StoredAppData);
      } catch (error) {
        if (generation === saveGeneration.current) {
          setPersistenceError(workspaceErrorMessage(error).includes("Workspace changed on another device")
            ? "Both devices have changes. Your edits are kept here. Export a backup before choosing which version to keep."
            : "Saved on this device. Cloud sync is pending.");
        }
        throw error;
      }
      if (remoteWorkspaceId.current === workspaceId) {
        remoteWorkspaceRevision.current = revision;
        await AsyncStorage.setItem(syncKey, JSON.stringify({ workspaceId, revision, pending: false }));
        lastRemoteSave.current = { workspaceId, key: storageKey, value };
      }
    };
    const { task, chain } = enqueueWorkspaceSave({
      previous: saveChain.current,
      write: writeWorkspace,
      key,
      value: JSON.stringify(stored),
      generation,
      latestGeneration: () => saveGeneration.current,
      updateStatus: (status) => {
        setSaveStatus(status);
        if (status === "saved") setPersistenceError("");
        if (status === "error") setPersistenceError((current) =>
          current || "Saving failed. Keep the app open and try again.");
      },
    });
    saveChain.current = chain;
    return task;
  };
  const retryWorkspaceSync = () => {
    if (latestStoredData.current)
      void queueWorkspaceSave(latestStoredData.current).catch(() => undefined);
  };
  useEffect(() => {
    if (!signedIn || accountDeletionInProgress.current) return;
    const stored = storedData();
    latestStoredData.current = stored;
    if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
    if (remoteWorkspaceHydrated.current) {
      const hydrationStatus = remoteWorkspaceHydrated.current;
      remoteWorkspaceHydrated.current = null;
      workspaceSaveTimer.current = null;
      const workspaceId = remoteWorkspaceId.current;
      lastRemoteSave.current = workspaceId && hydrationStatus === "saved" ? {
        workspaceId,
        key: userStorageKey(stored.account),
        value: JSON.stringify(stored),
      } : null;
      setSaveStatus(hydrationStatus);
      if (hydrationStatus === "saved") setPersistenceError("");
      return;
    }
    setSaveStatus("saving");
    workspaceSaveTimer.current = setTimeout(() => {
      workspaceSaveTimer.current = null;
      void queueWorkspaceSave(stored).catch(() => undefined);
    }, 300);
    return () => {
      if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
      workspaceSaveTimer.current = null;
    };
  }, [
    signedIn,
    account,
    plan,
    draftPlan,
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
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (supabase) void supabase.auth.startAutoRefresh();
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
      if (supabase) void supabase.auth.stopAutoRefresh();
      if (workspaceSaveTimer.current) {
        clearTimeout(workspaceSaveTimer.current);
        workspaceSaveTimer.current = null;
        const latest = latestStoredData.current;
        if (signedIn && latest)
          void queueWorkspaceSave(latest).catch(() => undefined);
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
  const openClassCreator = (from: typeof classCreatorReturn) => {
    if (from !== "assign") setAssignmentSlotId(undefined);
    setClassCreatorReturn(from);
    setScreen("create");
  };
  const showDraft = (draft: ClassPlan) => {
    setPlan(draft);
    setDraftPlan(draft);
  };
  const withDraftSlot = (id: string, proceed: () => void) => {
    if (draftPlan && draftPlan.id !== id) {
      confirmAction({
        title: "Start a new draft?",
        message: `Your ${draftPlan.brief.program} draft will move to Recently Deleted, where you can restore it.`,
        confirmText: "Start New Draft",
        cancelText: "Keep Current Draft",
        onConfirm: () => {
          archiveDraft(draftPlan);
          proceed();
        },
      });
      return;
    }
    proceed();
  };
  const openNewDraft = (draft: ClassPlan) => withDraftSlot(draft.id, () => {
    setEditorPhase("Warm-up");
    setSequenceHistory([]);
    setSequenceNotice("");
    setLibraryPlanPhase(undefined);
    showDraft(draft);
    setScreen("editor");
  });
  const duplicatePlan = (source: ClassPlan) => {
    const draft: ClassPlan = {
      ...source,
      id: `${source.id}-copy-${Date.now()}`,
      version: source.version + 1,
      status: "draft",
      brief: {
        ...source.brief,
        scheduledDate: undefined,
        scheduledTime: undefined,
      },
    };
    setAssignmentSlotId(undefined);
    openNewDraft(draft);
  };
  const rebuildPlan = (source: ClassPlan) => {
    const draft = createPlan({
      ...source.brief,
      scheduledDate: undefined,
      scheduledTime: undefined,
    }, libraryMovements);
    if (!classReadiness(draft, libraryMovements).ready) {
      showAlert(
        "More reviewed movements needed",
        "The library could not build a complete class with this level and equipment. Edit the sequence or try a different class setup.",
      );
      return;
    }
    setAssignmentSlotId(undefined);
    openNewDraft({ ...draft, sourcePlanId: source.id, version: source.version + 1 });
  };
  const persistPlan = () => {
    setSequenceHistory([]);
    setSequenceNotice("");
    const saved = { ...plan, status: "saved" as const };
    setPlan(saved);
    setDraftPlan((current) => current?.id === saved.id ? undefined : current);
    setSavedPlans((current) => [
      saved,
      ...current.filter((item) => item.id !== saved.id),
    ]);
    if (saved.brief.scheduledDate && saved.brief.scheduledTime) {
      const scheduledDate = saved.brief.scheduledDate;
      const scheduledTime = saved.brief.scheduledTime;
      const matching = schedule.find(
        (slot) =>
          slot.date === scheduledDate &&
          slot.time === scheduledTime &&
          slot.status !== "CANCELLED",
      );
      saveScheduledClass({
        id:
          matching?.id ??
          `slot-${scheduledDate}-${scheduledTime.replace(":", "")}`,
        date: scheduledDate,
        time: scheduledTime,
        level: planLevel(saved),
        lesson: `${saved.brief.week} / ${saved.brief.day}`,
        status: "READY",
        planId: saved.id,
      });
      setAssignmentSlotId(undefined);
    }
    setScreen("generated");
  };
  const savePlan = () => {
    if (plan.brief.scheduledDate && plan.brief.scheduledTime) {
      const proposed = {
        date: plan.brief.scheduledDate,
        time: plan.brief.scheduledTime,
      };
      if (!isFutureScheduleSlot(proposed, new Date())) {
        showAlert("Choose a future time", "Change the class date and time, or choose Schedule Later.");
        return;
      }
      const conflict = schedule.find((slot) => {
        if (slot.status === "CANCELLED" || !scheduleSlotsOverlap(proposed, slot)) return false;
        const sameTime = slot.date === proposed.date && slot.time === proposed.time;
        const canAssign = sameTime && !isFinishedClass(slot) && slot.status !== "IN PROGRESS" &&
          (slot.id === assignmentSlotId || !slot.planId || slot.planId === plan.id);
        return !canAssign;
      });
      if (conflict) {
        showAlert(
          "Class time unavailable",
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
    setScreen("classes");
  };
  const archiveDraft = (draft: ClassPlan) => {
    const draftDate = draft.brief.scheduledDate;
    const draftTime = draft.brief.scheduledTime;
    const deletedItem: RecentlyDeletedItem = {
      id: `deleted-draft-${draft.id}-${Date.now()}`,
      kind: "draft",
      deletedAt: Date.now(),
      plan: draft,
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
    return deletedItem;
  };
  const deleteDraft = () => {
    if (!draftPlan) return;
    setSequenceHistory([]);
    setSequenceNotice("");
    setLibraryPlanPhase(undefined);
    const deletedItem = archiveDraft(draftPlan);
    showUndo({
      kind: "deleted",
      message: `${draftPlan.brief.program} draft deleted.`,
      item: deletedItem,
    });
    setDraftPlan(undefined);
    if (plan.id === draftPlan.id) setPlan(savedPlans[0] ?? createDefaultPlan());
    setScreen("classes");
  };
  const assignPlan = (slotId: string, planId: string) => {
    const targetSlot = schedule.find((slot) => slot.id === slotId);
    const selectedPlan =
      savedPlans.find((saved) => saved.id === planId) ??
      (plan.id === planId && plan.status === "saved" ? plan : undefined);
    if (!targetSlot || isFinishedClass(targetSlot) || targetSlot.status === "CANCELLED" ||
        targetSlot.status === "IN PROGRESS" || !selectedPlan ||
        planLevel(selectedPlan) !== targetSlot.level || !classReadiness(selectedPlan, libraryMovements).ready) return;
    setSequenceHistory([]);
    setSequenceNotice("");
    setSchedule((current) =>
      assignSchedulePlan(current, slotId, selectedPlan.id),
    );
    setPlan(selectedPlan);
    if (targetSlot) setHomeDate(targetSlot.date);
    setAssignmentSlotId(undefined);
    select("home");
  };
  const schedulePlanAt = (proposed?: { date: string; time: string }) => {
    if (plan.status !== "saved" || !classReadiness(plan, libraryMovements).ready)
      return;
    const { date, time } = proposed ?? nextAvailableClassSlot(schedule, new Date());
    if (!isFutureScheduleSlot({ date, time }, new Date()) ||
        schedule.some((slot) => slot.status !== "CANCELLED" && scheduleSlotsOverlap({ date, time }, slot))) {
      showAlert("Class time unavailable", "Choose a future time that leaves 45 minutes for this class.");
      return;
    }
    const slot: ScheduledClass = {
      id: `slot-${date}-${time.replace(":", "")}-${Date.now()}`,
      date,
      time,
      level: planLevel(plan),
      lesson: `${plan.brief.week} · ${plan.brief.day}`,
      status: "READY",
      planId: plan.id,
    };
    saveScheduledClass(slot);
    setHomeDate(date);
    setAssignmentSlotId(undefined);
    select("home");
  };
  const findPlan = (planId?: string) =>
    savedPlans.find((saved) => saved.id === planId) ??
    (planId === plan.id && plan.status === "saved" ? plan : undefined);
  const playablePlan = (slot: ScheduledClass) => {
    const assigned = findPlan(slot.planId);
    if (assigned && planLevel(assigned) === slot.level && classReadiness(assigned, libraryMovements).ready)
      return assigned;
  };
  const openActiveTeachingSession = () => {
    if (!activeTeachingSession) return;
    setSequenceHistory([]);
    setSequenceNotice("");
    setPlan(activeTeachingSession.plan);
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
      showAlert(
        "Session record unavailable",
        "This class was completed before detailed session records were enabled.",
      );
      return;
    }
    openSessionDetails(result, "home");
  };
  const beginTeachingSession = (
    selectedPlan: ClassPlan,
    context: { booking: ScheduledClass } | { practice: true },
  ) => {
    const scheduledClassId = "booking" in context ? context.booking.id : undefined;
    if (activeTeachingSession) {
      showAlert(
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
      setSequenceHistory([]);
      setSequenceNotice("Resolve the class readiness issues before teaching.");
      setScreen("editor");
      return;
    }
    const ordered = sequenceForTeaching(selectedPlan);
    if (!ordered.length) {
      showAlert("Plan is empty", "Add at least one movement before teaching.");
      return;
    }
    const startedAt = Date.now();
    const active: ActiveTeachingSession = {
      plan: selectedPlan,
      scheduledClassId,
      practice: "practice" in context || undefined,
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
    if (scheduledClassId) {
      const slot = schedule.find((item) => item.id === scheduledClassId);
      if (slot) setHomeDate(slot.date);
      setSchedule((current) =>
        setScheduleStatus(current, scheduledClassId, "IN PROGRESS"),
      );
    }
    setScreen("teach");
  };
  const startScheduledClass = (slot: ScheduledClass) => {
    if (isFinishedClass(slot) || slot.status === "CANCELLED") return;
    if (activeTeachingSession?.scheduledClassId === slot.id) {
      openActiveTeachingSession();
      return;
    }
    const assignedPlan = findPlan(slot.planId);
    if (!assignedPlan || planLevel(assignedPlan) !== slot.level) {
      setAssignmentSlotId(slot.id);
      setSchedulePlanReturn("home");
      setScreen("assign");
      return;
    }
    if (!classReadiness(assignedPlan, libraryMovements).ready) {
      setPlan(assignedPlan);
      showAlert(
        "Plan needs review",
        "Review the timing, sides and movement content before teaching.",
      );
      setScreen("generated");
      return;
    }
    if (isFutureScheduleSlot(slot, new Date())) {
      confirmAction({
        title: "Start this booking early?",
        message: `This class is scheduled for ${classDateLabel(slot.date, true)} at ${slot.time}.`,
        confirmText: "Start Scheduled Class",
        cancelText: "Keep Booking",
        onConfirm: () => beginTeachingSession(assignedPlan, { booking: slot }),
      });
      return;
    }
    beginTeachingSession(assignedPlan, { booking: slot });
  };
  const toggleFavourite = useCallback((id: string) =>
    setFavourites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    ), []);
  const openLibraryMovement = useCallback((movement: LibraryMovement) => {
    setLibraryNotice("");
    setSelectedMovement(movement);
    setScreen("details");
  }, []);
  const changeSequence = (
    movements: PlanMovement[], mode?: SequenceMode, onChange?: () => void,
  ) => {
    const draft = updatePlanSequence(plan, movements, mode);
    withDraftSlot(draft.id, () => {
      setSequenceHistory((history) => [...history.slice(-19), plan]);
      showDraft(draft);
      setSequenceNotice("");
      onChange?.();
    });
  };
  const undoSequence = () => {
    const previous = sequenceHistory[sequenceHistory.length - 1];
    if (!previous) return;
    setPlan(previous);
    setDraftPlan(previous.status === "draft" ? previous : undefined);
    setSequenceHistory((history) => history.slice(0, -1));
    setSequenceNotice("Last sequence change undone.");
  };
  const addMovementToPlan = (movement: LibraryMovement, phase: Phase, side: SideSelection = "both") => {
    const issue = movementCompatibility(plan, movement, phase)[0];
    if (issue) {
      showAlert("Movement unavailable", `${movement.name}: ${issue}`);
      return;
    }
    let movements = insertMovement(plan, movement, phase, `${movement.id}-${Crypto.randomUUID()}`, side);
    if (movements === plan.movements) {
      showAlert("Movement already added", `${movement.name} is already in this class.`);
      return;
    }
    if (phaseRemaining({ ...plan, movements }, phase) < 0) {
      const fitted = fitPhaseTiming(movements, phase);
      if (fitted === movements) {
        showAlert("Phase is full", "Replace or remove a movement before adding this one.");
        return;
      }
      movements = fitted;
    }
    changeSequence(movements, undefined, () => {
      setSequenceNotice(`${movement.name} added to ${phase.toLowerCase()}.`);
      if (libraryPlanPhase) setEditorPhase(phase);
      setLibraryPlanPhase(undefined);
      setScreen("editor");
    });
  };
  const saveCustomMovement = (movement: LibraryMovement) => {
    const reviewed = { ...movement, reviewedBy: account.name, reviewedAt: Date.now() };
    const previousImageUri = libraryMovements.find(
      (item) => item.id === movement.id,
    )?.imageUri;
    const nextLibraryMovements = [
      reviewed,
      ...libraryMovements.filter((item) => item.id !== movement.id),
    ];
    const updateMovement = (current: ClassPlan) =>
      fillMissingPlanCues(syncMovementImage(current, movement.id, movement.imageUri), [reviewed]);
    const nextPlan = updateMovement(plan);
    const nextDraft = draftPlan ? updateMovement(draftPlan) : undefined;
    const nextSavedPlans = savedPlans.map(updateMovement);
    const nextActiveTeachingSession = activeTeachingSession ? {
      ...activeTeachingSession,
      plan: updateMovement(activeTeachingSession.plan),
    } : undefined;
    setLibraryMovements(nextLibraryMovements);
    setDeletedMovementIds((current) => current.filter((id) => id !== movement.id));
    setPlan(nextPlan);
    setDraftPlan(nextDraft);
    setSavedPlans(nextSavedPlans);
    setActiveTeachingSession(nextActiveTeachingSession);
    if (previousImageUri && previousImageUri !== movement.imageUri) {
      const references = referencedMovementImageUris({
        libraryMovements: nextLibraryMovements,
        currentPlan: nextPlan,
        draftPlan: nextDraft,
        savedPlans: nextSavedPlans,
        activePlan: nextActiveTeachingSession?.plan,
        sequenceHistory,
        recentlyDeleted: pruneRecentlyDeleted(recentlyDeleted),
      });
      if (!references.has(previousImageUri))
        void deleteOwnedMovementImage(previousImageUri);
    }
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
        showDraft(fillMissingPlanCues({ ...item.plan, status: "draft" }, libraryMovements));
        setSchedule((current) =>
          restoreScheduleAssignments(current, item.assignments),
        );
        setRecentlyDeletedNotice(`${item.plan.brief.program} draft restored.`);
      } else {
        const restoredPlan = fillMissingPlanCues({ ...item.plan, status: "saved" }, libraryMovements);
        setSavedPlans((current) => [
          restoredPlan,
          ...current.filter((saved) => saved.id !== restoredPlan.id),
        ]);
        if (!draftPlan) {
          setPlan(restoredPlan);
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
      draftPlan &&
      draftPlan.id !== item.plan.id
    ) {
      confirmAction({
        title: "Replace current draft?",
        message: `Restoring ${item.plan.brief.program} will move the current draft to Recently Deleted.`,
        confirmText: "Restore Draft",
        cancelText: "Keep Current",
        onConfirm: () => {
          archiveDraft(draftPlan);
          restore();
        },
      });
      return;
    }
    restore();
  };
  const cancelScheduledClass = (scheduledClass: ScheduledClass) => {
    setSchedule((current) =>
      setScheduleStatus(current, scheduledClass.id, "CANCELLED"),
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
    saveScheduledClass(undo.scheduledClass);
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
  const freshWorkspaceData = (owner: Account): StoredAppData => ({
    account: owner,
    plan: createDefaultPlan(initialLibrary),
    hasActiveDraft: false,
    savedPlans: [],
    sessionHistory: [],
    schedule: initialSchedule,
    libraryMovements: initialLibrary,
    deletedMovementIds: [],
    recentlyDeleted: [],
    favourites: ["manual-clam", "manual-shoulder-bridge"],
    instructorPreferences: {
      teachingMode: "Guided",
      vibration: true,
      countdownSound: false,
      completionSound: true,
    },
  });
  const resetWorkspace = (owner: Account) => {
    setCalendarOfferId(undefined);
    setEditorPhase("All");
    setSequenceHistory([]);
    setSequenceNotice("");
    setLibraryPlanPhase(undefined);
    setAccount(owner);
    setPlan(createDefaultPlan(initialLibrary));
    setDraftPlan(undefined);
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
    });
  };
  const loadWorkspace = async (owner: Account) => {
    setCalendarOfferId(undefined);
    setEditorPhase("All");
    setSequenceHistory([]);
    setSequenceNotice("");
    setLibraryPlanPhase(undefined);
    setLibraryQuery("");
    setLibraryFilter("All");
    libraryScrollOffset.current = 0;
    setHomeDate(localDateKey());
    const raw = await AsyncStorage.getItem(userStorageKey(owner));
    if (!raw) {
      resetWorkspace(owner);
      return;
    }
    try {
      const stored = JSON.parse(raw) as Partial<StoredAppData>;
      setAccount({
        ...owner,
        name: stored.account?.name ?? owner.name,
        phone: stored.account?.phone,
      });
      setSessionResult(null);
      setSelectedSession(null);
      setSessionHistory(stored.sessionHistory ?? []);
      setSchedule(
        (stored.schedule ?? initialSchedule).map((slot) => ({ ...slot, date: slot.date ?? localDateKey() })),
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
      const currentPlan = stored.plan
        ? fillMissingPlanCues(stored.plan, mergedLibrary)
        : createDefaultPlan(mergedLibrary);
      const active = stored.activeTeachingSession;
      setPlan(currentPlan);
      setDraftPlan(stored.plan?.status === "draft" && stored.hasActiveDraft !== false ? currentPlan : undefined);
      setSavedPlans((stored.savedPlans ?? []).map((saved) => fillMissingPlanCues(saved, mergedLibrary)));
      setActiveTeachingSession(active && isRecoverableTeachingSession(active)
        ? { ...active, plan: fillMissingPlanCues(active.plan, mergedLibrary) }
        : undefined);
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
          ...stored.instructorPreferences,
        });
    } catch {
      await AsyncStorage.setItem(
        `${WORKSPACE_RECOVERY_PREFIX}${owner.role}/${owner.email.toLowerCase()}/${Date.now()}`,
        raw,
      ).catch(() => undefined);
      resetWorkspace(owner);
      showAlert(
        "Workspace recovered",
        "Saved data could not be opened, so a fresh workspace was created. You can restore a backup from Profile > App Data.",
      );
    }
  };
  const connectRemoteAccount = async (user: {
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  }) => {
    if (!user.email) throw new Error("The signed-in account has no email address.");
    const fullName = user.user_metadata?.full_name;
    const owner: Account = {
      name:
        typeof fullName === "string" && fullName.trim()
          ? fullName.trim()
          : user.email.split("@")[0],
      email: user.email.toLowerCase(),
      role: "instructor",
    };
    const key = userStorageKey(owner);
    const syncKey = workspaceSyncKey(key);
    const [local, syncValue] = await Promise.all([
      AsyncStorage.getItem(key),
      AsyncStorage.getItem(syncKey),
    ]);
    const cached = readWorkspaceSync(syncValue);
    remoteWorkspaceHydrated.current = "saved";
    try {
      const [workspace] = await listRemoteWorkspaces();
      if (!workspace) throw new Error("Your account does not have an available workspace.");
      const remote = await loadRemoteWorkspaceState<Partial<StoredAppData>>(workspace.id);
      remoteWorkspaceId.current = workspace.id;
      remoteWorkspaceRevision.current = remote.revision;
      if (local && cached?.workspaceId === workspace.id && cached.pending) {
        remoteWorkspaceRevision.current = cached.revision;
        remoteWorkspaceHydrated.current = "error";
        setPersistenceError(remote.revision === cached.revision
          ? "Your local edits were recovered. Cloud sync is pending."
          : "There's a newer cloud version. Your local edits are still here, and you can export a backup.");
      } else {
        if (local && cached?.pending) {
          await AsyncStorage.setItem(
            `${WORKSPACE_RECOVERY_PREFIX}${owner.role}/${owner.email}/${Date.now()}`, local,
          );
        }
        const remoteHasData = remote.data?.account && remote.data?.plan;
        const initial = remoteHasData ? remote.data
          : local && !cached ? JSON.parse(local) as StoredAppData : freshWorkspaceData(owner);
        await AsyncStorage.multiSet([
          [key, JSON.stringify(initial)],
          [syncKey, JSON.stringify({ workspaceId: workspace.id, revision: remote.revision, pending: !remoteHasData })],
        ]);
        if (!remoteHasData) {
          const revision = await saveRemoteWorkspaceState(workspace.id, remote.revision, initial);
          remoteWorkspaceRevision.current = revision;
          await AsyncStorage.setItem(syncKey, JSON.stringify({ workspaceId: workspace.id, revision, pending: false }));
        }
      }
    } catch (error) {
      const offline = /fetch|network|timeout|temporarily unavailable|timed out/i.test(workspaceErrorMessage(error));
      if (!offline || !cached || !local) throw error;
      remoteWorkspaceId.current = cached.workspaceId;
      remoteWorkspaceRevision.current = cached.revision;
      remoteWorkspaceHydrated.current = "error";
      setPersistenceError("You're viewing this device's saved copy. Reconnect to sync changes.");
    }
    await loadWorkspace(owner);
    setSignInNotice(undefined);
    setSignedIn(true);
    setTab("home");
    setScreen("home");
  };
  const showUnavailableAuthLink = () => {
    setSignInNotice({
      title: "Email link unavailable",
      message: "This email link has expired or is invalid. To confirm signup, enter your email and resend verification. For a new reset link, use Forgot password.",
      verification: true,
    });
    setScreen("signin");
  };
  useEffect(() => {
    if (!supabaseConfigured || !supabase) return;
    let active = true;
    void supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (!active) return;
        const url = takeInitialWebAuthUrl();
        if (url && isExpiredAuthLink(url)) {
          showUnavailableAuthLink();
          return;
        }
        const tokens = url ? authTokensFromUrl(url) : null;
        if (tokens?.type === "recovery") {
          // Only enter recovery for the session Supabase accepted from this link.
          if (!error && data.session?.access_token === tokens.accessToken) {
            setScreen("recoverPassword");
          } else {
            showUnavailableAuthLink();
          }
          return;
        }
        if (error) throw error;
        if (data.session?.user) await connectRemoteAccount(data.session.user);
      })
      .catch(() => {
        if (active) {
          remoteWorkspaceId.current = null;
          remoteWorkspaceRevision.current = 0;
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setScreen("recoverPassword");
        return;
      }
      if (event !== "SIGNED_OUT") return;
      remoteWorkspaceId.current = null;
      remoteWorkspaceRevision.current = 0;
      remoteWorkspaceHydrated.current = null;
      lastRemoteSave.current = null;
      setSignInNotice(undefined);
      setSignedIn(false);
      setScreen("welcome");
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const client = supabase;
    if (!supabaseConfigured || !client || Platform.OS === "web") return;
    let active = true;
    const openAuthLink = async (url?: string | null) => {
      if (!active || !url) return;
      if (isExpiredAuthLink(url)) {
        showUnavailableAuthLink();
        return;
      }
      const tokens = authTokensFromUrl(url);
      if (!tokens) return;
      const { error } = await client.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (!active) return;
      if (error) showUnavailableAuthLink();
      else if (tokens.type === "recovery") setScreen("recoverPassword");
      else setScreen("signin");
    };
    void Linking.getInitialURL().then(openAuthLink);
    const listener = Linking.addEventListener("url", ({ url }) => {
      void openAuthLink(url);
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
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
      if (supabaseConfigured) {
        const client = requireSupabase();
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.user) {
          const blockedUntil = recordSignInFailure(attemptKey);
          return blockedUntil
            ? signInBlockedMessage(blockedUntil)
            : error?.message ?? "The email or password is incorrect.";
        }
        signInAttempts.delete(attemptKey);
        await connectRemoteAccount(data.user);
        return null;
      }
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
    remoteWorkspaceId.current = null;
    remoteWorkspaceRevision.current = 0;
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
      if (supabaseConfigured) {
        const client = requireSupabase();
        const { data, error } = await client.auth.signUp({
          email: newAccount.email,
          password,
          options: {
            emailRedirectTo: currentAuthRedirectUrl(),
            data: {
              full_name: newAccount.name,
              workspace_name: "Blush Bodies",
            },
          },
        });
        if (error) return error.message;
        if (!data.session || !data.user) {
          setSignInNotice({
            title: "Confirm your email",
            message: "Open the verification email from Blush Bodies to finish signing up, then sign in.",
            email: newAccount.email,
            verification: true,
          });
          setScreen("signin");
          return null;
        }
        await connectRemoteAccount(data.user);
        return null;
      }
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
      if (supabaseConfigured) {
        const client = requireSupabase();
        const { error: verificationError } = await client.auth.signInWithPassword({
          email: account.email,
          password: currentPassword,
        });
        if (verificationError) return "The current password is incorrect.";
        const { error } = await client.auth.updateUser({ password: newPassword });
        return error?.message ?? null;
      }
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
  const requestRemotePasswordReset = async (
    email: string,
  ): Promise<string | null> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return "Enter the email address used for your account.";
    }
    try {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: currentAuthRedirectUrl() },
      );
      if (error) throw error;
      return null;
    } catch (error) {
      return passwordResetErrorMessage(error);
    }
  };
  const updateRecoveredPassword = async (
    password: string,
  ): Promise<string | null> => {
    const passwordError = passwordValidationError(password);
    if (passwordError) return passwordError;
    try {
      const client = requireSupabase();
      const { data, error } = await client.auth.updateUser({ password });
      if (error || !data.user)
        return error?.message ?? "The recovered account could not be updated.";
      try {
        await connectRemoteAccount(data.user);
      } catch {
        setSignInNotice({
          title: "Password updated",
          message: "Sign in with your new password to open your workspace.",
          email: data.user.email,
        });
        setScreen("signin");
        return null;
      }
      showAlert("Password updated", "Your account is ready to use.", undefined, Check);
      return null;
    } catch {
      return "The recovery link may have expired. Request a new link and try again.";
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
      if (supabaseConfigured) {
        const client = requireSupabase();
        const { data, error } = await client.auth.updateUser({
          email: nextAccount.email,
          data: { full_name: nextAccount.name },
        });
        if (error) return error.message;
        if (!data.user) return "Account details could not be saved.";
        const { error: profileError } = await client
          .from("profiles")
          .update({ full_name: nextAccount.name, updated_at: new Date().toISOString() })
          .eq("id", data.user.id);
        if (profileError) return profileError.message;
        const savedAccount: Account = {
          ...nextAccount,
          email: data.user.email?.toLowerCase() ?? previous.email,
        };
        const saved = storedData(savedAccount);
        const savedKey = userStorageKey(savedAccount);
        await AsyncStorage.setItem(savedKey, JSON.stringify(saved));
        if (savedKey !== oldKey)
          await AsyncStorage.removeItem(oldKey).catch(() => undefined);
        latestStoredData.current = saved;
        setAccount(savedAccount);
        setPersistenceError("");
        setSaveStatus("saved");
        if (savedAccount.email !== nextAccount.email)
          showAlert(
            "Confirm your new email",
            "Supabase sent confirmation links. Your current email remains active until the change is confirmed.",
          );
        return null;
      }
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
      if (supabaseConfigured) {
        const { error } = await requireSupabase().auth.signOut();
        if (error) throw error;
        remoteWorkspaceId.current = null;
        remoteWorkspaceRevision.current = 0;
      }
      setSessionResult(null);
      setSignedIn(false);
      setScreen("welcome");
    } catch {
      showAlert(
        "Could not log out safely",
        "Your latest changes are not saved yet. Please try again.",
      );
    }
  };
  const backupWorkspaceData = async (
    workspace: StoredAppData,
  ): Promise<WorkspaceBackupData> => {
    const libraryMovements = await Promise.all(
      workspace.libraryMovements.map(async (movement) => {
        const imageUri = movement.imageUri;
        if (
          !imageUri ||
          imageUri.startsWith("data:") ||
          !FileSystem.documentDirectory ||
          !imageUri.startsWith(FileSystem.documentDirectory)
        )
          return movement;
        try {
          const fileName =
            imageUri.split("/").pop()?.split(/[?#]/)[0] ??
            `${movement.id}.jpg`;
          const base64 = await FileSystem.readAsStringAsync(imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return { ...movement, backupImage: { fileName, base64 } };
        } catch {
          return movement;
        }
      }),
    );
    return { ...workspace, libraryMovements };
  };
  const restoreWorkspaceData = async (
    workspace: WorkspaceBackupData,
  ): Promise<StoredAppData> => {
    const libraryMovements = await Promise.all(
      workspace.libraryMovements.map(async (movement, index) => {
        const { backupImage, ...restored } = movement;
        if (!backupImage || !FileSystem.documentDirectory) return restored;
        try {
          const directory = `${FileSystem.documentDirectory}movement-images/`;
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
          const safeName = safeBackupImageFileName(
            backupImage.fileName,
            movement.id,
          );
          const destination = `${directory}${Date.now()}-${index}-${safeName}`;
          await FileSystem.writeAsStringAsync(destination, backupImage.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return { ...restored, imageUri: destination };
        } catch {
          return restored;
        }
      }),
    );
    return { ...workspace, libraryMovements };
  };
  const exportWorkspaceBackup = async () => {
    try {
      if (Platform.OS !== "web") {
        if (!FileSystem.cacheDirectory) throw new Error("Backup file storage is unavailable.");
        if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this device.");
      }
      const workspace = await backupWorkspaceData(latestStoredData.current ?? storedData());
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const name = `blush-bodies-backup-${timestamp}.json`;
      const contents = JSON.stringify(createWorkspaceBackupEnvelope(workspace), null, 2);
      if (Platform.OS === "web") {
        downloadBrowserFile(name, contents, "application/json");
        return;
      }
      if (!FileSystem.cacheDirectory)
        throw new Error("Backup file storage is unavailable.");
      const path = `${FileSystem.cacheDirectory}${name}`;
      await FileSystem.writeAsStringAsync(
        path,
        contents,
        { encoding: FileSystem.EncodingType.UTF8 },
      );
      await Sharing.shareAsync(path, {
        dialogTitle: "Save Blush Bodies backup",
        mimeType: "application/json",
        UTI: "public.json",
      });
    } catch (error) {
      showAlert(
        "Backup unavailable",
        error instanceof Error
          ? error.message
          : "The workspace backup could not be created. Please try again.",
      );
    }
  };
  const restoreWorkspaceBackup = async () => {
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      if (!asset) throw new Error("No backup file was selected.");
      const contents = Platform.OS === "web"
        ? await (asset.file ? asset.file.text() : fetch(asset.uri).then((response) => response.text()))
        : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const workspace = parseWorkspaceBackup<WorkspaceBackupData>(
        contents,
        account,
      );
      confirmAction({
        title: "Restore this backup?",
        message: `This file contains ${workspace.savedPlans.length} saved plans, ${workspace.schedule.length} bookings and ${workspace.sessionHistory.length} sessions. It will replace your current ${supabaseConfigured ? "synced" : "local"} workspace.`,
        confirmText: "Restore backup",
        destructive: true,
        onConfirm: () => {
          void (async () => {
            const key = userStorageKey(account);
            let previousWorkspace: string | null = null;
            try {
              await saveChain.current;
              previousWorkspace = await AsyncStorage.getItem(key);
              const restored = await restoreWorkspaceData(
                workspace,
              );
              await AsyncStorage.setItem(
                key,
                JSON.stringify(restored),
              );
              await loadWorkspace(account);
              showAlert("Backup restored", "Your backup was opened on this device.", undefined, Check);
            } catch {
              if (previousWorkspace === null)
                await AsyncStorage.removeItem(key).catch(() => undefined);
              else
                await AsyncStorage.setItem(key, previousWorkspace).catch(
                  () => undefined,
                );
              showAlert(
                "Restore unavailable",
                "The backup could not be restored. Your current workspace was not changed.",
              );
            }
          })();
        },
      });
    } catch (error) {
      showAlert(
        "Backup unavailable",
        error instanceof Error
          ? error.message
          : "The backup could not be opened. Please try again.",
      );
    }
  };
  const clearActiveWorkspace = () => {
    if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
    workspaceSaveTimer.current = null;
    latestStoredData.current = null;
    remoteWorkspaceId.current = null;
    remoteWorkspaceRevision.current = 0;
    remoteWorkspaceHydrated.current = null;
    lastRemoteSave.current = null;
    signInAttempts.delete(signInAttemptKey(account.role, account.email));
    setSignedIn(false);
    resetWorkspace({
      name: "Blush Bodies Instructor",
      email: "coach@blushbodies.com",
      role: "instructor",
    });
    setTab("home");
  };
  const deleteCloudAccount = async (): Promise<string | null> => {
    if (accountDeletionInProgress.current) return null;
    accountDeletionInProgress.current = true;
    try {
      const key = userStorageKey(account);
      const recoveryPrefix = `${WORKSPACE_RECOVERY_PREFIX}${account.role}/${account.email.toLowerCase()}/`;
      const pendingSave = workspaceSaveTimer.current;
      if (pendingSave) {
        clearTimeout(pendingSave);
        workspaceSaveTimer.current = null;
        const latest = latestStoredData.current;
        if (latest) void queueWorkspaceSave(latest).catch(() => undefined);
      }
      await saveChain.current;
      const client = requireSupabase();
      await deleteCurrentAccount();
      clearActiveWorkspace();
      const clearCachedData = async () => {
        const keys = await AsyncStorage.getAllKeys();
        await AsyncStorage.multiRemove([
          key,
          workspaceSyncKey(key),
          legacyWalkthroughStorageKey(account),
          ...keys.filter((item) => item.startsWith(recoveryPrefix)),
        ]);
      };
      const cleanup = await Promise.allSettled([
        clearCachedData(),
        client.auth.signOut({ scope: "local" }),
      ]);
      setSignInNotice({
        title: "Account deleted",
        message: cleanup.some((result) => result.status === "rejected")
          ? "Your account was deleted. This device could not finish clearing its local data."
          : "You have been signed out of Blush Bodies.",
      });
      setScreen("signin");
      return null;
    } catch {
      return "Account deletion could not be confirmed. Check your connection and try again.";
    } finally {
      accountDeletionInProgress.current = false;
    }
  };
  const resetAppData = async () => {
    try {
      await saveChain.current;
      const key = userStorageKey(account);
      if (readWorkspaceSync(await AsyncStorage.getItem(workspaceSyncKey(key)))?.pending) {
        showAlert("Sync pending", "Your edits are still on this device. Sync or export a backup before clearing the cache.");
        return;
      }
      await AsyncStorage.multiRemove([key, workspaceSyncKey(key), legacyWalkthroughStorageKey(account)]);
      if (supabaseConfigured) {
        const { error } = await requireSupabase().auth.signOut();
        if (error) throw error;
      } else {
        const credentials = await readCredentials();
        await writeCredentials(
          credentials.filter(
            (credential) =>
              !(credential.role === account.role && credential.email === account.email),
          ),
        );
      }
      clearActiveWorkspace();
      setScreen("welcome");
    } catch {
      showAlert(
        "Account not deleted",
        "Your account and local data could not be removed. Please try again.",
      );
    }
  };
  const recentlyDeletedCount = pruneRecentlyDeleted(recentlyDeleted).length;
  const calendarOfferSlot = calendarOfferId ? schedule.find((slot) =>
    slot.id === calendarOfferId && slot.status !== "CANCELLED" && slot.status !== "IN PROGRESS" &&
    !isFinishedClass(slot) && isFutureScheduleSlot(slot, new Date())) : undefined;
  const calendarOffer = calendarOfferSlot
    ? <ClassCalendarOffer slot={calendarOfferSlot} dismiss={() => setCalendarOfferId(undefined)} />
    : null;
  const renderLibrary = () => (
    <Library
      back={libraryPlanPhase ? () => {
        setLibraryPlanPhase(undefined);
        setScreen("editor");
      } : undefined}
      movements={libraryMovements}
      favourites={favourites}
      planningPhase={libraryPlanPhase}
      planningPlan={plan}
      query={libraryQuery}
      setQuery={setLibraryQuery}
      filter={libraryFilter}
      setFilter={setLibraryFilter}
      scrollOffset={libraryScrollOffset}
      notice={libraryNotice}
      open={openLibraryMovement}
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
  );
  if (!authReady)
    return (
      <View style={[s.flex, s.authLoading]}>
        <Text style={s.brandTitle}>BLUSH BODIES</Text>
        <Text style={s.sub}>Opening your workspace...</Text>
      </View>
    );
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
        notice={signInNotice}
        resendVerification={async (email) => {
          if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter your account email first.";
          try {
            const { error } = await requireSupabase().auth.resend({
              type: "signup", email, options: { emailRedirectTo: currentAuthRedirectUrl() },
            });
            if (error) return "The verification email could not be requested. Please try again shortly.";
            showAlert("Check your email", "If verification is pending, check your inbox and junk folder for a new link.");
            return null;
          } catch {
            return "The verification service is unavailable. Please try again.";
          }
        }}
        allowSandboxReset={ALLOW_SANDBOX_PASSWORD_RESET && !supabaseConfigured}
        openDemo={
          ALLOW_SANDBOX_PASSWORD_RESET && !supabaseConfigured
            ? openDemoWorkspace
            : undefined
        }
        back={() => {
          setSignInNotice(undefined);
          setScreen("welcome");
        }}
        signup={() => {
          setSignInNotice(undefined);
          setSignupReturnScreen("signin");
          setScreen("signup");
        }}
        resetPassword={(email) => {
          setSignInNotice(undefined);
          setResetEmail(email);
          if (supabaseConfigured) {
            setScreen("forgotPassword");
            return;
          }
          setScreen("resetPassword");
        }}
        complete={(email, password) =>
          authenticate("instructor", email, password)
        }
      />
    );
  if (screen === "forgotPassword")
    return (
      <PasswordResetRequest
        initialEmail={resetEmail}
        back={() => setScreen("signin")}
        send={requestRemotePasswordReset}
        signup={(email) => {
          setResetEmail(email);
          setSignupReturnScreen("forgotPassword");
          setScreen("signup");
        }}
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
  if (screen === "recoverPassword")
    return (
      <RecoveryPasswordReset
        back={async () => {
          await requireSupabase().auth.signOut({ scope: "local" });
          setScreen("signin");
        }}
        complete={updateRecoveredPassword}
      />
    );
  if (screen === "signup")
    return (
      <SignUp
        role="instructor"
        initialEmail={
          signupReturnScreen === "forgotPassword" ? resetEmail : undefined
        }
        back={() => setScreen(signupReturnScreen)}
        complete={register}
      />
    );
  if (screen === "teach" && activeTeachingSession)
    return (
      <TeachingSession
        session={activeTeachingSession}
        preferences={instructorPreferences}
        exit={() => select("home")}
        checkpoint={setActiveTeachingSession}
        finish={(result) => {
          setActiveTeachingSession(undefined);
          if (result.scheduledClassId) {
            setSchedule((current) =>
              setScheduleStatus(current, result.scheduledClassId!, "COMPLETED"),
            );
          }
          setSessionResult(result);
          if (!result.practice) setSessionHistory((current) => [
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
          setSessionResult(completed.practice ? null : completed);
            if (!completed.practice) setSessionHistory((current) => [
              completed,
              ...current.filter(
                (session) => session.startedAt !== completed.startedAt,
              ),
            ]);
            select("home");
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
          key={selectedSession.startedAt}
          result={selectedSession}
          scheduledClass={schedule.find(
            (slot) => slot.id === selectedSession.scheduledClassId,
          )}
          back={() => setScreen(sessionDetailsReturn)}
          saveNotes={(notes) => {
            const updated = { ...selectedSession, notes };
            setSelectedSession(updated);
            setSessionHistory((current) => current.map((session) =>
              session.startedAt === updated.startedAt ? updated : session));
          }}
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
            setScreen(schedulePlanReturn);
          }}
          create={() => openClassCreator("assign")}
          assign={assignPlan}
          scheduleNext={schedulePlanAt}
        />
      </View>
    );
  if (screen === "schedule")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <TopSafeArea />
        {calendarOffer}
        <ScheduleManager
          schedule={displaySchedule.map((slot) => slot.status === "READY" && !playablePlan(slot)
            ? { ...slot, status: "NEEDS PLAN" } : slot)}
          initialEditId={scheduleEditId}
          back={() => {
            const destination = scheduleEditId ? "home" : scheduleReturnScreen;
            setScheduleEditId(undefined);
            setScreen(destination);
          }}
          save={(slot) => {
            const returnHome = Boolean(scheduleEditId);
            saveScheduledClass(slot);
            setScheduleEditId(undefined);
            if (returnHome) setScreen("home");
          }}
          remove={removeScheduledClass}
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
          duplicate={() => duplicatePlan(plan)}
          assign={classReadiness(plan, libraryMovements).ready ? () => {
            setAssignmentSlotId(undefined);
            setSchedulePlanReturn("managePlan");
            setScreen("assign");
          } : undefined}
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
          backup={exportWorkspaceBackup}
          restoreBackup={restoreWorkspaceBackup}
          reset={resetAppData}
          deleteAccount={supabaseConfigured ? deleteCloudAccount : undefined}
          sharedWorkspace={supabaseConfigured}
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
      {saveStatus === "error" && persistenceError ? (
        <View style={s.syncNotice} accessibilityLiveRegion="polite">
          <Text style={[s.sub, s.flex]}>{persistenceError}</Text>
          <Pressable onPress={retryWorkspaceSync} accessibilityRole="button" style={s.syncRetry}>
            <Text style={s.link}>Retry sync</Text>
          </Pressable>
        </View>
      ) : null}
      {screen === "home" || screen === "generated" ? calendarOffer : null}
      <View style={s.flex}>
        {screen === "home" ? (
          <InstructorHome
            schedule={displaySchedule}
            account={account}
            selectedDate={homeDate}
            setSelectedDate={setHomeDate}
            activeSession={activeTeachingSession}
            create={() => openClassCreator("home")}
            assign={(slot) => {
              setAssignmentSlotId(slot.id);
              setSchedulePlanReturn("home");
              setScreen("assign");
            }}
            start={startScheduledClass}
            resume={openActiveTeachingSession}
            review={reviewScheduledClass}
            openSchedule={() => {
              setScheduleReturnScreen("home");
              setScheduleEditId(undefined);
              setScreen("schedule");
            }}
            openProfile={() => select("profile")}
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
            getPlanTitle={(slot) => playablePlan(slot)?.brief.program}
          />
        ) : null}
        {screen === "create" ? (
          <Create
            library={libraryMovements}
            initialClass={schedule.find(
              (slot) => slot.id === assignmentSlotId,
            )}
            back={() => setScreen(classCreatorReturn)}
            generate={(brief, fromScratch) => {
              const draft = createPlan(brief, fromScratch ? [] : libraryMovements);
              if (!fromScratch && !draft.movements.length) {
                confirmAction({
                  title: "No matching movements",
                  message: "Change the class level or equipment, or choose movements yourself.",
                  confirmText: "Build From Scratch",
                  cancelText: "Change Settings",
                  onConfirm: () => openNewDraft(draft),
                  Icon: Info,
                });
              } else openNewDraft(draft);
            }}
          />
        ) : null}
        {screen === "generated" ? (
          <Generated
            plan={plan}
            library={libraryMovements}
            schedule={schedule}
            back={() => select("classes")}
            edit={(phase) => {
              setEditorPhase(phase ?? "Warm-up");
              setScreen("editor");
            }}
            rebuild={() => rebuildPlan(plan)}
            save={savePlan}
            schedulePlan={(slotId) => {
              setAssignmentSlotId(slotId);
              setSchedulePlanReturn("generated");
              setScreen("assign");
            }}
            teach={() => beginTeachingSession(plan, { practice: true })}
          />
        ) : null}
        {screen === "classes" ? (
          <Plans
            plan={draftPlan ?? plan}
            hasActiveDraft={Boolean(draftPlan)}
            savedPlans={savedPlans}
            schedule={schedule}
            lastSession={sessionResult}
            create={() => openClassCreator("classes")}
            open={() => {
              if (!draftPlan) return;
              setEditorPhase(classReadiness(draftPlan, libraryMovements).ready ? "Warm-up" : nextPlanningPhase(draftPlan));
              setAssignmentSlotId(undefined);
              showDraft(draftPlan);
              setScreen("editor");
            }}
            duplicate={() => duplicatePlan(draftPlan ?? plan)}
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
              setScreen("managePlan");
            }}
          />
        ) : null}
        {screen === "editor" ? (
          <View style={showPlansPane ? s.desktopPanes : s.flex}>
          {showPlansPane ? (
            <ScrollView style={s.desktopPlanPane} contentContainerStyle={s.desktopPlanList}>
              <Text style={s.headerTitle}>Plans</Text>
              {[...(draftPlan ? [draftPlan] : []), ...savedPlans].map((candidate) => (
                <Pressable key={candidate.id} accessibilityRole="button"
                  accessibilityState={{ selected: plan.id === candidate.id }}
                  onPress={() => {
                    if (plan.id === candidate.id) return;
                    setPlan(candidate);
                    setEditorPhase("All");
                    setAssignmentSlotId(undefined);
                    setSequenceHistory([]);
                    setSequenceNotice("");
                  }}
                  style={[s.savedPlan, plan.id === candidate.id && s.assignmentSelected]}>
                  <View style={s.flex}>
                    <Text style={s.moveTitle}>{candidate.brief.program}</Text>
                    <Text style={s.sub}>{candidate.brief.week} / {candidate.brief.day} / {candidate.status === "draft" ? "Draft" : `v${candidate.version}`}</Text>
                  </View>
                  <ChevronRight size={18} color={C.rose} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Classes
            key={plan.id}
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
            save={savePlan}
            back={() => plan.status === "saved" ? setScreen("generated") : select("classes")}
            setClassDate={(slot) => showDraft({
              ...plan,
              brief: { ...plan.brief, scheduledDate: slot?.date, scheduledTime: slot?.time },
            })}
            open={(phase) => {
              setLibraryQuery("");
              setLibraryFilter("All");
              libraryScrollOffset.current = 0;
              setLibraryPlanPhase(phase);
              setScreen("library");
            }}
          />
          </View>
        ) : null}
        {screen === "details" ? (
          <View style={showLibraryPane ? s.desktopPanes : s.flex}>
          {showLibraryPane ? <View style={s.desktopLibraryPane}>{renderLibrary()}</View> : null}
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
          </View>
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
        {screen === "library" ? renderLibrary() : null}
        {screen === "insights" ? (
          <Insights
            sessions={sessionHistory}
            schedule={schedule}
            readyForSlot={(slot) => Boolean(playablePlan(slot))}
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
  manualMovementVisual: { backgroundColor: C.white },
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
    alignItems: "center",
    overflow: "hidden",
  },
  appViewport: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    backgroundColor: C.bg,
    overflow: "hidden",
  },
  app: { flex: 1, minWidth: 0, backgroundColor: C.bg },
  flex: { flex: 1, minWidth: 0 },
  page: { paddingHorizontal: 24, paddingBottom: 28, gap: 20 },
  desktopPanes: { flex: 1, flexDirection: "row", minWidth: 0 },
  desktopLibraryPane: { width: 400, minHeight: 0, borderRightWidth: 1, borderRightColor: C.line },
  desktopPlanPane: { width: 290, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: C.line },
  desktopPlanList: { padding: 20, gap: 12 },
  row: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stack: { gap: 10 },
  syncNotice: { paddingHorizontal: 20, paddingVertical: 8, flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: "#F4E3E3" },
  syncRetry: { paddingVertical: 8, paddingHorizontal: 4 },
  calendarOffer: { backgroundColor: C.card, marginHorizontal: 24, marginVertical: 8, padding: 12, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  calendarOfferDismiss: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  welcome: {
    flexGrow: 1,
    backgroundColor: C.bg,
    padding: 24,
    paddingTop: 66,
    paddingBottom: 84,
    justifyContent: "space-between",
    gap: 20,
  },
  welcomeCompact: { paddingTop: 24, paddingBottom: 24, gap: 16 },
  brand: { alignItems: "center", gap: 10 },
  brandTitle: { color: C.rose, fontSize: 14, fontWeight: "800" },
  authLoading: { alignItems: "center", justifyContent: "center", gap: 10 },
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
  artCompact: { height: 132 },
  artDiskCompact: { top: 15, width: 100, height: 100 },
  artHeadCompact: { top: 15, width: 37, height: 37 },
  artBodyCompact: { top: 63, width: 105, height: 55 },
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
  heroCompact: { fontSize: 27, lineHeight: 31 },
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
  forgotPasswordAction: {
    alignSelf: "flex-end",
    marginTop: -6,
    paddingVertical: 6,
    paddingLeft: 12,
  },
  forgotPasswordText: {
    color: C.rose,
    fontSize: 13,
    fontWeight: "800",
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
  compactHeaderTitle: { fontSize: 21, flexShrink: 1 },
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
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingRight: 16,
  },
  classCardShape: { borderRadius: 15, overflow: "hidden" },
  swipeCardContent: { backgroundColor: C.card },
  swipeActions: {
    width: 156,
    flexDirection: "row",
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
  planDisclosure: { borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.card },
  planDisclosureButton: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  planDisclosureBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  planDetailFields: { flexDirection: "row", gap: 10 },
  planOption: { minHeight: 44, justifyContent: "center" },
  planOptionText: { color: C.muted, fontSize: 13, fontWeight: "800", textAlign: "center" },
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
  sequenceHeader: { paddingHorizontal: 24, paddingBottom: 12, gap: 8, backgroundColor: C.bg },
  sequencePage: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24, gap: 12 },
  sequenceFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
  },
  sequenceChecks: { maxHeight: 120 },
  phaseTimingStrip: {
    borderRadius: 12,
    backgroundColor: C.paleSage,
    flexDirection: "row",
    padding: 4,
  },
  phaseTimingItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  phaseTimingItemOn: { backgroundColor: C.card },
  phaseTimingLabel: { color: C.muted, fontSize: 11, fontWeight: "800", textAlign: "center" },
  phaseTimingValue: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
  },
  addMovementButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#DFC8CE",
    borderRadius: 12,
    backgroundColor: "#FFF8F8",
    paddingHorizontal: 12,
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
  detailCard: {
    width: "100%",
    alignSelf: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E4CDD1",
    backgroundColor: C.card,
    overflow: "hidden",
    shadowColor: "#6F4652",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 3,
  },
  detailCardAccent: { height: 7, backgroundColor: C.rose },
  detailCardTop: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailCardEyebrow: {
    color: C.rose,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  detailCardStatus: { color: C.muted, fontSize: 10, marginTop: 3 },
  detailFavourite: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FAEEEE",
    alignItems: "center",
    justifyContent: "center",
  },
  detailArtwork: {
    width: "100%",
    aspectRatio: 1.6,
    backgroundColor: "#F4E3E3",
    overflow: "hidden",
  },
  detailArtworkImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#F4E3E3",
  },
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
  detailArtworkStep: {
    position: "absolute",
    right: 12,
    top: 12,
    borderRadius: 10,
    backgroundColor: "rgba(78,63,68,0.82)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  detailArtworkStepText: {
    color: C.white,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  detailCardBody: { padding: 16, gap: 13 },
  movementTitle: { color: C.ink, fontSize: 28, fontWeight: "800" },
  detailTime: { color: C.ink, fontSize: 14, fontWeight: "800" },
  detailFactRow: {
    minHeight: 54,
    borderRadius: 13,
    backgroundColor: "#F8F2F0",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailFactIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  detailFactLabel: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  primaryCueCard: {
    minHeight: 86,
    borderRadius: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.rose,
    backgroundColor: "#FBF1F1",
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  primaryCueLabel: {
    color: C.rose,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 7,
  },
  primaryCueText: { color: C.ink, fontSize: 15, lineHeight: 21, fontWeight: "700" },
  primaryCuePending: { color: C.gold, fontSize: 13, lineHeight: 19, fontWeight: "700" },
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
  teachContentVeryCompact: { paddingHorizontal: 10, paddingBottom: 4 },
  teachContentLarge: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
  },
  teachTop: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teachTopCompact: { minHeight: 44 },
  teachTopVeryCompact: { minHeight: 40 },
  teachClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  teachSequence: { fontSize: 11 },
  teachProgress: { alignItems: "flex-end", gap: 3, flexShrink: 1 },
  teachStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 12,
    backgroundColor: C.paleSage,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  teachStatusPaused: { backgroundColor: "#FBF3F3" },
  teachStatusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.sage },
  teachStatusDotPaused: { backgroundColor: C.rose },
  teachStatusLabel: { color: "#4D6658", fontSize: 10, fontWeight: "800" },
  teachStatusLabelPaused: { color: C.rose },
  teachStepLabel: { color: C.muted, fontSize: 11, fontWeight: "500" },
  teachTimerRow: {
    flexDirection: "row",
    marginTop: 4,
    backgroundColor: C.card,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.line,
    overflow: "hidden",
  },
  teachTimerBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  teachTimerBlockCompact: { gap: 8, paddingVertical: 3 },
  teachTimerMovement: {
    backgroundColor: "#FBF3F3",
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
  teachTimerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.paleSage,
  },
  teachTimerMovementIcon: { backgroundColor: "#F4E5E7" },
  teachTimerCopy: { flexShrink: 1, gap: 1 },
  teachTimerLabel: { color: C.muted, fontSize: 11, lineHeight: 14, fontWeight: "700" },
  teachTimer: { color: C.ink, fontSize: 23, lineHeight: 26, fontWeight: "800", fontVariant: ["tabular-nums"] },
  teachMovementTime: { color: C.rose },
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
  movementCardVeryCompact: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 3,
    borderRadius: 15,
  },
  movementCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  movementArtwork: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    borderRadius: 13,
    backgroundColor: C.white,
    marginTop: 14,
    overflow: "hidden",
  },
  movementArtworkManual: { minHeight: 270 },
  movementArtworkManualCompact: { minHeight: 152 },
  movementArtworkVeryCompact: { marginTop: 7 },
  movementArtworkImage: {
    width: "100%",
    height: "100%",
    backgroundColor: C.white,
  },
  movementCardTitle: { marginTop: 12 },
  movementCardTitleCompact: { fontSize: 20, marginTop: 6 },
  movementCardTitleVeryCompact: { fontSize: 18, lineHeight: 22, marginTop: 5 },
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
  movementCueVeryCompact: {
    minHeight: 50,
    marginTop: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  movementCueTextVeryCompact: { fontSize: 12, lineHeight: 16 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginTop: 8,
  },
  controlsCompact: { marginTop: 7 },
  controlsVeryCompact: { marginTop: 4 },
  teachControlGroup: { width: 76, alignItems: "center", gap: 6 },
  navControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  navControlVeryCompact: { width: 42, height: 42, borderRadius: 21 },
  controlLabel: { fontSize: 11 },
  hold: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  holdVeryCompact: { width: 48, height: 48, borderRadius: 24 },
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
  upNextVeryCompact: { height: 64, marginTop: 5, paddingLeft: 11, paddingVertical: 3 },
  upNextComplete: { paddingRight: 14 },
  upText: { fontSize: 13, marginTop: 3 },
  upTextVeryCompact: { marginTop: 1, lineHeight: 16 },
  upNextSide: { color: C.muted, fontSize: 10, marginTop: 2 },
  upNextSideVeryCompact: { marginTop: 1, lineHeight: 12 },
  upNextMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  upNextMetaVeryCompact: { marginTop: 2 },
  upTime: { color: C.muted, fontSize: 10 },
  upNextTextVeryCompact: { lineHeight: 12 },
  upNextVisual: {
    width: 128,
    height: 76,
    marginVertical: -6,
    backgroundColor: C.white,
    overflow: "hidden",
  },
  upNextVisualCompact: { width: 108 },
  upNextVisualVeryCompact: { width: 92, height: 64, marginVertical: -3 },
  upNextVisualManual: {
    borderLeftWidth: 1,
    borderLeftColor: C.line,
  },
  upNextVisualImage: {
    width: "100%",
    height: "100%",
    backgroundColor: C.white,
  },
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
  endClassVeryCompact: { height: 40, marginTop: 2 },
  summaryHero: {
    minHeight: 170,
    backgroundColor: C.card,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  summaryEarly: { backgroundColor: "#F4E3E3" },
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
  libraryRowMain: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
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
  confirmationBackdrop: {
    alignItems: "center",
    justifyContent: "center",
  },
  confirmationCard: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "100%",
    flexGrow: 0,
    borderRadius: 20,
    backgroundColor: C.bg,
  },
  confirmationContent: { padding: 24, gap: 16 },
  confirmationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmationCopy: { color: C.muted, fontSize: 14, lineHeight: 21 },
  confirmationDestructive: { backgroundColor: "#A34848" },
  backupAction: {
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EBC8CC",
    backgroundColor: "#FFF9F9",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  backupTitle: { color: C.ink, fontSize: 13, fontWeight: "800" },
  backupCopy: { color: C.muted, fontSize: 11, marginTop: 3 },
  actionDisabled: { opacity: 0.55 },
  detailDeleteAction: { marginTop: 10 },
  dangerText: { color: "#A34848", fontSize: 13, fontWeight: "800" },
});

export default function App() {
  const { width } = useWindowDimensions();
  const [wideLayout, setWideLayout] = useState(false);
  const appWidth =
    Platform.OS === "web"
      ? Math.min(width, wideLayout ? 980 : 480)
      : width >= 700
        ? Math.min(width, 680)
        : null;
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={s.appRoot}>
        <View
          style={[
            s.appViewport,
            appWidth !== null && { width: appWidth },
          ]}
        >
          <AppDialogProvider>
            <BlushBodiesApp setWideLayout={setWideLayout} />
          </AppDialogProvider>
        </View>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
