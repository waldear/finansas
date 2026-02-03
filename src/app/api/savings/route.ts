import { createClient } from '@/lib/supabase-server';
import { SavingsGoalSchema } from '@/lib/schemas';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase.from('savings_goals').select('*').order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

export async function POST(req: Request) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const validatedData = SavingsGoalSchema.parse(body);
        const { data, error } = await supabase.from('savings_goals').insert([{ ...validatedData, user_id: user.id }]).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.errors || err.message }, { status: 400 });
    }
}
