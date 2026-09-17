// Reproduces the README. Two questions per library: does it accept the forms that actually arrive,
// and does it refuse the ones that are malformed rather than returning a number?
// Run with: npm run bench
import {parseDuration, tryParseDuration} from '../src/index.js';
import ms from 'ms';
import parseDurationLenient from 'parse-duration';
import timestring from 'timestring';
import {Duration as SapphireDuration} from '@sapphire/duration';
import * as durationFns from 'duration-fns';
import iso8601 from 'iso8601-duration';
import * as tinyduration from 'tinyduration';
import enhancedMs from 'enhanced-ms';
import {accepted, refused} from '../test/checks.mjs';

const attempt = (fn) => (v) => { try { return fn(v); } catch { return undefined; } };
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H, W = 7 * D;

const LIBS = {
  'ms': attempt((v) => ms(v)),
  'parse-duration': attempt((v) => parseDurationLenient(v)),
  'timestring': attempt((v) => timestring(v, 'ms')),
  '@sapphire/duration': attempt((v) => new SapphireDuration(v).offset),
  'enhanced-ms': attempt((v) => enhancedMs(v)),
  'duration-fns': attempt((v) => durationFns.toMilliseconds(durationFns.parse(v))),
  'iso8601-duration': attempt((v) => iso8601.toSeconds(iso8601.parse(v)) * 1000),
  'tinyduration': attempt((v) => { const p = tinyduration.parse(v); return ((p.years ?? 0) * 365 * D) + ((p.months ?? 0) * 30 * D) + ((p.days ?? 0) * D) + ((p.hours ?? 0) * H) + ((p.minutes ?? 0) * M) + ((p.seconds ?? 0) * S); }),
  'exact-duration': attempt((v) => parseDuration(v)),
};

const isRefusal = (v) => v === undefined || v === null || (typeof v === 'number' && (Number.isNaN(v) || !Number.isFinite(v)));
const near = (a, b) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) < 1e-6;

const ACCEPTED = accepted();
const REFUSED = refused();

console.log('forms that actually arrive, and forms that are ambiguous\n');
console.log('library'.padEnd(22) + 'accepts'.padStart(10) + 'wrong value'.padStart(14) + 'refuses ambiguity'.padStart(20));
const rows = [];
for (const [name, parse] of Object.entries(LIBS)) {
  let ok = 0, wrong = 0;
  const wrongExamples = [];
  for (const [input, expected] of ACCEPTED) {
    const got = parse(input);
    if (near(got, expected)) ok++;
    else if (!isRefusal(got)) { wrong++; wrongExamples.push(`${input}->${got}`); }
  }
  let refusedCount = 0;
  const guesses = [];
  for (const [input] of REFUSED) {
    const got = parse(input);
    if (isRefusal(got)) refusedCount++;
    else guesses.push(`${JSON.stringify(input)}->${got}`);
  }
  rows.push({name, ok, wrong, refusedCount, guesses, wrongExamples});
  console.log(name.padEnd(22) + `${ok}/${ACCEPTED.length}`.padStart(10) + String(wrong).padStart(14) + `${refusedCount}/${REFUSED.length}`.padStart(20));
}

console.log('\nonly one library is in both columns: everything else trades one for the other.\n');

console.log('what the lenient parsers return for input a person would call a typo\n');
const NOTABLE = ['1,5h', '1h30', 'h30m', '1h-30m', '1mo'];
console.log('input'.padEnd(12) + Object.keys(LIBS).filter((n) => ['parse-duration', 'timestring', '@sapphire/duration', 'exact-duration'].includes(n)).map((n) => n.padStart(21)).join(''));
for (const input of NOTABLE) {
  const cells = ['parse-duration', 'timestring', '@sapphire/duration', 'exact-duration'].map((n) => {
    const got = LIBS[n](input);
    return (isRefusal(got) ? 'refused' : String(got)).padStart(21);
  });
  console.log(JSON.stringify(input).padEnd(12) + cells.join(''));
}
console.log('\n1,5h is one and a half hours written the way most of the world writes it.');
console.log('54000000 ms is fifteen hours.\n');

console.log('speed, parsing a mixed list of durations, best of seven\n');
const corpus = [];
for (let i = 0; i < 2000; i++) {
  const [input] = ACCEPTED[i % ACCEPTED.length];
  corpus.push(input);
}
const best = (fn, runs = 7) => { fn(); let t = Infinity; for (let i = 0; i < runs; i++) { const s = process.hrtime.bigint(); fn(); t = Math.min(t, Number(process.hrtime.bigint() - s) / 1e6); } return t; };
console.log('library'.padEnd(22) + 'ms per 2,000 durations'.padStart(24));
for (const name of ['ms', 'parse-duration', 'timestring', '@sapphire/duration', 'exact-duration']) {
  const parse = name === 'exact-duration' ? (v) => tryParseDuration(v) : LIBS[name];
  const t = best(() => { for (const input of corpus) parse(input); });
  console.log(name.padEnd(22) + t.toFixed(2).padStart(24));
}
