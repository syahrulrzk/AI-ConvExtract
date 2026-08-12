import React, { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Download,
  Key,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  FileText,
  Zap,
  Clock,
  Copy,
  Check,
  Sparkles,
  Bot,
  User,
  Image as ImageIcon,
  Paperclip,
  Code2,
  MessageSquare,
  ArrowRight,
  MessageSquareDashed,
  BookOpen,
  ExternalLink,
  Tag
} from 'lucide-react';
import './index.css';

// ── Format duration for humans: 45s, 2m 8s, 1h 12m ───────────────
function formatDuration(ms) {
  if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return '—';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

// ── Detect platform from URL ──────────────────────────────────────
function detectPlatformFromUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes('chatgpt.com') || h.includes('openai.com')) return 'chatgpt';
    if (h.includes('claude.ai') || h === 'share.claude.ai') return 'claude';
    if (h.includes('gemini.google.com') || h === 'share.gemini.google' || h.endsWith('.gemini.google')) return 'gemini';
    return null;
  } catch {
    return null;
  }
}

const PLATFORM_LABELS = {
  chatgpt: 'ChatGPT',
  claude:  'Claude',
  gemini:  'Gemini',
};

// ── Stat Box Component ────────────────────────────────────────────
function StatBox({ value, label, icon: Icon, colorClass = '' }) {
  return (
    <div className={`stat-box ${colorClass}`}>
      <div className="stat-icon-wrapper">
        <Icon size={16} />
      </div>
      <div className="stat-info">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

// ── Result Display Component (Right Side) ──────────────────────────
function ResultView({ data }) {
  const [view, setView] = useState('visual');
  const [copied, setCopied] = useState(false);
  const messages = data.messages || [];

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(jsonStr).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(err => console.error('Clipboard API failed', err));
    } else {
      // Fallback for non-HTTPS mobile access
      const textArea = document.createElement('textarea');
      textArea.value = jsonStr;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const platformClass = data.platform || 'chatgpt';

  return (
    <div className="result-container">
      <div className="success-strip">
        <CheckCircle2 size={16} />
        Ekstraksi Berhasil! Ditemukan {data.totalMessages ?? messages.length} pesan.
      </div>

      {data.truncated && (
        <div className="truncate-warning">
          <AlertCircle size={16} />
          <span>
            <strong>Ekstraksi mungkin tidak lengkap.</strong> Percakapan ini sangat panjang dan melewati batas waktu
            ekstraksi. Sebagian pesan terakhir mungkin tidak terambil — coba extract ulang.
          </span>
        </div>
      )}

      <div className="card result-card">
        <div className="card-body">
          {/* Result Header */}
          <div className="result-header">
            <div className="result-title-group">
              <span className={`platform-badge badge-${platformClass}`}>
                {PLATFORM_LABELS[data.platform] || data.platform || 'AI'}
              </span>
              <h2 className="result-title">{data.title || 'Untitled Conversation'}</h2>
            </div>
            <button className="copy-json-btn" onClick={handleCopyJson} title="Copy Raw JSON">
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
            </button>
          </div>

          {/* Stats Grid */}
          <div className="stats-grid">
            <StatBox value={data.totalMessages ?? messages.length} label="Messages" icon={MessageSquare} colorClass="stat-blue" />
            <StatBox value={data.wordCount ?? '—'} label="Words" icon={FileText} colorClass="stat-indigo" />
            <StatBox value={data.promptCount ?? '—'} label="Prompts" icon={Zap} colorClass="stat-amber" />
            <StatBox value={data.processingTimeLabel || formatDuration(data.processingTime)} label="Time" icon={Clock} colorClass="stat-emerald" />
          </div>

          {/* View Tabs */}
          <div className="result-controls">
            <div className="result-tabs">
              <button
                className={`result-tab ${view === 'visual' ? 'active' : ''}`}
                onClick={() => setView('visual')}
              >
                <Sparkles size={14} />
                Chat Preview
              </button>
              <button
                className={`result-tab ${view === 'json' ? 'active' : ''}`}
                onClick={() => setView('json')}
              >
                <Code2 size={14} />
                Raw JSON
              </button>
            </div>
          </div>

          {/* Content View */}
          {view === 'visual' ? (
            messages.length > 0 ? (
              <div className="messages-preview">
                {messages.map((msg, i) => {
                  const hasAttachments = Array.isArray(msg.attachments) && msg.attachments.length > 0;
                  return (
                    <div key={i} className={`message-bubble ${msg.role}${hasAttachments ? ' has-attachment' : ''}`}>
                      <div className="message-header">
                        <div className="avatar">
                          {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                        </div>
                        <span className="message-role-name">
                          {msg.role === 'user' ? 'User Prompt' : (PLATFORM_LABELS[data.platform] || 'AI Assistant')}
                        </span>
                      </div>
                      {hasAttachments && (
                        <div className="attachment-badge">
                          {msg.attachments.includes('image') ? <ImageIcon size={13} /> : <Paperclip size={13} />}
                          {msg.content}
                        </div>
                      )}
                      {!hasAttachments && <div className="message-body">{msg.content}</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <AlertCircle size={36} />
                <p className="empty-title">No messages extracted</p>
                <p className="empty-sub">
                  The target conversation structure couldn't be parsed.
                </p>
              </div>
            )
          ) : (
            <div className="json-container">
              <pre className="json-viewer">{JSON.stringify(data, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hero Version Badge ───────────────────────────────────────────
function HeroBadge({ version }) {
  return (
    <div className="hero-badge" title="Engine version (set via APP_VERSION env)">
      <Sparkles size={13} />
      <span className="hero-badge-name">ConvExtract Engine</span>
      <span className="hero-badge-version">{version}</span>
    </div>
  );
}

// ── Main App Component ───────────────────────────────────────────
export default function App() {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('ai-converter-secret-key-123');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // 'queued' | 'running' | 'done' | 'failed'
  const [appVersion, setAppVersion] = useState('V.0.1');
  const pollTimerRef = useRef(null);
  const activeJobRef = useRef(null); // guards against overlapping poll chains

  const detectedPlatform = detectPlatformFromUrl(url);

  // Cleanup polling on unmount — avoids setState after unmount
  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  // Fetch app version from the backend (served from APP_VERSION env)
  useEffect(() => {
    let cancelled = false;
    fetch('/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.version) setAppVersion(data.version);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    activeJobRef.current = null;
  };

  const pollJob = async (jobId, apiKeyValue) => {
    const res = await fetch(`/api/v1/extract/jobs/${jobId}`, {
      headers: { 'x-api-key': apiKeyValue },
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error?.message || 'Failed to check job status');
    }

    // If a newer submission started, ignore stale responses
    if (activeJobRef.current !== jobId) return;
    setJobStatus(data.status);

    if (data.status === 'done') {
      setResult(data.result);
      setLoading(false);
      activeJobRef.current = null;
      return;
    }
    if (data.status === 'failed') {
      throw new Error(data.error?.message || 'Extraction failed');
    }

    // Still queued/running — poll again in 2s
    pollTimerRef.current = setTimeout(() => {
      pollJob(jobId, apiKeyValue).catch((err) => {
        if (activeJobRef.current !== jobId) return;
        setError(err.message);
        setLoading(false);
        activeJobRef.current = null;
      });
    }, 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    stopPolling(); // cancel any stale poll chain first
    setLoading(true);
    setError(null);
    setResult(null);
    setJobStatus('queued');

    try {
      const res = await fetch('/api/v1/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Extraction failed');
      }
      activeJobRef.current = data.jobId;
      await pollJob(data.jobId, apiKey);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      activeJobRef.current = null;
    }
  };

  const hasResult = Boolean(result);

  return (
    <div className="app-wrapper">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="navbar">
        <div className="navbar-container">
          <a className="navbar-brand" href="/">
            <div className="brand-icon">
              <Sparkles size={18} />
            </div>
            <span className="brand-name">Conv<span>Extract</span></span>
          </a>
          <div className="navbar-center">
            <span className="support-badge badge-chatgpt">ChatGPT</span>
            <span className="support-badge badge-claude">Claude</span>
            <span className="support-badge badge-gemini">Gemini</span>
          </div>
          <div className="navbar-actions">
            <a
              id="nav-api-docs"
              className="nav-docs-btn"
              href="/docs"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen size={14} />
              <span>API Docs</span>
              <ExternalLink size={11} className="nav-docs-ext" />
            </a>
          </div>
        </div>
      </nav>

      {/* ── Page Container ───────────────────────────────────── */}
      <div className="main-layout-container">

        {/* Hero centered above grid — only shown BEFORE extraction */}
        {!hasResult && (
          <div className="hero-centered-wrapper">
            <HeroBadge version={appVersion} />
            <h1>
              AI Conversation <span className="accent">Extractor</span>
            </h1>
            <p>Extract, parse, and analyze shared AI conversations into clean structured JSON format.</p>
          </div>
        )}

        {/* 2-Column Main Content Grid */}
        <main className={`page-content-grid ${hasResult ? 'with-result' : 'no-result'}`}>

          {/* LEFT COLUMN: Fixed side (Header only shown here AFTER extraction) */}
          <section className="column-left">
            <div className="sticky-left-side">

              {/* Header: only shown in left column AFTER extraction */}
              {hasResult && (
                <header className="page-hero hero-left">
                  <HeroBadge version={appVersion} />
                  <h1>
                    AI Conversation <span className="accent">Extractor</span>
                  </h1>
                  <p>Extract, parse, and analyze shared AI conversations into clean structured JSON format.</p>
                </header>
              )}

              {/* Form Box inside Left Column */}
              <div className="card form-card">
                <div className="card-body">
                  <form onSubmit={handleSubmit}>
                    {/* API Key */}
                    <div className="form-group">
                      <label htmlFor="api-key">
                        <Key size={14} className="label-icon" />
                        API Key Secret
                      </label>
                      <input
                        id="api-key"
                        type="password"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="Enter your secret API key"
                        required
                      />
                    </div>

                    <div className="form-divider" />

                    {/* URL Input */}
                    <div className="form-group">
                      <label htmlFor="share-url">
                        <LinkIcon size={14} className="label-icon" />
                        Shared AI Conversation Link
                      </label>
                      <input
                        id="share-url"
                        type="url"
                        placeholder="https://chatgpt.com/share/..."
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        required
                      />
                      
                      {/* Live Platform Indicator */}
                      {url ? (
                        <div className="url-hint">
                          {detectedPlatform ? (
                            <span className={`platform-indicator ${detectedPlatform}`}>
                              <CheckCircle2 size={12} />
                              {PLATFORM_LABELS[detectedPlatform]} detected
                            </span>
                          ) : (
                            <span className="platform-indicator unknown">
                              <AlertCircle size={12} />
                              Unrecognized platform URL
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="url-hint">
                          Supports public share URLs from ChatGPT, Claude, & Gemini.
                        </div>
                      )}
                    </div>

                    <button id="btn-extract" type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? (
                        <><Loader2 className="spinner" size={18} /> {jobStatus === 'queued' ? 'Queued...' : 'Extracting...'}</>
                      ) : (
                        <><Download size={18} /> Extract Conversation <ArrowRight size={18} /></>
                      )}
                    </button>
                  </form>

                  {/* Error banner */}
                  {error && (
                    <div className="error-msg" id="error-display">
                      <AlertCircle size={18} className="error-icon" />
                      <div>
                        <strong>Extraction Gagal:</strong> {error}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Result Preview */}
          <section className="column-right">
            {result ? (
              <ResultView data={result} />
            ) : (
              <div className="card placeholder-card">
                <div className="placeholder-content">
                  <MessageSquareDashed size={44} className="placeholder-icon" />
                  <h3>Ready to Extract</h3>
                  <p>Masukkan API Key dan link shared percakapan AI pada form di sebelah kiri untuk menampilkan hasil ekstraksi di sini.</p>
                </div>
              </div>
            )}
          </section>

        </main>
      </div>

      {/* Full-width footer bar, same pattern as the navbar */}
      <footer className="app-footer">
        <div className="footer-content">
          <span>ConvExtract &copy; 2026 AI Conversation Extractor Microservice</span>
          <div className="footer-links">
            <a href="/docs" target="_blank" rel="noreferrer">API Docs</a>
            <span>&bull;</span>
            <span className="footer-version" title="App version (set via APP_VERSION env)">
              <Tag size={12} />
              {appVersion}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
