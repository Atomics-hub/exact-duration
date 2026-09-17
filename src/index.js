// Duration parsing that refuses to guess.
//
// Durations arrive as text — a config file, a CLI flag, an environment variable, an API payload —
// and every parser in this space makes one of two trades. `ms` accepts only a single unit, so
// `1h30m` is simply rejected. The parsers that do accept `1h30m` accept almost anything else too:
// `1,5h` becomes fifteen hours, `1h30` quietly becomes one hour, and `1h-30m` means different things
// in different libraries.
//
// This accepts every form that actually turns up and throws on everything else. A wrong timeout is
// worth an exception at startup; it is not worth a silent ten-fold error in a cache expiry.
//
// Calendar units are refused on purpose. A month is 28 to 31 days and a year is 365 or 366, so
// neither has a millisecond value without a reference date. Parsers that accept them are choosing an
// average and presenting it as a fact.

export class DurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DurationError';
  }
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const UNITS = new Map([
  ['ms', 1], ['msec', 1], ['msecs', 1], ['millisecond', 1], ['milliseconds', 1],
  ['s', SECOND], ['sec', SECOND], ['secs', SECOND], ['second', SECOND], ['seconds', SECOND],
  ['m', MINUTE], ['min', MINUTE], ['mins', MINUTE], ['minute', MINUTE], ['minutes', MINUTE],
  ['h', HOUR], ['hr', HOUR], ['hrs', HOUR], ['hour', HOUR], ['hours', HOUR],
  ['d', DAY], ['day', DAY], ['days', DAY],
  ['w', WEEK], ['wk', WEEK], ['wks', WEEK], ['week', WEEK], ['weeks', WEEK],
]);

// Named so the error can say what was meant rather than only that it failed.
const CALENDAR_UNITS = new Map([
  ['mo', 'months'], ['mos', 'months'], ['month', 'months'], ['months', 'months'],
  ['y', 'years'], ['yr', 'years'], ['yrs', 'years'], ['year', 'years'], ['years', 'years'],
]);

const calendarRefusal = (name) =>
  `${name} cannot be converted to a fixed number of milliseconds: a month is 28 to 31 days and a ` +
  'year is 365 or 366, so the length depends on when it starts. Use days instead, for example 30d or 365d.';

const isDigit = (ch) => ch >= '0' && ch <= '9';
const isLetter = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');

function checkFinite(total, input) {
  if (!Number.isFinite(total) || Math.abs(total) > Number.MAX_SAFE_INTEGER) {
    throw new DurationError(`${JSON.stringify(input)} is too large to represent exactly in milliseconds`);
  }
  return total;
}

// `1h30m`, `1 hour 30 minutes`, `2d4h`, `-5m`. Every component must carry a unit, each unit may be
// used once, and a sign may only lead — which is what makes `1h30`, `1,5h` and `1h-30m` errors here
// rather than three different numbers.
function parseUnitForm(input) {
  const text = input.trim();
  let i = 0;
  let sign = 1;

  if (text[i] === '+' || text[i] === '-') {
    sign = text[i] === '-' ? -1 : 1;
    i += 1;
    if (text[i] === '+' || text[i] === '-') {
      throw new DurationError(`${JSON.stringify(input)} has more than one sign`);
    }
  }

  let total = 0;
  let components = 0;
  const used = new Set();

  while (i < text.length) {
    // Separators between components: spaces, commas and the word "and".
    let skipped = false;
    while (i < text.length) {
      const ch = text[i];
      if (ch === ' ' || ch === '\t' || ch === ',') { i += 1; skipped = true; continue; }
      if (text.slice(i, i + 3).toLowerCase() === 'and' && !isLetter(text[i + 3] ?? '')) { i += 3; skipped = true; continue; }
      break;
    }
    if (i >= text.length) break;

    const numberStart = i;
    while (i < text.length && isDigit(text[i])) i += 1;
    if (i < text.length && text[i] === '.') {
      i += 1;
      if (!isDigit(text[i] ?? '')) throw new DurationError(`${JSON.stringify(input)} has a dot that is not part of a number`);
      while (i < text.length && isDigit(text[i])) i += 1;
    }
    if (i === numberStart) {
      const ch = text[i];
      if (ch === '+' || ch === '-') throw new DurationError(`${JSON.stringify(input)} has a sign in the middle; only a leading sign is allowed`);
      throw new DurationError(`${JSON.stringify(input)} has "${text.slice(i)}" where a number was expected`);
    }
    const amount = Number(text.slice(numberStart, i));

    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i += 1;

    const unitStart = i;
    while (i < text.length && isLetter(text[i])) i += 1;
    const unitName = text.slice(unitStart, i).toLowerCase();

    if (unitName === '') {
      throw new DurationError(
        `${JSON.stringify(input)} has the number ${text.slice(numberStart, unitStart).trim()} with no unit. ` +
        'Every number needs a unit, for example 30s or 1h30m.',
      );
    }
    if (CALENDAR_UNITS.has(unitName)) throw new DurationError(calendarRefusal(CALENDAR_UNITS.get(unitName)));
    const scale = UNITS.get(unitName);
    if (scale === undefined) throw new DurationError(`${JSON.stringify(input)} uses an unknown unit "${unitName}"`);
    if (used.has(scale)) throw new DurationError(`${JSON.stringify(input)} uses the same unit twice`);
    used.add(scale);

    total += amount * scale;
    components += 1;
    void skipped;
  }

  if (components === 0) throw new DurationError(`${JSON.stringify(input)} contains no duration`);
  return checkFinite(sign * total, input);
}

// ISO 8601: `PT1H30M`, `P1DT2H`, `P2W`, `PT0.5S`. `M` means months before the `T` and minutes after
// it, which is the part hand-written parsers get wrong; months and years are refused either way.
function parseIsoForm(input) {
  const text = input.trim();
  let i = 0;
  let sign = 1;
  if (text[i] === '+' || text[i] === '-') { sign = text[i] === '-' ? -1 : 1; i += 1; }
  if (text[i] !== 'P' && text[i] !== 'p') throw new DurationError(`${JSON.stringify(input)} is not an ISO 8601 duration`);
  i += 1;

  const dateUnits = {W: WEEK, D: DAY};
  const timeUnits = {H: HOUR, M: MINUTE, S: SECOND};
  let inTime = false;
  let total = 0;
  let components = 0;
  let timeComponents = 0;
  const used = new Set();

  while (i < text.length) {
    if (text[i] === 'T' || text[i] === 't') {
      if (inTime) throw new DurationError(`${JSON.stringify(input)} has more than one T`);
      inTime = true;
      i += 1;
      continue;
    }

    const numberStart = i;
    while (i < text.length && isDigit(text[i])) i += 1;
    if (i < text.length && (text[i] === '.' || text[i] === ',')) {
      if (text[i] === ',') throw new DurationError(`${JSON.stringify(input)} uses a comma as a decimal point; ISO 8601 durations here use a dot`);
      i += 1;
      if (!isDigit(text[i] ?? '')) throw new DurationError(`${JSON.stringify(input)} has a dot that is not part of a number`);
      while (i < text.length && isDigit(text[i])) i += 1;
    }
    if (i === numberStart) throw new DurationError(`${JSON.stringify(input)} has "${text.slice(i)}" where a number was expected`);
    const amount = Number(text.slice(numberStart, i));

    const designator = (text[i] ?? '').toUpperCase();
    if (designator === '') throw new DurationError(`${JSON.stringify(input)} ends with a number that has no unit`);
    i += 1;

    if (!inTime && (designator === 'Y' || designator === 'M')) {
      throw new DurationError(calendarRefusal(designator === 'Y' ? 'years' : 'months'));
    }
    const scale = inTime ? timeUnits[designator] : dateUnits[designator];
    if (scale === undefined) throw new DurationError(`${JSON.stringify(input)} uses "${designator}" where a ${inTime ? 'time' : 'date'} unit was expected`);
    if (used.has(designator + (inTime ? 't' : 'd'))) throw new DurationError(`${JSON.stringify(input)} uses the same unit twice`);
    used.add(designator + (inTime ? 't' : 'd'));

    total += amount * scale;
    components += 1;
    if (inTime) timeComponents += 1;
  }

  if (components === 0) throw new DurationError(`${JSON.stringify(input)} contains no duration`);
  if (inTime && timeComponents === 0) throw new DurationError(`${JSON.stringify(input)} has a T with nothing after it`);
  return checkFinite(sign * total, input);
}

/**
 * Parse a duration into milliseconds, throwing `DurationError` on anything ambiguous.
 *
 * @param {string} input
 * @returns {number}
 */
export function parseDuration(input) {
  if (typeof input !== 'string') {
    throw new DurationError(
      `a duration must be a string, received ${input === null ? 'null' : typeof input}. ` +
      'A bare number has no unit — write "30s" or "30ms" so the meaning is in the value.',
    );
  }
  const text = input.trim();
  if (text === '') throw new DurationError('a duration cannot be empty');
  const body = text[0] === '+' || text[0] === '-' ? text.slice(1) : text;
  return body[0] === 'P' || body[0] === 'p' ? parseIsoForm(text) : parseUnitForm(text);
}

/**
 * Parse a duration, returning null instead of throwing.
 *
 * @param {string} input
 * @returns {number | null}
 */
export function tryParseDuration(input) {
  try { return parseDuration(input); } catch { return null; }
}
