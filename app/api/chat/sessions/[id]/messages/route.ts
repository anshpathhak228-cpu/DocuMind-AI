import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sb = await createServerSupabase();

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await sb
      .from("chat_messages")
      .select("id,role,content,created_at")
      .eq("session_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ messages: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load messages." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const sb = await createServerSupabase();

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!body?.role || !body?.content?.trim()) {
      return NextResponse.json(
        { error: "Role and content are required." },
        { status: 400 }
      );
    }

    if (!["user", "assistant"].includes(body.role)) {
      return NextResponse.json(
        { error: "Invalid message role." },
        { status: 400 }
      );
    }

    const { data: session } = await sb
      .from("chat_sessions")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: "Chat session not found." },
        { status: 404 }
      );
    }

    const { data, error } = await sb
      .from("chat_messages")
      .insert({
        session_id: id,
        user_id: user.id,
        role: body.role,
        content: body.content.trim(),
      })
      .select("id,role,content,created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await sb
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ message: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save message." },
      { status: 500 }
    );
  }
}
