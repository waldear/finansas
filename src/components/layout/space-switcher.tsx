'use client';

import Link from 'next/link';
import { ChevronDown, Check, Users, User2, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSpace } from '@/components/providers/space-provider';

export function SpaceSwitcher({ className }: { className?: string }) {
    const { spaces, activeSpaceId, activeSpace, isLoading, setActiveSpace } = useSpace();

    if (isLoading) {
        return (
            <div className={cn('h-7 w-32 animate-pulse rounded-full bg-muted', className)} aria-hidden="true" />
        );
    }

    if (!activeSpaceId || !activeSpace) {
        return null;
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur transition hover:text-foreground',
                        className
                    )}
                    aria-label="Cambiar espacio"
                    title="Cambiar espacio"
                >
                    {activeSpace.type === 'family' ? <Users className="h-3.5 w-3.5" /> : <User2 className="h-3.5 w-3.5" />}
                    <span className="max-w-[11rem] truncate">{activeSpace.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
                <div className="border-b p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espacios</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Selecciona dónde trabajar</p>
                </div>

                <div className="p-2">
                    <div className="space-y-1">
                        {spaces.map((space) => {
                            const isActive = space.id === activeSpaceId;
                            return (
                                <button
                                    key={space.id}
                                    type="button"
                                    className={cn(
                                        'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted',
                                        isActive && 'bg-muted'
                                    )}
                                    onClick={() => void setActiveSpace(space.id)}
                                    disabled={isActive}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        {space.type === 'family' ? <Users className="h-4 w-4" /> : <User2 className="h-4 w-4" />}
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium">{space.name}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {space.type === 'family' ? 'Familia' : 'Personal'} • {space.role.toUpperCase()}
                                            </span>
                                        </span>
                                    </span>
                                    {isActive ? <Check className="h-4 w-4 text-primary" /> : null}
                                </button>
                            );
                        })}
                        {spaces.length === 0 && (
                            <div className="px-3 py-4 text-sm text-muted-foreground">No hay espacios aún.</div>
                        )}
                    </div>
                </div>

                <div className="border-t p-2">
                    <Link
                        href="/dashboard/profile#spaces"
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
                    >
                        <Settings2 className="h-4 w-4" />
                        Gestionar espacios
                    </Link>
                </div>
            </PopoverContent>
        </Popover>
    );
}

