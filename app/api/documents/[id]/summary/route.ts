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

    const hfToken = process.env.HF_TOKEN;

    if (!hfToken) {
      return NextResponse.json(
        { error: "HF_TOKEN is not configured." },
        { status: 500 }
      );
    }

    const prompt = `
Summarize this document faithfully.

Use exactly these sections:

## Overview

## Key Points

## Action Items

Rules:
- Do not invent information.
- Use only information present in the document.
- Preserve important facts, names, dates and numbers.
- Keep the summary clear and useful.
- If there are no action items, write "No specific action items found."

File name:
${doc.file_name}

Document:
${(doc.extracted_text || "").slice(0, 50000)}
`;

    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-8B:fastest",
          messages: [
            {
              role: "system",
              content:
                "You are a document summarization assistant. Never invent facts.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Hugging Face API error:", data);

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            data?.error ||
            "Hugging Face API request failed.",
        },
        { status: response.status }
      );
    }

    const summary =
      data?.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      return NextResponse.json(
        { error: "Hugging Face returned an empty summary." },
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
