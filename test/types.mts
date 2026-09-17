import {parseDuration, tryParseDuration, DurationError} from 'exact-duration';

const ms: number = parseDuration('1h30m');
const maybe: number | null = tryParseDuration('1,5h');
const error: DurationError = new DurationError('x');
const name: 'DurationError' = error.name;
void [ms, maybe, name];
