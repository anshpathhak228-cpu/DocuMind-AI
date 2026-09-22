import {NextResponse} from "next/server";
import {createServerSupabase} from "@/lib/supabase-server";

export async function GET(){
  const sb=await createServerSupabase();
  const {data:{user}}=await sb.auth.getUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data,error}=await sb.from("documents").select("id,file_name,file_type,file_size,summary,is_favorite,created_at").eq("user_id",user.id).order("created_at",{ascending:false});
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({documents:data||[]});
}