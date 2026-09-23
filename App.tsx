import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Calendar, type DateData } from "react-native-calendars";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  House,
  LibraryBig,
  List,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
  UserRound,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Tab = "home" | "classes" | "library" | "insights" | "profile";
type ClientTab =
  "clientHome" | "clientBook" | "clientPass" | "clientStudio" | "clientProfile";
type Role = "instructor" | "client";
type Screen =
  | Tab
  | ClientTab
  | "welcome"
  | "role"
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
  | "assign"
  | "schedule"
  | "managePlan"
  | "dataSettings"
  | "changePassword";
type Account = { name: string; email: string; role: Role; phone?: string };
type Phase = "Warm-up" | "Main" | "Cool-down";
type PlanBrief = {
  program: string;
  week: string;
  day: string;
  scheduledDate?: string;
  scheduledTime?: string;
  energy: string;
  equipment: string[];
};
type PlanMovement = {
  id: string;
  title: string;
  position: string;
  duration: number;
  phase: Phase;
  cue: string;
};
type ClassPlan = {
  id: string;
  version: number;
  brief: PlanBrief;
  movements: PlanMovement[];
  status: "draft" | "saved";
};
type SessionResult = {
  startedAt: number;
  endedAt: number;
  completed: number;
  total: number;
  plannedSeconds: number;
  actualSeconds: number;
  planId?: string;
  program?: string;
  notes?: string;
};
type ScheduledClass = {
  id: string;
  date: string;
  time: string;
  level: string;
  lesson: string;
  status: "READY" | "NEEDS PLAN" | "DRAFT";
  planId?: string;
};
type LibraryMovement = {
  id: string;
  name: string;
  position: string;
  level: string;
  equipment: string;
  duration: number;
  cues: string[];
};
type InstructorPreferences = {
  teachingMode: "Guided" | "Minimal";
  vibration: boolean;
  offline: boolean;
};
type ClientPreferences = {
  bookingReminders: boolean;
  studioUpdates: boolean;
  emailReceipts: boolean;
};
type ClientClass = {
  id: number;
  date: string;
  time: string;
  name: string;
  level: string;
  studio: string;
  coach: string;
  capacity: number;
  bookedCount: number;
};
type LocalCredential = {
  name: string;
  email: string;
  role: Role;
  salt: string;
  passwordHash: string;
};
type BookingUpdateResult =
  | "cancelled"
  | "booked"
  | "reminder-scheduled"
  | "reminder-denied"
  | "reminder-unavailable"
  | "reminder-too-late"
  | "reminder-error";
type NotificationsModule = typeof import("expo-notifications");
type NotificationPermissions = Awaited<
  ReturnType<NotificationsModule["getPermissionsAsync"]>
>;
type StoredAppData = {
  account: Account;
  booked: number[];
  waitlisted: number[];
  plan: ClassPlan;
  savedPlans: ClassPlan[];
  sessionHistory: SessionResult[];
  schedule: ScheduledClass[];
  libraryMovements: LibraryMovement[];
  favourites: string[];
  instructorPreferences: InstructorPreferences;
  clientPreferences: ClientPreferences;
};
const LEGACY_STORAGE_KEY = "@blush-bodies/app-data-v1";
const USER_STORAGE_PREFIX = "@blush-bodies/user-data-v2/";
const userStorageKey = (account: Pick<Account, "role" | "email">) =>
  `${USER_STORAGE_PREFIX}${account.role}/${account.email.toLowerCase()}`;
const CREDENTIALS_KEY = "blush-bodies-local-credentials-v1";
const STUDIO_SCHEDULE_KEY = "@blush-bodies/studio-schedule-v1";
const hashPassword = (password: string, salt: string) =>
  Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
const readCredentials = async (): Promise<LocalCredential[]> => {
  const raw =
    Platform.OS === "web"
      ? await AsyncStorage.getItem(CREDENTIALS_KEY)
      : await SecureStore.getItemAsync(CREDENTIALS_KEY);
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
  await SecureStore.setItemAsync(CREDENTIALS_KEY, value);
};
const deleteCredentials = async (): Promise<void> => {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(CREDENTIALS_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
};
const BOOKING_REMINDER_CHANNEL = "booking-reminders";
const IS_EXPO_GO = Constants.expoGoConfig !== null;
let notificationsPromise: Promise<NotificationsModule> | undefined;
const loadNotifications = async (): Promise<NotificationsModule | null> => {
  if (IS_EXPO_GO) return null;
  notificationsPromise ??= import("expo-notifications").then(
    (Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      return Notifications;
    },
  );
  return notificationsPromise;
};
const notificationsAllowed = (
  permissions: NotificationPermissions,
  Notifications: NotificationsModule,
) => {
  const iosStatus = permissions.ios?.status;
  return (
    permissions.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
};
const ensureNotificationPermission = async () => {
  const Notifications = await loadNotifications();
  if (!Notifications) return "unavailable" as const;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(BOOKING_REMINDER_CHANNEL, {
      name: "Booking reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let permissions = await Notifications.getPermissionsAsync();
  if (!notificationsAllowed(permissions, Notifications))
    permissions = await Notifications.requestPermissionsAsync();
  return notificationsAllowed(permissions, Notifications)
    ? ("granted" as const)
    : ("denied" as const);
};
const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateKeyFromOffset = (days: number) => {
  const date = new Date();
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
const clientClassStart = (item: ClientClass) => {
  const [year, month, day] = item.date.split("-").map(Number);
  const [hours, minutes] = item.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};
const cancelBookingReminders = async (owner: Account, classId?: number) => {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const ownerKey = userStorageKey(owner);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const matching = scheduled.filter(
    (request) =>
      request.content.data?.type === "booking-reminder" &&
      request.content.data?.owner === ownerKey &&
      (classId === undefined || request.content.data?.classId === classId),
  );
  await Promise.all(
    matching.map((request) =>
      Notifications.cancelScheduledNotificationAsync(request.identifier),
    ),
  );
};
const scheduleBookingReminder = async (item: ClientClass, owner: Account) => {
  const Notifications = await loadNotifications();
  if (!Notifications) throw new Error("Notifications require a native build.");
  await cancelBookingReminders(owner, item.id);
  const reminderAt = clientClassStart(item).getTime() - 60 * 60 * 1000;
  const seconds = Math.floor((reminderAt - Date.now()) / 1000);
  if (seconds <= 0) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Class reminder: ${item.name}`,
      body: `Your class starts at ${item.time} in ${item.studio}.`,
      data: {
        type: "booking-reminder",
        classId: item.id,
        owner: userStorageKey(owner),
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId:
        Platform.OS === "android" ? BOOKING_REMINDER_CHANNEL : undefined,
    },
  });
  return true;
};
const cancelAllBookingReminders = async () => {
  const Notifications = await loadNotifications();
  if (Notifications) await Notifications.cancelAllScheduledNotificationsAsync();
};
const saturdayOffset = (6 - new Date().getDay() + 7) % 7;
const clientClasses: ClientClass[] = [
  {
    id: 101,
    date: dateKeyFromOffset(0),
    time: "17:30",
    name: "Pilates Foundations",
    level: "Beginner",
    studio: "Studio One",
    coach: "Nandi",
    capacity: 12,
    bookedCount: 8,
  },
  {
    id: 102,
    date: dateKeyFromOffset(0),
    time: "18:30",
    name: "Strong Flow",
    level: "Intermediate",
    studio: "Studio Two",
    coach: "Mia",
    capacity: 10,
    bookedCount: 10,
  },
  {
    id: 103,
    date: dateKeyFromOffset(0),
    time: "19:30",
    name: "Stretch & Reset",
    level: "All levels",
    studio: "Studio One",
    coach: "Nandi",
    capacity: 14,
    bookedCount: 6,
  },
  {
    id: 201,
    date: dateKeyFromOffset(1),
    time: "07:00",
    name: "Morning Flow",
    level: "All levels",
    studio: "Studio One",
    coach: "Mia",
    capacity: 12,
    bookedCount: 7,
  },
  {
    id: 202,
    date: dateKeyFromOffset(1),
    time: "17:30",
    name: "Pilates Foundations",
    level: "Beginner",
    studio: "Studio One",
    coach: "Nandi",
    capacity: 12,
    bookedCount: 9,
  },
  {
    id: 203,
    date: dateKeyFromOffset(1),
    time: "17:30",
    name: "Restore & Stretch",
    level: "All levels",
    studio: "Studio Two",
    coach: "Mia",
    capacity: 10,
    bookedCount: 4,
  },
  {
    id: 301,
    date: dateKeyFromOffset(saturdayOffset),
    time: "09:00",
    name: "Strong Flow",
    level: "Intermediate",
    studio: "Studio Two",
    coach: "Mia",
    capacity: 10,
    bookedCount: 5,
  },
  {
    id: 302,
    date: dateKeyFromOffset(saturdayOffset),
    time: "10:30",
    name: "Stretch & Reset",
    level: "All levels",
    studio: "Studio One",
    coach: "Nandi",
    capacity: 14,
    bookedCount: 11,
  },
];
const publishedClassId = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return 1_000_000 + (hash % 900_000_000);
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
const initialLibrary: LibraryMovement[] = [
  {
    id: "side-leg-lift",
    name: "Side Leg Lift",
    position: "Side-lying",
    level: "Beginner",
    equipment: "Mat",
    duration: 120,
    cues: [
      "Set up on the supporting side.",
      "Lift the top leg to hip height.",
      "Keep the core steady and shoulders relaxed.",
      "Lower with control.",
    ],
  },
  {
    id: "clamshell",
    name: "Clamshell",
    position: "Side-lying",
    level: "Beginner",
    equipment: "Mat",
    duration: 120,
    cues: [
      "Stack the hips and bend the knees.",
      "Keep the feet together.",
      "Open the top knee without rolling back.",
      "Close with control.",
    ],
  },
  {
    id: "hundred",
    name: "The Hundred",
    position: "Supine",
    level: "Intermediate",
    equipment: "Mat",
    duration: 180,
    cues: [
      "Find a supported curl.",
      "Reach through the fingertips.",
      "Pump the arms with the breath.",
    ],
  },
  {
    id: "single-leg-stretch",
    name: "Single Leg Stretch",
    position: "Supine",
    level: "Intermediate",
    equipment: "Mat",
    duration: 120,
    cues: [
      "Draw one knee toward the chest.",
      "Extend the opposite leg.",
      "Switch smoothly without rocking the pelvis.",
    ],
  },
  {
    id: "spine-twist",
    name: "Spine Twist",
    position: "Seated",
    level: "Beginner",
    equipment: "Mat",
    duration: 120,
    cues: [
      "Sit tall through the crown.",
      "Rotate from the ribs.",
      "Return to centre with control.",
    ],
  },
  {
    id: "donkey-kick",
    name: "Donkey Kick",
    position: "Kneeling",
    level: "Intermediate",
    equipment: "Mat",
    duration: 120,
    cues: [
      "Set the hands under the shoulders.",
      "Keep the pelvis level.",
      "Press the heel upward without arching the back.",
    ],
  },
];
const initialSchedule: ScheduledClass[] = [
  {
    id: "slot-0800",
    date: dateKeyFromOffset(0),
    time: "08:00",
    level: "Beginner",
    lesson: "Week 2 · Day 4",
    status: "NEEDS PLAN",
  },
  {
    id: "slot-1000",
    date: dateKeyFromOffset(0),
    time: "10:00",
    level: "Intermediate",
    lesson: "Week 1 · Day 3",
    status: "NEEDS PLAN",
  },
  {
    id: "slot-1200",
    date: dateKeyFromOffset(0),
    time: "12:00",
    level: "Beginner",
    lesson: "Week 2 · Day 4",
    status: "NEEDS PLAN",
  },
  {
    id: "slot-1700",
    date: dateKeyFromOffset(0),
    time: "17:00",
    level: "Intermediate",
    lesson: "Week 3 · Day 1",
    status: "DRAFT",
  },
  {
    id: "slot-1830",
    date: dateKeyFromOffset(0),
    time: "18:30",
    level: "Beginner",
    lesson: "Week 2 · Day 5",
    status: "NEEDS PLAN",
  },
];
const slots = [
  ["08:00", "Beginner", "Week 2 · Day 4", "READY"],
  ["10:00", "Intermediate", "Week 1 · Day 3", "NEEDS PLAN"],
  ["12:00", "Beginner", "Week 2 · Day 4", "READY"],
  ["17:00", "Intermediate", "Week 3 · Day 1", "DRAFT"],
  ["18:30", "Beginner", "Week 2 · Day 5", "READY"],
];
const moves = [
  ["Breath & Centre", "Standing", "00:45"],
  ["Shoulder Rolls", "Standing", "00:45"],
  ["Cat Cow", "Hands & knees", "01:00"],
  ["Hip Circles", "Standing", "01:10"],
  ["Roll Down", "Standing", "01:20"],
];
const fmt = (n: number) =>
  String(Math.floor(Math.max(0, n) / 60)).padStart(2, "0") +
  ":" +
  String(Math.max(0, n) % 60).padStart(2, "0");
const planTotal = (plan: ClassPlan) =>
  plan.movements.reduce((total, movement) => total + movement.duration, 0);
const phaseTotal = (plan: ClassPlan, phase: Phase) =>
  plan.movements
    .filter((movement) => movement.phase === phase)
    .reduce((total, movement) => total + movement.duration, 0);
const positionGroup = (position: string) => {
  const normalized = position.toLowerCase();
  if (normalized.includes("standing")) return "Standing";
  if (normalized.includes("kneeling") || normalized.includes("knees"))
    return "Kneeling";
  if (normalized.includes("seated")) return "Seated";
  if (normalized.includes("side-lying") || normalized.includes("sidelying"))
    return "Side-lying";
  if (normalized.includes("back") || normalized.includes("supine"))
    return "Lying on back";
  if (normalized.includes("front") || normalized.includes("prone"))
    return "Lying on front";
  return position;
};
const positionOrder: Record<Phase, string[]> = {
  "Warm-up": [
    "Standing",
    "Kneeling",
    "Seated",
    "Side-lying",
    "Lying on back",
    "Lying on front",
  ],
  Main: [
    "Standing",
    "Kneeling",
    "Side-lying",
    "Seated",
    "Lying on front",
    "Lying on back",
  ],
  "Cool-down": [
    "Seated",
    "Kneeling",
    "Side-lying",
    "Lying on front",
    "Lying on back",
    "Standing",
  ],
};
const orderMovementsByPosition = (movements: PlanMovement[]) => {
  const phases: Phase[] = ["Warm-up", "Main", "Cool-down"];
  return phases.flatMap((phase) =>
    movements
      .map((movement, originalIndex) => ({ movement, originalIndex }))
      .filter(({ movement }) => movement.phase === phase)
      .sort((a, b) => {
        const order = positionOrder[phase];
        const aRank = order.indexOf(positionGroup(a.movement.position));
        const bRank = order.indexOf(positionGroup(b.movement.position));
        const normalizedARank = aRank < 0 ? order.length : aRank;
        const normalizedBRank = bRank < 0 ? order.length : bRank;
        return (
          normalizedARank - normalizedBRank ||
          a.movement.position.localeCompare(b.movement.position) ||
          a.originalIndex - b.originalIndex
        );
      })
      .map(({ movement }) => movement),
  );
};
const createPlan = (brief: PlanBrief): ClassPlan => ({
  id: `BB-${Date.now()}`,
  version: 1,
  brief,
  status: "draft",
  movements: orderMovementsByPosition([
    {
      id: "breath-centre",
      title: "Breath & Centre",
      position: "Standing",
      duration: 60,
      phase: "Warm-up",
      cue: "Settle the breath and find a tall neutral posture.",
    },
    {
      id: "shoulder-rolls",
      title: "Shoulder Rolls",
      position: "Standing",
      duration: 60,
      phase: "Warm-up",
      cue: "Move slowly and keep the neck relaxed.",
    },
    {
      id: "cat-cow",
      title: "Cat Cow",
      position: "Hands & knees",
      duration: 90,
      phase: "Warm-up",
      cue: "Move one vertebra at a time with the breath.",
    },
    {
      id: "roll-down",
      title: "Roll Down",
      position: "Standing",
      duration: 90,
      phase: "Warm-up",
      cue: "Soften the knees and rebuild the spine with control.",
    },
    {
      id: "side-leg-right",
      title: "Side Leg Lift · Right",
      position: "Left side-lying",
      duration: 240,
      phase: "Main",
      cue: "Raise the right leg to hip height with a steady core.",
    },
    {
      id: "side-leg-left",
      title: "Side Leg Lift · Left",
      position: "Right side-lying",
      duration: 240,
      phase: "Main",
      cue: "Raise the left leg to hip height with a steady core.",
    },
    {
      id: "clamshell-right",
      title: "Clamshell · Right",
      position: "Left side-lying",
      duration: 240,
      phase: "Main",
      cue: "Keep the feet together and open the right knee.",
    },
    {
      id: "clamshell-left",
      title: "Clamshell · Left",
      position: "Right side-lying",
      duration: 240,
      phase: "Main",
      cue: "Keep the feet together and open the left knee.",
    },
    {
      id: "hundred",
      title: "The Hundred",
      position: "Lying on back",
      duration: 300,
      phase: "Main",
      cue: "Reach long through the fingertips and breathe evenly.",
    },
    {
      id: "single-leg",
      title: "Single Leg Stretch",
      position: "Lying on back",
      duration: 300,
      phase: "Main",
      cue: "Keep the pelvis steady as the legs exchange.",
    },
    {
      id: "donkey-kick",
      title: "Donkey Kick",
      position: "Hands & knees",
      duration: 300,
      phase: "Main",
      cue: "Press through the heel without changing the spine.",
    },
    {
      id: "spine-twist",
      title: "Spine Twist",
      position: "Seated",
      duration: 240,
      phase: "Main",
      cue: "Grow tall before rotating from the waist.",
    },
    {
      id: "figure-four",
      title: "Figure Four Stretch",
      position: "Lying on back",
      duration: 120,
      phase: "Cool-down",
      cue: "Keep the pelvis heavy and relax into the hip stretch.",
    },
    {
      id: "supine-twist",
      title: "Supine Twist",
      position: "Lying on back",
      duration: 90,
      phase: "Cool-down",
      cue: "Let the shoulders stay heavy as the knees lower.",
    },
    {
      id: "closing-breath",
      title: "Closing Breath",
      position: "Lying on back",
      duration: 90,
      phase: "Cool-down",
      cue: "Return to an easy breath and release tension.",
    },
  ]),
});

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
function Welcome({ choose }: { choose: () => void }) {
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
        <Main label="Get Started" onPress={choose} />
        <Outline label="Log In" onPress={choose} />
      </View>
    </View>
  );
}
function SignIn({
  back,
  complete,
  signup,
  resetPassword,
  role,
}: {
  back: () => void;
  complete: (email: string, password: string) => Promise<string | null>;
  signup: () => void;
  resetPassword: () => void;
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
            keyboardType="email-address"
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
            placeholder="Enter password"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <Main
            label={submitting ? "Checking Account..." : "Sign In"}
            onPress={submit}
          />
          <Pressable accessibilityRole="button" onPress={signup}>
            <Text style={s.forgot}>Create a new account</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={resetPassword}>
            <Text style={s.forgot}>Forgot password?</Text>
          </Pressable>
        </View>
        <View style={s.demoNote}>
          <Text style={s.whyLabel}>DEMO SESSION</Text>
          <Text style={s.whyCopy}>
            Local prototype accounts are verified securely on this device.
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
}: {
  back: () => void;
  reset: (email: string, password: string) => Promise<string | null>;
  role: Role;
}) {
  const [email, setEmail] = useState("");
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
    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      setError(
        "Use at least 8 characters with uppercase, lowercase and a number.",
      );
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
            keyboardType="email-address"
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
    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      setError(
        "Use at least 8 characters with uppercase, lowercase and a number.",
      );
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
            keyboardType="email-address"
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
            placeholder="Create password"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          {error ? <Text style={s.formError}>{error}</Text> : null}
          <Main
            label={submitting ? "Creating Account..." : "Create Account"}
            onPress={submit}
          />
        </View>
        <View style={s.demoNote}>
          <Text style={s.whyLabel}>PROTOTYPE ACCOUNT</Text>
          <Text style={s.whyCopy}>
            Your profile and encrypted local credentials stay on this device.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
function Home({
  create,
  teach,
  account,
  plan,
}: {
  create: () => void;
  teach: () => void;
  account: Account;
  plan: ClassPlan;
}) {
  const firstName = account.name.split(" ")[0];
  const ready = plan.status === "saved";
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.row}>
        <View style={s.flex}>
          <Text style={s.title}>Good morning, {firstName}</Text>
          <Text style={s.sub}>
            5 classes today ·{" "}
            {ready ? "1 reviewed plan ready" : "plan review needed"}
          </Text>
        </View>
        <View style={s.avatar}>
          <UserRound size={20} color={C.rose} />
        </View>
      </View>
      <View style={s.days}>
        {[
          ["Mon", "15"],
          ["Tue", "16"],
          ["Wed", "17"],
          ["Thu", "18"],
          ["Fri", "19"],
        ].map(([d, n]) => (
          <View key={d} style={[s.day, d === "Wed" && s.dayOn]}>
            <Text style={[s.dayText, d === "Wed" && s.roseText]}>{d}</Text>
            <Text style={[s.dayNumber, d === "Wed" && s.roseText]}>{n}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={ready ? teach : create} style={s.todayPlan}>
        <View style={s.flex}>
          <Text style={s.whyLabel}>NEXT PLAN</Text>
          <Text style={s.moveTitle}>{plan.brief.program}</Text>
          <Text style={s.sub}>
            {plan.brief.week} · {plan.brief.day} · {fmt(planTotal(plan))}
          </Text>
        </View>
        <Pill label={ready ? "READY" : "DRAFT"} active green={ready} />
      </Pressable>
      <View style={s.row}>
        <Text style={s.section}>Today's Classes</Text>
        <Pressable onPress={create} style={s.plan}>
          <Plus size={17} color={C.white} />
          <Text style={s.planText}>Plan Class</Text>
        </Pressable>
      </View>
      <View style={s.stack}>
        {slots.map((slot) => {
          const isReady = slot[3] === "READY";
          return (
            <Pressable
              key={slot[0]}
              onPress={isReady ? teach : create}
              style={s.classCard}
            >
              <View style={[s.rail, isReady ? s.readyRail : s.planRail]} />
              <View style={s.time}>
                <Text style={s.timeText}>{slot[0]}</Text>
                <Text style={s.duration}>45 min</Text>
              </View>
              <View style={s.flex}>
                <Text style={s.level}>{slot[1]}</Text>
                <Text style={s.week}>{slot[2]}</Text>
              </View>
              <View style={s.action}>
                <Pill label={slot[3]} active green={isReady} />
                {isReady ? (
                  <Pressable onPress={teach} style={s.start}>
                    <Play size={14} color={C.white} fill={C.white} />
                    <Text style={s.startText}>Start</Text>
                  </Pressable>
                ) : (
                  <Outline label="Plan" onPress={create} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
function InstructorHome({
  schedule,
  account,
  plan,
  create,
  teach,
  assign,
  start,
  modify,
  remove,
  getPlanTitle,
}: {
  schedule: ScheduledClass[];
  account: Account;
  plan: ClassPlan;
  create: () => void;
  teach: () => void;
  assign: () => void;
  start: (slot: ScheduledClass) => void;
  modify: (slot: ScheduledClass) => void;
  remove: (slot: ScheduledClass) => void;
  getPlanTitle: (planId?: string) => string | undefined;
}) {
  const firstName = account.name.split(" ")[0];
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const visibleSchedule = schedule.filter((item) => item.date === selectedDate);
  const readyCount = visibleSchedule.filter((item) => item.planId).length;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const upcomingDays = Array.from({ length: 5 }, (_, offset) => {
    const key = dateKeyFromOffset(offset);
    const date = dateFromKey(key);
    return {
      key,
      day: date.toLocaleDateString("en-ZA", { weekday: "short" }),
      number: String(date.getDate()),
    };
  });
  return (
    <ScrollView contentContainerStyle={s.page}>
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
      <Pressable
        onPress={plan.status === "saved" ? assign : create}
        style={s.todayPlan}
      >
        <View style={s.flex}>
          <Text style={s.whyLabel}>CURRENT SAVED PLAN</Text>
          <Text style={s.moveTitle}>{plan.brief.program}</Text>
          <Text style={s.sub}>
            {plan.brief.week} · {plan.brief.day} · {fmt(planTotal(plan))}
          </Text>
        </View>
        <Pill
          label={plan.status === "saved" ? "ASSIGN" : "SAVE"}
          active
          green={plan.status === "saved"}
        />
      </Pressable>
      <View style={s.row}>
        <Text style={s.section}>{classDateLabel(selectedDate)} Classes</Text>
        <Pressable onPress={create} style={s.plan}>
          <Plus size={17} color={C.white} />
          <Text style={s.planText}>Plan Class</Text>
        </Pressable>
      </View>
      <View style={s.stack}>
        {visibleSchedule.map((slot) => {
          const ready = Boolean(slot.planId);
          const planTitle = getPlanTitle(slot.planId);
          return (
            <Swipeable
              key={slot.id}
              overshootRight={false}
              rightThreshold={38}
              renderRightActions={() => (
                <View style={s.swipeActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${slot.level} class`}
                    onPress={() => modify(slot)}
                    style={s.swipeEdit}
                  >
                    <Pencil size={18} color={C.white} />
                    <Text style={s.swipeActionText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${slot.level} class`}
                    onPress={() => remove(slot)}
                    style={s.swipeDelete}
                  >
                    <Trash2 size={18} color={C.white} />
                    <Text style={s.swipeActionText}>Delete</Text>
                  </Pressable>
                </View>
              )}
            >
              <Pressable
                onPress={ready ? () => start(slot) : assign}
                style={s.classCard}
              >
                <View style={[s.rail, ready ? s.readyRail : s.planRail]} />
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
                  <Pill
                    label={ready ? "READY" : slot.status}
                    active
                    green={ready}
                  />
                  {ready ? (
                    <Pressable onPress={() => start(slot)} style={s.start}>
                      <Play size={14} color={C.white} fill={C.white} />
                      <Text style={s.startText}>Start</Text>
                    </Pressable>
                  ) : (
                    <Outline label="Assign" onPress={assign} />
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
  schedule,
  back,
  assign,
}: {
  plan: ClassPlan;
  schedule: ScheduledClass[];
  back: () => void;
  assign: (id: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="Use for Another Class" back={back} />
      <Text style={s.sub}>
        Assign {plan.brief.program} · {plan.brief.week} · {plan.brief.day} to a
        scheduled class.
      </Text>
      <Text style={s.group}>SCHEDULED CLASS SLOTS</Text>
      {schedule.map((slot) => {
        const occupied = slot.planId === plan.id;
        return (
          <Pressable
            key={slot.id}
            onPress={() => assign(slot.id)}
            style={s.assignCard}
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
              label={occupied ? "ASSIGNED" : slot.status}
              active
              green={occupied || slot.status === "READY"}
            />
            <ChevronRight size={19} color={C.muted} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
function ScheduleManager({
  schedule,
  initialEditId,
  back,
  save,
  remove,
}: {
  schedule: ScheduledClass[];
  initialEditId?: string;
  back: () => void;
  save: (slot: ScheduledClass) => void;
  remove: (id: string) => void;
}) {
  const [date, setDate] = useState(dateKeyFromOffset(1));
  const [time, setTime] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [lesson, setLesson] = useState("Week 1 / Day 1");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const resetForm = () => {
    setEditingId(null);
    setDate(dateKeyFromOffset(1));
    setTime("");
    setLevel("Beginner");
    setLesson("Week 1 / Day 1");
    setError("");
  };
  const edit = (slot: ScheduledClass) => {
    setEditingId(slot.id);
    setDate(slot.date);
    setTime(slot.time);
    setLevel(slot.level);
    setLesson(slot.lesson);
    setError("");
  };
  useEffect(() => {
    const initialClass = schedule.find((slot) => slot.id === initialEditId);
    if (initialClass) edit(initialClass);
  }, [initialEditId]);
  const submit = () => {
    const clean = time.trim();
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
          slot.id !== editingId && slot.date === date && slot.time === clean,
      )
    ) {
      setError("A class already exists at this date and time.");
      return;
    }
    const existing = schedule.find((slot) => slot.id === editingId);
    save({
      id: editingId ?? `slot-${clean.replace(":", "")}-${Date.now()}`,
      date,
      time: clean,
      level,
      lesson: lesson.trim() || "New class",
      status: existing?.status ?? "NEEDS PLAN",
      planId: existing?.planId,
    });
    resetForm();
  };
  const confirmRemove = (slot: ScheduledClass) =>
    Alert.alert(
      "Remove class?",
      `${classDateLabel(slot.date, true)} at ${slot.time} will be removed from the schedule.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => remove(slot.id),
        },
      ],
    );
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="My Schedule" back={back} />
      <View style={s.profileEditor}>
        <View style={s.row}>
          <Text style={s.group}>{editingId ? "EDIT CLASS" : "ADD CLASS"}</Text>
          {editingId ? (
            <Pressable onPress={resetForm} hitSlop={10}>
              <Text style={s.link}>Cancel edit</Text>
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
          markedDates={{
            [date]: {
              selected: true,
              selectedColor: C.rose,
              selectedTextColor: C.white,
            },
          }}
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
        <Text style={s.label}>START TIME</Text>
        <TextInput
          value={time}
          onChangeText={setTime}
          keyboardType="numbers-and-punctuation"
          placeholder="09:30"
          placeholderTextColor={C.muted}
          maxLength={5}
          style={s.formInput}
        />
        <Text style={s.label}>LEVEL</Text>
        <View style={s.options}>
          {["Beginner", "Intermediate", "Advanced"].map((option) => (
            <Pressable key={option} onPress={() => setLevel(option)}>
              <Pill label={option} active={level === option} />
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>PROGRAM DAY</Text>
        <TextInput
          value={lesson}
          onChangeText={setLesson}
          placeholder="Week 1 / Day 1"
          placeholderTextColor={C.muted}
          style={s.formInput}
        />
        {error ? <Text style={s.formError}>{error}</Text> : null}
        <Main
          label={editingId ? "Save Changes" : "Add to Schedule"}
          onPress={submit}
        />
      </View>
      <Text style={s.group}>{schedule.length} CLASSES</Text>
      <View style={s.stack}>
        {schedule.map((slot) => (
          <View key={slot.id} style={s.assignCard}>
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
              label={slot.planId ? "READY" : slot.status}
              active
              green={Boolean(slot.planId)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${slot.level} class`}
              onPress={() => edit(slot)}
              hitSlop={10}
            >
              <Pencil size={18} color={C.muted} />
            </Pressable>
            <Pressable onPress={() => confirmRemove(slot)} hitSlop={10}>
              <X size={18} color={C.rose} />
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
function ChoiceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <View style={s.selectGroup}>
        <Text style={s.label}>{label}</Text>
        <Pressable onPress={() => setOpen(true)} style={s.select}>
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
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
function Create({
  back,
  generate,
}: {
  back: () => void;
  generate: (brief: PlanBrief) => void;
}) {
  const programs = [
    "Beginner Foundations",
    "Intermediate Flow",
    "Strong Pilates",
  ];
  const weeks = ["Week 1", "Week 2", "Week 3", "Week 4"];
  const days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"];
  const [program, setProgram] = useState(programs[0]);
  const [week, setWeek] = useState(weeks[0]);
  const [day, setDay] = useState(days[0]);
  const [scheduledDate, setScheduledDate] = useState(dateKeyFromOffset(1));
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [energy, setEnergy] = useState("Flowing");
  const [equipment, setEquipment] = useState<string[]>(["Mat"]);
  const toggleEquipment = (item: string) =>
    setEquipment((current) =>
      current.includes(item)
        ? current.filter((x) => x !== item)
        : [...current, item],
    );
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
      week,
      day,
      scheduledDate,
      scheduledTime: cleanTime,
      energy,
      equipment,
    });
  };
  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={s.page}>
        <Header title="Create Class Plan" back={back} />
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
        <View style={s.selectGroup}>
          <Text style={s.label}>START TIME</Text>
          <TextInput
            value={scheduledTime}
            onChangeText={setScheduledTime}
            keyboardType="numbers-and-punctuation"
            placeholder="09:30"
            placeholderTextColor={C.muted}
            maxLength={5}
            style={s.formInput}
          />
          <Text style={s.sub}>
            {classDateLabel(scheduledDate, true)} at {scheduledTime}
          </Text>
        </View>
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
        <Main label="Generate Class Plan" onPress={submit} />
      </View>
    </View>
  );
}
function Generated({
  plan,
  back,
  edit,
  save,
  teach,
}: {
  plan: ClassPlan;
  back: () => void;
  edit: () => void;
  save: () => void;
  teach: () => void;
}) {
  const valid =
    phaseTotal(plan, "Warm-up") === 300 &&
    phaseTotal(plan, "Main") === 2100 &&
    phaseTotal(plan, "Cool-down") === 300;
  const start = () => {
    if (!valid) {
      Alert.alert(
        "Plan needs review",
        "Correct the timing before starting this class.",
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
          title="Generated Plan"
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
        {plan.brief.scheduledDate && plan.brief.scheduledTime ? (
          <Text style={s.sub}>
            {classDateLabel(plan.brief.scheduledDate, true)} at{" "}
            {plan.brief.scheduledTime}
          </Text>
        ) : null}
        <Text style={s.sub}>
          {plan.brief.energy} · {plan.brief.equipment.join(", ")} ·{" "}
          {fmt(planTotal(plan))}
        </Text>
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
        <View style={s.why}>
          <Text style={s.whyLabel}>WHY THIS PLAN</Text>
          <Text style={s.whyCopy}>
            Uses the selected {plan.brief.energy.toLowerCase()} energy and
            available {plan.brief.equipment.join(", ").toLowerCase()} equipment.
          </Text>
          <Text style={s.whyCopy}>
            Both sides and all fixed phase budgets are included.
          </Text>
        </View>
      </ScrollView>
      <View style={s.dual}>
        <View style={s.flex}>
          <Outline label="Edit Sequence" onPress={edit} />
        </View>
        <View style={s.flex}>
          <Main
            label={
              plan.status === "saved"
                ? plan.brief.scheduledDate
                  ? "Scheduled"
                  : "Plan Saved"
                : plan.brief.scheduledDate
                  ? "Save & Schedule"
                  : "Save Plan"
            }
            onPress={save}
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
}: {
  plan: ClassPlan;
  change: (movements: PlanMovement[]) => void;
  open: () => void;
  back: () => void;
}) {
  const [filter, setFilter] = useState<"All" | Phase>("All");
  const visible = plan.movements
    .map((movement, index) => ({ movement, index }))
    .filter((item) => filter === "All" || item.movement.phase === filter);
  const valid =
    phaseTotal(plan, "Warm-up") === 300 &&
    phaseTotal(plan, "Main") === 2100 &&
    phaseTotal(plan, "Cool-down") === 300;
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
    change(next);
  };
  const replace = (index: number) => {
    const current = plan.movements[index];
    const alternatives: Record<Phase, [string, string, string][]> = {
      "Warm-up": [
        [
          "Standing Reach",
          "Standing",
          "Reach overhead without lifting the ribs.",
        ],
        [
          "Hip Circles",
          "Standing",
          "Circle smoothly through a comfortable range.",
        ],
      ],
      Main: [
        [
          "Bridge",
          "Lying on back",
          "Lift the hips while keeping the ribs soft.",
        ],
        [
          "Bird Dog",
          "Hands & knees",
          "Reach opposite limbs without shifting the trunk.",
        ],
      ],
      "Cool-down": [
        [
          "Figure Four Stretch",
          "Lying on back",
          "Keep the breath easy and the hips relaxed.",
        ],
        [
          "Seated Side Bend",
          "Seated",
          "Lengthen both sides before returning upright.",
        ],
      ],
    };
    const choice =
      alternatives[current.phase].find((item) => item[0] !== current.title) ??
      alternatives[current.phase][0];
    change(
      plan.movements.map((movement, i) =>
        i === index
          ? {
              ...movement,
              id: `${movement.id}-variation`,
              title: choice[0],
              position: choice[1],
              cue: choice[2],
            }
          : movement,
      ),
    );
  };
  const remove = (index: number) =>
    change(plan.movements.filter((_, i) => i !== index));
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header title="Class Sequence" back={back} />
      <Text
        style={[s.sub, { color: valid ? C.sage : C.gold, fontWeight: "800" }]}
      >
        {fmt(planTotal(plan))} total · {plan.movements.length} movements ·{" "}
        {valid ? "Valid" : "Timing needs review"}
      </Text>
      <View style={s.options}>
        {(["All", "Warm-up", "Main", "Cool-down"] as const).map((x) => (
          <Pressable key={x} onPress={() => setFilter(x)}>
            <Pill label={x} active={filter === x} />
          </Pressable>
        ))}
      </View>
      <Text style={s.group}>
        {filter.toUpperCase()} · {visible.length} MOVEMENTS
      </Text>
      {visible.map(({ movement, index }, i) => (
        <View key={`${movement.id}-${index}`} style={s.move}>
          <Pressable onPress={open} style={s.editorMain}>
            <View style={s.moveNum}>
              <Text style={s.moveNumText}>
                {String(i + 1).padStart(2, "0")}
              </Text>
            </View>
            <View style={s.flex}>
              <Text style={s.moveTitle}>{movement.title}</Text>
              <Text style={s.sub}>
                {movement.position} · {fmt(movement.duration)}
              </Text>
            </View>
          </Pressable>
          <View style={s.editorTools}>
            <Pressable onPress={() => move(index, -1)} hitSlop={7}>
              <ArrowUp size={17} color={C.muted} />
            </Pressable>
            <Pressable onPress={() => move(index, 1)} hitSlop={7}>
              <ArrowDown size={17} color={C.muted} />
            </Pressable>
            <Pressable onPress={() => replace(index)} hitSlop={7}>
              <RefreshCw size={17} color={C.rose} />
            </Pressable>
            <Pressable onPress={() => remove(index)} hitSlop={7}>
              <X size={17} color={C.rose} />
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
function Plans({
  plan,
  savedPlans,
  lastSession,
  create,
  open,
  duplicate,
  select,
}: {
  plan: ClassPlan;
  savedPlans: ClassPlan[];
  lastSession: SessionResult | null;
  create: () => void;
  open: () => void;
  duplicate: () => void;
  select: (plan: ClassPlan) => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.row}>
        <View>
          <Text style={s.headerTitle}>Plans</Text>
          <Text style={s.sub}>Prepare and reuse reviewed lessons.</Text>
        </View>
        <Pressable onPress={create} style={s.avatar}>
          <Plus size={22} color={C.rose} />
        </Pressable>
      </View>
      <Text style={s.group}>CURRENT PLAN</Text>
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
          <Pill
            label={plan.status === "saved" ? "SAVED" : "DRAFT"}
            active
            green={plan.status === "saved"}
          />
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
          <Outline label="Open Plan" onPress={open} />
        </View>
        <Pressable onPress={duplicate} style={s.iconAction}>
          <RefreshCw size={18} color={C.rose} />
        </Pressable>
      </View>
      <Text style={s.group}>SAVED PLANS</Text>
      {savedPlans.length ? (
        savedPlans.map((saved) => (
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
              {saved.brief.scheduledDate && saved.brief.scheduledTime ? (
                <Text style={s.duration}>
                  {classDateLabel(saved.brief.scheduledDate, true)} at{" "}
                  {saved.brief.scheduledTime}
                </Text>
              ) : null}
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
function Details({
  movement,
  favourite,
  back,
  toggle,
  add,
}: {
  movement: LibraryMovement;
  favourite: boolean;
  back: () => void;
  toggle: () => void;
  add: () => void;
}) {
  const [added, setAdded] = useState(false);
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
        <Art />
        <Text style={s.movementTitle}>{movement.name}</Text>
        <View style={s.options}>
          <Pill label={movement.level} active />
          <Pill label={movement.equipment} />
          <Pill label={movement.position} />
        </View>
        <View style={s.row}>
          <Clock3 size={19} color={C.rose} />
          <Text style={s.detailTime}>{fmt(movement.duration)} planned</Text>
        </View>
        <Text style={s.group}>TEACHING CUES</Text>
        {movement.cues.map((cue, index) => (
          <View key={`${movement.id}-${index}`} style={s.cue}>
            <View style={s.cueNum}>
              <Text style={s.cueNumText}>{index + 1}</Text>
            </View>
            <Text style={s.cueText}>{cue}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={s.sticky}>
        <Main
          label={added ? "Added to Plan" : "Add to Plan"}
          onPress={() => {
            if (added) return;
            setAdded(true);
            setTimeout(add, 350);
          }}
        />
      </View>
    </View>
  );
}
function Teach({
  plan,
  exit,
  finish,
}: {
  plan: ClassPlan;
  exit: () => void;
  finish: (result: SessionResult) => void;
}) {
  const [held, setHeld] = useState(false);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(1);
  const [startedAt] = useState(Date.now());
  const [classTime, setClassTime] = useState(planTotal(plan));
  const [moveTime, setMoveTime] = useState(plan.movements[0].duration);
  const current = plan.movements[index];
  const go = (next: number) => {
    const safe = Math.max(0, Math.min(plan.movements.length - 1, next));
    setIndex(safe);
    setStep(1);
    setMoveTime(plan.movements[safe].duration);
  };
  const end = () =>
    finish({
      startedAt,
      endedAt: Date.now(),
      completed: index + 1,
      total: plan.movements.length,
      plannedSeconds: planTotal(plan),
      actualSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
    });
  const confirmEnd = () =>
    Alert.alert(
      index === plan.movements.length - 1
        ? "Complete class?"
        : "End class early?",
      index === plan.movements.length - 1
        ? "This will create the session summary."
        : "The unfinished movements will be recorded in the summary.",
      [
        { text: "Keep teaching", style: "cancel" },
        {
          text: index === plan.movements.length - 1 ? "Complete" : "End early",
          style: "destructive",
          onPress: end,
        },
      ],
    );
  useEffect(() => {
    const id = setInterval(() => {
      setClassTime(
        Math.max(
          0,
          planTotal(plan) - Math.floor((Date.now() - startedAt) / 1000),
        ),
      );
      if (!held) setMoveTime((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [held, plan, startedAt]);
  useEffect(() => {
    if (moveTime === 0 && !held && index < plan.movements.length - 1)
      go(index + 1);
  }, [moveTime, held, index]);
  const nextStep = () => {
    if (step < 3) setStep((value) => value + 1);
    else if (index < plan.movements.length - 1) go(index + 1);
  };
  const upcoming = plan.movements[index + 1];
  const finishTime = new Date(
    startedAt + planTotal(plan) * 1000,
  ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <View style={s.teach}>
      <StatusBar style="dark" />
      <View style={s.teachTop}>
        <Pressable onPress={exit}>
          <X size={21} color="#EEE0E3" />
        </Pressable>
        <Text style={s.context}>
          {plan.brief.program.toUpperCase()} · {plan.brief.week.toUpperCase()} ·{" "}
          {plan.brief.day.toUpperCase()}
        </Text>
        <Text style={s.context}>{current.phase.toUpperCase()}</Text>
      </View>
      <View style={s.row}>
        <View>
          <Text style={s.light}>Class remaining · finish {finishTime}</Text>
          <Text style={s.clock}>{fmt(classTime)}</Text>
        </View>
        <Text style={s.counter}>
          {index + 1} / {plan.movements.length}
        </Text>
      </View>
      <View style={s.track}>
        <View
          style={[
            s.fill,
            { width: `${((index + 1) / plan.movements.length) * 100}%` },
          ]}
        />
      </View>
      <View style={s.live}>
        <View style={s.row}>
          <Text style={s.liveLabel}>CURRENT MOVEMENT</Text>
          <Pill label={fmt(current.duration)} />
        </View>
        <Art dark />
        <Text style={s.liveTitle}>{current.title}</Text>
        <Text style={s.liveMeta}>
          {current.position} · Step {step} of 3
        </Text>
        <View style={s.activeCue}>
          <Text style={s.liveLabel}>ACTIVE CUE</Text>
          <Text style={s.cueLive}>
            {step === 1
              ? `Set up in ${current.position.toLowerCase()}.`
              : step === 2
                ? current.cue
                : "Finish with control and prepare to transition."}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={s.light}>Movement time</Text>
          <Text style={s.moveClock}>{fmt(moveTime)}</Text>
        </View>
      </View>
      <View style={s.controls}>
        <Pressable
          onPress={() => go(index - 1)}
          disabled={index === 0}
          style={[s.navControl, index === 0 && s.disabled]}
        >
          <ChevronLeft size={24} color={C.white} />
        </Pressable>
        <Pressable onPress={() => setHeld((value) => !value)} style={s.hold}>
          {held ? (
            <Play size={23} color={C.dark} fill={C.dark} />
          ) : (
            <Pause size={23} color={C.dark} fill={C.dark} />
          )}
          <Text style={s.holdText}>{held ? "Resume cues" : "Hold cues"}</Text>
        </Pressable>
        <Pressable onPress={nextStep} style={s.navControl}>
          <ChevronRight size={24} color={C.white} />
          <Text style={s.controlLabel}>Next step</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() => (upcoming ? go(index + 1) : confirmEnd())}
        style={s.upNext}
      >
        <View style={s.flex}>
          <Text style={s.liveLabel}>{upcoming ? "UP NEXT" : "SESSION"}</Text>
          <Text style={s.upText}>
            {upcoming
              ? `${upcoming.title} · ${fmt(upcoming.duration)} · ${upcoming.position}`
              : "Complete class and review summary"}
          </Text>
        </View>
        <ChevronRight size={20} color="#D9C8CC" />
      </Pressable>
      <Pressable onPress={confirmEnd} style={s.endClass}>
        <Text style={s.endClassText}>End Class</Text>
      </Pressable>
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
function Library({
  movements,
  favourites,
  open,
  create,
  toggle,
}: {
  movements: LibraryMovement[];
  favourites: string[];
  open: (movement: LibraryMovement) => void;
  create: () => void;
  toggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const needle = query.trim().toLowerCase();
  const visible = movements.filter(
    (movement) =>
      (filter === "All" ||
        (filter === "Favourites" && favourites.includes(movement.id)) ||
        movement.position === filter) &&
      (!needle ||
        [
          movement.name,
          movement.position,
          movement.equipment,
          movement.level,
        ].some((value) => value.toLowerCase().includes(needle))),
  );
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.row}>
        <Text style={s.headerTitle}>Movement Library</Text>
        <Pressable onPress={create} style={s.avatar}>
          <Plus size={23} color={C.rose} />
        </Pressable>
      </View>
      <View style={s.search}>
        <Search size={20} color={C.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search movement, position or equipment"
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
          "Standing",
          "Side-lying",
          "Supine",
          "Seated",
          "Kneeling",
        ].map((option) => (
          <Pressable key={option} onPress={() => setFilter(option)}>
            <Pill label={option} active={filter === option} />
          </Pressable>
        ))}
      </ScrollView>
      <Text style={s.group}>{visible.length} MOVEMENTS</Text>
      {visible.map((movement) => (
        <Pressable
          key={movement.id}
          onPress={() => open(movement)}
          style={s.libraryRow}
        >
          <View style={s.thumb} />
          <View style={s.flex}>
            <Text style={s.moveTitle}>{movement.name}</Text>
            <Text style={s.sub}>
              {movement.level} / {movement.position} / {movement.equipment}
            </Text>
          </View>
          <Text style={s.duration}>{fmt(movement.duration)}</Text>
          <Pressable onPress={() => toggle(movement.id)} hitSlop={10}>
            <Heart
              size={20}
              color={C.rose}
              fill={favourites.includes(movement.id) ? C.rose : "transparent"}
            />
          </Pressable>
        </Pressable>
      ))}
      {visible.length === 0 ? (
        <Text style={s.empty}>No movements match your search.</Text>
      ) : null}
    </ScrollView>
  );
}
function CustomMovement({
  back,
  save,
}: {
  back: () => void;
  save: (movement: LibraryMovement) => void;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("Standing");
  const [level, setLevel] = useState("Beginner");
  const [equipment, setEquipment] = useState("Mat");
  const [minutes, setMinutes] = useState("2");
  const [cue, setCue] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const duration = Math.round(Number(minutes) * 60);
    if (!name.trim()) {
      setError("Enter a movement name.");
      return;
    }
    if (!Number.isFinite(duration) || duration < 15) {
      setError("Enter a duration of at least 0.25 minutes.");
      return;
    }
    save({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      position,
      level,
      equipment: equipment.trim() || "None",
      duration,
      cues: [cue.trim() || "Move with control and maintain steady breathing."],
    });
  };
  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={s.page}>
        <Header title="New Movement" back={back} />
        <View style={s.form}>
          <Text style={s.label}>MOVEMENT NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Standing Side Bend"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>POSITION</Text>
          <View style={s.options}>
            {["Standing", "Side-lying", "Supine", "Seated", "Kneeling"].map(
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
          <Text style={s.label}>DURATION IN MINUTES</Text>
          <TextInput
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="decimal-pad"
            placeholder="2"
            placeholderTextColor={C.muted}
            style={s.formInput}
          />
          <Text style={s.label}>PRIMARY TEACHING CUE</Text>
          <TextInput
            value={cue}
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
        <Main label="Save Movement" onPress={submit} />
      </View>
    </View>
  );
}
function Insights({
  sessions,
  schedule,
}: {
  sessions: SessionResult[];
  schedule: ScheduledClass[];
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
  const readyRate = schedule.length
    ? Math.round(
        (schedule.filter((slot) => slot.planId).length / schedule.length) * 100,
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
          <View key={session.endedAt} style={s.recentSession}>
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
          </View>
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
}: {
  account: Account;
  preferences: InstructorPreferences;
  updateAccount: (account: Account) => void;
  updatePreferences: (preferences: InstructorPreferences) => void;
  navigate: (screen: Tab) => void;
  manageData: () => void;
  openSecurity: () => void;
  logout: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [error, setError] = useState("");
  const saveAccount = () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    updateAccount({ ...account, name: name.trim(), email: cleanEmail });
    setError("");
    setEditing(false);
  };
  const toggle = (key: "vibration" | "offline") =>
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
              <Main label="Save Details" onPress={saveAccount} />
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
            <View>
              <Text style={s.settingText}>Offline plans</Text>
              <Text style={s.duration}>
                {preferences.offline ? "Downloaded" : "Not downloaded"}
              </Text>
            </View>
            <Toggle
              value={preferences.offline}
              onPress={() => toggle("offline")}
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
    if (
      newPassword.length < 8 ||
      !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      setError(
        "Use at least 8 characters with uppercase, lowercase and a number.",
      );
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
            style={s.formInput}
          />
          <Text style={s.sub}>
            At least 8 characters with uppercase, lowercase and a number.
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
    Alert.alert(
      "Reset all app data?",
      "This removes saved plans, schedules, custom movements, insights, profile details and preferences from this device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset everything", style: "destructive", onPress: reset },
      ],
    );
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
      <Text style={s.group}>RESET</Text>
      <Pressable onPress={confirmReset} style={s.dangerAction}>
        <Trash2 size={19} color="#A34848" />
        <Text style={s.dangerText}>Reset all app data</Text>
      </Pressable>
    </ScrollView>
  );
}

function ClientHome({
  book,
  account,
  booked,
}: {
  book: () => void;
  account: Account;
  booked: number[];
}) {
  const remaining = Math.max(0, 10 - booked.length);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.row}>
        <View>
          <Text style={s.title}>Hello, {account.name.split(" ")[0]}</Text>
          <Text style={s.sub}>Find a little time to move today.</Text>
        </View>
        <View style={s.avatar}>
          <UserRound size={20} color={C.rose} />
        </View>
      </View>
      <Pressable onPress={book} style={s.clientHero}>
        <Text style={s.clientEyebrow}>
          {booked.length ? "YOUR NEXT CLASS" : "READY TO MOVE?"}
        </Text>
        <Text style={s.clientHeroTitle}>
          {booked.length ? "Pilates Foundations" : "Book your next class"}
        </Text>
        <Text style={s.clientHeroMeta}>
          {booked.length
            ? "Today, 17:30 · Studio One"
            : "Explore today’s studio schedule"}
        </Text>
        <View style={s.clientHeroButton}>
          {booked.length ? (
            <Check size={16} color={C.sage} />
          ) : (
            <Plus size={16} color={C.sage} />
          )}
          <Text style={s.clientHeroButtonText}>
            {booked.length ? "You're booked" : "View classes"}
          </Text>
        </View>
      </Pressable>
      <View style={s.row}>
        <Text style={s.section}>This week</Text>
        <Pressable onPress={book}>
          <Text style={s.link}>View schedule</Text>
        </Pressable>
      </View>
      {[
        ["TUE", "18:00", "Stretch & Reset", "All levels"],
        ["THU", "17:30", "Pilates Foundations", "Beginner"],
        ["SAT", "09:00", "Strong Flow", "Intermediate"],
      ].map((x) => (
        <Pressable key={x[0]} onPress={book} style={s.clientClass}>
          <Text style={s.clientDay}>{x[0]}</Text>
          <View style={s.time}>
            <Text style={s.timeText}>{x[1]}</Text>
            <Text style={s.duration}>45 min</Text>
          </View>
          <View style={s.flex}>
            <Text style={s.level}>{x[2]}</Text>
            <Text style={s.week}>{x[3]} · Studio One</Text>
          </View>
          <ChevronRight size={19} color={C.muted} />
        </Pressable>
      ))}
      <View style={s.row}>
        <Text style={s.section}>Your Blush</Text>
      </View>
      <View style={s.passCard}>
        <View>
          <Text style={s.passLabel}>CLASS PASS</Text>
          <Text style={s.passCount}>
            {remaining} <Text style={s.passSmall}>classes left</Text>
          </Text>
          <Text style={s.passDate}>Renews 14 October</Text>
        </View>
        <Ticket size={34} color="#F3E3E5" />
      </View>
    </ScrollView>
  );
}
function ClientBook({
  booked,
  toggle,
}: {
  booked: number[];
  toggle: (id: number) => void;
}) {
  const [date, setDate] = useState("Today");
  const classes = [
    ["17:30", "Pilates Foundations", "Beginner · Studio One"],
    ["18:30", "Strong Flow", "Intermediate · Studio Two"],
    ["19:30", "Stretch & Reset", "All levels · Studio One"],
  ];
  const confirm = (id: number) => {
    const isBooked = booked.includes(id);
    const item = classes[id];
    Alert.alert(
      isBooked ? "Cancel this class?" : "Book this class?",
      `${item[1]} at ${item[0]} · ${item[2]}`,
      [
        { text: "Keep current booking", style: "cancel" },
        {
          text: isBooked ? "Confirm cancellation" : "Confirm booking",
          style: isBooked ? "destructive" : "default",
          onPress: () => toggle(id),
        },
      ],
    );
  };
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.headerTitle}>Book a class</Text>
      <Text style={s.sub}>Choose a session that fits your week.</Text>
      <View style={s.options}>
        {["Today", "Tomorrow", "This week"].map((x) => (
          <Pressable key={x} onPress={() => setDate(x)}>
            <Pill label={x} active={date === x} />
          </Pressable>
        ))}
      </View>
      <Text style={s.group}>{date.toUpperCase()}</Text>
      {classes.map((x, i) => {
        const isBooked = booked.includes(i);
        return (
          <View key={x[0]} style={s.bookingCard}>
            <View style={s.row}>
              <View>
                <Text style={s.moveTitle}>{x[1]}</Text>
                <Text style={s.sub}>{x[2]}</Text>
              </View>
              <Text style={s.planTime}>{x[0]}</Text>
            </View>
            <View style={s.bookingFooter}>
              <Text style={s.duration}>45 MIN · Coach Nandi</Text>
              <Pressable
                onPress={() => confirm(i)}
                style={isBooked ? s.bookedButton : s.bookButton}
              >
                <Text style={isBooked ? s.bookedText : s.bookText}>
                  {isBooked ? "Cancel" : "Book"}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
function ClientPass({ booked }: { booked: number[] }) {
  const classes = ["Pilates Foundations", "Strong Flow", "Stretch & Reset"];
  const remaining = Math.max(0, 10 - booked.length);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.headerTitle}>My Blush</Text>
      <Text style={s.sub}>Your classes, passes and movement history.</Text>
      <View style={s.bigPass}>
        <Text style={s.passLabel}>10 CLASS PASS</Text>
        <Text style={s.bigPassCount}>{remaining}</Text>
        <Text style={s.passSmall}>classes remaining</Text>
        <View style={s.passProgress}>
          <View style={[s.passProgressFill, { width: `${remaining * 10}%` }]} />
        </View>
        <Text style={s.passDate}>Valid until 14 October 2026</Text>
      </View>
      <Text style={s.group}>UPCOMING</Text>
      {booked.length ? (
        booked.map((id) => (
          <View key={id} style={s.upcoming}>
            <CalendarDays size={20} color={C.rose} />
            <View style={s.flex}>
              <Text style={s.moveTitle}>{classes[id]}</Text>
              <Text style={s.sub}>Today · Studio One</Text>
            </View>
            <Pill label="BOOKED" active green />
          </View>
        ))
      ) : (
        <Text style={s.empty}>No upcoming bookings yet.</Text>
      )}
      <Text style={s.group}>RECENTLY ATTENDED</Text>
      {[
        "Strong Flow · 18 Sep",
        "Pilates Foundations · 16 Sep",
        "Stretch & Reset · 13 Sep",
      ].map((x) => (
        <View key={x} style={s.setting}>
          <Text style={s.settingText}>{x}</Text>
          <Check size={18} color={C.sage} />
        </View>
      ))}
    </ScrollView>
  );
}
function ClientBookingHome({
  book,
  account,
  booked,
  classes,
}: {
  book: () => void;
  account: Account;
  booked: number[];
  classes: ClientClass[];
}) {
  const bookedClasses = classes.filter((item) => booked.includes(item.id));
  const nextClass = bookedClasses[0];
  const remaining = Math.max(0, 10 - bookedClasses.length);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.row}>
        <View>
          <Text style={s.title}>Hello, {account.name.split(" ")[0]}</Text>
          <Text style={s.sub}>Find a little time to move today.</Text>
        </View>
        <View style={s.avatar}>
          <UserRound size={20} color={C.rose} />
        </View>
      </View>
      <Pressable onPress={book} style={s.clientHero}>
        <Text style={s.clientEyebrow}>
          {nextClass ? "YOUR NEXT CLASS" : "READY TO MOVE?"}
        </Text>
        <Text style={s.clientHeroTitle}>
          {nextClass?.name ?? "Book your next class"}
        </Text>
        <Text style={s.clientHeroMeta}>
          {nextClass
            ? `${classDateLabel(nextClass.date, true)}, ${nextClass.time} / ${nextClass.studio}`
            : "Explore the studio schedule"}
        </Text>
        <View style={s.clientHeroButton}>
          {nextClass ? (
            <Check size={16} color={C.sage} />
          ) : (
            <Plus size={16} color={C.sage} />
          )}
          <Text style={s.clientHeroButtonText}>
            {nextClass ? "Manage booking" : "View classes"}
          </Text>
        </View>
      </Pressable>
      <View style={s.row}>
        <Text style={s.section}>This week</Text>
        <Pressable onPress={book}>
          <Text style={s.link}>View schedule</Text>
        </Pressable>
      </View>
      {classes.slice(0, 3).map((item) => (
        <Pressable key={item.id} onPress={book} style={s.clientClass}>
          <Text style={s.clientDay}>
            {classDateLabel(item.date).slice(0, 3).toUpperCase()}
          </Text>
          <View style={s.time}>
            <Text style={s.timeText}>{item.time}</Text>
            <Text style={s.duration}>45 min</Text>
          </View>
          <View style={s.flex}>
            <Text style={s.level}>{item.name}</Text>
            <Text style={s.week}>
              {item.level} / {item.studio}
            </Text>
          </View>
          {booked.includes(item.id) ? (
            <Pill label="BOOKED" active green />
          ) : (
            <ChevronRight size={19} color={C.muted} />
          )}
        </Pressable>
      ))}
      <Text style={s.section}>Your Blush</Text>
      <View style={s.passCard}>
        <View>
          <Text style={s.passLabel}>CLASS PASS</Text>
          <Text style={s.passCount}>
            {remaining} <Text style={s.passSmall}>classes left</Text>
          </Text>
          <Text style={s.passDate}>Renews 14 October</Text>
        </View>
        <Ticket size={34} color="#F3E3E5" />
      </View>
    </ScrollView>
  );
}

function ClientBooking({
  booked,
  waitlisted,
  classes,
  toggle,
  toggleWaitlist,
}: {
  booked: number[];
  waitlisted: number[];
  classes: ClientClass[];
  toggle: (id: number) => Promise<BookingUpdateResult>;
  toggleWaitlist: (id: number) => void;
}) {
  const [date, setDate] = useState(localDateKey());
  const visible = classes.filter((item) => item.date === date);
  const markedDates = classes.reduce<
    Record<
      string,
      {
        marked?: boolean;
        dotColor?: string;
        selected?: boolean;
        selectedColor?: string;
        selectedTextColor?: string;
      }
    >
  >((dates, item) => {
    dates[item.date] = { marked: true, dotColor: C.rose };
    return dates;
  }, {});
  markedDates[date] = {
    ...markedDates[date],
    selected: true,
    selectedColor: C.rose,
    selectedTextColor: C.white,
  };
  const confirm = (item: ClientClass) => {
    const isBooked = booked.includes(item.id);
    const isWaitlisted = waitlisted.includes(item.id);
    const isFull = item.bookedCount >= item.capacity;
    if (isWaitlisted) {
      Alert.alert(
        "Leave this waitlist?",
        `${item.name} at ${item.time} / ${item.studio}`,
        [
          { text: "Stay on waitlist", style: "cancel" },
          {
            text: "Leave waitlist",
            style: "destructive",
            onPress: () => toggleWaitlist(item.id),
          },
        ],
      );
      return;
    }
    if (!isBooked && isFull) {
      Alert.alert(
        "Join the waitlist?",
        `We will hold your place in line for ${item.name} at ${item.time}. This does not use a class credit.`,
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Join waitlist",
            onPress: () => toggleWaitlist(item.id),
          },
        ],
      );
      return;
    }
    if (
      !isBooked &&
      booked.filter((id) => classes.some((entry) => entry.id === id)).length >=
        10
    ) {
      Alert.alert(
        "No classes remaining",
        "Renew your class pass before booking another session.",
      );
      return;
    }
    const conflict = classes.find(
      (entry) =>
        booked.includes(entry.id) &&
        entry.id !== item.id &&
        entry.date === item.date &&
        entry.time === item.time,
    );
    if (!isBooked && conflict) {
      Alert.alert(
        "Booking conflict",
        `You are already booked for ${conflict.name} at ${conflict.time}.`,
      );
      return;
    }
    Alert.alert(
      isBooked ? "Cancel this class?" : "Book this class?",
      `${item.name} at ${item.time} / ${item.level} / ${item.studio}`,
      [
        { text: isBooked ? "Keep booking" : "Not now", style: "cancel" },
        {
          text: isBooked ? "Confirm cancellation" : "Confirm booking",
          style: isBooked ? "destructive" : "default",
          onPress: () => {
            void toggle(item.id).then((result) => {
              if (result === "reminder-scheduled") {
                Alert.alert(
                  "Booking confirmed",
                  "A reminder is scheduled for one hour before class.",
                );
              }
              if (result === "reminder-denied") {
                Alert.alert(
                  "Booking confirmed",
                  "Notifications are not allowed, so booking reminders have been turned off.",
                );
              }
              if (result === "reminder-unavailable") {
                Alert.alert(
                  "Booking confirmed",
                  "System reminders require a development build. Your booking is still saved.",
                );
              }
              if (result === "reminder-too-late") {
                Alert.alert(
                  "Booking confirmed",
                  "This class starts too soon to schedule a one-hour reminder.",
                );
              }
              if (result === "reminder-error") {
                Alert.alert(
                  "Booking confirmed",
                  "The reminder could not be scheduled, but your booking is saved.",
                );
              }
            });
          },
        },
      ],
    );
  };
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.headerTitle}>Book a class</Text>
      <Text style={s.sub}>Choose a workout date and available session.</Text>
      <Calendar
        current={date}
        minDate={localDateKey()}
        maxDate={dateKeyFromOffset(60)}
        firstDay={1}
        enableSwipeMonths
        markedDates={markedDates}
        onDayPress={(day: DateData) => setDate(day.dateString)}
        style={s.bookingCalendar}
        theme={{
          calendarBackground: C.card,
          monthTextColor: C.ink,
          textMonthFontWeight: "800",
          textMonthFontSize: 17,
          textSectionTitleColor: C.muted,
          dayTextColor: C.ink,
          todayTextColor: C.rose,
          selectedDayBackgroundColor: C.rose,
          selectedDayTextColor: C.white,
          arrowColor: C.rose,
          textDisabledColor: C.line,
          dotColor: C.rose,
          selectedDotColor: C.white,
        }}
      />
      <Text style={s.group}>
        {classDateLabel(date, true).toUpperCase()} / {visible.length} CLASSES
      </Text>
      {visible.length ? (
        visible.map((item) => {
          const isBooked = booked.includes(item.id);
          const isWaitlisted = waitlisted.includes(item.id);
          const full = item.bookedCount >= item.capacity && !isBooked;
          const spaces = Math.max(0, item.capacity - item.bookedCount);
          return (
            <View key={item.id} style={s.bookingCard}>
              <View style={s.row}>
                <View style={s.flex}>
                  <Text style={s.moveTitle}>{item.name}</Text>
                  <Text style={s.sub}>
                    {item.level} / {item.studio}
                  </Text>
                </View>
                <Text style={s.planTime}>{item.time}</Text>
              </View>
              <View style={s.bookingMeta}>
                <Text style={s.duration}>45 MIN / Coach {item.coach}</Text>
                <Text style={[s.duration, spaces <= 2 && { color: C.rose }]}>
                  {full ? "FULL" : `${spaces} SPACES LEFT`}
                </Text>
              </View>
              <View style={s.bookingFooter}>
                <Text style={s.sub}>{classDateLabel(item.date, true)}</Text>
                <Pressable
                  onPress={() => confirm(item)}
                  style={[
                    isBooked || isWaitlisted ? s.bookedButton : s.bookButton,
                  ]}
                >
                  <Text
                    style={isBooked || isWaitlisted ? s.bookedText : s.bookText}
                  >
                    {isBooked
                      ? "Cancel"
                      : isWaitlisted
                        ? "Waitlisted"
                        : full
                          ? "Join waitlist"
                          : "Book"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })
      ) : (
        <View style={s.emptyCard}>
          <CalendarDays size={26} color={C.rose} />
          <Text style={s.moveTitle}>No workouts on this date</Text>
          <Text style={s.sub}>
            Choose a marked date to view studio classes.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function ClientMembership({
  booked,
  waitlisted,
  classes,
}: {
  booked: number[];
  waitlisted: number[];
  classes: ClientClass[];
}) {
  const upcoming = classes.filter((item) => booked.includes(item.id));
  const waiting = classes.filter((item) => waitlisted.includes(item.id));
  const remaining = Math.max(0, 10 - upcoming.length);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.headerTitle}>My Blush</Text>
      <Text style={s.sub}>Your classes, pass and movement history.</Text>
      <View style={s.bigPass}>
        <Text style={s.passLabel}>10 CLASS PASS</Text>
        <Text style={s.bigPassCount}>{remaining}</Text>
        <Text style={s.passSmall}>classes remaining</Text>
        <View style={s.passProgress}>
          <View style={[s.passProgressFill, { width: `${remaining * 10}%` }]} />
        </View>
        <Text style={s.passDate}>Valid until 14 October 2026</Text>
      </View>
      <Text style={s.group}>UPCOMING / {upcoming.length}</Text>
      {upcoming.length ? (
        upcoming.map((item) => (
          <View key={item.id} style={s.upcoming}>
            <CalendarDays size={20} color={C.rose} />
            <View style={s.flex}>
              <Text style={s.moveTitle}>{item.name}</Text>
              <Text style={s.sub}>
                {classDateLabel(item.date, true)} / {item.time} / {item.studio}
              </Text>
            </View>
            <Pill label="BOOKED" active green />
          </View>
        ))
      ) : (
        <Text style={s.empty}>No upcoming bookings yet.</Text>
      )}
      <Text style={s.group}>WAITLIST / {waiting.length}</Text>
      {waiting.length ? (
        waiting.map((item, index) => (
          <View key={item.id} style={s.upcoming}>
            <Clock3 size={20} color={C.gold} />
            <View style={s.flex}>
              <Text style={s.moveTitle}>{item.name}</Text>
              <Text style={s.sub}>
                {classDateLabel(item.date, true)} / {item.time} / {item.studio}
              </Text>
            </View>
            <Pill label={`WAIT ${index + 1}`} active />
          </View>
        ))
      ) : (
        <Text style={s.empty}>You are not waiting for any classes.</Text>
      )}
      <Text style={s.group}>RECENTLY ATTENDED</Text>
      {[
        "Strong Flow / 18 Sep",
        "Pilates Foundations / 16 Sep",
        "Stretch & Reset / 13 Sep",
      ].map((item) => (
        <View key={item} style={s.setting}>
          <Text style={s.settingText}>{item}</Text>
          <Check size={18} color={C.sage} />
        </View>
      ))}
    </ScrollView>
  );
}

function ClientStudio() {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.headerTitle}>Your studio</Text>
      <View style={s.studioCover}>
        <MapPin size={33} color={C.rose} />
      </View>
      <Text style={s.movementTitle}>Blush Bodies Cape Town</Text>
      <Text style={s.sub}>Movement for every body, every day.</Text>
      <View style={s.studioInfo}>
        <MapPin size={19} color={C.rose} />
        <Text style={s.settingText}>18 Kloof Street, Gardens</Text>
      </View>
      <View style={s.studioInfo}>
        <Clock3 size={19} color={C.rose} />
        <Text style={s.settingText}>Mon–Fri 06:30–20:30 · Sat 08:00–13:00</Text>
      </View>
      <Text style={s.group}>STUDIO NOTES</Text>
      <View style={s.why}>
        <Text style={s.whyCopy}>
          Arrive 10 minutes before class. Mats are provided, just bring water
          and something comfortable to move in.
        </Text>
      </View>
    </ScrollView>
  );
}
function ClientProfile({
  logout,
  account,
  preferences,
  updateAccount,
  updatePreferences,
  openPass,
  openSecurity,
}: {
  logout: () => void;
  account: Account;
  preferences: ClientPreferences;
  updateAccount: (account: Account) => void;
  updatePreferences: (preferences: ClientPreferences) => void;
  openPass: () => void;
  openSecurity: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [phone, setPhone] = useState(account.phone ?? "");
  const [error, setError] = useState("");
  const save = () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (phone.trim() && phone.replace(/\D/g, "").length < 8) {
      setError("Enter a valid phone number.");
      return;
    }
    updateAccount({
      ...account,
      name: name.trim(),
      email: cleanEmail,
      phone: phone.trim(),
    });
    setError("");
    setEditing(false);
  };
  const toggle = (key: keyof ClientPreferences) =>
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
      <Text style={s.headerTitle}>Profile</Text>
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
          <Pill label="CLIENT" active green />
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
          <Text style={s.label}>PHONE NUMBER</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Optional"
            placeholderTextColor={C.muted}
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
                  setPhone(account.phone ?? "");
                  setError("");
                  setEditing(false);
                }}
              />
            </View>
            <View style={s.flex}>
              <Main label="Save Details" onPress={save} />
            </View>
          </View>
        </View>
      ) : null}
      <View>
        <Text style={s.group}>COMMUNICATION</Text>
        <View style={s.settings}>
          <View style={s.setting}>
            <Text style={s.settingText}>Booking reminders</Text>
            <Toggle
              value={preferences.bookingReminders}
              onPress={() => toggle("bookingReminders")}
            />
          </View>
          <View style={s.setting}>
            <Text style={s.settingText}>Studio updates</Text>
            <Toggle
              value={preferences.studioUpdates}
              onPress={() => toggle("studioUpdates")}
            />
          </View>
          <View style={s.setting}>
            <Text style={s.settingText}>Email receipts</Text>
            <Toggle
              value={preferences.emailReceipts}
              onPress={() => toggle("emailReceipts")}
            />
          </View>
        </View>
      </View>
      <View>
        <Text style={s.group}>MEMBERSHIP</Text>
        <View style={s.settings}>
          <Pressable onPress={openPass} style={s.setting}>
            <Text style={s.settingText}>My pass</Text>
            <ChevronRight size={20} color={C.muted} />
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert(
                "Payment methods",
                "Payment details are managed securely by the studio and are not stored in this app.",
              )
            }
            style={s.setting}
          >
            <Text style={s.settingText}>Payment methods</Text>
            <ChevronRight size={20} color={C.muted} />
          </Pressable>
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
      <Outline label="Log Out" onPress={logout} />
    </ScrollView>
  );
}

function ManagePlan({
  plan,
  back,
  open,
  duplicate,
  assign,
  rename,
  remove,
}: {
  plan: ClassPlan;
  back: () => void;
  open: () => void;
  duplicate: () => void;
  assign: () => void;
  rename: (name: string) => void;
  remove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.brief.program);
  const [error, setError] = useState("");
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
    Alert.alert(
      "Delete saved plan?",
      `${plan.brief.program} will be removed. Assigned classes will need another plan.`,
      [
        { text: "Keep plan", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: remove },
      ],
    );
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
            <Text style={s.settingText}>Assign to class</Text>
            <Text style={s.sub}>Use this plan in your schedule</Text>
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
  plan,
  preferences,
  exit,
  finish,
}: {
  plan: ClassPlan;
  preferences: InstructorPreferences;
  exit: () => void;
  finish: (result: SessionResult) => void;
}) {
  const movements = orderMovementsByPosition(plan.movements);
  const [held, setHeld] = useState(false);
  const [index, setIndex] = useState(0);
  const [startedAt] = useState(Date.now());
  const [moveTime, setMoveTime] = useState(movements[0].duration);
  const cardOffset = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const transitioning = useRef(false);
  const current = movements[index];
  const go = (next: number) => {
    const safe = Math.max(0, Math.min(movements.length - 1, next));
    if (safe === index || transitioning.current) return;
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
      setIndex(safe);
      setMoveTime(movements[safe].duration);
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
  const end = () => {
    if (preferences.vibration)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    finish({
      startedAt,
      endedAt: Date.now(),
      completed: index + 1,
      total: movements.length,
      plannedSeconds: planTotal(plan),
      actualSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
      planId: plan.id,
      program: plan.brief.program,
    });
  };
  const confirmEnd = () =>
    Alert.alert(
      index === movements.length - 1 ? "Complete class?" : "End class early?",
      index === movements.length - 1
        ? "This will create the session summary."
        : "The unfinished movements will be recorded in the summary.",
      [
        { text: "Keep teaching", style: "cancel" },
        {
          text: index === movements.length - 1 ? "Complete" : "End early",
          style: "destructive",
          onPress: end,
        },
      ],
    );
  useEffect(() => {
    const id = setInterval(() => {
      if (!held) setMoveTime((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [held]);
  useEffect(() => {
    if (moveTime === 0 && !held && index < movements.length - 1) go(index + 1);
  }, [moveTime, held, index]);
  useEffect(() => {
    if (preferences.vibration)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [index, preferences.vibration]);
  const nextStep = () => {
    if (index < movements.length - 1) go(index + 1);
    else confirmEnd();
  };
  const toggleHold = () => setHeld((value) => !value);
  const upcoming = movements[index + 1];
  const classLevel = plan.brief.program.toLowerCase().includes("intermediate")
    ? "Intermediate"
    : plan.brief.program.toLowerCase().includes("strong") ||
        plan.brief.program.toLowerCase().includes("advanced")
      ? "Advanced"
      : "Beginner";
  return (
    <View style={s.teach}>
      <StatusBar style="dark" />
      <View style={s.teachTop}>
        <Pressable onPress={exit} style={s.teachClose}>
          <X size={21} color="#EEE0E3" />
        </Pressable>
        <View style={s.flex}>
          <Text style={s.teachPlanMeta}>
            {classLevel} · {plan.brief.week} · {plan.brief.day}
          </Text>
          <Text style={s.teachSequence}>
            {current.phase === "Main" ? "Main Sequence" : current.phase}
          </Text>
        </View>
      </View>
      <View style={s.teachTimerBlock}>
        <Text style={s.teachTimer}>{fmt(moveTime)}</Text>
        <Text style={s.teachTimerTotal}>/ {fmt(current.duration)}</Text>
      </View>
      <Animated.View
        style={[
          s.movementCard,
          {
            opacity: cardOpacity,
            transform: [{ translateY: cardOffset }],
          },
        ]}
      >
        <View style={s.movementPhaseBadge}>
          <Text style={s.movementPhaseText}>
            {current.phase === "Main" ? "MAIN SEQUENCE" : current.phase.toUpperCase()}
          </Text>
        </View>
        <Text style={s.movementCardTitle}>{current.title}</Text>
        <Text style={s.movementCardCount}>
          Step {index + 1} of {movements.length}
        </Text>
        <View style={s.movementArtwork}>
          <UserRound size={42} color="#A57884" />
          <Text style={s.movementArtworkLabel}>movement visual</Text>
          <Text style={s.movementArtworkPosition}>{current.position}</Text>
        </View>
        <View style={s.movementCue}>
          <Text style={s.movementCueText}>{current.cue}</Text>
        </View>
      </Animated.View>
      <View style={s.controls}>
        <View style={s.teachControlGroup}>
          <Pressable
            onPress={() => go(index - 1)}
            disabled={index === 0}
            style={[s.navControl, index === 0 && s.disabled]}
          >
            <ChevronLeft size={22} color={C.ink} />
          </Pressable>
          <Text style={s.controlLabel}>Previous</Text>
        </View>
        <View style={s.teachControlGroup}>
          <Pressable onPress={toggleHold} style={s.hold}>
            {held ? (
              <Play size={21} color={C.white} fill={C.white} />
            ) : (
              <Pause size={21} color={C.white} fill={C.white} />
            )}
          </Pressable>
          <Text style={s.controlLabel}>{held ? "Resume" : "Hold"}</Text>
        </View>
        <View style={s.teachControlGroup}>
          <Pressable onPress={nextStep} style={s.navControl}>
            <ChevronRight size={22} color={C.ink} />
          </Pressable>
          <Text style={s.controlLabel}>Next</Text>
        </View>
      </View>
      <Pressable
        onPress={() => (upcoming ? go(index + 1) : confirmEnd())}
        style={s.upNext}
      >
        <View style={s.flex}>
          <Text style={s.nextMovementLabel}>
            {upcoming ? "UP NEXT" : "SESSION COMPLETE"}
          </Text>
          <Text style={s.upText}>
            {upcoming
              ? upcoming.title
              : "Complete class and review summary"}
          </Text>
          {upcoming ? <Text style={s.upTime}>{fmt(upcoming.duration)}</Text> : null}
        </View>
        {upcoming ? (
          <View style={s.upNextVisual}>
            <UserRound size={24} color="#A57884" />
            <Text style={s.upNextVisualText}>movement visual</Text>
          </View>
        ) : (
          <ChevronRight size={20} color="#D9C8CC" />
        )}
      </Pressable>
      <Pressable onPress={confirmEnd} style={s.endClass}>
        <Text style={s.endClassText}>End Class</Text>
      </Pressable>
    </View>
  );
}

function BlushBodiesApp() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [tab, setTab] = useState<Tab>("home");
  const [clientTab, setClientTab] = useState<ClientTab>("clientHome");
  const [role, setRole] = useState<Role>("instructor");
  const [account, setAccount] = useState<Account>({
    name: "Blush Bodies Instructor",
    email: "coach@blushbodies.com",
    role: "instructor",
  });
  const [booked, setBooked] = useState<number[]>([]);
  const [waitlisted, setWaitlisted] = useState<number[]>([]);
  const [plan, setPlan] = useState<ClassPlan>(() =>
    createPlan({
      program: "Beginner Foundations",
      week: "Week 2",
      day: "Day 4",
      energy: "Flowing",
      equipment: ["Mat"],
    }),
  );
  const [savedPlans, setSavedPlans] = useState<ClassPlan[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(
    null,
  );
  const [sessionHistory, setSessionHistory] = useState<SessionResult[]>([]);
  const [schedule, setSchedule] = useState<ScheduledClass[]>(initialSchedule);
  const [scheduleEditId, setScheduleEditId] = useState<string | undefined>();
  const [studioClasses, setStudioClasses] =
    useState<ClientClass[]>(clientClasses);
  const [libraryMovements, setLibraryMovements] =
    useState<LibraryMovement[]>(initialLibrary);
  const [favourites, setFavourites] = useState<string[]>([
    "side-leg-lift",
    "clamshell",
  ]);
  const [selectedMovement, setSelectedMovement] = useState<LibraryMovement>(
    initialLibrary[0],
  );
  const [instructorPreferences, setInstructorPreferences] =
    useState<InstructorPreferences>({
      teachingMode: "Guided",
      vibration: true,
      offline: false,
    });
  const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(
    {
      bookingReminders: !IS_EXPO_GO,
      studioUpdates: true,
      emailReceipts: true,
    },
  );
  const [hydrated, setHydrated] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void Promise.all([
      AsyncStorage.removeItem(LEGACY_STORAGE_KEY),
      AsyncStorage.getItem(STUDIO_SCHEDULE_KEY),
    ])
      .then(([, rawSchedule]) => {
        if (rawSchedule) {
          setStudioClasses(JSON.parse(rawSchedule) as ClientClass[]);
        }
      })
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (!hydrated || !signedIn) return;
    const stored: StoredAppData = {
      account,
      booked,
      waitlisted,
      plan,
      savedPlans,
      sessionHistory,
      schedule,
      libraryMovements,
      favourites,
      instructorPreferences,
      clientPreferences,
    };
    void AsyncStorage.setItem(userStorageKey(account), JSON.stringify(stored));
  }, [
    hydrated,
    signedIn,
    account,
    booked,
    waitlisted,
    plan,
    savedPlans,
    sessionHistory,
    schedule,
    libraryMovements,
    favourites,
    instructorPreferences,
    clientPreferences,
  ]);
  useEffect(() => {
    if (!hydrated || !signedIn || account.role !== "instructor") return;
    const plans = [plan, ...savedPlans];
    const published = schedule
      .filter((slot) => slot.date >= localDateKey())
      .map((slot) => ({
        id: publishedClassId(slot.id),
        date: slot.date,
        time: slot.time,
        name:
          plans.find((item) => item.id === slot.planId)?.brief.program ??
          `${slot.level} Pilates`,
        level: slot.level,
        studio: "Studio One",
        coach: account.name,
        capacity: 12,
        bookedCount: 0,
      }))
      .sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      );
    setStudioClasses(published);
    void AsyncStorage.setItem(STUDIO_SCHEDULE_KEY, JSON.stringify(published));
  }, [hydrated, signedIn, account, plan, savedPlans, schedule]);
  const select = (next: Tab) => {
    setTab(next);
    setScreen(next);
  };
  const selectClient = (next: ClientTab) => {
    setClientTab(next);
    setScreen(next);
  };
  const toggleBooking = async (id: number): Promise<BookingUpdateResult> => {
    const isBooked = booked.includes(id);
    setBooked((current) =>
      isBooked
        ? current.filter((item) => item !== id)
        : [...current.filter((item) => item !== id), id],
    );
    if (isBooked) {
      await cancelBookingReminders(account, id).catch(() => undefined);
      return "cancelled";
    }
    setWaitlisted((waiting) => waiting.filter((item) => item !== id));
    if (!clientPreferences.bookingReminders) return "booked";
    try {
      const permission = await ensureNotificationPermission();
      if (permission !== "granted") {
        setClientPreferences((current) => ({
          ...current,
          bookingReminders: false,
        }));
        return permission === "unavailable"
          ? "reminder-unavailable"
          : "reminder-denied";
      }
      const item = studioClasses.find((entry) => entry.id === id);
      if (!item) return "reminder-error";
      return (await scheduleBookingReminder(item, account))
        ? "reminder-scheduled"
        : "reminder-too-late";
    } catch {
      return "reminder-error";
    }
  };
  const toggleWaitlist = (id: number) =>
    setWaitlisted((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current.filter((item) => item !== id), id],
    );
  const updateClientPreferences = async (next: ClientPreferences) => {
    const remindersChanged =
      next.bookingReminders !== clientPreferences.bookingReminders;
    if (!remindersChanged) {
      setClientPreferences(next);
      return;
    }
    if (!next.bookingReminders) {
      setClientPreferences(next);
      await cancelBookingReminders(account).catch(() => undefined);
      return;
    }
    try {
      const permission = await ensureNotificationPermission();
      if (permission !== "granted") {
        Alert.alert(
          permission === "unavailable"
            ? "Development build required"
            : "Notifications are off",
          permission === "unavailable"
            ? "System reminders are unavailable in Expo Go. They will work in the development and production builds."
            : "Allow notifications in your device settings to use booking reminders.",
        );
        return;
      }
      setClientPreferences(next);
      const bookedClasses = studioClasses.filter((item) =>
        booked.includes(item.id),
      );
      await Promise.all(
        bookedClasses.map((item) => scheduleBookingReminder(item, account)),
      );
    } catch {
      Alert.alert(
        "Reminders unavailable",
        "Booking reminders could not be updated. Please try again.",
      );
    }
  };
  const duplicatePlan = () => {
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
    setScreen("generated");
  };
  const savePlan = () => {
    const saved = { ...plan, status: "saved" as const };
    setPlan(saved);
    setSavedPlans((current) => [
      saved,
      ...current.filter((item) => item.id !== saved.id),
    ]);
    if (saved.brief.scheduledDate && saved.brief.scheduledTime) {
      const scheduledDate = saved.brief.scheduledDate;
      const scheduledTime = saved.brief.scheduledTime;
      setSchedule((current) => {
        const matching = current.find(
          (slot) => slot.date === scheduledDate && slot.time === scheduledTime,
        );
        const scheduled: ScheduledClass = {
          id:
            matching?.id ??
            `slot-${scheduledDate}-${scheduledTime.replace(":", "")}`,
          date: scheduledDate,
          time: scheduledTime,
          level: saved.brief.program.includes("Intermediate")
            ? "Intermediate"
            : "Beginner",
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
    }
  };
  const renamePlan = (name: string) => {
    setPlan((current) => ({
      ...current,
      version: current.version + 1,
      brief: { ...current.brief, program: name },
    }));
    setSavedPlans((current) =>
      current.map((saved) =>
        saved.id === plan.id
          ? {
              ...saved,
              version: saved.version + 1,
              brief: { ...saved.brief, program: name },
            }
          : saved,
      ),
    );
  };
  const deletePlan = () => {
    const deletedId = plan.id;
    setSavedPlans((current) =>
      current.filter((saved) => saved.id !== deletedId),
    );
    setSchedule((current) =>
      current.map((slot) =>
        slot.planId === deletedId
          ? { ...slot, planId: undefined, status: "NEEDS PLAN" }
          : slot,
      ),
    );
    setPlan((current) => ({
      ...current,
      id: `BB-${Date.now()}`,
      version: 1,
      status: "draft",
    }));
    setScreen("classes");
  };
  const assignPlan = (slotId: string) => {
    if (plan.status !== "saved") {
      setScreen("generated");
      return;
    }
    setSchedule((current) =>
      current.map((slot) =>
        slot.id === slotId
          ? { ...slot, status: "READY", planId: plan.id }
          : slot,
      ),
    );
    setScreen("home");
  };
  const findPlan = (planId?: string) =>
    planId === plan.id ? plan : savedPlans.find((saved) => saved.id === planId);
  const startScheduledClass = (slot: ScheduledClass) => {
    const assignedPlan = findPlan(slot.planId);
    if (!assignedPlan) {
      setScreen("assign");
      return;
    }
    setPlan(assignedPlan);
    setScreen("teach");
  };
  const toggleFavourite = (id: string) =>
    setFavourites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const addMovementToPlan = () => {
    setPlan((current) => ({
      ...current,
      status: "draft",
      version: current.version + 1,
      movements: [
        ...current.movements,
        {
          id: `${selectedMovement.id}-${Date.now()}`,
          title: selectedMovement.name,
          position: selectedMovement.position,
          duration: selectedMovement.duration,
          phase: "Main",
          cue: selectedMovement.cues[0],
        },
      ],
    }));
    setScreen("editor");
  };
  const saveCustomMovement = (movement: LibraryMovement) => {
    setLibraryMovements((current) => [movement, ...current]);
    setSelectedMovement(movement);
    setScreen("details");
  };
  const createDefaultPlan = () =>
    createPlan({
      program: "Beginner Foundations",
      week: "Week 2",
      day: "Day 4",
      energy: "Flowing",
      equipment: ["Mat"],
    });
  const resetWorkspace = (owner: Account) => {
    setAccount(owner);
    setBooked([]);
    setWaitlisted([]);
    setPlan(createDefaultPlan());
    setSavedPlans([]);
    setSessionResult(null);
    setSessionHistory([]);
    setSchedule(initialSchedule);
    setLibraryMovements(initialLibrary);
    setFavourites(["side-leg-lift", "clamshell"]);
    setSelectedMovement(initialLibrary[0]);
    setInstructorPreferences({
      teachingMode: "Guided",
      vibration: true,
      offline: false,
    });
    setClientPreferences({
      bookingReminders: !IS_EXPO_GO,
      studioUpdates: true,
      emailReceipts: true,
    });
  };
  const loadWorkspace = async (owner: Account) => {
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
    setBooked(
      (stored.booked ?? []).filter((id) =>
        studioClasses.some((item) => item.id === id),
      ),
    );
    setWaitlisted(
      (stored.waitlisted ?? []).filter((id) =>
        studioClasses.some((item) => item.id === id),
      ),
    );
    setPlan(stored.plan ?? createDefaultPlan());
    setSavedPlans(stored.savedPlans ?? []);
    setSessionResult(null);
    setSessionHistory(stored.sessionHistory ?? []);
    setSchedule(
      (stored.schedule ?? initialSchedule).map((slot) => ({
        ...slot,
        date: slot.date ?? localDateKey(),
      })),
    );
    setLibraryMovements(stored.libraryMovements ?? initialLibrary);
    setFavourites(stored.favourites ?? ["side-leg-lift", "clamshell"]);
    setSelectedMovement(initialLibrary[0]);
    setInstructorPreferences(
      stored.instructorPreferences ?? {
        teachingMode: "Guided",
        vibration: true,
        offline: false,
      },
    );
    const savedClientPreferences = stored.clientPreferences ?? {
      bookingReminders: true,
      studioUpdates: true,
      emailReceipts: true,
    };
    setClientPreferences({
      ...savedClientPreferences,
      bookingReminders: !IS_EXPO_GO && savedClientPreferences.bookingReminders,
    });
  };
  const authenticate = async (
    chosen: Role,
    email: string,
    password: string,
  ): Promise<string | null> => {
    try {
      const credentials = await readCredentials();
      const credential = credentials.find(
        (item) => item.role === chosen && item.email === email,
      );
      if (!credential) return "No account was found. Create an account first.";
      const passwordHash = await hashPassword(password, credential.salt);
      if (passwordHash !== credential.passwordHash)
        return "The email or password is incorrect.";
      await loadWorkspace({
        name: credential.name,
        email: credential.email,
        role: credential.role,
      });
      setSignedIn(true);
      setScreen(chosen === "instructor" ? "home" : "clientHome");
      return null;
    } catch {
      return "Account verification is unavailable. Please try again.";
    }
  };
  const register = async (
    newAccount: Account,
    password: string,
  ): Promise<string | null> => {
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
      resetWorkspace(newAccount);
      setSignedIn(true);
      setScreen(newAccount.role === "instructor" ? "home" : "clientHome");
      return null;
    } catch {
      return "The account could not be created. Please try again.";
    }
  };
  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<string | null> => {
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
      return null;
    } catch {
      return "The local password could not be reset. Please try again.";
    }
  };
  const updateAccountDetails = (nextAccount: Account) => {
    const previous = account;
    setAccount(nextAccount);
    if (previous.email !== nextAccount.email) {
      void AsyncStorage.removeItem(userStorageKey(previous)).catch(
        () => undefined,
      );
      if (previous.role === "client" && clientPreferences.bookingReminders) {
        void cancelBookingReminders(previous)
          .then(() =>
            Promise.all(
              studioClasses
                .filter((item) => booked.includes(item.id))
                .map((item) => scheduleBookingReminder(item, nextAccount)),
            ),
          )
          .catch(() => undefined);
      }
    }
    void readCredentials()
      .then((credentials) =>
        writeCredentials(
          credentials.map((credential) =>
            credential.role === previous.role &&
            credential.email === previous.email
              ? {
                  ...credential,
                  name: nextAccount.name,
                  email: nextAccount.email,
                }
              : credential,
          ),
        ),
      )
      .catch(() => undefined);
  };
  const logout = () => {
    setSessionResult(null);
    setSignedIn(false);
    setScreen("welcome");
  };
  const resetAppData = () => {
    void AsyncStorage.getAllKeys()
      .then((keys) =>
        AsyncStorage.multiRemove(
          keys.filter(
            (key) =>
              key === LEGACY_STORAGE_KEY ||
              key === STUDIO_SCHEDULE_KEY ||
              key.startsWith(USER_STORAGE_PREFIX),
          ),
        ),
      )
      .catch(() => undefined);
    void deleteCredentials();
    void cancelAllBookingReminders();
    setStudioClasses(clientClasses);
    resetWorkspace({
      name: "Blush Bodies Instructor",
      email: "coach@blushbodies.com",
      role: "instructor",
    });
    setSignedIn(false);
    setTab("home");
    setClientTab("clientHome");
    setRole("instructor");
    setScreen("welcome");
  };
  if (!hydrated)
    return (
      <View style={s.loading}>
        <View style={s.largeAvatar}>
          <UserRound size={28} color={C.rose} />
        </View>
        <Text style={s.moveTitle}>Loading Blush Bodies...</Text>
      </View>
    );
  if (screen === "welcome")
    return (
      <Welcome
        choose={() => {
          setRole("instructor");
          setScreen("signin");
        }}
      />
    );
  if (screen === "signin")
    return (
      <SignIn
        role="instructor"
        back={() => setScreen("welcome")}
        signup={() => setScreen("signup")}
        resetPassword={() => setScreen("resetPassword")}
        complete={(email, password) =>
          authenticate("instructor", email, password)
        }
      />
    );
  if (screen === "resetPassword")
    return (
      <SandboxPasswordReset
        role="instructor"
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
        back={() => setScreen("signin")}
        complete={register}
      />
    );
  if (screen === "teach")
    return (
      <TeachingSession
        plan={plan}
        preferences={instructorPreferences}
        exit={() => setScreen("generated")}
        finish={(result) => {
          setSessionResult(result);
          setScreen("summary");
        }}
      />
    );
  if (screen === "summary" && sessionResult)
    return (
      <Summary
        plan={plan}
        result={sessionResult}
        done={(notes) => {
          const completed = { ...sessionResult, notes };
          setSessionResult(completed);
          setSessionHistory((current) => [completed, ...current]);
          setScreen("home");
        }}
      />
    );
  if (screen === "assign")
    return (
      <AssignPlan
        plan={plan}
        schedule={schedule}
        back={() => setScreen("home")}
        assign={assignPlan}
      />
    );
  if (screen === "schedule")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <View style={s.top} />
        <ScheduleManager
          schedule={schedule}
          initialEditId={scheduleEditId}
          back={() => {
            const destination = scheduleEditId ? "home" : "profile";
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
          }}
          remove={(id) =>
            setSchedule((current) => current.filter((slot) => slot.id !== id))
          }
        />
      </View>
    );
  if (screen === "managePlan")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <View style={s.top} />
        <ManagePlan
          plan={plan}
          back={() => setScreen("classes")}
          open={() => setScreen("generated")}
          duplicate={duplicatePlan}
          assign={() => setScreen("assign")}
          rename={renamePlan}
          remove={deletePlan}
        />
      </View>
    );
  if (screen === "dataSettings")
    return (
      <View style={s.app}>
        <StatusBar style="dark" />
        <View style={s.top} />
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
        <View style={s.top} />
        <ChangePassword
          back={() =>
            setScreen(
              account.role === "instructor" ? "profile" : "clientProfile",
            )
          }
          update={changePassword}
        />
      </View>
    );
  return (
    <View style={s.app}>
      <StatusBar style="dark" />
      <View style={s.top} />
      <View style={s.flex}>
        {screen === "home" ? (
          <InstructorHome
            schedule={schedule}
            account={account}
            plan={plan}
            create={() => setScreen("create")}
            teach={() =>
              plan.status === "saved"
                ? setScreen("teach")
                : setScreen("generated")
            }
            assign={() =>
              plan.status === "saved"
                ? setScreen("assign")
                : setScreen("generated")
            }
            start={startScheduledClass}
            modify={(slot) => {
              setScheduleEditId(slot.id);
              setScreen("schedule");
            }}
            remove={(slot) =>
              Alert.alert(
                "Delete scheduled class?",
                `${classDateLabel(slot.date, true)} at ${slot.time} will be removed from your schedule.`,
                [
                  { text: "Keep class", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () =>
                      setSchedule((current) =>
                        current.filter((item) => item.id !== slot.id),
                      ),
                  },
                ],
              )
            }
            getPlanTitle={(planId) => findPlan(planId)?.brief.program}
          />
        ) : null}
        {screen === "create" ? (
          <Create
            back={() => setScreen("home")}
            generate={(brief) => {
              setPlan(createPlan(brief));
              setScreen("generated");
            }}
          />
        ) : null}
        {screen === "generated" ? (
          <Generated
            plan={plan}
            back={() => setScreen("create")}
            edit={() => setScreen("editor")}
            save={savePlan}
            teach={() => setScreen("teach")}
          />
        ) : null}
        {screen === "classes" ? (
          <Plans
            plan={plan}
            savedPlans={savedPlans}
            lastSession={sessionResult}
            create={() => setScreen("create")}
            open={() => setScreen("generated")}
            duplicate={duplicatePlan}
            select={(selected) => {
              setPlan(selected);
              setScreen("managePlan");
            }}
          />
        ) : null}
        {screen === "editor" ? (
          <Classes
            plan={plan}
            change={(movements) =>
              setPlan((current) => ({
                ...current,
                movements,
                status: "draft",
                version: current.version + 1,
              }))
            }
            back={() => setScreen("generated")}
            open={() => setScreen("library")}
          />
        ) : null}
        {screen === "details" ? (
          <Details
            movement={selectedMovement}
            favourite={favourites.includes(selectedMovement.id)}
            back={() => setScreen("library")}
            toggle={() => toggleFavourite(selectedMovement.id)}
            add={addMovementToPlan}
          />
        ) : null}
        {screen === "customMovement" ? (
          <CustomMovement
            back={() => setScreen("library")}
            save={saveCustomMovement}
          />
        ) : null}
        {screen === "library" ? (
          <Library
            movements={libraryMovements}
            favourites={favourites}
            open={(movement) => {
              setSelectedMovement(movement);
              setScreen("details");
            }}
            create={() => setScreen("customMovement")}
            toggle={toggleFavourite}
          />
        ) : null}
        {screen === "insights" ? (
          <Insights sessions={sessionHistory} schedule={schedule} />
        ) : null}
        {screen === "profile" ? (
          <Profile
            account={account}
            preferences={instructorPreferences}
            updateAccount={updateAccountDetails}
            updatePreferences={setInstructorPreferences}
            navigate={(target) =>
              target === "home" ? setScreen("schedule") : select(target)
            }
            manageData={() => setScreen("dataSettings")}
            openSecurity={() => setScreen("changePassword")}
            logout={logout}
          />
        ) : null}
      </View>
      {(
        ["home", "classes", "library", "insights", "profile"] as Screen[]
      ).includes(screen) ? (
        <Nav tab={tab} setTab={select} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "#EDE7E5" : C.bg,
    alignItems: Platform.OS === "web" ? "center" : "stretch",
  },
  appViewport: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 480 : undefined,
    backgroundColor: C.bg,
  },
  app: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  top: {
    height:
      Platform.OS === "android" ? (NativeStatusBar.currentHeight ?? 24) : 44,
  },
  page: { paddingHorizontal: 24, paddingBottom: 28, gap: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stack: { gap: 10 },
  pressed: { opacity: 0.76 },
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
  roleCard: {
    minHeight: 128,
    borderRadius: 18,
    backgroundColor: C.card,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  roleIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F3E3E5",
    alignItems: "center",
    justifyContent: "center",
  },
  roleTitle: { color: C.ink, fontSize: 17, fontWeight: "800", marginBottom: 4 },
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
  todayPlan: {
    minHeight: 91,
    borderRadius: 17,
    backgroundColor: C.card,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  classCard: {
    minHeight: 86,
    borderRadius: 15,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    gap: 11,
    paddingRight: 16,
  },
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
  time: { width: 50, alignItems: "center" },
  timeText: { color: C.ink, fontSize: 14, fontWeight: "800" },
  duration: { color: C.muted, fontSize: 10, fontWeight: "700" },
  level: { color: C.ink, fontSize: 14, fontWeight: "800" },
  week: { color: C.muted, fontSize: 11, marginTop: 5 },
  action: { width: 95, alignItems: "flex-end", gap: 8 },
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
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
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
  sessionNote: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  emptyCard: {
    minHeight: 70,
    borderRadius: 16,
    backgroundColor: C.card,
    padding: 16,
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
  moveTitle: { color: C.ink, fontSize: 14, fontWeight: "800" },
  moveTime: { color: C.ink, fontSize: 12, fontWeight: "800" },
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
  transition: {
    borderRadius: 15,
    backgroundColor: "#F4E3E3",
    padding: 17,
    gap: 7,
  },
  transitionText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  teach: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop:
      Platform.OS === "android" ? (NativeStatusBar.currentHeight ?? 24) : 44,
    paddingHorizontal: 20,
  },
  teachTop: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teachClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  teachPlanMeta: { color: C.ink, fontSize: 13, fontWeight: "800" },
  teachSequence: { color: C.muted, fontSize: 11, marginTop: 3 },
  teachTimerBlock: { alignItems: "center", paddingVertical: 8 },
  teachTimer: { color: C.ink, fontSize: 40, fontWeight: "900" },
  teachTimerTotal: { color: C.muted, fontSize: 13, marginTop: 1 },
  context: { flex: 1, color: "#E7D9DC", fontSize: 10, fontWeight: "800" },
  light: { color: "#CBC0C2", fontSize: 11 },
  clock: { color: C.white, fontSize: 31, fontWeight: "800" },
  counter: { color: "#DDD2D4", fontSize: 12, fontWeight: "800" },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4B4446",
    marginTop: 10,
    overflow: "hidden",
  },
  fill: {
    width: "36%",
    height: "100%",
    backgroundColor: "#E6C8CF",
    borderRadius: 3,
  },
  live: {
    marginTop: 24,
    borderRadius: 25,
    backgroundColor: C.darkCard,
    padding: 20,
    gap: 12,
  },
  liveLabel: { color: "#E8D8DC", fontSize: 9, fontWeight: "800" },
  liveTitle: { color: C.white, fontSize: 27, fontWeight: "800" },
  liveMeta: { color: "#D6C8CB", fontSize: 12, fontWeight: "700" },
  movementCard: {
    flex: 1,
    minHeight: 280,
    maxHeight: 440,
    marginTop: 8,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    padding: 18,
    overflow: "hidden",
  },
  movementCardSeries: { color: C.rose, fontSize: 10, fontWeight: "900" },
  movementCardCount: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
  },
  movementPhaseBadge: {
    minHeight: 25,
    alignSelf: "flex-start",
    borderRadius: 13,
    backgroundColor: "#F5E6E8",
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  movementPhaseText: { color: C.rose, fontSize: 9, fontWeight: "900" },
  movementArtwork: {
    flex: 1,
    minHeight: 120,
    borderRadius: 13,
    backgroundColor: "#F4E3E3",
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  movementArtworkRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: "rgba(149,89,107,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  movementArtworkLabel: { color: C.muted, fontSize: 13 },
  movementArtworkPosition: {
    color: C.rose,
    fontSize: 10,
    fontWeight: "800",
  },
  movementCardTitle: {
    color: C.ink,
    fontSize: 23,
    fontWeight: "900",
    marginTop: 5,
  },
  movementMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  movementMetaItem: {
    minHeight: 30,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.62)",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  movementMetaText: { color: C.ink, fontSize: 10, fontWeight: "800" },
  movementCue: {
    minHeight: 56,
    justifyContent: "center",
    paddingTop: 12,
  },
  movementCueLabel: { color: C.rose, fontSize: 9, fontWeight: "900" },
  movementCueText: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
  movementCardTimer: {
    minHeight: 42,
    borderTopWidth: 2,
    borderTopColor: "rgba(55,49,51,0.2)",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  movementTimerLabel: { color: C.muted, fontSize: 9, fontWeight: "900" },
  movementTimerValue: { color: C.ink, fontSize: 25, fontWeight: "900" },
  activeCue: {
    borderRadius: 16,
    backgroundColor: "#41393B",
    padding: 17,
    gap: 7,
  },
  cueLive: { color: C.white, fontSize: 17, fontWeight: "800" },
  moveClock: { color: C.white, fontSize: 22, fontWeight: "800" },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginTop: 15,
  },
  teachControlGroup: { width: 76, alignItems: "center", gap: 6 },
  navControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EEE7E5",
    alignItems: "center",
    justifyContent: "center",
  },
  controlLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  hold: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.rose,
    alignItems: "center",
    justifyContent: "center",
  },
  holdText: { fontSize: 11, color: C.dark, fontWeight: "800" },
  upNext: {
    minHeight: 82,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingLeft: 14,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    overflow: "hidden",
  },
  nextMovementLabel: { color: C.rose, fontSize: 9, fontWeight: "900" },
  upText: { color: C.ink, fontSize: 13, fontWeight: "800", marginTop: 5 },
  upTime: { color: C.muted, fontSize: 10, marginTop: 4 },
  upNextVisual: {
    width: 112,
    alignSelf: "stretch",
    backgroundColor: "#F4E3E3",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  upNextVisualText: { color: C.muted, fontSize: 9 },
  endClass: {
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  endClassText: { color: C.rose, fontSize: 11, fontWeight: "800" },
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
  filterRow: { gap: 8, paddingRight: 20 },
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
  },
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
  clientHero: {
    minHeight: 178,
    borderRadius: 20,
    backgroundColor: "#EBCFD4",
    padding: 21,
    justifyContent: "center",
    gap: 8,
  },
  clientEyebrow: { color: C.rose, fontSize: 10, fontWeight: "800" },
  clientHeroTitle: { color: C.ink, fontSize: 25, fontWeight: "800" },
  clientHeroMeta: { color: C.ink, fontSize: 13, fontWeight: "700" },
  clientHeroButton: {
    alignSelf: "flex-start",
    marginTop: 7,
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  clientHeroButtonText: { fontSize: 11, fontWeight: "800", color: C.sage },
  link: { color: C.rose, fontSize: 12, fontWeight: "800" },
  clientClass: {
    minHeight: 72,
    borderRadius: 15,
    backgroundColor: C.card,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  clientDay: { width: 29, color: C.rose, fontSize: 10, fontWeight: "800" },
  passCard: {
    minHeight: 115,
    borderRadius: 18,
    backgroundColor: C.rose,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  passLabel: { color: "#F7E7EA", fontSize: 10, fontWeight: "800" },
  passCount: { color: C.white, fontSize: 31, fontWeight: "800", marginTop: 4 },
  passSmall: { color: "#F7E7EA", fontSize: 13, fontWeight: "700" },
  passDate: { color: "#EFCED4", fontSize: 11, fontWeight: "700", marginTop: 3 },
  bookingCard: {
    borderRadius: 18,
    backgroundColor: C.card,
    padding: 18,
    gap: 16,
  },
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
  bookingMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bookingFooter: {
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bookButton: {
    height: 34,
    minWidth: 72,
    borderRadius: 17,
    backgroundColor: C.rose,
    alignItems: "center",
    justifyContent: "center",
  },
  bookedButton: {
    height: 34,
    minWidth: 72,
    borderRadius: 17,
    backgroundColor: C.paleSage,
    alignItems: "center",
    justifyContent: "center",
  },
  bookText: { color: C.white, fontSize: 11, fontWeight: "800" },
  bookedText: { color: C.sage, fontSize: 11, fontWeight: "800" },
  bigPass: {
    minHeight: 230,
    borderRadius: 21,
    backgroundColor: C.rose,
    padding: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  bigPassCount: {
    fontSize: 68,
    color: C.white,
    fontWeight: "800",
    marginTop: 10,
  },
  passProgress: {
    height: 7,
    width: "100%",
    backgroundColor: "#B87786",
    borderRadius: 4,
    marginTop: 20,
    overflow: "hidden",
  },
  passProgressFill: {
    height: "100%",
    width: "40%",
    backgroundColor: "#F6DDE1",
    borderRadius: 4,
  },
  upcoming: {
    minHeight: 74,
    borderRadius: 16,
    backgroundColor: C.card,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  studioCover: {
    height: 155,
    borderRadius: 20,
    backgroundColor: "#EBCFD4",
    alignItems: "center",
    justifyContent: "center",
  },
  studioInfo: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  dangerText: { color: "#A34848", fontSize: 13, fontWeight: "800" },
  loading: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
});

export default function App() {
  return (
    <GestureHandlerRootView style={s.appRoot}>
      <View style={s.appViewport}>
        <BlushBodiesApp />
      </View>
    </GestureHandlerRootView>
  );
}
