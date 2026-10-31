// Geometric solar position using NOAA's Meeus-based equations:
// https://gml.noaa.gov/grad/solcalc/calcdetails.html
const RAD = Math.PI / 180;
const MINUTE = 60_000;

function altitude(time: number, lat: number, lon: number): number {
  const t = (time / 86_400_000 + 2440587.5 - 2451545) / 36525;
  const l = ((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) * RAD;
  const m = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * RAD;
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c = (Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289) * RAD;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const lambda = l + c - (0.00569 + 0.00478 * Math.sin(omega)) * RAD;
  const epsilon = (23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    + 0.00256 * Math.cos(omega)) * RAD;
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const y = Math.tan(epsilon / 2) ** 2;
  const eq = 4 / RAD * (y * Math.sin(2 * l) - 2 * e * Math.sin(m)
    + 4 * e * y * Math.sin(m) * Math.cos(2 * l)
    - 0.5 * y * y * Math.sin(4 * l) - 1.25 * e * e * Math.sin(2 * m));
  const utcMinutes = ((time % 86_400_000) + 86_400_000) % 86_400_000 / MINUTE;
  const hourAngle = ((utcMinutes + eq + 4 * lon) / 4 - 180) * RAD;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(decl)
    + Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(hourAngle)) / RAD;
}

export interface SolarEvents {
  dawn: number | null;
  dusk: number | null;
  sunrise: number | null;
  sunset: number | null;
}

/** Find crossings independently within the selected location's calendar day.
 * Scanning UTC also covers DST days and locations across the date line.
 */
export function solarEvents(date: string, lat: number, lon: number, timezone: string): SolarEvents {
  const events: SolarEvents = { dawn: null, dusk: null, sunrise: null, sunset: null };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return events;
  const calendar = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const localDate = (time: number) => {
    const parts = calendar.formatToParts(time);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const start = Date.parse(`${date}T00:00:00Z`) - 18 * 60 * MINUTE;
  const end = start + 60 * 60 * MINUTE;
  const step = 5 * MINUTE;
  let previous = altitude(start, lat, lon);
  for (let time = start + step; time <= end; time += step) {
    const current = altitude(time, lat, lon);
    for (const threshold of [-6, -0.833]) {
      const rising = previous < threshold && current >= threshold;
      const falling = previous >= threshold && current < threshold;
      if (!rising && !falling) continue;
      let low = time - step;
      let high = time;
      while (high - low > 1000) {
        const mid = (low + high) / 2;
        if ((altitude(mid, lat, lon) >= threshold) === rising) high = mid;
        else low = mid;
      }
      const crossing = (low + high) / 2;
      if (localDate(crossing) !== date) continue;
      const key = threshold === -6 ? (rising ? "dawn" : "dusk") : (rising ? "sunrise" : "sunset");
      events[key] = crossing;
    }
    previous = current;
  }
  return events;
}

export function solarClock(time: number | null, timezone: string): string {
  if (time == null) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(Math.round(time / MINUTE) * MINUTE);
}
