"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

type Session = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export default function Assistant() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [m, setM] = useState<Msg[]>([]);

  async function loadSessions() {
    const r = await fetch("/api/chat/sessions");
    const j = await r.json();

    if (r.ok) {
      setSessions(j.sessions || []);

      if (j.sessions?.length && !sessionId) {
        await loadSession(j.sessions[0].id);
      }
    }
  }

  async function loadSession(id: string) {
    setSessionId(id);

    const r = await fetch(
      `/api/chat/sessions/${id}/messages`
    );

    const j = await r.json();

    if (r.ok) {
      setM(j.messages || []);
    }
  }

  function newChat() {
    setSessionId("");
    setM([]);
    setQ("");
  }

  async function createSession(title: string) {
    const r = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ title }),
    });

    const j = await r.json();

    if (!r.ok) {
      throw new Error(
        j.error || "Failed to create chat."
      );
    }

    setSessions((old) => [
      j.session,
      ...old,
    ]);

    setSessionId(j.session.id);

    return j.session.id;
  }

  async function saveMessage(
    id: string,
    role: "user" | "assistant",
    content: string
  ) {
    await fetch(
      `/api/chat/sessions/${id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          role,
          content,
        }),
      }
    );
  }

  async function send() {
    if (!q.trim() || busy) return;

    const text = q.trim();

    setQ("");
    setBusy(true);

    try {
      let activeSession = sessionId;

      if (!activeSession) {
        activeSession = await createSession(
          text.slice(0, 40)
        );
      }

      setM((old) => [
        ...old,
        {
          role: "user",
          content: text,
        },
      ]);

      await saveMessage(
        activeSession,
        "user",
        text
      );

      const r = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          question: text,
        }),
      });

      const j = await r.json();

      const answer = r.ok
        ? j.answer
        : j.error || "Something went wrong.";

      setM((old) => [
        ...old,
        {
          role: "assistant",
          content: answer,
        },
      ]);

      if (r.ok) {
        await saveMessage(
          activeSession,
          "assistant",
          answer
        );
      }

      await loadSessions();
    } catch (error) {
      setM((old) => [
        ...old,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Network error. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await createClient().auth.signOut();
    window.location.href = "/";
  }

  useEffect(() => {
    loadSessions();
  }, []);

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

          <button
            className="btn"
            onClick={logout}
          >
            Logout
          </button>

        </nav>

        <section className="main">

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "240px 1fr",
              gap: "20px",
            }}
          >

            <aside
              className="card"
              style={{
                padding: "16px",
                height: "fit-content",
              }}
            >

              <button
                className="btn primary"
                onClick={newChat}
                style={{
                  width: "100%",
                  marginBottom: "16px",
                }}
              >
                + New Chat
              </button>

              <h3
                style={{
                  marginBottom: "12px",
                }}
              >
                Chat History
              </h3>

              {sessions.length === 0 && (
                <p className="muted">
                  No chats yet.
                </p>
              )}

              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    loadSession(s.id)
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px",
                    marginBottom: "6px",
                    borderRadius: "10px",
                    border:
                      "1px solid #24334d",
                    background:
                      sessionId === s.id
                        ? "#263b66"
                        : "transparent",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {s.title}
                </button>
              ))}

            </aside>

            <div>

              <h1>AI Assistant</h1>

              <p className="muted">
                Ask questions about your
                uploaded documents using
                document-aware AI.
              </p>

              <div className="card chat">

                <div className="messages">

                  {m.length === 0 && (
                    <div className="msg ai">
                      Hi! Ask me about your
                      uploaded documents.
                      I will retrieve relevant
                      information before
                      answering.
                    </div>
                  )}

                  {m.map((x, i) => (
                    <div
                      className={
                        "msg " +
                        (x.role === "user"
                          ? "user"
                          : "ai")
                      }
                      key={x.id || i}
                    >

                      {x.content}

                      {x.role === "assistant" && (
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(
                              x.content
                            )
                          }
                          style={{
                            display: "block",
                            marginTop: "8px",
                            fontSize: "12px",
                            opacity: 0.7,
                          }}
                        >
                          Copy
                        </button>
                      )}

                    </div>
                  ))}

                  {busy && (
                    <div className="msg ai">
                      Thinking...
                    </div>
                  )}

                </div>

                <div className="composer">

                  <input
                    className="input"
                    value={q}
                    onChange={(e) =>
                      setQ(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        send();
                      }
                    }}
                    placeholder="Ask about your documents..."
                  />

                  <button
                    className="btn primary"
                    onClick={send}
                    disabled={busy}
                  >
                    {busy ? "..." : "Send"}
                  </button>

                </div>

              </div>

            </div>

          </div>

        </section>
      </div>
    </main>
  );
}
