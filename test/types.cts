import {parseDuration, tryParseDuration} from 'exact-duration';
const ms: number = parseDuration('PT1H');
const maybe: number | null = tryParseDuration('nope');
void [ms, maybe];
