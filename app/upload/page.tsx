"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function Upload() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function goDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  async function up() {
    if (!file || busy) return;

    setBusy(true);
    setSuccess(false);
    setMsg("Uploading securely...");

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Please login first.");
      }

      const safeName = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      const path =
        user.id +
        "/" +
        crypto.randomUUID() +
        "-" +
        safeName;

      const { error: uploadError } =
        await supabase.storage
          .from("documents")
          .upload(path, file, {
            contentType:
              file.type ||
              "application/octet-stream",
            upsert: false,
          });

      if (uploadError) {
        throw uploadError;
      }

      setMsg(
        "File uploaded. Processing document..."
      );

      const response = await fetch(
        "/api/upload",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        await supabase.storage
          .from("documents")
          .remove([path]);

        throw new Error(
          result.error ||
            "Document processing failed."
        );
      }

      setSuccess(true);
      setMsg(
        "Upload complete! Your document is ready."
      );

      setFile(null);

      setTimeout(() => {
        goDashboard();
      }, 2000);
    } catch (error) {
      setSuccess(false);

      setMsg(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="container">

        <nav className="nav">

          <Link
            className="brand"
            href="/dashboard"
          >
            Doc<span>AI</span>
          </Link>

          <div className="links">

            <Link href="/">
              Home
            </Link>

            <Link href="/dashboard">
              Dashboard
            </Link>

            <Link href="/upload">
              Upload
            </Link>

            <Link href="/assistant">
              AI Assistant
            </Link>

          </div>

        </nav>

        <section className="main">

          <h1>
            Upload & Index
          </h1>

          <p className="muted">
            Upload your documents securely.
            DocAI will extract the text and
            prepare it for AI search and RAG.
          </p>

          <div className="drop">

            <h2>
              ☁️ Choose a document
            </h2>

            <input
              type="file"
              accept=".pdf,.docx,.txt,.csv,.xlsx,.pptx"
              disabled={busy}
              onChange={(e) => {
                setFile(
                  e.target.files?.[0] ?? null
                );
                setMsg("");
                setSuccess(false);
              }}
            />

            <p>
              {file?.name ||
                "No file selected"}
            </p>

            <button
              className="btn primary"
              disabled={!file || busy}
              onClick={up}
            >
              {busy
                ? "Processing..."
                : "Upload Securely"}
            </button>

            {msg && (
              <div
                className="card"
                style={{
                  marginTop: "20px",
                  textAlign: "center",
                  padding: "18px",
                }}
              >

                <p
                  className={
                    success
                      ? ""
                      : "muted"
                  }
                >
                  {success
                    ? "✅ " + msg
                    : msg}
                </p>

                {success && (
                  <>
                    <button
                      className="btn primary"
                      onClick={goDashboard}
                    >
                      Go to Dashboard →
                    </button>

                    <p
                      className="muted"
                      style={{
                        fontSize: "12px",
                        marginTop: "10px",
                      }}
                    >
                      Dashboard will open
                      automatically in a moment.
                    </p>
                  </>
                )}

              </div>
            )}

          </div>

        </section>
      </div>
    </main>
  );
}
