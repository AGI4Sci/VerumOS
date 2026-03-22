type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, meta?: unknown): void {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const consoleMethod = level === 'info' ? console.log : console[level];
  if (meta === undefined) {
    consoleMethod(prefix, message);
    return;
  }
  consoleMethod(prefix, message, meta);
}

export const logger = {
  info(message: string, meta?: unknown) {
    log('info', message, meta);
  },
  warn(message: string, meta?: unknown) {
    log('warn', message, meta);
  },
  error(message: string, meta?: unknown) {
    log('error', message, meta);
  },
};
