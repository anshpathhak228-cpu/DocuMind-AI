 "use client";
import {useState} from "react";
import Link from "next/link";

export default function Upload(){
  const [file,setFile]=useState<File|null>(null);
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);

  async function up(){
    if(!file) return; setBusy(true); setMsg("");
    try{
      const fd=new FormData(); fd.append("file",file);
      const r=await fetch("/api/upload",{method:"POST",body:fd});
      const j=await r.json(); if(!r.ok) throw new Error(j.error);
      setMsg("Upload complete. Text extracted and RAG chunks created."); setFile(null);
    }catch(e){setMsg(e instanceof Error?e.message:"Upload failed")}
    finally{setBusy(false)}
  }

  return <main><div className="container">
    <nav className="nav"><Link className="brand" href="/dashboard">Docu<span>Mind</span> AI</Link><div className="links"><Link href="/dashboard">Dashboard</Link><Link href="/assistant">AI Assistant</Link></div></nav>
    <section className="main"><h1>Upload & index</h1><p className="muted">PDF, DOCX, TXT, CSV, XLSX and PPTX are extracted, chunked and embedded.</p>
      <div className="drop"><h2>☁️ Choose a document</h2>
        <input type="file" accept=".pdf,.docx,.txt,.csv,.xlsx,.pptx" onChange={e=>setFile(e.target.files?.[0]??null)}/>
        <p>{file?.name??"No file selected"}</p>
        <button className="btn primary" disabled={!file||busy} onClick={up}>{busy?"Processing…":"Upload securely"}</button>
        {msg&&<p>{msg}</p>}
      </div>
    </section>
  </div></main>
}