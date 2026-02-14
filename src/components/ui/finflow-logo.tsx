'use client';

import { useId } from 'react';
import { cn } from "@/lib/utils";

type FinFlowLogoProps = {
    className?: string;
    showText?: boolean;
    title?: string;
};

export function FinFlowLogo({ className, showText = false, title = 'Finansas' }: FinFlowLogoProps) {
    const uniqueId = useId().replace(/:/g, '');
    const bgId = `finansas-bg-${uniqueId}`;
    const rimId = `finansas-rim-${uniqueId}`;
    const glareId = `finansas-glare-${uniqueId}`;
    const bubbleShadowId = `finansas-bubble-shadow-${uniqueId}`;
    const walletId = `finansas-wallet-${uniqueId}`;
    const arrowWarmId = `finansas-arrow-warm-${uniqueId}`;
    const arrowRedId = `finansas-arrow-red-${uniqueId}`;
    const coinGoldId = `finansas-coin-gold-${uniqueId}`;
    const coinSilverId = `finansas-coin-silver-${uniqueId}`;

    return (
        <div className={cn("relative inline-flex items-center justify-center", className)}>
            <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-sm overflow-visible" role="img" aria-label={title}>
                <defs>
                    <radialGradient id={bgId} cx="30%" cy="25%" r="75%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
                        <stop offset="45%" stopColor="#CFEAF5" stopOpacity="0.82" />
                        <stop offset="100%" stopColor="#A9CBDC" stopOpacity="0.92" />
                    </radialGradient>

                    <linearGradient id={rimId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
                        <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.55" />
                    </linearGradient>

                    <radialGradient id={glareId} cx="30%" cy="25%" r="55%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
                        <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.30" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                    </radialGradient>

                    <filter id={bubbleShadowId} x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#0B2B3A" floodOpacity="0.28" />
                        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0B2B3A" floodOpacity="0.18" />
                    </filter>

                    <linearGradient id={walletId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#22E0D3" />
                        <stop offset="55%" stopColor="#13BDB7" />
                        <stop offset="100%" stopColor="#0E8FA0" />
                    </linearGradient>

                    <linearGradient id={arrowWarmId} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#F6B65A" />
                        <stop offset="100%" stopColor="#F08A1A" />
                    </linearGradient>

                    <linearGradient id={arrowRedId} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#E45B66" />
                        <stop offset="100%" stopColor="#B11D2B" />
                    </linearGradient>

                    <radialGradient id={coinGoldId} cx="35%" cy="30%" r="70%">
                        <stop offset="0%" stopColor="#FFE19A" />
                        <stop offset="100%" stopColor="#C89522" />
                    </radialGradient>
                    <radialGradient id={coinSilverId} cx="35%" cy="30%" r="70%">
                        <stop offset="0%" stopColor="#FFFFFF" />
                        <stop offset="100%" stopColor="#B9C2C9" />
                    </radialGradient>
                </defs>

                {/* Bubble badge (glass) */}
                <g filter={`url(#${bubbleShadowId})`}>
                    <circle cx="60" cy="60" r="56" fill={`url(#${bgId})`} />
                    <circle cx="60" cy="60" r="56" fill="none" stroke={`url(#${rimId})`} strokeWidth="2.25" />
                    <circle cx="52" cy="48" r="34" fill={`url(#${glareId})`} opacity="0.9" />
                    <path
                        d="M22 46 C 30 22, 50 14, 72 18"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeOpacity="0.45"
                        strokeWidth="7"
                        strokeLinecap="round"
                    />
                    <path
                        d="M20 70 C 20 92, 34 102, 50 104"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeOpacity="0.18"
                        strokeWidth="7"
                        strokeLinecap="round"
                    />
                </g>

                {/* Arrows */}
                <path
                    d="M 34 50 C 42 28, 80 28, 90 46"
                    fill="none"
                    stroke={`url(#${arrowWarmId})`}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <path
                    d="M 90 46 L 84 40 L 83 52 Z"
                    fill={`url(#${arrowWarmId})`}
                />

                <path
                    d="M 92 74 C 82 96, 42 96, 32 78"
                    fill="none"
                    stroke={`url(#${arrowRedId})`}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <path
                    d="M 32 78 L 39 84 L 40 72 Z"
                    fill={`url(#${arrowRedId})`}
                />

                {/* Coins / dots */}
                <circle cx="32" cy="72" r="5.2" fill={`url(#${coinGoldId})`} opacity="0.95" />
                <circle cx="88" cy="56" r="4.6" fill={`url(#${coinGoldId})`} opacity="0.9" />
                <circle cx="92" cy="66" r="4.3" fill={`url(#${coinSilverId})`} opacity="0.92" />
                <circle cx="40" cy="80" r="3.6" fill="#5F6B74" opacity="0.55" />

                {/* Wallet */}
                <g>
                    <rect x="38" y="52" width="44" height="34" rx="10" fill={`url(#${walletId})`} />
                    <path
                        d="M40 56 C 48 52, 72 52, 80 56"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeOpacity="0.25"
                        strokeWidth="5"
                        strokeLinecap="round"
                    />
                    <rect x="62" y="62" width="22" height="20" rx="8" fill="#0FAEAE" opacity="0.90" />
                    <rect x="64" y="66" width="18" height="12" rx="6" fill="#0A8E95" opacity="0.55" />
                    <circle cx="72.5" cy="72" r="4.2" fill="#E8FDFF" opacity="0.95" />
                    <circle cx="72.5" cy="72" r="2.0" fill="#0C6B73" opacity="0.40" />
                </g>

                {showText ? (
                    <text
                        x="60"
                        y="112"
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="800"
                        letterSpacing="3"
                        fill="#6FAFC3"
                        fillOpacity="0.85"
                        style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial' }}
                    >
                        FINANZAS
                    </text>
                ) : null}
            </svg>
        </div>
    );
}

export function FinFlowIcon({ className }: { className?: string }) {
    return (
        <div className={cn("relative inline-flex items-center justify-center", className)}>
            <FinFlowLogo className="w-full h-full" />
        </div>
    )
}
