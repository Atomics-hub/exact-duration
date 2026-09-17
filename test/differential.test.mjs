import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDuration, tryParseDuration, DurationError} from '../src/index.js';
import ms from 'ms';
import parseDurationLenient from 'parse-duration';
import timestring from 'timestring';
import {Duration as SapphireDuration} from '@sapphire/duration';

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H, W = 7 * D;

// A tiny deterministic generator, so a failure can be reproduced from its seed.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

const UNITS = [['ms', 1], ['s', S], ['m', M], ['h', H], ['d', D], ['w', W]];

test('generated compound durations parse to exactly the sum of their parts', () => {
  const next = random(20260916);
  for (let i = 0; i < 2000; i++) {
    const count = 1 + Math.floor(next() * 4);
    const chosen = [];
    const pool = UNITS.slice();
    for (let c = 0; c < count && pool.length; c++) chosen.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
    let expected = 0;
    const parts = chosen.map(([name, scale]) => {
      const amount = 1 + Math.floor(next() * 90);
      expected += amount * scale;
      return `${amount}${name}`;
    });
    const negative = next() < 0.25;
    const separator = [' ', '', ' ', ', '][Math.floor(next() * 4)];
    const input = (negative ? '-' : '') + parts.join(separator);
    const got = parseDuration(input);
    assert.equal(got, negative ? -expected : expected, `${JSON.stringify(input)} parsed as ${got}`);
  }
});

test('generated ISO 8601 durations parse to exactly the sum of their parts', () => {
  const next = random(777);
  for (let i = 0; i < 1000; i++) {
    const days = Math.floor(next() * 10);
    const hours = Math.floor(next() * 24);
    const minutes = Math.floor(next() * 60);
    const seconds = Math.floor(next() * 60);
    const datePart = days ? `${days}D` : '';
    const timePart = [hours ? `${hours}H` : '', minutes ? `${minutes}M` : '', seconds ? `${seconds}S` : ''].join('');
    if (!datePart && !timePart) continue;
    const input = 'P' + datePart + (timePart ? 'T' + timePart : '');
    assert.equal(parseDuration(input), days * D + hours * H + minutes * M + seconds * S, input);
  }
});

test('a number without a unit is always refused, whatever surrounds it', () => {
  const next = random(31337);
  for (let i = 0; i < 500; i++) {
    const amount = 1 + Math.floor(next() * 500);
    const unit = UNITS[Math.floor(next() * UNITS.length)][0];
    const trailing = 1 + Math.floor(next() * 99);
    assert.throws(() => parseDuration(`${amount}${unit}${trailing}`), DurationError);
  }
});

test('the result is never NaN, never Infinity, and keeps its sign', () => {
  const next = random(5150);
  for (let i = 0; i < 1000; i++) {
    // The written form is what gets parsed, so the expectation uses the same rounded amount.
    const amount = Number((next() * 1000).toFixed(3));
    const [name, scale] = UNITS[Math.floor(next() * UNITS.length)];
    const negative = next() < 0.5;
    const value = parseDuration(`${negative ? '-' : ''}${amount}${name}`);
    assert.ok(Number.isFinite(value), 'finite');
    assert.equal(value < 0, negative && amount > 0, 'sign kept');
    assert.ok(Math.abs(Math.abs(value) - amount * scale) < 1e-6, 'scaled correctly');
  }
});

test('parsing stays linear in the length of the input', () => {
  const build = (n) => Array.from({length: n}, () => '1h').join('x');
  const best = (fn) => { fn(); let t = Infinity; for (let i = 0; i < 5; i++) { const s = process.hrtime.bigint(); fn(); t = Math.min(t, Number(process.hrtime.bigint() - s) / 1e6); } return t; };
  const small = best(() => tryParseDuration(build(200)));
  const large = best(() => tryParseDuration(build(1600)));
  assert.ok(large < small * 24 + 50, `eightfold input took ${large.toFixed(2)}ms against ${small.toFixed(2)}ms`);
});

test('no input makes it throw something other than DurationError', () => {
  const next = random(90210);
  const alphabet = '0123456789.,+-hmsdwPT xyz';
  for (let i = 0; i < 4000; i++) {
    const length = Math.floor(next() * 12);
    let input = '';
    for (let c = 0; c < length; c++) input += alphabet[Math.floor(next() * alphabet.length)];
    try {
      const value = parseDuration(input);
      assert.ok(Number.isFinite(value), `${JSON.stringify(input)} returned ${value}`);
    } catch (error) {
      assert.ok(error instanceof DurationError, `${JSON.stringify(input)} threw ${error.name}: ${error.message}`);
    }
  }
});

// These assert the comparison in the README is still true. If a library fixes its behaviour this
// goes red, rather than the README quietly becoming false.
test('the libraries this claims to beat really do behave this way', () => {
  // `ms` refuses compound and ISO forms outright.
  for (const input of ['1h30m', '2d4h', '1m30s', 'PT1H30M', 'P1D']) {
    assert.equal(ms(input), undefined, `ms should still reject ${input}`);
    assert.equal(parseDuration(input) > 0, true, `this should still accept ${input}`);
  }

  // The lenient parsers read a comma as a thousands separator, so "1,5h" becomes fifteen hours.
  assert.equal(parseDurationLenient('1,5h'), 15 * H, 'parse-duration should still read 1,5h as 15 hours');
  assert.equal(timestring('1,5h', 'ms'), 15 * H, 'timestring should still read 1,5h as 15 hours');
  assert.equal(new SapphireDuration('1,5h').offset, 15 * H, 'sapphire should still read 1,5h as 15 hours');
  assert.throws(() => parseDuration('1,5h'), DurationError);

  // A number with no unit is silently dropped or silently assumed.
  assert.equal(parseDurationLenient('1h30'), H + 30 * M, 'parse-duration should still guess at 1h30');
  assert.equal(new SapphireDuration('1h30').offset, H, 'sapphire should still drop the 30 in 1h30');
  assert.throws(() => parseDuration('1h30'), DurationError);

  // They disagree with each other about what a mid-string sign means.
  assert.equal(parseDurationLenient('1h-30m'), H + 30 * M, 'parse-duration reads 1h-30m as 1h30m');
  assert.equal(new SapphireDuration('1h-30m').offset, 30 * M, 'sapphire reads the same input as 30m');
  assert.throws(() => parseDuration('1h-30m'), DurationError);

  // Calendar units get an average presented as a fact.
  assert.ok(parseDurationLenient('1mo') > 0, 'parse-duration still returns a number for a month');
  assert.throws(() => parseDuration('1mo'), DurationError);
});
