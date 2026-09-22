import {NextResponse} from "next/server";
import OpenAI from "openai";
import {createServerSupabase} from "@/lib/supabase-server";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const sb=await createServerSupabase(); const {data:{user}}=await sb.auth.getUser();
  if(!user) return NextResponse.redirect(new URL("/login",req.url));
  const {data:doc}=await sb.from("documents").select("file_name,extracted_text").eq("id",id).eq("user_id",user.id).single();
  if(!doc) return NextResponse.json({error:"Not found"},{status:404});
  if(!process.env.OPENAI_API_KEY) return NextResponse.json({error:"OPENAI_API_KEY is not configured."},{status:500});
  const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const response=await ai.responses.create({model:process.env.OPENAI_CHAT_MODEL||"gpt-5.6-luna",input:[
    {role:"system",content:"Summarize the document faithfully. Use headings: Overview, Key Points, Action Items. Never invent facts."},
    {role:"user",content:"File: "+doc.file_name+"\n\n"+(doc.extracted_text||"").slice(0,60000)}
  ]});
  await sb.from("documents").update({summary:response.output_text}).eq("id",id).eq("user_id",user.id);
  return NextResponse.redirect(new URL("/documents/"+id,req.url));
}