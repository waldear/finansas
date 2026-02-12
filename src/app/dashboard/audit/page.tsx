'use client';

export const dynamic = 'force-dynamic';

import { useAudit } from '@/hooks/use-audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function AuditPage() {
    const { events, isLoading } = useAudit(100);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Auditoría</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Últimos eventos registrados
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : events.length > 0 ? (
                        <div className="space-y-3">
                            {events.map((event) => (
                                <div key={event.id} className="border rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                        <p className="font-medium">
                                            {event.entity_type} • {event.action}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(event.created_at).toLocaleString('es-AR')}
                                        </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        ID entidad: {event.entity_id}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Aún no hay eventos de auditoría.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
