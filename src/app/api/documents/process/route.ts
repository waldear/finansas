
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Schema for the extraction result
const extractionSchema = `
{
  "total_amount": number,
  "currency": string (e.g., "ARS", "USD"),
  "due_date": string (YYYY-MM-DD),
  "minimum_payment": number (nullable),
  "items": [
    {
      "description": string,
      "amount": number,
      "date": string (YYYY-MM-DD)
    }
  ],
  "type": string ("credit_card", "invoice", "bank_statement", "other"),
  "merchant": string (nullable)
}
`;

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // 1. Authenticate user
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Upload to Supabase Storage
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
            .from("documents")
            .upload(fileName, file);

        if (uploadError) {
            console.error("Upload error:", uploadError);
            return NextResponse.json(
                { error: "Failed to upload document" },
                { status: 500 }
            );
        }

        // Get public URL (or signed URL if private)
        const { data: { publicUrl } } = supabase.storage
            .from("documents")
            .getPublicUrl(fileName);


        // 3. Process with Gemini
        const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY;
        const genAI = new GoogleGenerativeAI(apiKey!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");

        const prompt = `
      You are a financial data extraction expert. 
      Analyze this document (image or PDF) and extract the key financial information.
      Return ONLY a valid JSON object matching this schema:
      ${extractionSchema}

      If a field is not found, use null.
      For "items", extract the 5 largest transactions if there are many.
      Ensure the currency is correct (default to ARS if not specified but looks like Argentine Peso).
      Date format must be YYYY-MM-DD.
    `;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: file.type,
                },
            },
        ]);

        const response = await result.response;
        const text = response.text();

        // Clean code fences if present
        const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const extractionData = JSON.parse(cleanJson);

        // 4. Save metadata to DB
        // Insert document record
        const { data: docData, error: docError } = await supabase
            .from('documents')
            .insert({
                user_id: user.id,
                url: publicUrl,
                type: extractionData.type || 'other',
                status: 'processed'
            })
            .select()
            .single();

        if (docError) {
            console.error("DB Error (Elements):", docError);
            // Continue anyway to return result to UI, but log error
        }

        // Insert extraction record
        if (docData) {
            await supabase
                .from('extractions')
                .insert({
                    document_id: docData.id,
                    raw_json: extractionData,
                    confidence_score: 1.0, // Mock score for now
                    manual_verification_needed: false
                });
        }

        return NextResponse.json({
            success: true,
            data: extractionData,
            documentId: docData?.id
        });

    } catch (error: any) {
        console.error("Processing error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
