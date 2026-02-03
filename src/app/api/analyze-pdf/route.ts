import { NextResponse } from 'next/server';
import pdf from 'pdf-parse';

import { createClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { fileData } = await req.json(); // base64 string

        if (!fileData) {
            return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const data = await pdf(buffer);

        return NextResponse.json({ text: data.text });
    } catch (error: any) {
        console.error('PDF Parse Error:', error);
        return NextResponse.json({ error: 'Error processing PDF: ' + error.message }, { status: 500 });
    }
}
