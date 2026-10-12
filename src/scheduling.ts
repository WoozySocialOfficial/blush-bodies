const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

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
