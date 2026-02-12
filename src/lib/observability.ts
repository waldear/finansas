type LogLevel = 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

function safeSerializeError(error: unknown) {
    if (!error) return null;
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    return { message: String(error) };
}

function writeLog(level: LogLevel, message: string, context: LogContext = {}) {
    const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...context,
    };

    const line = JSON.stringify(payload);
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

export function createRequestContext(route: string, method: string) {
    return {
        requestId: crypto.randomUUID(),
        route,
        method,
        runtime: process.env.VERCEL_REGION || 'local',
    };
}

export function logInfo(message: string, context: LogContext = {}) {
    writeLog('info', message, context);
}

export function logWarn(message: string, context: LogContext = {}) {
    writeLog('warn', message, context);
}

export function logError(message: string, error: unknown, context: LogContext = {}) {
    const errorPayload = safeSerializeError(error);
    writeLog('error', message, { ...context, error: errorPayload });
}
