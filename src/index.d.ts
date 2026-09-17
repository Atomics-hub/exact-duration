export declare class DurationError extends Error {
  readonly name: 'DurationError';
}

/**
 * Parse a duration string into milliseconds.
 *
 * Accepts single units (`30s`), compound units (`1h30m`, `2d4h`), human forms
 * (`1 hour 30 minutes`) and ISO 8601 (`PT1H30M`, `P1DT2H`). Throws `DurationError` on anything
 * ambiguous, including a number with no unit (`1h30`), a comma decimal point (`1,5h`), a sign in the
 * middle (`1h-30m`) and calendar units (`1mo`, `P1Y`) that have no fixed length.
 */
export declare function parseDuration(input: string): number;

/** Parse a duration, returning `null` instead of throwing. */
export declare function tryParseDuration(input: string): number | null;
