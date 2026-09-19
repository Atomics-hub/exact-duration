# Changelog

## 0.1.1

README corrections, so that every claim is one that holds:

- `parse-duration` reads `1h30` as 1h30m (5400000), taking a bare trailing number as the next unit
  down; the earlier text said it dropped the 30 and returned 3600000, which is what `timestring` and
  `@sapphire/duration` do. The differential test already asserted the correct values.
- The comma in `1,5h` is a thousands separator in `parse-duration`'s documented default locale, and a
  comma-decimal locale can be set (#35); the text now says so instead of presenting it as a bug.
- `ms`'s single-unit scope is linked to the open request for multiple units (#54, 2015).
- The GitHub code-search figure is stated with its query. No code change.

## 0.1.0

First release.

- `parseDuration(input)` — a duration string becomes milliseconds, or throws `DurationError`.
- `tryParseDuration(input)` — the same, returning `null` instead of throwing.
- Accepts single units (`30s`), compound units (`1h30m`, `2d4h`, `1w2d`), spelled-out and punctuated
  forms (`1 hour 30 minutes`, `1h, 30m`, `1 hour and 30 minutes`), ISO 8601 (`PT1H30M`, `P1DT2H`,
  `P2W`, `PT0.5S`) and signed durations (`-5m`, `-PT1H`), in any case.
- Refuses what other parsers answer with a number: a number with no unit (`1h30`), a comma decimal
  point (`1,5h`, read elsewhere as fifteen hours), a sign in the middle (`1h-30m`), a repeated unit
  (`1h2h`), and date and time designators on the wrong side of an ISO `T` (`PT1D`, `P1H`).
- Refuses calendar units (`1mo`, `1y`, `P1M`, `P1Y`): a month is 28 to 31 days and a year 365 or 366,
  so neither has a millisecond value without a reference date.
- Distinguishes ISO `P1M` (months) from `PT1M` (minutes), which `parse-duration` reports as the same
  number.
- Every error names the input and says what to write instead.
- Zero dependencies. Node 18 or newer.
