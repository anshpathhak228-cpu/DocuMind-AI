import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

const MODEL = "Qwen/Qwen3-8B:fastest";

export async function POST(req: Request) {
  try {
    const { question } = await req.json();

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 }
      );
    }

    const sb = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const hfToken = process.env.HF_TOKEN;

    if (!hfToken) {
      return NextResponse.json(
        { error: "HF_TOKEN is not configured." },
        { status: 500 }
      );
    }

    // Get uploaded documents directly.
    // No OpenAI embeddings required.
    const { data: documents, error: docError } = await sb
      .from("documents")
      .select("id,file_name,extracted_text")
      .eq("user_id", user.id)
      .not("extracted_text", "is", null);

    if (docError) {
      return NextResponse.json(
        { error: docError.message },
        { status: 500 }
      );
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({
        answer:
          "I couldn't find any uploaded documents. Please upload a document first.",
        sources: []
      });
    }

    const stopWords = new Set([
      "the",
      "is",
      "are",
      "was",
      "were",
      "what",
      "who",
      "when",
      "where",
      "why",
      "how",
      "a",
      "an",
      "and",
      "or",
      "of",
      "to",
      "in",
      "on",
      "for",
      "with",
      "this",
      "that",
      "it",
      "from",
      "can",
      "do",
      "does"
    ]);

    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (word: string) =>
          word.length > 2 &&
          !stopWords.has(word)
      );

    // Create small chunks directly from extracted text.
    const candidates: {
      file_name: string;
      content: string;
      score: number;
    }[] = [];

    for (const doc of documents) {
      const text = String(
        doc.extracted_text || ""
      );

      const chunkSize = 5000;

      for (
        let i = 0;
        i < text.length;
        i += chunkSize
      ) {
        const content = text.slice(
          i,
          i + chunkSize
        );

        const lower =
          content.toLowerCase();

        let score = 0;

        for (const word of words) {
          if (lower.includes(word)) {
            score++;
          }
        }

        candidates.push({
          file_name: doc.file_name,
          content,
          score
        });
      }
    }

    candidates.sort(
      (a, b) => b.score - a.score
    );

    const selected =
      candidates
        .slice(0, 8);

    const context = selected
      .map(
        (chunk, index) =>
          `[${index + 1}] ${chunk.file_name}\n${chunk.content}`
      )
      .join("\n\n");

    const finalContext =
      context ||
      "No relevant information was found in the uploaded documents.";

    const prompt = `
You are DocuMind AI, a document-aware AI assistant.

Answer the user's question using ONLY the uploaded document context below.

Rules:
- Do not invent facts.
- Do not use outside knowledge.
- If the answer is not present in the documents, say:
  "I couldn't find this information in your uploaded documents."
- Give a clear and useful answer.
- Use simple language.
- Cite the document context using [1], [2], etc. when appropriate.

User question:
${question}

Uploaded document context:
${finalContext}
`;

    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            "Bearer " + hfToken,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          model: MODEL,

          messages: [
            {
              role: "system",
              content:
                "You are DocuMind AI. Answer only from uploaded documents."
            },

            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.2,

          max_tokens: 1200
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Hugging Face error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            data?.error ||
            "Hugging Face request failed."
        },

        {
          status: response.status
        }
      );
    }

    const answer =
      data?.choices?.[0]
        ?.message?.content
        ?.trim();

    if (!answer) {
      return NextResponse.json(
        {
          error:
            "AI returned an empty response."
        },

        {
          status: 500
        }
      );
    }

    return NextResponse.json({
      answer,

      sources:
        selected.map(
          (chunk) =>
            chunk.file_name
        )
    });

  } catch (error: any) {
    console.error(
      "Chat error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "AI Assistant request failed."
      },

      {
        status: 500
      }
    );
  }
}
