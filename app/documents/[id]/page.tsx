import Link from "next/link";
import {createServerSupabase} from "@/lib/supabase-server";

export default async function DocumentPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const sb=await createServerSupabase();
  const {data:{user}}=await sb.auth.getUser();
  if(!user) return null;
  const {data:doc}=await sb.from("documents").select("id,file_name,file_type,file_size,extracted_text,summary,created_at").eq("id",id).eq("user_id",user.id).single();
  if(!doc) return <main className="auth"><div className="card"><h2>Document not found</h2><Link className="btn" href="/dashboard">Back</Link></div></main>;
  return <main><div className="container"><nav className="nav"><Link className="brand" href="/dashboard">Docu<span>Mind</span> AI</Link><Link className="btn" href="/dashboard">← Back</Link></nav>
    <section className="main"><div className="row"><div><h1>{doc.file_name}</h1><p className="muted">{doc.file_type} • {(doc.file_size/1024).toFixed(0)} KB</p></div>
      <form action={"/api/documents/"+doc.id+"/summary"} method="post"><button className="btn primary">Generate summary</button></form></div>
      <div className="grid2"><article className="card"><h2>AI Summary</h2><p className="reading">{doc.summary||"No summary yet. Generate one above."}</p></article><article className="card"><h2>Extracted text</h2><pre className="reading">{doc.extracted_text||"No text extracted."}</pre></article></div>
    </section>
  </div></main>
}