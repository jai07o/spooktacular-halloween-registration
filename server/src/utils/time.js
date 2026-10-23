/**
 * Time utilities with configurable test clock for date-boundary testing.
 * All times use Asia/Kolkata timezone.
 */

const TIMEZONE = 'Asia/Kolkata';
const TIMEZONE_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30

/**
 * Get the current time, optionally overridden by TEST_CLOCK_OVERRIDE env var.
 * @returns {Date}
 */
function now() {
  if (process.env.TEST_CLOCK_OVERRIDE) {
    return new Date(process.env.TEST_CLOCK_OVERRIDE);
  }
  return new Date();
}

/**
 * Convert a Date to IST (Asia/Kolkata) midnight-based date comparison.
 * Returns { year, month, day } in IST.
 */
function toIST(date) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const ist = new Date(utc + TIMEZONE_OFFSET_MS);
  return {
    year: ist.getFullYear(),
    month: ist.getMonth() + 1,
    day: ist.getDate(),
    hours: ist.getHours(),
    minutes: ist.getMinutes(),
    seconds: ist.getSeconds(),
    date: ist
  };
}

/**
 * Format date for display (IST)
 */
function formatIST(date) {
  return date.toLocaleString('en-IN', { timeZone: TIMEZONE });
}

/**
 * Format date as ISO string preserving IST
 */
function toISOStringIST(date) {
  const ist = toIST(date);
  const d = ist.date;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+05:30`;
}

/**
 * Check if registration deadline has passed.
 * Deadline: End of 30 October 2026, IST (i.e., before 31 Oct starts).
 */
function isRegistrationClosed(currentDate) {
  const date = currentDate || now();
  const ist = toIST(date);
  // Deadline: 30 Oct 2026, 23:59:59 IST
  // Registration is closed if date is 31 Oct 2026 or later
  if (ist.year > 2026) return true;
  if (ist.year === 2026 && ist.month > 10) return true;
  if (ist.year === 2026 && ist.month === 10 && ist.day >= 31) return true;
  return false;
}

/**
 * Get current pricing based on date.
 * Early bird: Until 25 Oct 2026 (inclusive) = ₹249
 * Regular: 26 Oct - 30 Oct 2026 = ₹299
 */
function getCurrentPricing(currentDate) {
  const date = currentDate || now();
  const ist = toIST(date);

  if (isRegistrationClosed(date)) {
    return { available: false, reason: 'Registration is closed' };
  }

  // Early bird: up to and including 25 Oct 2026
  if (ist.year < 2026 || (ist.year === 2026 && ist.month < 10) ||
      (ist.year === 2026 && ist.month === 10 && ist.day <= 25)) {
    return {
      available: true,
      unitPrice: 249,
      category: 'EARLY_BIRD',
      label: 'Early Bird',
      deadline: '25 October 2026'
    };
  }

  // Regular: 26 Oct - 30 Oct 2026
  return {
    available: true,
    unitPrice: 299,
    category: 'REGULAR',
    label: 'Regular',
    deadline: '30 October 2026'
  };
}

module.exports = {
  now,
  toIST,
  formatIST,
  toISOStringIST,
  isRegistrationClosed,
  getCurrentPricing,
  TIMEZONE
};
