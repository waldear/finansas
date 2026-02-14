'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type PendingDocumentContext = {
    sourceName: string;
    mimeType: string;
    sizeBytes: number;
    extraction: unknown;
};

type AssistantAttachmentContextValue = {
    pendingFile: File | null;
    setPendingFile: (file: File | null) => void;
    consumePendingFile: () => File | null;

    pendingDocumentContext: PendingDocumentContext | null;
    setPendingDocumentContext: (value: PendingDocumentContext | null) => void;
    consumePendingDocumentContext: () => PendingDocumentContext | null;
};

const AssistantAttachmentContext = createContext<AssistantAttachmentContextValue | null>(null);

export function AssistantAttachmentProvider({ children }: { children: React.ReactNode }) {
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingDocumentContext, setPendingDocumentContext] = useState<PendingDocumentContext | null>(null);

    const consumePendingFile = useCallback(() => {
        const file = pendingFile;
        setPendingFile(null);
        return file;
    }, [pendingFile]);

    const consumePendingDocumentContext = useCallback(() => {
        const value = pendingDocumentContext;
        setPendingDocumentContext(null);
        return value;
    }, [pendingDocumentContext]);

    const value = useMemo(() => ({
        pendingFile,
        setPendingFile,
        consumePendingFile,

        pendingDocumentContext,
        setPendingDocumentContext,
        consumePendingDocumentContext,
    }), [pendingFile, consumePendingFile, pendingDocumentContext, consumePendingDocumentContext]);

    return (
        <AssistantAttachmentContext.Provider value={value}>
            {children}
        </AssistantAttachmentContext.Provider>
    );
}

export function useAssistantAttachment() {
    const ctx = useContext(AssistantAttachmentContext);
    if (!ctx) {
        return {
            pendingFile: null,
            setPendingFile: () => {},
            consumePendingFile: () => null,
            pendingDocumentContext: null,
            setPendingDocumentContext: () => {},
            consumePendingDocumentContext: () => null,
        } satisfies AssistantAttachmentContextValue;
    }
    return ctx;
}
