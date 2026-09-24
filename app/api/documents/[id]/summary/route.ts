import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const sb = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const { data: doc, error: docError } = await sb
      .from("documents")
      .select("file_name,extracted_text")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (docError) {
      return NextResponse.json(
        { error: docError.message },
        { status: 500 }
      );
    }

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const prompt = `
Summarize the following document faithfully.

Use these headings:
## Overview
## Key Points
## Action Items

Rules:
- Do not invent information.
- Use only information present in the document.
- Keep the summary clear and useful.
- Preserve important facts, names, dates and numbers.

File name:
${doc.file_name}

Document:
${(doc.extracted_text || "").slice(0, 60000)}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "Gemini API request failed.",
        },
        { status: 500 }
      );
    }

    const summary = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();

    if (!summary) {
      return NextResponse.json(
        { error: "Gemini returned an empty summary." },
        { status: 500 }
      );
    }

    const { error: updateError } = await sb
      .from("documents")
      .update({ summary })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.redirect(
      new URL(`/documents/${id}`, req.url)
    );
  } catch (error: any) {
    console.error("Summary generation failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Summary generation failed.",
      },
      { status: 500 }
    );
  }
}
