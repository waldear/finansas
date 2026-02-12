import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function sanitizeEnv(val: string | undefined): string {
    if (!val) return '';
    // Remove Byte Order Mark (BOM) character 65279 and whitespace
    return val.replace(/^\uFEFF/g, '').trim();
}
