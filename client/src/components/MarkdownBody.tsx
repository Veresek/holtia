import Markdown from "react-markdown";
import type { Components } from "react-markdown";

function safeHref(href: string | undefined) {
  if (!href) {
    return undefined;
  }
  const trimmed = href.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return undefined;
  }
  return trimmed;
}

function markdownComponents(options: {
  compact: boolean;
  links: boolean;
}): Components {
  const heading = options.compact
    ? "mt-1 font-medium text-ink first:mt-0"
    : "mt-3 font-serif text-ink first:mt-0";
  return {
    h1: ({ children }) => (
      <h1 className={[heading, options.compact ? "text-sm" : "text-lg"].join(" ")}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className={[heading, options.compact ? "text-sm" : "text-base"].join(" ")}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className={options.compact ? heading : "mt-3 font-medium text-ink first:mt-0"}>
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className={options.compact ? "mt-1 first:mt-0" : "mt-2 first:mt-0"}>
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul
        className={[
          "list-disc space-y-1 pl-5 first:mt-0",
          options.compact ? "mt-1" : "mt-2",
        ].join(" ")}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol
        className={[
          "list-decimal space-y-1 pl-5 first:mt-0",
          options.compact ? "mt-1" : "mt-2",
        ].join(" ")}
      >
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-6">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="mt-1 border-l border-line pl-3 text-ink-faint first:mt-0">
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => {
      const safe = safeHref(href);
      if (!options.links || !safe) {
        return <span className="text-moss">{children}</span>;
      }
      const external = /^(https?:)?\/\//i.test(safe);
      return (
        <a
          className="relative wrap-break-word text-moss underline hover:text-moss-hover"
          href={safe}
          rel={external ? "noopener noreferrer" : undefined}
          target={external ? "_blank" : undefined}
        >
          {children}
        </a>
      );
    },
    strong: ({ children }) => (
      <strong className="font-semibold text-ink">{children}</strong>
    ),
    em: ({ children }) => <em>{children}</em>,
    code: ({ children }) => (
      <code className="wrap-break-word rounded-sm bg-paper px-1 py-0.5 font-mono text-[0.85em] text-ink">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="mt-1 max-w-full overflow-x-auto rounded-md border border-line bg-paper p-2 font-mono text-[0.85em] text-ink first:mt-0">
        {children}
      </pre>
    ),
    hr: () => <hr className="my-2 border-line" />,
  };
}

interface MarkdownBodyProps {
  markdown: string;
  compact?: boolean;
  links?: boolean;
  className?: string;
}

export function MarkdownBody({
  markdown,
  compact = false,
  links = true,
  className,
}: MarkdownBodyProps) {
  return (
    <div
      className={
        className ??
        [
          "mt-3 min-w-0 wrap-break-word text-sm leading-6 text-ink-soft",
          compact ? "line-clamp-6" : "",
        ].join(" ")
      }
    >
      <Markdown components={markdownComponents({ compact, links })}>
        {markdown}
      </Markdown>
    </div>
  );
}
