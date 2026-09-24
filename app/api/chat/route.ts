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

    const { data: chunks, error: chunksError } = await sb
      .from("document_chunks")
      .select("content,chunk_index,documents!inner(file_name)")
      .eq("user_id", user.id)
      .limit(100);

    if (chunksError) {
      console.error("Chunk retrieval error:", chunksError);

      return NextResponse.json(
        { error: chunksError.message },
        { status: 500 }
      );
    }

    const stopWords = new Set([
      "the","is","are","was","were","what","who","when",
      "where","why","how","a","an","and","or","of","to",
      "in","on","for","with","this","that","it","from",
      "can","do","does"
    ]);

    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (word: string) =>
          word.length > 2 && !stopWords.has(word)
      );

    const rankedChunks = (chunks || [])
      .map((chunk: any) => {
        const content = String(
          chunk.content || ""
        ).toLowerCase();

        let score = 0;

        for (const word of words) {
          if (content.includes(word)) {
            score++;
          }
        }

        return {
          content: chunk.content,
          file_name:
            chunk.documents?.file_name ||
            "Uploaded document",
          chunk_index: chunk.chunk_index,
          score
        };
      })
      .sort(
        (a: any, b: any) =>
          b.score - a.score
      )
      .slice(0, 10);

    const context = rankedChunks
      .map(
        (chunk: any, index: number) =>
          "[" +
          String(index + 1) +
          "] " +
          chunk.file_name +
          "\n" +
          chunk.content
      )
      .join("\n\n");

    const finalContext =
      context ||
      "No matching information was found in the uploaded documents.";

    const prompt =
      "You are DocuMind AI, a document-aware assistant.\n\n" +
      "Answer the user's question using ONLY the supplied document context.\n\n" +
      "Rules:\n" +
      "- Do not invent facts.\n" +
      "- If the answer is not present, say you couldn't find it in the uploaded documents.\n" +
      "- Give a clear and useful answer.\n" +
      "- Use simple language.\n" +
      "- Cite relevant source numbers like [1] or [2].\n\n" +
      "User question:\n" +
      question +
      "\n\nDocument context:\n" +
      finalContext;

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
                "You are DocuMind AI, a helpful document assistant."
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

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Hugging Face Chat Error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            data?.error ||
            "Hugging Face AI request failed."
        },
        { status: response.status }
      );
    }

    const answer =
      data?.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return NextResponse.json(
        {
          error:
            "AI returned an empty response."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      answer,
      sources: rankedChunks.map(
        (chunk: any) =>
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
      { status: 500 }
    );
  }
}
