type CalendarClass = {
  id: string;
  date: string;
  time: string;
  level: string;
  lesson: string;
};

const utcCalendarStamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

const escapeCalendarText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

export const classCalendarDates = (
  scheduledClass: Pick<CalendarClass, "date" | "time">,
  durationMinutes = 45,
) => {
  const [year, month, day] = scheduledClass.date.split("-").map(Number);
  const [hours, minutes] = scheduledClass.time.split(":").map(Number);
  const start = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return {
    start,
    end: new Date(start.getTime() + durationMinutes * 60 * 1000),
  };
};

export const classCalendarTitle = (scheduledClass: CalendarClass) =>
  `Blush Bodies ${scheduledClass.level} Class`;

export const classCalendarEvent = (scheduledClass: CalendarClass) => {
  const { start, end } = classCalendarDates(scheduledClass);
  return {
    title: classCalendarTitle(scheduledClass),
    notes: `${scheduledClass.lesson} / 45-minute class`,
    startDate: start,
    endDate: end,
  };
};

export const googleCalendarUrl = (scheduledClass: CalendarClass) => {
  const { title, notes, startDate, endDate } = classCalendarEvent(scheduledClass);
  const params = [
    ["action", "TEMPLATE"],
    ["text", title],
    ["dates", `${utcCalendarStamp(startDate)}/${utcCalendarStamp(endDate)}`],
    ["details", notes],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `https://calendar.google.com/calendar/render?${params}`;
};

export const classCalendarFileName = (scheduledClass: CalendarClass) =>
  `blush-bodies-${scheduledClass.date}-${scheduledClass.time.replace(":", "")}.ics`;

export const classCalendarIcs = (
  scheduledClass: CalendarClass,
  createdAt = new Date(),
) => {
  const { title, notes, startDate, endDate } = classCalendarEvent(scheduledClass);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blush Bodies//Class Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(scheduledClass.id)}@busybodies.app`,
    `DTSTAMP:${utcCalendarStamp(createdAt)}`,
    `DTSTART:${utcCalendarStamp(startDate)}`,
    `DTEND:${utcCalendarStamp(endDate)}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(notes)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
};
