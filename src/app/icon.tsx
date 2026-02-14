import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
    width: 512,
    height: 512,
};
export const contentType = 'image/png';

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'radial-gradient(circle at 30% 25%, #F2FDFF 0%, #CFEAF5 55%, #A9CBDC 100%)',
                }}
            >
                <svg width="420" height="420" viewBox="0 0 120 120">
                    <defs>
                        <radialGradient id="bg" cx="30%" cy="25%" r="75%">
                            <stop offset="0%" stopColor="#F2FDFF" stopOpacity="1" />
                            <stop offset="55%" stopColor="#CFEAF5" stopOpacity="1" />
                            <stop offset="100%" stopColor="#A9CBDC" stopOpacity="1" />
                        </radialGradient>
                        <linearGradient id="wallet" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#22E0D3" />
                            <stop offset="55%" stopColor="#13BDB7" />
                            <stop offset="100%" stopColor="#0E8FA0" />
                        </linearGradient>
                        <linearGradient id="warm" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#F6B65A" />
                            <stop offset="100%" stopColor="#F08A1A" />
                        </linearGradient>
                        <linearGradient id="red" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#E45B66" />
                            <stop offset="100%" stopColor="#B11D2B" />
                        </linearGradient>
                        <radialGradient id="gold" cx="35%" cy="30%" r="70%">
                            <stop offset="0%" stopColor="#FFE19A" />
                            <stop offset="100%" stopColor="#C89522" />
                        </radialGradient>
                        <radialGradient id="silver" cx="35%" cy="30%" r="70%">
                            <stop offset="0%" stopColor="#FFFFFF" />
                            <stop offset="100%" stopColor="#B9C2C9" />
                        </radialGradient>
                    </defs>

                    <circle cx="60" cy="60" r="56" fill="url(#bg)" />
                    <circle cx="60" cy="60" r="56" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2" />
                    <path
                        d="M22 46 C 30 22, 50 14, 72 18"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeOpacity="0.45"
                        strokeWidth="7"
                        strokeLinecap="round"
                    />

                    <path
                        d="M 34 50 C 42 28, 80 28, 90 46"
                        fill="none"
                        stroke="url(#warm)"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path d="M 90 46 L 84 40 L 83 52 Z" fill="url(#warm)" />

                    <path
                        d="M 92 74 C 82 96, 42 96, 32 78"
                        fill="none"
                        stroke="url(#red)"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path d="M 32 78 L 39 84 L 40 72 Z" fill="url(#red)" />

                    <circle cx="32" cy="72" r="5.2" fill="url(#gold)" opacity="0.95" />
                    <circle cx="88" cy="56" r="4.6" fill="url(#gold)" opacity="0.9" />
                    <circle cx="92" cy="66" r="4.3" fill="url(#silver)" opacity="0.92" />
                    <circle cx="40" cy="80" r="3.6" fill="#5F6B74" opacity="0.55" />

                    <rect x="38" y="52" width="44" height="34" rx="10" fill="url(#wallet)" />
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
                </svg>
            </div>
        ),
        {
            ...size,
        }
    );
}

