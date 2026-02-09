'use client';

import { cn } from "@/lib/utils";

export function NanoBananaLogo({ className }: { className?: string }) {
    return (
        <div className={cn("relative inline-flex items-center justify-center animate-float", className)}>
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xl overflow-visible">
                {/* Rubber Banana Body */}
                <path
                    d="M20,70 Q20,30 75,20 C85,18 85,30 80,35 Q75,40 45,65 Q35,85 35,85 Q20,80 20,70"
                    fill="#FDE047"
                    stroke="#EAB308"
                    strokeWidth="2"
                />

                {/* Shine for rubbery effect */}
                <path
                    d="M32,55 Q32,38 62,28"
                    stroke="white"
                    strokeWidth="4"
                    strokeLinecap="round"
                    opacity="0.3"
                />

                {/* Big Dollar Medallion */}
                <circle cx="55" cy="62" r="18" fill="#F59E0B" stroke="#B45309" strokeWidth="1.5" />
                <circle cx="55" cy="62" r="14" fill="#D97706" />

                <text
                    x="55"
                    y="70"
                    fill="white"
                    fontSize="24"
                    fontWeight="950"
                    textAnchor="middle"
                    style={{ fontFamily: 'Arial Black, sans-serif' }}
                >
                    $
                </text>
            </svg>
        </div>
    );
}

export function NanoBananaIcon({ className }: { className?: string }) {
    return (
        <div className={cn("relative inline-flex items-center justify-center", className)}>
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md overflow-visible">
                <path
                    d="M20,70 Q20,30 75,20 C85,18 85,30 80,35 Q75,40 45,65 Q35,85 35,85 Q20,80 20,70"
                    fill="#FDE047"
                />
                <circle cx="55" cy="62" r="18" fill="#F59E0B" />
                <text
                    x="55"
                    y="70"
                    fill="white"
                    fontSize="24"
                    fontWeight="950"
                    textAnchor="middle"
                    style={{ fontFamily: 'Arial Black, sans-serif' }}
                >
                    $
                </text>
            </svg>
        </div>
    )
}
