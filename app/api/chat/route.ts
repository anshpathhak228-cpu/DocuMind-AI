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

function clean(s: string) {
  return s
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractText(
  fileName: string,
  buf: ArrayBuffer
) {
  const ext =
    fileName
      .toLowerCase()
      .split(".")
      .pop() || "";

  if (
    ext === "txt" ||
    ext === "csv"
  ) {
    return clean(
      new TextDecoder().decode(buf)
    );
  }

  if (ext === "pdf") {
    const mod: any =
      await import("pdf-parse");

    const parse =
      mod.default || mod;

    const result =
      await parse(
        Buffer.from(buf)
      );

    return clean(result.text);
  }

  if (ext === "docx") {
    const result =
      await mammoth.extractRawText({
        buffer: Buffer.from(buf),
      });

    return clean(result.value);
  }

  if (ext === "xlsx") {
    const wb = XLSX.read(
      Buffer.from(buf),
      { type: "buffer" }
    );

    return clean(
      wb.SheetNames
        .map(
          (sheet) =>
            "## " +
            sheet +
            "\n" +
            XLSX.utils.sheet_to_csv(
              wb.Sheets[sheet]
            )
        )
        .join("\n\n")
    );
  }

  if (ext === "pptx") {
    const zip =
      await JSZip.loadAsync(buf);

    const out: string[] = [];

    for (
      const [path, entry] of Object.entries(
        zip.files
      )
    ) {
      if (
        /^ppt\/slides\/slide\d+\.xml$/.test(
          path
        )
      ) {
        const xml =
          await (entry as any).async(
            "text"
          );

        out.push(
          xml
            .replace(/<a:t>/g, " ")
            .replace(/<\/a:t>/g, " ")
            .replace(/<[^>]+>/g, " ")
        );
      }
    }

    return clean(
      out.join("\n")
    );
  }

  throw new Error(
    "Unsupported file type: " +
      ext
  );
}

function isImageType(type: string) {
  return (
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/webp" ||
    type === "image/gif"
  );
}

function isAllowedDocument(
  fileName: string
) {
  const ext =
    fileName
      .toLowerCase()
      .split(".")
      .pop() || "";

  return [
    "pdf",
    "docx",
    "txt",
    "csv",
    "xlsx",
    "pptx",
  ].includes(ext);
}

function makeDataUrl(
  type: string,
  buffer: ArrayBuffer
) {
  const base64 =
    Buffer.from(buffer).toString(
      "base64"
    );

  return `data:${type};base64,${base64}`;
}

export async function POST(
  req: Request
) {
  const temporaryPaths: string[] = [];

  try {
    const body = await req.json();

    const question =
      String(
        body?.question || ""
      ).trim();

    const attachments: Attachment[] =
      Array.isArray(
        body?.attachments
      )
        ? body.attachments
        : [];

    if (
      !question &&
      attachments.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Question or attachment is required.",
        },
        { status: 400 }
      );
    }

    const sb =
      await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized. Please login again.",
        },
        { status: 401 }
      );
    }

    const hfToken =
      process.env.HF_TOKEN;

    if (!hfToken) {
      return NextResponse.json(
        {
          error:
            "HF_TOKEN is not configured.",
        },
        { status: 500 }
      );
    }

    /*
     * SECURITY:
     * Every attachment must belong to
     * the currently authenticated user.
     */
    for (const item of attachments) {
      if (
        !item?.path ||
        !item?.name
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid attachment information.",
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
            error:
              "Invalid attachment path.",
          },
          { status: 403 }
        );
      }

      temporaryPaths.push(
        item.path
      );

      if (
        item.size >
        15 * 1024 * 1024
      ) {
        return NextResponse.json(
          {
            error:
              `${item.name} is larger than 15 MB.`,
          },
          { status: 400 }
        );
      }

      if (
        !isImageType(item.type) &&
        !isAllowedDocument(
          item.name
        )
      ) {
        return NextResponse.json(
          {
            error:
              `Unsupported attachment: ${item.name}`,
          },
          { status: 400 }
        );
      }
    }

    /*
     * Read assistant attachments.
     */
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
      const downloaded =
        await sb.storage
          .from("documents")
          .download(item.path);

      if (
        downloaded.error ||
        !downloaded.data
      ) {
        throw new Error(
          `Could not read attachment: ${item.name}`
        );
      }

      const buffer =
        await downloaded.data.arrayBuffer();

      if (
        isImageType(item.type)
      ) {
        images.push({
          name: item.name,
          type: item.type,
          dataUrl:
            makeDataUrl(
              item.type,
              buffer
            ),
        });
      } else {
        const extracted =
          await extractText(
            item.name,
            buffer
          );

        if (extracted) {
          attachmentTexts.push({
            name: item.name,
            content: extracted,
          });
        }
      }
    }

    /*
     * Get user's saved documents.
     */
    const {
      data: documents,
      error: docError,
    } = await sb
      .from("documents")
      .select(
        "id,file_name,extracted_text"
      )
      .eq(
        "user_id",
        user.id
      )
      .not(
        "extracted_text",
        "is",
        null
      );

    if (docError) {
      return NextResponse.json(
        {
          error:
            docError.message,
        },
        { status: 500 }
      );
    }

    /*
     * Existing document RAG-style
     * keyword retrieval.
     */
    const stopWords =
      new Set([
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
      ]);

    const words =
      question
        .toLowerCase()
        .replace(
          /[^a-z0-9\s]/g,
          " "
        )
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

    for (const doc of
      documents || []) {
      const text =
        String(
          doc.extracted_text ||
            ""
        );

      const chunkSize =
        5000;

      for (
        let i = 0;
        i < text.length;
        i += chunkSize
      ) {
        const content =
          text.slice(
            i,
            i + chunkSize
          );

        const lower =
          content.toLowerCase();

        let score = 0;

        for (const word of words) {
          if (
            lower.includes(word)
          ) {
            score++;
          }
        }

        candidates.push({
          file_name:
            doc.file_name,
          content,
          score,
        });
      }
    }

    candidates.sort(
      (a, b) =>
        b.score - a.score
    );

    const selected =
      candidates.slice(0, 8);

    const savedContext =
      selected
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

    const combinedContext =
      [
        savedContext
          ? "UPLOADED DOCUMENTS:\n" +
            savedContext
          : "",
        attachmentContext
          ? "NEW ATTACHED FILES:\n" +
            attachmentContext
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

    /*
     * If an image is attached,
     * use the multimodal model.
     */
    const hasImages =
      images.length > 0;

    const model =
      hasImages
        ? VISION_MODEL
        : TEXT_MODEL;

    const textPrompt = `
You are DocAI, a secure document-aware AI assistant.

User question:
${question || "Please analyze the attached content."}

Use the provided document context and attached content.

Rules:
- Answer clearly and helpfully.
- Do not invent information.
- For document questions, prefer the supplied document content.
- If the requested information is not present, clearly say that you could not find it.
- If an image is attached, analyze the visible content of the image.
- You may describe text, tables, objects, diagrams, screenshots, charts, and other visible information.
- Use simple language.
${combinedContext
  ? `

DOCUMENT CONTEXT:
${combinedContext}`
  : ""}
`;

    let userContent:
      | string
      | {
          type: string;
          text?: string;
          image_url?: {
            url: string;
          };
        }[];

    if (hasImages) {
      const contentParts: {
        type: string;
        text?: string;
        image_url?: {
          url: string;
        };
      }[] = [];

      contentParts.push({
        type: "text",
        text: textPrompt,
      });

      for (const image of images) {
        contentParts.push({
          type: "text",
          text:
            `Attached image: ${image.name}`,
        });

        contentParts.push({
          type: "image_url",
          image_url: {
            url: image.dataUrl,
          },
        });
      }

      userContent =
        contentParts;
    } else {
      userContent =
        textPrompt;
    }

    const response =
      await fetch(
        "https://router.huggingface.co/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization:
              "Bearer " +
              hfToken,
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            model,

            messages: [
              {
                role: "system",
                content:
                  hasImages
                    ? "You are DocAI, a multimodal document assistant. Analyze images and supplied document context carefully."
                    : "You are DocAI. Answer using supplied document context and never invent document facts.",
              },

              {
                role: "user",
                content:
                  userContent,
              },
            ],

            temperature: 0.2,

            max_tokens:
              hasImages
                ? 1500
                : 1200,
          }),
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
            "Hugging Face request failed.",
        },
        {
          status:
            response.status,
        }
      );
    }

    const answer =
      data?.choices?.[0]
        ?.message
        ?.content
        ?.trim();

    if (!answer) {
      return NextResponse.json(
        {
          error:
            "AI returned an empty response.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      answer,

      sources: selected.map(
        (chunk) =>
          chunk.file_name
      ),

      attachments:
        attachments.map(
          (item) =>
            item.name
        ),

      model,
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
    /*
     * Remove temporary assistant
     * attachments from private storage.
     */
    try {
      if (
        temporaryPaths.length > 0
      ) {
        const sb =
          await createServerSupabase();

        await sb.storage
          .from("documents")
          .remove(
            temporaryPaths
          );
      }
    } catch (cleanupError) {
      console.error(
        "Attachment cleanup error:",
        cleanupError
      );
    }
  }
}
