export const MAX_ASSISTANT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_ASSISTANT_ATTACHMENT_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
] as const;

export const SUPPORTED_ASSISTANT_ATTACHMENT_TYPES = new Set<string>(SUPPORTED_ASSISTANT_ATTACHMENT_MIME_TYPES);

