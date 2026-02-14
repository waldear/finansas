'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type AssistantAttachmentContextValue = {
    pendingFile: File | null;
    setPendingFile: (file: File | null) => void;
    consumePendingFile: () => File | null;
};

const AssistantAttachmentContext = createContext<AssistantAttachmentContextValue | null>(null);

export function AssistantAttachmentProvider({ children }: { children: React.ReactNode }) {
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    const consumePendingFile = useCallback(() => {
        const file = pendingFile;
        setPendingFile(null);
        return file;
    }, [pendingFile]);

    const value = useMemo(() => ({
        pendingFile,
        setPendingFile,
        consumePendingFile,
    }), [pendingFile, consumePendingFile]);

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
        } satisfies AssistantAttachmentContextValue;
    }
    return ctx;
}

