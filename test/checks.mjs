// Behavioural checks shared by the unit tests and by the test that installs the packed artifact into
// a fresh consumer, so the published build is held to the same behaviour as the source.
import assert from 'node:assert/strict';

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H, W = 7 * D;

// Forms that genuinely arrive in configuration, flags, environment variables and API payloads.
export function accepted() {
  return [
    ['30s', 30 * S],
    ['5m', 5 * M],
    ['2h', 2 * H],
    ['1d', D],
    ['3w', 3 * W],
    ['500ms', 500],
    ['1.5h', 1.5 * H],
    ['0.5s', 500],
    ['2 days', 2 * D],
    ['1 hour', H],
    ['-5m', -5 * M],
    ['+5m', 5 * M],
    ['1h30m', H + 30 * M],
    ['2d4h', 2 * D + 4 * H],
    ['1w2d', W + 2 * D],
    ['1m30s', M + 30 * S],
    ['1h 30m', H + 30 * M],
    ['1h30m15s', H + 30 * M + 15 * S],
    ['1 hour 30 minutes', H + 30 * M],
    ['1 hour and 30 minutes', H + 30 * M],
    ['1h, 30m', H + 30 * M],
    ['  30s  ', 30 * S],
    ['30 S', 30 * S],
    ['1H30M', H + 30 * M],
    ['90s', 90 * S],
    ['2.5d', 2.5 * D],
    ['0s', 0],
    ['-1h30m', -(H + 30 * M)],
    // ISO 8601
    ['PT30S', 30 * S],
    ['PT1H30M', H + 30 * M],
    ['P1D', D],
    ['P1DT2H', D + 2 * H],
    ['P2W', 2 * W],
    ['PT0.5S', 500],
    ['-PT1H', -H],
    ['PT1H30M15S', H + 30 * M + 15 * S],
    ['pt1h', H],
  ];
}

// Inputs where any number returned would be a guess presented as a fact.
export function refused() {
  return [
    ['', 'empty'],
    ['   ', 'only whitespace'],
    ['abc', 'no number'],
    ['1x', 'unknown unit'],
    ['h', 'a unit with no number'],
    ['--5m', 'two signs'],
    ['1h30', 'a number with no unit'],
    ['h30m', 'leading text that is not a number'],
    ['1h-30m', 'a sign in the middle'],
    ['1,5h', 'a comma decimal point, which would otherwise read as 15 hours'],
    ['1h30m30', 'a trailing number with no unit'],
    ['5m3', 'a trailing number with no unit'],
    ['1h2h', 'the same unit twice'],
    ['1.5.5h', 'two decimal points'],
    ['1.h', 'a dot with no digits after it'],
    ['PT', 'an ISO duration with no components'],
    ['P', 'an ISO duration with no components'],
    ['P1DT', 'a T with nothing after it'],
    ['PT1H1H', 'the same ISO unit twice'],
    ['P1Y', 'years are calendar-dependent'],
    ['P1M', 'months are calendar-dependent'],
    ['1y', 'years are calendar-dependent'],
    ['1mo', 'months are calendar-dependent'],
    ['6 months', 'months are calendar-dependent'],
    ['PT1D', 'D is a date unit and cannot follow T'],
    ['P1H', 'H is a time unit and must follow T'],
    ['1e3ms', 'exponent notation'],
    ['0x10s', 'hexadecimal'],
  ];
}

export function runChecks(api) {
  const {parseDuration, tryParseDuration, DurationError} = api;
  let checked = 0;
  const check = (name, fn) => { fn(); checked++; };

  check('every accepted form gives the documented number of milliseconds', () => {
    for (const [input, expected] of accepted()) {
      assert.equal(parseDuration(input), expected, `${JSON.stringify(input)} should be ${expected}`);
    }
  });

  check('every ambiguous form is refused rather than guessed at', () => {
    for (const [input, why] of refused()) {
      assert.throws(() => parseDuration(input), DurationError, `${JSON.stringify(input)} should be refused: ${why}`);
    }
  });

  check('a duration must be a string, because a bare number has no unit', () => {
    for (const bad of [100, null, undefined, {}, [], new Date(), 0, NaN]) {
      assert.throws(() => parseDuration(bad), DurationError);
    }
  });

  check('the sign is kept', () => {
    assert.equal(parseDuration('-5m'), -5 * M);
    assert.equal(parseDuration('-1h30m'), -(H + 30 * M));
    assert.equal(parseDuration('-PT1H'), -H);
  });

  check('M means months before a T and minutes after it', () => {
    assert.equal(parseDuration('PT1M'), M);
    assert.throws(() => parseDuration('P1M'), DurationError);
  });

  check('the comma case that reads as fifteen hours elsewhere is refused', () => {
    assert.throws(() => parseDuration('1,5h'), DurationError);
    assert.equal(parseDuration('1.5h'), 1.5 * H);
  });

  check('tryParseDuration returns null instead of throwing', () => {
    assert.equal(tryParseDuration('1h30m'), H + 30 * M);
    assert.equal(tryParseDuration('1,5h'), null);
    assert.equal(tryParseDuration(100), null);
  });

  check('errors say what is wrong and name the input', () => {
    for (const [input] of refused().slice(0, 12)) {
      try { parseDuration(input); assert.fail(`${JSON.stringify(input)} did not throw`); }
      catch (error) {
        assert.ok(error instanceof DurationError);
        assert.ok(error.message.length > 10, 'the message should explain');
      }
    }
    assert.match(parseDurationMessage(parseDuration, '1y'), /calendar|month|year|days/i);
    assert.match(parseDurationMessage(parseDuration, '1h30'), /unit/i);
  });

  check('values too large to be exact are refused', () => {
    assert.throws(() => parseDuration('999999999999999w'), DurationError);
  });

  return checked;
}

function parseDurationMessage(parse, input) {
  try { parse(input); return ''; } catch (error) { return error.message; }
}
