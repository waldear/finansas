'use client';

import { cn } from "@/lib/utils";

export function FinFlowLogo({ className }: { className?: string }) {
    return (
        <div className={cn("relative inline-flex items-center justify-center", className)}>
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm overflow-visible">
                <defs>
                    <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                </defs>
                {/* Abstract 'F' logo with flow */}
                <path
                    d="M30 25 H75 A5 5 0 0 1 80 30 V35 A5 5 0 0 1 75 40 H45 V50 H70 A5 5 0 0 1 75 55 V60 A5 5 0 0 1 70 65 H45 V80 A5 5 0 0 1 40 85 H35 A5 5 0 0 1 30 80 V25 Z"
                    fill="url(#flowGradient)"
                />
                <circle cx="75" cy="75" r="10" fill="#10B981" />
            </svg>
        </div>
    );
}

export function FinFlowIcon({ className }: { className?: string }) {
    return (
        <div className={cn("relative inline-flex items-center justify-center", className)}>
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md overflow-visible">
                <path
                    d="M20 20 H80 V80 H20 Z"
                    fill="#3B82F6"
                />
            </svg>
        </div>
    )
}
