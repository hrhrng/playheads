/**
 * MarkdownMessage - Markdown rendering component
 * @module components/chat/MarkdownMessage
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  /** Markdown content to render */
  content: string;
}

/**
 * MarkdownMessage - Renders markdown content with playheads styling
 *
 * Supports:
 * - **bold**, *italic*, `code`
 * - Lists (ordered and unordered)
 * - Code blocks with syntax highlighting
 * - Links and blockquotes
 */
export const MarkdownMessage = ({ content }: MarkdownMessageProps): React.JSX.Element => {
  return (
    <div className="prose prose-lg max-w-none text-2xl md:text-3xl font-medium">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
