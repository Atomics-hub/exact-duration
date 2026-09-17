import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import {runChecks, accepted, refused} from './checks.mjs';

const {parseDuration, tryParseDuration, DurationError} = api;
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H, W = 7 * D;

test('shared behavioural checks', () => {
  const checked = runChecks(api);
  assert.equal(checked, 9);
});

test('the fixture set covers both directions', () => {
  assert.ok(accepted().length >= 35, 'enough accepted forms');
  assert.ok(refused().length >= 25, 'enough refused forms');
});

test('single units', () => {
  assert.equal(parseDuration('1ms'), 1);
  assert.equal(parseDuration('1s'), S);
  assert.equal(parseDuration('1m'), M);
  assert.equal(parseDuration('1h'), H);
  assert.equal(parseDuration('1d'), D);
  assert.equal(parseDuration('1w'), W);
});

test('unit spellings', () => {
  assert.equal(parseDuration('1sec'), S);
  assert.equal(parseDuration('2secs'), 2 * S);
  assert.equal(parseDuration('1second'), S);
  assert.equal(parseDuration('3seconds'), 3 * S);
  assert.equal(parseDuration('1min'), M);
  assert.equal(parseDuration('1minute'), M);
  assert.equal(parseDuration('1hr'), H);
  assert.equal(parseDuration('1hour'), H);
  assert.equal(parseDuration('1wk'), W);
  assert.equal(parseDuration('1week'), W);
  assert.equal(parseDuration('1millisecond'), 1);
});

test('case and whitespace do not change the meaning', () => {
  assert.equal(parseDuration('1H30M'), H + 30 * M);
  assert.equal(parseDuration('  1h  30m  '), H + 30 * M);
  assert.equal(parseDuration('1 h 30 m'), H + 30 * M);
  assert.equal(parseDuration('\t30s\t'), 30 * S);
});

test('ISO 8601, including the M that means two different things', () => {
  assert.equal(parseDuration('PT1M'), M, 'M after T is minutes');
  assert.throws(() => parseDuration('P1M'), DurationError, 'M before T is months, which has no fixed length');
  assert.equal(parseDuration('P1DT1M'), D + M);
  assert.equal(parseDuration('P2W'), 2 * W);
  assert.equal(parseDuration('PT0.25H'), 0.25 * H);
  assert.throws(() => parseDuration('PT1D'), DurationError, 'D is a date unit');
  assert.throws(() => parseDuration('P1S'), DurationError, 'S is a time unit');
  assert.throws(() => parseDuration('PT1H,5M'), DurationError, 'comma decimals are refused');
});

test('errors name the input and explain the problem', () => {
  const message = (input) => { try { parseDuration(input); return ''; } catch (error) { return error.message; } };
  assert.match(message('1h30'), /no unit/i);
  assert.match(message('1,5h'), /unit|number/i);
  assert.match(message('1mo'), /month/i);
  assert.match(message('1y'), /year/i);
  assert.match(message('1x'), /unknown unit/i);
  assert.match(message('1h2h'), /same unit twice/i);
  assert.match(message('--5m'), /sign/i);
  assert.match(message(100), /string/i);
  assert.ok(message('1y').includes('365d'), 'the calendar message suggests what to write instead');
});

test('DurationError is exported and is a real Error', () => {
  const error = new DurationError('x');
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'DurationError');
  assert.equal(Object.prototype.toString.call(error), '[object Error]');
});

test('tryParseDuration never throws', () => {
  const inputs = ['1h30m', '1,5h', '', 'abc', null, 100, 'P1Y', 'PT1H'];
  for (const input of inputs) {
    const value = tryParseDuration(input);
    assert.ok(value === null || Number.isFinite(value));
  }
});

test('zero and fractional values', () => {
  assert.equal(parseDuration('0s'), 0);
  assert.equal(parseDuration('0.001s'), 1);
  assert.equal(parseDuration('-0s'), -0);
  assert.equal(parseDuration('0.5h'), 0.5 * H);
});
