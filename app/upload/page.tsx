"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Upload() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function up() {
    if (!file) return;

    setBusy(true);
    setMsg("");

    try {
      const fd = new FormData();
      fd.append("file", file);

      const r = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      const j = await r.json();

      if (!r.ok) {
        throw new Error(j.error || "Upload failed");
      }

      setMsg("Upload complete! Opening dashboard...");

      setFile(null);

      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 700);
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "Upload failed"
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
            <Link href="/">Home</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/upload">Upload</Link>
            <Link href="/assistant">AI Assistant</Link>
          </div>

        </nav>

        <section className="main">

          <h1>Upload & Index</h1>

          <p className="muted">
            Upload your documents securely.
            Text will be extracted and prepared
            for AI search and RAG.
          </p>

          <div className="drop">

            <h2>☁️ Choose a document</h2>

            <input
              type="file"
              accept=".pdf,.docx,.txt,.csv,.xlsx,.pptx"
              onChange={(e) =>
                setFile(
                  e.target.files?.[0] ?? null
                )
              }
            />

            <p>
              {file?.name ?? "No file selected"}
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
              <p className="muted">
                {msg}
              </p>
            )}

          </div>

        </section>
      </div>
    </main>
  );
}
