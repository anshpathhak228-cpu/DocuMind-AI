import { NextResponse } from "next/server";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

const TEXT_MODEL = "Qwen/Qwen3-8B:fastest";
const VISION_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";

type Attachment = {
  path: string;
  name: string;
  type: string;
  size: number;
};

function clean(text: string) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isImageType(type: string) {
  return [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ].includes(type);
}

function isAllowedDocument(fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop() || "";

  return [
    "pdf",
    "docx",
    "txt",
    "csv",
    "xlsx",
    "pptx",
  ].includes(ext);
}

async function extractText(
  fileName: string,
  buffer: ArrayBuffer
) {
  const ext =
    fileName.toLowerCase().split(".").pop() || "";

  if (ext === "txt" || ext === "csv") {
    return clean(new TextDecoder().decode(buffer));
  }

  if (ext === "pdf") {
    const mod: any = await import("pdf-parse");
    const parse = mod.default || mod;

    const result = await parse(Buffer.from(buffer));

    return clean(result.text || "");
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(buffer),
    });

    return clean(result.value || "");
  }

  if (ext === "xlsx") {
    const workbook = XLSX.read(Buffer.from(buffer), {
      type: "buffer",
    });

    const text = workbook.SheetNames.map((sheet) => {
      return (
        "## " +
        sheet +
        "\n" +
        XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])
      );
    }).join("\n\n");

    return clean(text);
  }

  if (ext === "pptx") {
    const zip = await JSZip.loadAsync(buffer);
    const slides: string[] = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
        const xml = await (entry as any).async("text");

        slides.push(
          xml
            .replace(/<a:t>/g, " ")
            .replace(/<\/a:t>/g, " ")
            .replace(/<[^>]+>/g, " ")
        );
      }
    }

    return clean(slides.join("\n"));
  }

  throw new Error("Unsupported file type.");
}

function makeDataUrl(
  type: string,
  buffer: ArrayBuffer
) {
  const base64 = Buffer.from(buffer).toString("base64");

  return `data:${type};base64,${base64}`;
}

export async function POST(req: Request) {
  const temporaryPaths: string[] = [];

  try {
    const body = await req.json();

    const question = String(body?.question || "").trim();

    const attachments: Attachment[] =
      Array.isArray(body?.attachments)
        ? body.attachments
        : [];

    if (!question && attachments.length === 0) {
      return NextResponse.json(
        {
          error:
            "Question or attachment is required.",
        },
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
        {
          error: "Unauthorized. Please login again.",
        },
        { status: 401 }
      );
    }

    const hfToken = process.env.HF_TOKEN;

    if (!hfToken) {
      return NextResponse.json(
        {
          error: "HF_TOKEN is not configured.",
        },
        { status: 500 }
      );
    }

    // Validate attachments
    for (const item of attachments) {
      if (!item?.path || !item?.name) {
        return NextResponse.json(
          {
            error: "Invalid attachment information.",
          },
          { status: 400 }
        );
      }

      if (
        !item.path.startsWith(
          `${user.id}/assistant/`
        )
      ) {
        return NextResponse.json(
          {
            error: "Invalid attachment path.",
          },
          { status: 403 }
        );
      }

      if (item.size > 15 * 1024 * 1024) {
        return NextResponse.json(
          {
            error: `${item.name} is larger than 15 MB.`,
          },
          { status: 400 }
        );
      }

      if (
        !isImageType(item.type) &&
        !isAllowedDocument(item.name)
      ) {
        return NextResponse.json(
          {
            error:
              `Unsupported attachment: ${item.name}`,
          },
          { status: 400 }
        );
      }

      temporaryPaths.push(item.path);
    }

    // Process new attachments
    const attachmentTexts: {
      name: string;
      content: string;
    }[] = [];

    const images: {
      name: string;
      type: string;
      dataUrl: string;
    }[] = [];

    for (const item of attachments) {
      const downloaded = await sb.storage
        .from("documents")
        .download(item.path);

      if (
        downloaded.error ||
        !downloaded.data
      ) {
        throw new Error(
          `Could not read ${item.name}`
        );
      }

      const buffer =
        await downloaded.data.arrayBuffer();

      if (isImageType(item.type)) {
        images.push({
          name: item.name,
          type: item.type,
          dataUrl: makeDataUrl(
            item.type,
            buffer
          ),
        });
      } else {
        const text = await extractText(
          item.name,
          buffer
        );

        if (text) {
          // Limit huge attachment text
          attachmentTexts.push({
            name: item.name,
            content: text.slice(0, 12000),
          });
        }
      }
    }

    // Get user's existing documents
    const {
      data: documents,
      error: docError,
    } = await sb
      .from("documents")
      .select(
        "file_name,extracted_text"
      )
      .eq("user_id", user.id)
      .not("extracted_text", "is", null);

    if (docError) {
      return NextResponse.json(
        {
          error: docError.message,
        },
        { status: 500 }
      );
    }

    // Fast keyword search
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
      "does",
      "please",
      "tell",
      "me",
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

    const candidates: {
      file_name: string;
      content: string;
      score: number;
    }[] = [];

    for (const doc of documents || []) {
      const text = String(
        doc.extracted_text || ""
      );

      // Smaller chunks = less context sent to AI
      const chunkSize = 3500;

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
          score,
        });
      }
    }

    candidates.sort(
      (a, b) => b.score - a.score
    );

    // Only send top 4 chunks
    const selected =
      candidates.slice(0, 4);

    const savedContext = selected
      .map(
        (chunk, index) =>
          `[${index + 1}] ${chunk.file_name}\n${chunk.content}`
      )
      .join("\n\n");

    const attachmentContext =
      attachmentTexts
        .map(
          (item) =>
            `ATTACHED FILE: ${item.name}\n${item.content}`
        )
        .join("\n\n");

    const combinedContext = [
      savedContext
        ? `UPLOADED DOCUMENTS:\n${savedContext}`
        : "",
      attachmentContext
        ? `NEW ATTACHED FILES:\n${attachmentContext}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const hasImages = images.length > 0;

    const model = hasImages
      ? VISION_MODEL
      : TEXT_MODEL;

    const prompt = `
You are DocAI, a fast document AI assistant.

User question:
${question || "Analyze the attached content."}

${
  combinedContext
    ? `
Document context:
${combinedContext}
`
    : ""
}

Rules:
- Answer clearly and directly.
- Use supplied document information.
- Do not invent document facts.
- If information is unavailable, say so.
- Keep the answer concise unless detailed explanation is requested.
`;

    let userContent: any = prompt;

    if (hasImages) {
      const content: any[] = [
        {
          type: "text",
          text: prompt,
        },
      ];

      for (const image of images) {
        content.push({
          type: "text",
          text: `Attached image: ${image.name}`,
        });

        content.push({
          type: "image_url",
          image_url: {
            url: image.dataUrl,
          },
        });
      }

      userContent = content;
    }

    // Streaming Hugging Face response
    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${hfToken}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: hasImages
                ? "You are DocAI, a fast multimodal document assistant."
                : "You are DocAI, a fast document assistant.",
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          temperature: 0.2,
          max_tokens: hasImages
            ? 900
            : 800,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const errorData =
        await response.json();

      return NextResponse.json(
        {
          error:
            errorData?.error?.message ||
            errorData?.error ||
            "Hugging Face request failed.",
        },
        {
          status: response.status,
        }
      );
    }

    if (!response.body) {
      return NextResponse.json(
        {
          error:
            "AI response stream unavailable.",
        },
        { status: 500 }
      );
    }

    // Forward AI stream directly to browser
    const stream =
      new ReadableStream({
        async start(controller) {
          const reader =
            response.body!.getReader();

          const decoder =
            new TextDecoder();

          const encoder =
            new TextEncoder();

          try {
            while (true) {
              const {
                value,
                done,
              } = await reader.read();

              if (done) break;

              const text =
                decoder.decode(
                  value,
                  { stream: true }
                );

              controller.enqueue(
                encoder.encode(text)
              );
            }
          } catch (error) {
            console.error(
              "Stream error:",
              error
            );
          } finally {
            controller.close();
          }
        },
      });

    return new Response(stream, {
      headers: {
        "Content-Type":
          "text/event-stream; charset=utf-8",
        "Cache-Control":
          "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering":
          "no",
      },
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
          "AI Assistant request failed.",
      },
      { status: 500 }
    );
  } finally {
    try {
      if (temporaryPaths.length > 0) {
        const sb =
          await createServerSupabase();

        await sb.storage
          .from("documents")
          .remove(
            temporaryPaths
          );
      }
    } catch (error) {
      console.error(
        "Cleanup error:",
        error
      );
    }
  }
}
