 "use client";
import {useState} from "react";
import Link from "next/link";

type Msg={role:"user"|"assistant";content:string};

export default function Assistant(){
  const [q,setQ]=useState("");
  const [busy,setBusy]=useState(false);
  const [m,setM]=useState<Msg[]>([{role:"assistant",content:"Hi! Ask me about your uploaded documents. I will retrieve relevant chunks before answering."}]);

  async function send(){
    if(!q.trim()||busy) return;
    const text=q; setQ(""); setM(x=>[...x,{role:"user",content:text}]); setBusy(true);
    try{
      const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question:text})});
      const j=await r.json(); setM(x=>[...x,{role:"assistant",content:r.ok?j.answer:(j.error||"Something went wrong.")}]);
    }catch{setM(x=>[...x,{role:"assistant",content:"Network error. Please try again."}])}
    finally{setBusy(false)}
  }

  return <main><div className="container"><nav className="nav"><Link className="brand" href="/dashboard">Docu<span>Mind</span> AI</Link><div className="links"><Link href="/dashboard">Dashboard</Link><Link href="/upload">Upload</Link></div></nav>
    <section className="main"><h1>AI Assistant</h1><p className="muted">Document-aware RAG chat.</p>
      <div className="card chat"><div className="messages">{m.map((x,i)=><div className={"msg "+(x.role==="user"?"user":"ai")} key={i}>{x.content}</div>)}</div>
        <div className="composer"><input className="input" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask about your documents…"/><button className="btn primary" onClick={send} disabled={busy}>{busy?"…":"Send"}</button></div>
      </div>
    </section>
  </div></main>
}