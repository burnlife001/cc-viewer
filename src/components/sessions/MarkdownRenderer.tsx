import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

/** Pre-block wrapper: trim leading/trailing blank lines for cleaner prose layout. */
function trimContent(text: string): string {
  return text.replace(/^\n+/, "").replace(/\n+$/, "");
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          /* ---- Inline code ---- */
          code({ className, children, ...props }) {
            // Inline code: no className (language-*) = inline
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="bg-muted/60 text-[0.875em] px-1 py-0.5 rounded font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            // Fenced code block — rendered inside <pre>
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          /* ---- Code block wrapper ---- */
          pre({ children }) {
            return (
              <pre className="bg-muted/50 border rounded-lg p-3 overflow-x-auto text-sm leading-relaxed font-mono">
                {children}
              </pre>
            );
          },
          /* ---- Links open in new tab ---- */
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
                {...props}
              >
                {children}
              </a>
            );
          },
          /* ---- Tables ---- */
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table className="border-collapse border border-border text-sm">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-border bg-muted/40 px-3 py-1.5 text-left font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-border px-3 py-1.5">{children}</td>
            );
          },
          /* ---- Blockquote ---- */
          blockquote({ children }) {
            return (
              <blockquote className="border-l-[3px] border-primary/40 pl-3 italic text-muted-foreground">
                {children}
              </blockquote>
            );
          },
          /* ---- Horizontal rule ---- */
          hr() {
            return <hr className="border-border/60 my-3" />;
          },
        }}
      >
        {trimContent(content)}
      </ReactMarkdown>
    </div>
  );
});
