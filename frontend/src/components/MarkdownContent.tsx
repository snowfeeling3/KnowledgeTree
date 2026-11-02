import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId } from "../lib/document-markdown";
export function MarkdownContent({ content, onNavigate }: { content: string; onNavigate?: (id: string) => void }) {
  const components: Components = {
    h1: ({ node, ...props }) => <h1 {...props} id={headingId(node?.position?.start.line ?? 0)} />,
    h2: ({ node, ...props }) => <h2 {...props} id={headingId(node?.position?.start.line ?? 0)} />,
    h3: ({ node, ...props }) => <h3 {...props} id={headingId(node?.position?.start.line ?? 0)} />,
    h4: ({ node, ...props }) => <h4 {...props} id={headingId(node?.position?.start.line ?? 0)} />,
    h5: ({ node, ...props }) => <h5 {...props} id={headingId(node?.position?.start.line ?? 0)} />,
    h6: ({ node, ...props }) => <h6 {...props} id={headingId(node?.position?.start.line ?? 0)} />,
    a: ({ node: _node, href, children, ...props }) => href?.startsWith("knowledge:") ? <button type="button" className="knowledge-link" onClick={() => onNavigate?.(decodeKnowledgeId(href.slice(10)))}>{children}</button> : <a {...props} href={href} target={href?.startsWith("#") ? undefined : "_blank"} rel="noreferrer">{children}</a>,
    table: ({ node: _node, ...props }) => <div className="markdown-table"><table {...props} /></div>,
  };
  return <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={url => url.startsWith("knowledge:") ? url : defaultUrlTransform(url)}>{content}</Markdown>;
}

function decodeKnowledgeId(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
