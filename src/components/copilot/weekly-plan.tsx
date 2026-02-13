
'use client';

import { useCopilot } from '@/hooks/use-copilot';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle2, Circle, ArrowRight, ShieldAlert, Rocket, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function WeeklyPlan() {
    const { insight, isLoading } = useCopilot();

    const handleCompleteAction = () => {
        // In a real app, this would mutate state in DB
        toast.success('¡Acción completada! Tu plan se actualizará pronto.');
    };

    if (isLoading) {
        return (
            <Card className="animate-pulse">
                <CardHeader>
                    <div className="h-6 w-32 bg-muted rounded"></div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="h-12 w-full bg-muted rounded"></div>
                    <div className="h-12 w-full bg-muted rounded"></div>
                </CardContent>
            </Card>
        );
    }

    const ProfileIcon = () => {
        switch (insight.profile) {
            case 'defensive': return <ShieldAlert className="w-5 h-5 text-red-500" />;
            case 'accelerated': return <Rocket className="w-5 h-5 text-green-500" />;
            default: return <Scale className="w-5 h-5 text-blue-500" />;
        }
    };

    const getOutlookColor = () => {
        switch (insight.profile) {
            case 'defensive': return 'text-red-500 bg-red-50 dark:bg-red-900/10';
            case 'accelerated': return 'text-green-500 bg-green-50 dark:bg-green-900/10';
            default: return 'text-blue-500 bg-blue-50 dark:bg-blue-900/10';
        }
    };

    return (
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <ProfileIcon />
                            Plan Semanal
                        </CardTitle>
                        <CardDescription>
                            Perfil detectado: <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", getOutlookColor())}>
                                {insight.monthlyOutlook}
                            </span>
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {insight.weeklyActions.length > 0 ? (
                        insight.weeklyActions.map((action) => (
                            <div key={action.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group">
                                <button
                                    onClick={handleCompleteAction}
                                    className="mt-0.5 text-muted-foreground hover:text-primary transition-colors"
                                >
                                    {action.isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                                </button>
                                <div className="flex-1 space-y-1">
                                    <p className={cn("font-medium text-sm leading-none", action.isCompleted && "line-through text-muted-foreground")}>
                                        {action.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {action.description}
                                    </p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-6 text-muted-foreground">
                            <p>¡Todo al día! Disfruta tu semana financiera. 🌴</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
