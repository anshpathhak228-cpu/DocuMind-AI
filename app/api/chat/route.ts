import {NextResponse} from "next/server";
import OpenAI from "openai";
import {createServerSupabase} from "@/lib/supabase-server";

export async function POST(req:Request){
  try{
    const {question}=await req.json();
    if(!question?.trim()) return NextResponse.json({error:"Question is required."},{status:400});
    const sb=await createServerSupabase(); const {data:{user}}=await sb.auth.getUser();
    if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
    if(!process.env.OPENAI_API_KEY) return NextResponse.json({error:"OPENAI_API_KEY is not configured."},{status:500});
    const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const e=await ai.embeddings.create({model:process.env.OPENAI_EMBEDDING_MODEL||"text-embedding-3-small",input:question});
    const {data:chunks,error}=await sb.rpc("match_document_chunks",{query_embedding:e.data[0].embedding,match_threshold:0.25,match_count:8});
    if(error) throw error;
    const context=(chunks||[]).map((c:any,i:number)=>"["+String(i+1)+"] "+c.file_name+"\n"+c.content).join("\n\n");
    const response=await ai.responses.create({model:process.env.OPENAI_CHAT_MODEL||"gpt-5.6-luna",input:[
      {role:"system",content:"You are DocuMind AI. Answer only from the supplied document context. If the answer is not present, say you cannot find it in the uploaded documents. Cite source numbers like [1] and [2]."},
      {role:"user",content:"Question: "+question+"\n\nDocument context:\n"+(context||"No matching context.")}
    ]});
    return NextResponse.json({answer:response.output_text,sources:(chunks||[]).map((c:any)=>c.file_name)});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"AI request failed"},{status:500})}
}