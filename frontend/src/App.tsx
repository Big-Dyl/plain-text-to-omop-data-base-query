import { useState, useRef, useEffect } from "react";
import "./App.css";

interface PendingSQL {
  sql: string;
  originalQuery: string;
}

interface Message {
  id: number;
  role: "user" | "assistant" | "error" | "rejected";
  text: string;
  query?: string;
  timestamp: Date;
}

const ANTHROPIC_MODELS = [
  { value: "claude-opus-4-7",           label: "Claude Opus 4.7" },
  { value: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
] as const;

const DEFAULT_MODEL = ANTHROPIC_MODELS[1].value;

export default function App() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingSQL | null>(null);
  const [executing, setExecuting] = useState(false);
  const [dbHost, setDbHost] = useState("");
  const [dbDatabase, setDbDatabase] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  // Stage 1: generate SQL only
  const handleSubmit = async () => {
    const trimmed = query.trim();
    if (!trimmed || loading || pending) return;

    setMessages((prev) => [...prev, {
      id: Date.now(),
      role: "user",
      text: trimmed,
      timestamp: new Date(),
    }]);
    setQuery("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, model: selectedModel }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);

      setPending({ sql: data.sql_msg, originalQuery: trimmed });
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        id: Date.now() + 1,
        role: "error",
        text: `Generation failed: ${err.message}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Stage 2a: user approves → execute
  const handleApprove = async () => {
    if (!pending) return;
    setExecuting(true);

    try {
      const res = await fetch("http://localhost:3001/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql_msg: pending.sql,
          host: dbHost,
          database: dbDatabase,
          username: dbUser,
          password: dbPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);

      setMessages((prev) => [...prev, {
        id: Date.now(),
        role: "assistant",
        query: data.sql_msg,
        text: data.response ?? JSON.stringify(data, null, 2),
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        id: Date.now(),
        role: "error",
        query: pending.sql,
        text: `Execution failed: ${err.message}`,
        timestamp: new Date(),
      }]);
    } finally {
      setPending(null);
      setExecuting(false);
      inputRef.current?.focus();
    }
  };

  // Stage 2b: user rejects → discard
  const handleReject = () => {
    if (!pending) return;
    setMessages((prev) => [...prev, {
      id: Date.now(),
      role: "rejected",
      query: pending.sql,
      text: "Query rejected — not executed.",
      timestamp: new Date(),
    }]);
    setPending(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const selectedModelLabel =
    ANTHROPIC_MODELS.find((m) => m.value === selectedModel)?.label ?? selectedModel;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-bracket">[</span>
            <span className="logo-text">TEXT TO OMOP QUERY</span>
            <span className="logo-bracket">]</span>
          </div>
          <div className="header-right">
            <span className={`status-dot ${loading || executing ? "pulsing" : "idle"}`} />
            <button
              className={`config-toggle ${configOpen ? "config-toggle--open" : ""}`}
              onClick={() => setConfigOpen((o) => !o)}
              aria-label="Toggle connection settings"
            >
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              config
            </button>
          </div>
        </div>

        {configOpen && (
          <div className="config-panel">
            <div className="config-divider"><span>model</span></div>
            <div className="config-row">
              <label className="config-label" htmlFor="model-select">model</label>
              <div className="select-wrap">
                <select
                  id="model-select"
                  className="config-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {ANTHROPIC_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <svg className="select-chevron" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            <div className="config-divider"><span>connection</span></div>
            <div className="config-row">
              <label className="config-label">host</label>
              <input className="config-input" type="text" value={dbHost}
                onChange={(e) => setDbHost(e.target.value)} spellCheck={false}
                placeholder="your-server.database.windows.net" />
            </div>
            <div className="config-row">
              <label className="config-label">database</label>
              <input className="config-input" type="text" value={dbDatabase}
                onChange={(e) => setDbDatabase(e.target.value)} spellCheck={false}
                placeholder="mydb" />
            </div>
            <div className="config-divider"><span>database credentials</span></div>
            <div className="config-row">
              <label className="config-label">username</label>
              <input className="config-input" type="text" value={dbUser}
                onChange={(e) => setDbUser(e.target.value)} spellCheck={false}
                placeholder="db_user" autoComplete="username" />
            </div>
            <div className="config-row">
              <label className="config-label">password</label>
              <div className="password-wrap">
                <input className="config-input" type={showPassword ? "text" : "password"}
                  value={dbPassword} onChange={(e) => setDbPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password" />
                <button className="show-pw-btn" onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"} tabIndex={-1}>
                  {showPassword ? (
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M4.2 4.3C2.8 5.3 1.7 6.5 1 8c1.3 2.8 4 5 7 5 1.2 0 2.4-.3 3.4-.9M6.5 3.1C7 3 7.5 3 8 3c3 0 5.7 2.2 7 5-.4.9-1 1.8-1.8 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 8c1.3-2.8 4-5 7-5s5.7 2.2 7 5c-1.3 2.8-4 5-7 5s-5.7-2.2-7-5z" stroke="currentColor" strokeWidth="1.3"/>
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <p className="config-note">
              Requests go to <code>localhost:3001</code> · Using <code>{selectedModelLabel}</code>.
            </p>
          </div>
        )}
      </header>

      {/* Messages */}
      <main className="messages-area">
        {messages.length === 0 && !pending && (
          <div className="empty-state">
            <div className="empty-grid" aria-hidden>
              {Array.from({ length: 64 }).map((_, i) => (
                <span key={i} className="grid-cell" />
              ))}
            </div>
            <p className="empty-hint">Send a query to your server below.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message message--${msg.role}`}>
            <div className="message-meta">
              <span className="message-role">
                {msg.role === "user" ? "YOU"
                  : msg.role === "error" ? "ERR"
                  : msg.role === "rejected" ? "REJ"
                  : "SRV"}
              </span>
              <span className="message-time">{fmt(msg.timestamp)}</span>
            </div>
            {msg.query && (
              <div className="message-query">
                <span className="message-query-label">sql</span>
                <pre className="message-query-text">{msg.query}</pre>
              </div>
            )}
            <pre className="message-text">{msg.text}</pre>
          </div>
        ))}

        {loading && (
          <div className="message message--assistant loading-msg">
            <div className="message-meta"><span className="message-role">GEN</span></div>
            <div className="loader-dots"><span /><span /><span /></div>
          </div>
        )}

        {/* Pending approval card */}
        {pending && (
          <div className="message message--pending">
            <div className="message-meta">
              <span className="message-role pending-role">SQL</span>
              <span className="message-time">awaiting approval</span>
            </div>
            <div className="message-query">
              <span className="message-query-label">generated</span>
              <pre className="message-query-text">{pending.sql}</pre>
            </div>
            <p className="pending-prompt">Run this query against the database?</p>
            <div className="pending-actions">
              <button
                className="action-btn action-btn--approve"
                onClick={handleApprove}
                disabled={executing}
              >
                {executing ? <span className="spinner spinner--dark" /> : (
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {executing ? "executing…" : "approve & run"}
              </button>
              <button
                className="action-btn action-btn--reject"
                onClick={handleReject}
                disabled={executing}
              >
                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                reject
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="input-area">
        <div className="input-row">
          <textarea
            ref={inputRef}
            className="query-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pending ? "Approve or reject the query above first…" : "Type a query… (Enter to send, Shift+Enter for newline)"}
            rows={1}
            disabled={loading || !!pending}
          />
          <button
            className={`send-btn ${loading ? "send-btn--busy" : ""}`}
            onClick={handleSubmit}
            disabled={loading || !!pending || !query.trim()}
            aria-label="Send query"
          >
            {loading ? <span className="spinner" /> : (
              <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 10L17 3L10 17L9 11L3 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
        <p className="input-hint">
          {pending
            ? <span className="hint-warning">⚠ approve or reject the generated SQL before continuing</span>
            : <>POST → <code>localhost:3001/generate</code> · model: <code>{selectedModelLabel}</code></>
          }
        </p>
      </footer>
    </div>
  );
}