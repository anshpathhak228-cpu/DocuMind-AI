import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export async function GET() {
  try {
    const sb = await createServerSupabase();

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data, error } = await sb
      .from("chat_sessions")
      .select("id,title,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sessions: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to load chat history.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const sb = await createServerSupabase();

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const title =
      body?.title?.trim() || "New Chat";

    const { data, error } = await sb
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        title,
      })
      .select("id,title,created_at,updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      session: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to create chat.",
      },
      { status: 500 }
    );
  }
}
