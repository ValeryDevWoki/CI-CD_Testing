// src/utils/dateUtils.js

/**
 * Returns a Date object for the Sunday of "Week #1" in the given year,
 * based on a Sunday-start-of-week system.
 *
 * Example: If Jan 1 is Wednesday (dayOfWeek=3),
 * then we move back 3 days so that SundayOfWeekOne is the prior Sunday (Dec 29).
 */
function getSundayOfWeekOne(year) {
    // Jan 1 of the given year (local time)
    const jan1 = new Date(year, 0, 1);
    // dayOfWeek => 0=Sunday, 1=Monday, ... 6=Saturday
    const dayOfWeek = jan1.getDay();
    // Move back 'dayOfWeek' days to get the Sunday
    const sundayTime = jan1.getTime() - dayOfWeek * 86400000;
    return new Date(sundayTime);
}

/**
 * Returns a string "YYYY-Wxx" representing the *current* week
 * in a Sunday-based system.
 *
 * For example: If today's date is 2025-02-13, and Jan 1 was a Wednesday,
 * then Sunday of Week #1 was Dec 29 (previous year),
 * so 2025-02-13 would be recognized as "2025-W07".
 */
export function getCurrentWeekCode(date = new Date()) {
    const year = date.getFullYear();
    const sundayOfWeekOne = getSundayOfWeekOne(year);

    // Days between that Sunday and 'date'
    const dayDiff = Math.floor((date - sundayOfWeekOne) / 86400000);

    // If dayDiff < 0, means we're still in the tail of last year
    // For simplicity, clamp to week #1. Or you could shift to the previous year's final week.
    let weekNum = 1 + Math.floor(dayDiff / 7);
    if (weekNum < 1) {
        // We can adjust to last year's final weeks if needed, but here's a simple clamp to 1:
        weekNum = 1;
    }

    // Return "YYYY-Wxx" (e.g. "2025-W07")
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Parse a "YYYY-Wxx" string and return an object { year, week }
 */
export function parseWeekCode(weekCode) {
    const [yr, w] = weekCode.split('-W');
    return {
        year: parseInt(yr, 10),
        week: parseInt(w, 10),
    };
}

/**
 * Format back to "YYYY-Wxx" with zero-padded week (1 => "01", etc.)
 */
export function formatWeekCode(year, week) {
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Add or subtract 'offset' weeks from a "YYYY-Wxx".
 * Example: nextWeek("2025-W06", +1) => "2025-W07"
 */
export function nextWeek(weekCode, offset = 1) {
    const { year, week } = parseWeekCode(weekCode);
    let newWeek = week + offset;
    let newYear = year;

    // Handle year rollover (very simplistic with "52" as a base;
    // if your year might have 53 weeks in a Sunday-based context, consider adjusting).
    if (newWeek < 1) {
        newYear -= 1;
        newWeek = 52 + newWeek; // e.g. if newWeek was 0, it becomes 52
    } else if (newWeek > 52) {
        newYear += Math.floor((newWeek - 1) / 52);
        newWeek = ((newWeek - 1) % 52) + 1;
    }

    return formatWeekCode(newYear, newWeek);
}

/**
 * A convenience helper for moving backward in weeks.
 * Example: prevWeek("2025-W10", 1) => "2025-W09"
 */
export function prevWeek(weekCode, offset = 1) {
    return nextWeek(weekCode, -offset);
}

/**
 * Return a Date object for the given dayIndex (0=Sunday, ..., 6=Saturday)
 * in the specified Sunday-based "YYYY-Wxx".
 *
 * Steps:
 * 1) Find the Sunday that starts "Week #1" for 'year'.
 * 2) Advance by (week - 1)*7 days to get the Sunday of that target 'week'.
 * 3) Then add 'dayIndex' days to get the final date.
 */
export function getDateForWeekDay(weekCode, dayIndex) {
    // dayIndex=0 => Sunday, dayIndex=6 => Saturday
    const { year, week } = parseWeekCode(weekCode);

    // Sunday of "Week #1"
    const sundayOfWeekOne = getSundayOfWeekOne(year);

    // Sunday of the target 'week'
    const daysOffset = (week - 1) * 7 + dayIndex;
    const targetTime = sundayOfWeekOne.getTime() + daysOffset * 86400000;

    return new Date(targetTime);
}

/**
 * Format a Date object as "DD/MM" (day/month), ignoring year.
 * Example: if date is 2025-02-13, returns "13/02".
 */
export function formatDDMM(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}`;
}

/**
 * Optional: Check if a target week is within N weeks forward from the current week.
 * Returns true if targetWeek <= currentWeek + maxWeeks.
 */
export function withinMaxFutureWeeks(targetWeek, maxWeeks = 4) {
    const current = getCurrentWeekCode();
    const { year: cy, week: cw } = parseWeekCode(current);
    const { year: ty, week: tw } = parseWeekCode(targetWeek);

    // approximate difference in weeks
    const diffYear = (ty - cy) * 52;
    const diffWeek = tw - cw;
    const totalDiff = diffYear + diffWeek;

    return totalDiff <= maxWeeks;
}
