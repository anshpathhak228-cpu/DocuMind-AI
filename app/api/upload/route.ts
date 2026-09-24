import { NextResponse } from "next/server";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

function clean(s: string) {
  return s
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeChunks(text: string) {
  const out: string[] = [];
  const size = 1400;
  const overlap = 180;

  for (
    let i = 0;
    i < text.length;
    i += size - overlap
  ) {
    const chunk = text
      .slice(i, i + size)
      .trim();

    if (chunk) out.push(chunk);

    if (i + size >= text.length) break;
  }

  return out;
}

async function extract(
  fileName: string,
  buf: ArrayBuffer
) {
  const ext =
    fileName
      .toLowerCase()
      .split(".")
      .pop() || "";

  if (ext === "txt" || ext === "csv") {
    return clean(
      new TextDecoder().decode(buf)
    );
  }

  if (ext === "pdf") {
    const mod: any = await import(
      "pdf-parse"
    );

    const parse = mod.default || mod;

    const result = await parse(
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

    return clean(out.join("\n"));
  }

  throw new Error(
    "Unsupported file type."
  );
}

export async function POST(req: Request) {
  try {
    const sb =
      await createServerSupabase();

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Please login first.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      path,
      fileName,
      fileType,
      fileSize,
    } = body;

    if (!path || !fileName) {
      return NextResponse.json(
        {
          error:
            "Uploaded file information is missing.",
        },
        { status: 400 }
      );
    }

    const allowed = [
      "pdf",
      "docx",
      "txt",
      "csv",
      "xlsx",
      "pptx",
    ];

    const ext =
      fileName
        .toLowerCase()
        .split(".")
        .pop() || "";

    if (!allowed.includes(ext)) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type.",
        },
        { status: 400 }
      );
    }

    if (fileSize > 15 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            "Maximum file size is 15 MB.",
        },
        { status: 400 }
      );
    }

    const downloaded =
      await sb.storage
        .from("documents")
        .download(path);

    if (downloaded.error) {
      throw downloaded.error;
    }

    const buffer =
      await downloaded.data.arrayBuffer();

    const text = await extract(
      fileName,
      buffer
    );

    if (!text) {
      return NextResponse.json(
        {
          error:
            "No readable text found.",
        },
        { status: 400 }
      );
    }

    const {
      data: doc,
      error: documentError,
    } = await sb
      .from("documents")
      .insert({
        user_id: user.id,
        file_name: fileName,
        file_type: fileType || ext,
        file_size: fileSize || buffer.byteLength,
        storage_path: path,
        extracted_text: text,
      })
      .select("id")
      .single();

    if (documentError) {
      throw documentError;
    }

    const chunks = makeChunks(text);

    if (chunks.length > 0) {
      const rows = chunks.map(
        (content, index) => ({
          document_id: doc.id,
          user_id: user.id,
          chunk_index: index,
          content,
        })
      );

      const {
        error: chunkError,
      } = await sb
        .from("document_chunks")
        .insert(rows);

      if (chunkError) {
        throw chunkError;
      }
    }

    return NextResponse.json({
      ok: true,
      document_id: doc.id,
      chunks: chunks.length,
    });
  } catch (e) {
    console.error("UPLOAD ERROR:", e);

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Upload failed.",
      },
      { status: 500 }
    );
  }
}
