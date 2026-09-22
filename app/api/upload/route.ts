import {NextResponse} from "next/server";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import OpenAI from "openai";
import {createServerSupabase} from "@/lib/supabase-server";

export const runtime="nodejs";

function clean(s:string){return s.replace(/\u0000/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim()}
function makeChunks(text:string){const out:string[]=[];const size=1400,overlap=180;for(let i=0;i<text.length;i+=size-overlap){const c=text.slice(i,i+size).trim();if(c)out.push(c);if(i+size>=text.length)break}return out}

async function extract(file:File,buf:ArrayBuffer){
  const ext=file.name.toLowerCase().split(".").pop()||"";
  if(ext==="txt"||ext==="csv") return clean(new TextDecoder().decode(buf));
  if(ext==="pdf"){const mod:any=await import("pdf-parse");const parse=mod.default||mod;const r=await parse(Buffer.from(buf));return clean(r.text)}
  if(ext==="docx"){const r=await mammoth.extractRawText({buffer:Buffer.from(buf)});return clean(r.value)}
  if(ext==="xlsx"){const wb=XLSX.read(Buffer.from(buf),{type:"buffer"});return clean(wb.SheetNames.map(s=>"## "+s+"\n"+XLSX.utils.sheet_to_csv(wb.Sheets[s])).join("\n\n"))}
  if(ext==="pptx"){
    const zip=await JSZip.loadAsync(buf);const out:string[]=[];
    for(const [p,e] of Object.entries(zip.files)){if(/^ppt\/slides\/slide\d+\.xml$/.test(p)){const xml=await (e as any).async("text");out.push(xml.replace(/<a:t>/g," ").replace(/<\/a:t>/g," ").replace(/<[^>]+>/g," "))}}
    return clean(out.join("\n"));
  }
  throw new Error("Unsupported file type.");
}

export async function POST(req:Request){
  try{
    const sb=await createServerSupabase();const {data:{user}}=await sb.auth.getUser();
    if(!user) return NextResponse.json({error:"Please login first."},{status:401});
    const fd=await req.formData();const file=fd.get("file");
    if(!(file instanceof File)) return NextResponse.json({error:"File is required."},{status:400});
    if(file.size>15*1024*1024) return NextResponse.json({error:"Maximum file size is 15 MB."},{status:400});
    const allowed=["pdf","docx","txt","csv","xlsx","pptx"];const ext=file.name.toLowerCase().split(".").pop()||"";
    if(!allowed.includes(ext)) return NextResponse.json({error:"Unsupported file type."},{status:400});
    const buf=await file.arrayBuffer();const text=await extract(file,buf);if(!text) return NextResponse.json({error:"No readable text found."},{status:400});
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=user.id+"/"+crypto.randomUUID()+"-"+safe;
    const up=await sb.storage.from("documents").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});if(up.error) throw up.error;
    const {data:doc,error:de}=await sb.from("documents").insert({user_id:user.id,file_name:file.name,file_type:file.type||ext,file_size:file.size,storage_path:path,extracted_text:text}).select("id").single();
    if(de) throw de;
    const chunks=makeChunks(text);
    if(process.env.OPENAI_API_KEY){
      const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
      for(let i=0;i<chunks.length;i+=50){
        const batch=chunks.slice(i,i+50);
        const emb=await ai.embeddings.create({model:process.env.OPENAI_EMBEDDING_MODEL||"text-embedding-3-small",input:batch});
        const rows=batch.map((content,j)=>({document_id:doc.id,user_id:user.id,chunk_index:i+j,content,embedding:emb.data[j].embedding}));
        const {error}=await sb.from("document_chunks").insert(rows);if(error) throw error;
      }
    }
    return NextResponse.json({ok:true,document_id:doc.id,chunks:chunks.length});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Upload failed"},{status:500})}
}