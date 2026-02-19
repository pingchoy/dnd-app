"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  children: string;
  className?: string;
}

/**
 * Client component that renders a markdown string via ReactMarkdown.
 * Must be "use client" so it can be imported by other client components
 * (e.g. StepReview, CharacterSheet) without hitting the Next.js rule that
 * forbids importing Server Components from Client Components.
 */
export default function MarkdownProse({ children, className = "" }: Props) {
  return (
    <div
      className={`prose prose-stone max-w-none
        prose-strong:font-semibold prose-p:my-1 prose-p:leading-snug ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
