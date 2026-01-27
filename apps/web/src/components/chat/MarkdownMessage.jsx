import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * MarkdownMessage - Renders markdown content with playheads styling
 *
 * Supports:
 * - **bold**, *italic*, `code`
 * - Lists (ordered and unordered)
 * - Code blocks with syntax highlighting
 * - Links and blockquotes
 *
 * @param {string} content - Markdown text to render
 */
export const MarkdownMessage = ({ content }) => {
    return (
        <div className="prose prose-lg max-w-none text-2xl md:text-3xl font-medium">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
    );
};
