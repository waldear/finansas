
'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useCopilot } from '@/hooks/use-copilot';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export function NotificationCenter() {
    const { insight } = useCopilot();

    // Filter for "High Priority" items (Priority 1)
    const alerts = insight.weeklyActions?.filter(action => action.priority === 1 && !action.isCompleted) || [];
    const hasAlerts = alerts.length > 0;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {hasAlerts && (
                        <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse ring-2 ring-background" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Notificaciones</h4>
                        <p className="text-sm text-muted-foreground">
                            {hasAlerts ? `Tienes ${alerts.length} alertas importantes.` : 'Estás al día.'}
                        </p>
                    </div>
                    {hasAlerts ? (
                        <ScrollArea className="h-[300px] w-full pr-4">
                            <div className="grid gap-2">
                                {alerts.map((alert) => (
                                    <div key={alert.id} className="flex flex-col gap-1 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold">{alert.title}</span>
                                            <Badge variant="destructive" className="text-[10px] h-5">Urgente</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {alert.description}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                            <Bell className="h-8 w-8 mb-2 opacity-20" />
                            <p className="text-sm">No hay notificaciones nuevas</p>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
