import Link from "next/link";

const features = [
  ["🔐", "Secure Storage", "Private user-isolated document storage."],
  ["✨", "AI Summaries", "Generate faithful document summaries."],
  ["💬", "AI Assistant", "Ask questions using document-grounded RAG."],
  ["🔎", "Smart Search", "Search your uploaded files quickly."],
  ["📁", "Folders", "Organize documents for your workspace."],
  ["⚡", "Modern UI", "Responsive SaaS-style interface."],
];

export default function Home() {
  return (
    <main>
      <div className="container">
        <nav className="nav">
          <div className="brand">
            Doc<span>AI</span>
          </div>

          <div className="links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <Link href="/login">Login</Link>
          </div>

          <Link className="btn primary" href="/login">
            Get Started
          </Link>
        </nav>

        <section className="hero">
          <div className="badge">
            AI Document Workspace
          </div>

          <h1>
            Store your documents.
            <br />
            <span className="grad">
              Understand them with AI.
            </span>
          </h1>

          <p className="muted">
            Secure storage, extraction, summaries,
            semantic search and document-aware AI
            in one workspace.
          </p>

          <div className="actions">
            <Link className="btn primary" href="/login">
              Open Workspace →
            </Link>

            <a className="btn" href="#features">
              Explore Features
            </a>
          </div>
        </section>

        <section id="features" className="section">
          <h2>Everything in one workspace</h2>

          <div className="grid">
            {features.map((x) => (
              <div className="card" key={x[1]}>
                <div style={{ fontSize: 26 }}>
                  {x[0]}
                </div>

                <h3>{x[1]}</h3>

                <p>{x[2]}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="section">
          <h2>How it works</h2>

          <div className="grid">
            <div className="card">
              <h3>01. Sign in</h3>
              <p>Email OTP authentication.</p>
            </div>

            <div className="card">
              <h3>02. Upload</h3>
              <p>
                Extract text, create chunks and
                embeddings.
              </p>
            </div>

            <div className="card">
              <h3>03. Ask AI</h3>
              <p>
                Retrieve relevant chunks and
                generate grounded answers.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
