// سجلّ بسيط ومنظّم — JSON في الإنتاج، ملوّن ومقروء في التطوير
const isProd = process.env.NODE_ENV === 'production';
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? (isProd ? LEVELS.info : LEVELS.debug);

const COLORS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

/** مفاتيح مايتسجّلش محتواها أبدًا */
const REDACT = new Set(['password', 'token', 'apiKey', 'api_key', 'secret', 'authorization', 'cookie']);

function scrub(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrub);

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT.has(k) || REDACT.has(k.toLowerCase()) ? '[محجوب]' : scrub(v);
  }
  return out;
}

function emit(level, event, data) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const payload = scrub(data ?? {});

  if (isProd) {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level, event, ...payload }) + '\n'
    );
    return;
  }

  const time = new Date().toTimeString().slice(0, 8);
  const extra = Object.keys(payload).length ? ' ' + JSON.stringify(payload) : '';
  process.stdout.write(`${COLORS[level]}${time} ${level.padEnd(5)}${RESET} ${event}${extra}\n`);
}

export const log = {
  debug: (event, data) => emit('debug', event, data),
  info: (event, data) => emit('info', event, data),
  warn: (event, data) => emit('warn', event, data),
  error: (event, data) => emit('error', event, data),
};
