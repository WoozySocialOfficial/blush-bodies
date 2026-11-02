const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type SchedulePoint = { date: string; time: string; status?: string };

export type ScheduleFilter =
  | "Upcoming"
  | "Completed"
  | "Needs plan"
  | "Drafts"
  | "Cancelled";

const minutesFromTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const scheduleSlotStartsAt = (slot: SchedulePoint) => {
  const [year, month, day] = slot.date.split("-").map(Number);
  const [hours, minutes] = slot.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

export const isFutureScheduleSlot = (slot: SchedulePoint, now: Date) =>
  scheduleSlotStartsAt(slot).getTime() > now.getTime();

export const scheduleSlotsOverlap = (
  first: SchedulePoint,
  second: SchedulePoint,
  durationMinutes = 45,
) => {
  if (first.date !== second.date) return false;
  const firstStart = minutesFromTime(first.time);
  const secondStart = minutesFromTime(second.time);
  return (
    firstStart < secondStart + durationMinutes &&
    secondStart < firstStart + durationMinutes
  );
};

export const rescheduleSlot = <T extends SchedulePoint>(
  slot: T,
  date: string,
  time: string,
): T => ({ ...slot, date, time });

export const filterSchedule = <T extends SchedulePoint>(
  schedule: T[],
  filter: ScheduleFilter,
  now: Date,
) =>
  schedule
    .filter((slot) => {
      if (filter === "Upcoming")
        return (
          slot.status !== "COMPLETED" &&
          slot.status !== "CANCELLED" &&
          isFutureScheduleSlot(slot, now)
        );
      if (filter === "Completed") return slot.status === "COMPLETED";
      if (filter === "Needs plan") return slot.status === "NEEDS PLAN";
      if (filter === "Drafts") return slot.status === "DRAFT";
      return slot.status === "CANCELLED";
    })
    .sort((first, second) =>
      `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`),
    );

export const timeFromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const scheduleTimeOptions = (date: string, now: Date) => {
  const isToday = date === localDateKey(now);
  const nextQuarterHour =
    Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) * 15 + 15;

  return Array.from({ length: 24 * 4 }, (_, index) => index * 15)
    .filter((minutes) => !isToday || minutes >= nextQuarterHour)
    .map(timeFromMinutes);
};

export const nextAvailableClassSlot = (
  schedule: SchedulePoint[],
  now: Date,
  durationMinutes = 45,
) => {
  const openingMinutes = 8 * 60;
  const latestStartMinutes = 20 * 60;
  const todayMinutes = now.getHours() * 60 + now.getMinutes();

  for (let dayOffset = 0; dayOffset <= 120; dayOffset += 1) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() + dayOffset);
    const date = localDateKey(day);
    const firstStart = dayOffset === 0
      ? Math.max(
          openingMinutes,
          Math.floor(todayMinutes / 15) * 15 + 15,
        )
      : openingMinutes;
    const occupied = schedule
      .filter((slot) => slot.date === date && slot.status !== "CANCELLED")
      .map((slot) => minutesFromTime(slot.time));

    for (
      let candidate = firstStart;
      candidate <= latestStartMinutes;
      candidate += 15
    ) {
      const overlaps = occupied.some((start) =>
        scheduleSlotsOverlap(
          { date, time: timeFromMinutes(candidate) },
          { date, time: timeFromMinutes(start) },
          durationMinutes,
        ),
      );
      if (!overlaps) return { date, time: timeFromMinutes(candidate) };
    }
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 121);
  return { date: localDateKey(fallback), time: timeFromMinutes(openingMinutes) };
};
