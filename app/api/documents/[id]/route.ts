import {NextResponse} from "next/server";
import {createServerSupabase} from "@/lib/supabase-server";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const body=await req.json(); const sb=await createServerSupabase();
  const {data:{user}}=await sb.auth.getUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const patch:any={}; if(typeof body.is_favorite==="boolean") patch.is_favorite=body.is_favorite; if(typeof body.file_name==="string") patch.file_name=body.file_name.trim();
  const {data,error}=await sb.from("documents").update(patch).eq("id",id).eq("user_id",user.id).select().single();
  if(error) return NextResponse.json({error:error.message},{status:400}); return NextResponse.json({document:data});
}

export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const sb=await createServerSupabase(); const {data:{user}}=await sb.auth.getUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:doc}=await sb.from("documents").select("storage_path").eq("id",id).eq("user_id",user.id).single();
  if(!doc) return NextResponse.json({error:"Not found"},{status:404});
  await sb.storage.from("documents").remove([doc.storage_path]);
  const {error}=await sb.from("documents").delete().eq("id",id).eq("user_id",user.id);
  if(error) return NextResponse.json({error:error.message},{status:400}); return NextResponse.json({ok:true});
}