"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");

    try {
      const { error } = await createClient().auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      setSent(true);
    } catch (x) {
      setErr(
        x instanceof Error
          ? x.message
          : "Unable to send OTP"
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");

    try {
      const { error } =
        await createClient().auth.verifyOtp({
          email,
          token: otp,
          type: "email",
        });

      if (error) throw error;

      window.location.href = "/dashboard";
    } catch (x) {
      setErr(
        x instanceof Error
          ? x.message
          : "Invalid OTP"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="authbox">

        <div className="loginbrand">
          <Link
            className="brand"
            href="/"
          >
            Doc<span>AI</span>
          </Link>

          <Link
            href="/"
            className="muted"
          >
            Home
          </Link>
        </div>

        <h1>
          {sent
            ? "Verify OTP"
            : "Welcome to DocAI"}
        </h1>

        <p className="muted">
          {sent
            ? "Enter the 6-digit code sent to your email."
            : "Secure sign-in with email OTP."}
        </p>

        {err && (
          <p className="error">
            {err}
          </p>
        )}

        {!sent ? (
          <form
            className="stack"
            onSubmit={send}
          >
            <label>Email</label>

            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="you@example.com"
            />

            <button
              className="btn primary"
              disabled={busy}
            >
              {busy
                ? "Sending..."
                : "Send OTP"}
            </button>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={verify}
          >
            <label>OTP</label>

            <input
              className="input"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={otp}
              onChange={(e) =>
                setOtp(
                  e.target.value.replace(
                    /\D/g,
                    ""
                  )
                )
              }
              placeholder="123456"
            />

            <button
              className="btn primary"
              disabled={busy}
            >
              {busy
                ? "Verifying..."
                : "Verify & Continue"}
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => {
                setSent(false);
                setOtp("");
              }}
            >
              Use another email
            </button>
          </form>
        )}

      </div>
    </main>
  );
}
