"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
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

type Attachment = {
  id: string;
  file: File;
  preview?: string;
  type: "file" | "image";
};

export default function Assistant() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [m, setM] = useState<Msg[]>([]);
  const [attachments, setAttachments] = useState<
    Attachment[]
  >([]);
  const [showAttach, setShowAttach] = useState(false);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const imageInputRef =
    useRef<HTMLInputElement>(null);

  async function loadSessions() {
    const r = await fetch(
      "/api/chat/sessions"
    );

    const j = await r.json();

    if (r.ok) {
      setSessions(j.sessions || []);

      if (
        j.sessions?.length &&
        !sessionId
      ) {
        await loadSession(
          j.sessions[0].id
        );
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
    removeAllAttachments();
  }

  async function createSession(
    title: string
  ) {
    const r = await fetch(
      "/api/chat/sessions",
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
        },
        body: JSON.stringify({
          title,
        }),
      }
    );

    const j = await r.json();

    if (!r.ok) {
      throw new Error(
        j.error ||
          "Failed to create chat."
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
    role:
      | "user"
      | "assistant",
    content: string
  ) {
    await fetch(
      `/api/chat/sessions/${id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
        },
        body: JSON.stringify({
          role,
          content,
        }),
      }
    );
  }

  function addFiles(
    files: FileList | null,
    type: "file" | "image"
  ) {
    if (!files) return;

    const selected = Array.from(files);

    const newAttachments =
      selected.map((file) => ({
        id: crypto.randomUUID(),
        file,
        type,
        preview:
          type === "image"
            ? URL.createObjectURL(file)
            : undefined,
      }));

    setAttachments((old) => [
      ...old,
      ...newAttachments,
    ]);

    setShowAttach(false);
  }

  function removeAttachment(
    id: string
  ) {
    setAttachments((old) => {
      const item = old.find(
        (x) => x.id === id
      );

      if (item?.preview) {
        URL.revokeObjectURL(
          item.preview
        );
      }

      return old.filter(
        (x) => x.id !== id
      );
    });
  }

  function removeAllAttachments() {
    attachments.forEach((item) => {
      if (item.preview) {
        URL.revokeObjectURL(
          item.preview
        );
      }
    });

    setAttachments([]);
  }

  function attachmentText() {
    if (!attachments.length) {
      return "";
    }

    return (
      "\n\nAttachments:\n" +
      attachments
        .map(
          (item) =>
            `• ${item.file.name}`
        )
        .join("\n")
    );
  }

  async function send() {
    if (
      (!q.trim() &&
        attachments.length === 0) ||
      busy
    ) {
      return;
    }

    const text =
      q.trim() ||
      "Please analyze the attached file.";

    const displayText =
      text + attachmentText();

    setQ("");
    setBusy(true);

    try {
      let activeSession = sessionId;

      if (!activeSession) {
        activeSession =
          await createSession(
            text.slice(0, 40)
          );
      }

      setM((old) => [
        ...old,
        {
          role: "user",
          content: displayText,
        },
      ]);

      await saveMessage(
        activeSession,
        "user",
        displayText
      );

      const r = await fetch(
        "/api/chat",
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            question: text,
            attachments:
              attachments.map(
                (item) => ({
                  name:
                    item.file.name,
                  type:
                    item.file.type,
                  size:
                    item.file.size,
                })
              ),
          }),
        }
      );

      const j = await r.json();

      const answer = r.ok
        ? j.answer
        : j.error ||
          "Something went wrong.";

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

      removeAllAttachments();

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
    await createClient()
      .auth.signOut();

    window.location.href = "/";
  }

  useEffect(() => {
    loadSessions();

    return () => {
      attachments.forEach(
        (item) => {
          if (item.preview) {
            URL.revokeObjectURL(
              item.preview
            );
          }
        }
      );
    };
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
                height:
                  "fit-content",
              }}
            >

              <button
                className="btn primary"
                onClick={newChat}
                style={{
                  width: "100%",
                  marginBottom:
                    "16px",
                }}
              >
                + New Chat
              </button>

              <h3
                style={{
                  marginBottom:
                    "12px",
                }}
              >
                Chat History
              </h3>

              {sessions.length ===
                0 && (
                <p className="muted">
                  No chats yet.
                </p>
              )}

              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    loadSession(
                      s.id
                    )
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign:
                      "left",
                    padding: "10px",
                    marginBottom:
                      "6px",
                    borderRadius:
                      "10px",
                    border:
                      "1px solid #24334d",
                    background:
                      sessionId ===
                      s.id
                        ? "#263b66"
                        : "transparent",
                    color: "white",
                    cursor:
                      "pointer",
                  }}
                >
                  {s.title}
                </button>
              ))}

            </aside>

            <div>

              <h1>
                AI Assistant
              </h1>

              <p className="muted">
                Ask questions about
                your uploaded
                documents using
                document-aware AI.
              </p>

              <div className="card chat">

                <div className="messages">

                  {m.length ===
                    0 && (
                    <div className="msg ai">
                      Hi! Ask me about
                      your uploaded
                      documents. You
                      can also attach
                      files or images.
                    </div>
                  )}

                  {m.map((x, i) => (
                    <div
                      className={
                        "msg " +
                        (x.role ===
                        "user"
                          ? "user"
                          : "ai")
                      }
                      key={
                        x.id || i
                      }
                    >

                      {x.content}

                      {x.role ===
                        "assistant" && (
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(
                              x.content
                            )
                          }
                          style={{
                            display:
                              "block",
                            marginTop:
                              "8px",
                            fontSize:
                              "12px",
                            opacity:
                              0.7,
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

                {attachments.length >
                  0 && (
                  <div
                    style={{
                      display:
                        "flex",
                      gap: "10px",
                      flexWrap:
                        "wrap",
                      padding:
                        "10px 0",
                    }}
                  >

                    {attachments.map(
                      (item) => (
                        <div
                          key={
                            item.id
                          }
                          style={{
                            position:
                              "relative",
                            border:
                              "1px solid #24334d",
                            borderRadius:
                              "12px",
                            padding:
                              "8px",
                            background:
                              "#091827",
                            minWidth:
                              "100px",
                          }}
                        >

                          {item.preview ? (
                            <img
                              src={
                                item.preview
                              }
                              alt={
                                item.file
                                  .name
                              }
                              style={{
                                width:
                                  "80px",
                                height:
                                  "70px",
                                objectFit:
                                  "cover",
                                borderRadius:
                                  "8px",
                                display:
                                  "block",
                                marginBottom:
                                  "5px",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                fontSize:
                                  "28px",
                                textAlign:
                                  "center",
                                padding:
                                  "10px",
                              }}
                            >
                              📄
                            </div>
                          )}

                          <div
                            style={{
                              fontSize:
                                "11px",
                              maxWidth:
                                "120px",
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {
                              item
                                .file
                                .name
                            }
                          </div>

                          <button
                            onClick={() =>
                              removeAttachment(
                                item.id
                              )
                            }
                            style={{
                              position:
                                "absolute",
                              top:
                                "-7px",
                              right:
                                "-7px",
                              width:
                                "22px",
                              height:
                                "22px",
                              borderRadius:
                                "50%",
                              border:
                                "1px solid #456",
                              background:
                                "#172b40",
                              color:
                                "white",
                              cursor:
                                "pointer",
                            }}
                          >
                            ×
                          </button>

                        </div>
                      )
                    )}

                  </div>
                )}

                <div
                  className="composer"
                  style={{
                    position:
                      "relative",
                  }}
                >

                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setShowAttach(
                        (v) => !v
                      )
                    }
                    disabled={busy}
                    style={{
                      flexShrink: 0,
                      fontSize:
                        "20px",
                      padding:
                        "8px 13px",
                    }}
                    title="Add attachment"
                  >
                    +
                  </button>

                  {showAttach && (
                    <div
                      style={{
                        position:
                          "absolute",
                        bottom:
                          "60px",
                        left: "0",
                        zIndex: 20,
                        background:
                          "#0d1b2a",
                        border:
                          "1px solid #24334d",
                        borderRadius:
                          "14px",
                        padding:
                          "8px",
                        minWidth:
                          "190px",
                        boxShadow:
                          "0 15px 40px rgba(0,0,0,.35)",
                      }}
                    >

                      <button
                        className="btn"
                        type="button"
                        onClick={() =>
                          fileInputRef.current?.click()
                        }
                        style={{
                          width:
                            "100%",
                          textAlign:
                            "left",
                          marginBottom:
                            "6px",
                        }}
                      >
                        📎 Add File
                      </button>

                      <button
                        className="btn"
                        type="button"
                        onClick={() =>
                          imageInputRef.current?.click()
                        }
                        style={{
                          width:
                            "100%",
                          textAlign:
                            "left",
                        }}
                      >
                        🖼️ Add Image
                      </button>

                    </div>
                  )}

                  <input
                    ref={
                      fileInputRef
                    }
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.ppt,.pptx"
                    style={{
                      display:
                        "none",
                    }}
                    onChange={(e) =>
                      addFiles(
                        e.target
                          .files,
                        "file"
                      )
                    }
                  />

                  <input
                    ref={
                      imageInputRef
                    }
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{
                      display:
                        "none",
                    }}
                    onChange={(e) =>
                      addFiles(
                        e.target
                          .files,
                        "image"
                      )
                    }
                  />

                  <input
                    className="input"
                    value={q}
                    onChange={(e) =>
                      setQ(
                        e.target.value
                      )
                    }
                    onKeyDown={(
                      e
                    ) => {
                      if (
                        e.key ===
                        "Enter"
                      ) {
                        send();
                      }
                    }}
                    placeholder="Ask about your documents..."
                    disabled={busy}
                    style={{
                      margin: 0,
                    }}
                  />

                  <button
                    className="btn primary"
                    onClick={send}
                    disabled={
                      busy ||
                      (!q.trim() &&
                        attachments.length ===
                          0)
                    }
                  >
                    {busy
                      ? "..."
                      : "Send"}
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
