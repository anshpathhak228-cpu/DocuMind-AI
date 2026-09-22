 "use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {createClient} from "@/lib/supabase";

type Doc={id:string;file_name:string;file_type:string;file_size:number;summary:string|null;is_favorite:boolean;created_at:string};

export default function Dashboard(){
  const [docs,setDocs]=useState<Doc[]>([]);
  const [q,setQ]=useState("");
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");

  async function load(){
    setLoading(true);
    try{
      const r=await fetch("/api/documents"); const j=await r.json();
      if(!r.ok) throw new Error(j.error); setDocs(j.documents||[]);
    }catch(e){setErr(e instanceof Error?e.message:"Unable to load documents")}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  async function logout(){await createClient().auth.signOut();window.location.href="/"}
  async function del(id:string){
    if(!confirm("Delete this document?")) return;
    await fetch("/api/documents/"+id,{method:"DELETE"}); load();
  }
  async function fav(d:Doc){
    await fetch("/api/documents/"+d.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({is_favorite:!d.is_favorite})});
    load();
  }
  const filtered=useMemo(()=>docs.filter(d=>d.file_name.toLowerCase().includes(q.toLowerCase())),[docs,q]);

  return <main><div className="container">
    <nav className="nav">
      <Link className="brand" href="/dashboard">Docu<span>Mind</span> AI</Link>
      <div className="links"><Link href="/dashboard">Dashboard</Link><Link href="/upload">Upload</Link><Link href="/assistant">AI Assistant</Link></div>
      <button className="btn" onClick={logout}>Logout</button>
    </nav>
    <section className="main">
      <div className="row"><div><h1>Your workspace</h1><p className="muted">Documents, summaries and AI in one place.</p></div><Link className="btn primary" href="/upload">+ Upload</Link></div>
      <div className="stats">
        <div className="card"><span className="muted">Documents</span><strong>{docs.length}</strong></div>
        <div className="card"><span className="muted">Storage</span><strong>{(docs.reduce((a,d)=>a+d.file_size,0)/1048576).toFixed(1)} MB</strong></div>
        <div className="card"><span className="muted">Favorites</span><strong>{docs.filter(d=>d.is_favorite).length}</strong></div>
        <div className="card"><span className="muted">Summaries</span><strong>{docs.filter(d=>d.summary).length}</strong></div>
      </div>
      <div className="card">
        <div className="row"><h2>My documents</h2><input className="input search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search files…"/></div>
        {err&&<p className="error">{err}</p>}
        {loading?<p className="muted">Loading…</p>:filtered.length===0?<p className="muted">No documents yet. Upload your first file.</p>:
        <div className="doclist">{filtered.map(d=><div className="doc" key={d.id}>
          <div><b>{d.file_name}</b><small>{d.file_type} • {(d.file_size/1024).toFixed(0)} KB</small>{d.summary&&<p>{d.summary.slice(0,180)}{d.summary.length>180?"…":""}</p>}</div>
          <div className="docactions"><button className="btn" onClick={()=>fav(d)}>{d.is_favorite?"★":"☆"}</button><Link className="btn" href={"/documents/"+d.id}>Open</Link><button className="btn danger" onClick={()=>del(d.id)}>Delete</button></div>
        </div>)}</div>}
      </div>
    </section>
  </div></main>
}