# exact-duration

Parse a duration string into milliseconds, and refuse anything ambiguous instead of guessing.
Zero dependencies.

```js
import {parseDuration} from 'exact-duration';

parseDuration('1h30m');   // 5400000
parseDuration('PT1H30M'); // 5400000
parseDuration('2 days');  // 172800000

parseDuration('1,5h');    // DurationError — one and a half hours, or fifteen?
```

## The problem

Durations arrive as text: a config file, a CLI flag, an environment variable, an API payload. Every
parser in this space makes one of two trades, and neither is safe.

**`ms` (394M downloads a week) is strict but narrow.** It accepts a single unit and nothing else, so
`1h30m`, `PT1H30M` and `1 hour 30 minutes` all come back `undefined`. That is honest, and it is also
why so many projects write their own: searching GitHub finds a hand-rolled `parseDuration` more than
twenty thousand times.

**The parsers that accept `1h30m` accept nearly everything else too**, and answer with a number:

```js
parseDuration('1,5h');    // 54000000  — fifteen hours, not one and a half
parseDuration('1h30');    // 3600000   — the 30 is silently dropped
parseDuration('h30m');    // 1800000   — the leading junk is ignored
parseDuration('1h2h');    // 10800000  — the same unit twice, quietly added
```

That last set is `parse-duration`, the most capable alternative. It also mis-reads valid ISO 8601:

```js
parseDuration('P1DT2H');  // 7200000   — the day is gone. Should be 93600000.
parseDuration('P1M');     // 60000     — one month
parseDuration('PT1M');    // 60000     — one minute. The same number.
```

`M` means months before the `T` and minutes after it. Getting that wrong turns a monthly retention
window into a one-minute one, and nothing reports it.

None of this throws. A wrong duration becomes a timeout that never fires, a cache that never expires,
or a retention window off by a factor of forty thousand.

## The trade, measured

`npm run bench` reproduces this. 37 forms that genuinely arrive, and 28 that are ambiguous:

| library | accepts | returns a wrong value | refuses the ambiguous |
| --- | --- | --- | --- |
| `ms` | 15/37 | 0 | 27/28 |
| `parse-duration` | 36/37 | 1 | 8/28 |
| `@sapphire/duration` | 34/37 | 3 | 9/28 |
| `enhanced-ms` | 34/37 | 3 | 2/28 |
| `timestring` | 32/37 | 3 | 12/28 |
| `duration-fns` | 8/37 | 0 | 25/28 |
| `iso8601-duration` | 7/37 | 1 | 24/28 |
| `tinyduration` | 6/37 | 2 | 24/28 |
| **`exact-duration`** | **37/37** | **0** | **28/28** |

Read the last two columns together. `parse-duration` is close on what it accepts — one form apart —
and the difference is that it answers 20 of 28 ambiguous inputs with a number. Everything else trades
one column for the other. The libraries do not even agree with each other: `1h-30m` is 1h30m to
`parse-duration` and 30m to `@sapphire/duration`, a threefold difference on the same string.

## What it accepts

- **Single units** — `30s`, `5m`, `2h`, `1d`, `3w`, `500ms`, `1.5h`
- **Compound** — `1h30m`, `2d4h`, `1w2d`, `1h30m15s`
- **Spaced, spelled out, punctuated** — `1h 30m`, `1 hour 30 minutes`, `1 hour and 30 minutes`, `1h, 30m`
- **ISO 8601** — `PT30S`, `PT1H30M`, `P1DT2H`, `P2W`, `PT0.5S`
- **Signed** — `-5m`, `-PT1H`
- Unit spellings `ms`/`msec`/`millisecond`, `s`/`sec`/`second`, `m`/`min`/`minute`, `h`/`hr`/`hour`,
  `d`/`day`, `w`/`wk`/`week`, in any case

## What it refuses, and why

| input | why |
| --- | --- |
| `1h30` | a number with no unit — is the 30 minutes or seconds? |
| `1,5h` | a comma decimal point, which the lenient parsers read as fifteen hours |
| `1h-30m` | a sign in the middle; libraries disagree on whether it subtracts |
| `h30m` | leading text that is not a number |
| `1h2h` | the same unit twice |
| `1mo`, `1y`, `P1M`, `P1Y` | a month is 28–31 days and a year 365 or 366, so neither has a fixed length |
| `100` (a number, not a string) | a bare number has no unit |
| `PT1D`, `P1H` | `D` is a date unit and `H` a time unit; they are on the wrong side of the `T` |

Calendar units are the one that looks unhelpful and is not. `parse-duration` answers `1mo` with
2629800000 — the average month. That average is never the month you actually have. If you want thirty
days, `30d` says so.

Every error names the input and explains the problem:

```
DurationError: "1h30" has the number 30 with no unit. Every number needs a unit, for example 30s or 1h30m.
DurationError: months cannot be converted to a fixed number of milliseconds: a month is 28 to 31 days
and a year is 365 or 366, so the length depends on when it starts. Use days instead, for example 30d or 365d.
```

## API

### `parseDuration(input: string): number`

Milliseconds. Throws `DurationError` on anything ambiguous. Input must be a string.

### `tryParseDuration(input: string): number | null`

The same, returning `null` instead of throwing — for validating configuration without a try/catch.

```js
const ttl = tryParseDuration(process.env.CACHE_TTL);
if (ttl === null) throw new Error('CACHE_TTL must be a duration like 30m or 1h30m');
```

### `DurationError`

Thrown for bad input. `error.name` is `'DurationError'`.

## Speed

Parsing 2,000 mixed durations, best of seven: `exact-duration` 0.60 ms, `parse-duration` 0.76 ms,
`@sapphire/duration` 1.74 ms, `timestring` 2.67 ms. `ms` is faster still at 0.18 ms, and if every
duration in your project is a single unit it remains a good choice — it is narrow, but it does not
lie.

## Honest limits

- It does not format. `pretty-ms` does that well.
- It is deliberately stricter than `ms`: bare numbers and calendar units are errors, so it is not a
  drop-in replacement. That strictness is the point.
- A fraction is allowed on any ISO component, which is slightly looser than ISO 8601, where only the
  smallest component may carry one.

## Install

```sh
npm install exact-duration
```

ESM and CommonJS, TypeScript types included, Node 18 or newer, no dependencies.

## License

MIT
