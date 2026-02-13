import { NextResponse } from 'next/server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

type PasswordLeakCheckPayload = {
    sha1?: string;
};

const SHA1_REGEX = /^[A-F0-9]{40}$/;

function parseBreachCount(payload: string, suffix: string) {
    for (const line of payload.split('\n')) {
        const [candidateSuffix, count] = line.trim().split(':');
        if (candidateSuffix?.toUpperCase() !== suffix) continue;
        return Number.parseInt(count ?? '0', 10) || 0;
    }
    return 0;
}

export async function POST(request: Request) {
    const context = createRequestContext('/api/auth/password-leak-check', 'POST');
    const startedAt = Date.now();

    try {
        const body = (await request.json()) as PasswordLeakCheckPayload;
        const sha1 = body.sha1?.trim().toUpperCase();

        if (!sha1 || !SHA1_REGEX.test(sha1)) {
            return NextResponse.json(
                { error: 'Formato inválido. Se requiere SHA-1 en hexadecimal.' },
                { status: 400 }
            );
        }

        const prefix = sha1.slice(0, 5);
        const suffix = sha1.slice(5);
        const hibpResponse = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            cache: 'no-store',
            headers: {
                'Add-Padding': 'true',
                'User-Agent': 'finansas-password-check',
            },
        });

        if (!hibpResponse.ok) {
            logError(
                'password_leak_check_hibp_error',
                new Error(`HIBP status ${hibpResponse.status}`),
                { ...context, durationMs: Date.now() - startedAt }
            );
            return NextResponse.json(
                { error: 'No se pudo validar la seguridad de la contraseña.' },
                { status: 502 }
            );
        }

        const payload = await hibpResponse.text();
        const breachCount = parseBreachCount(payload, suffix);
        const leaked = breachCount > 0;

        logInfo('password_leak_check_completed', {
            ...context,
            leaked,
            breachCount,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ leaked, breachCount });
    } catch (error) {
        logError('password_leak_check_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
            { error: 'No se pudo validar la seguridad de la contraseña.' },
            { status: 500 }
        );
    }
}
