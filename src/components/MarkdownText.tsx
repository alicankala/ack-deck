import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import "../content-polish.css";
function CodeBlock({ children }: { children?: ReactNode }) {
  const [status, setStatus] = useState("");
  return <div className="markdown-code"><button type="button" onClick={async e => {
    const text = e.currentTarget.parentElement?.querySelector("code")?.textContent ?? "";
    try { await navigator.clipboard.writeText(text); setStatus("Kopyalandı"); } catch { setStatus("Kopyalanamadı"); }
  }}>{status || "Kopyala"}</button><pre>{children}</pre><span className="sr-only" role="status">{status}</span></div>;
}
export function MarkdownText({ text }: { text: string }) {
  return <div className="markdown-content"><Markdown skipHtml remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false }]]} components={{
    pre: CodeBlock,
    img: ({ alt }) => <span className="markdown-image-label">{alt ? "Görsel: " + alt : "Görsel"}</span>,
    a: ({ children, href }) => <a href={href && /^https?:\/\//i.test(href) ? href : undefined} target="_blank" rel="noopener noreferrer">{children}</a>,
    table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>
  }}>{text}</Markdown></div>;
}
