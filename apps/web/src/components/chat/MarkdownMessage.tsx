/**
 * MarkdownMessage - Markdown rendering component
 * @module components/chat/MarkdownMessage
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { detectPlaylistUrl, PLATFORM_COLORS } from '../../utils/playlistUrl';

interface MarkdownMessageProps {
  /** Markdown content to render */
  content: string;
}

/** Inline chip for a music platform playlist URL in rendered messages. */
const PlaylistUrlChip = ({
  href,
  displayName,
  platform,
}: {
  href: string;
  displayName: string;
  platform: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium no-underline transition-colors"
  >
    <span
      className={`inline-block w-3 h-3 rounded-full shrink-0 ${PLATFORM_COLORS[platform] || "bg-gray-400"}`}
    />
    <span className="text-gray-700">{displayName}</span>
    <span className="text-gray-400 text-[10px]">↗</span>
  </a>
);

/**
 * MarkdownMessage - Renders markdown content with playheads styling
 *
 * Supports:
 * - **bold**, *italic*, `code`
 * - Lists (ordered and unordered)
 * - Code blocks with syntax highlighting
 * - Links and blockquotes
 * - Music platform playlist URLs rendered as visual chips
 */
export const MarkdownMessage = ({ content }: MarkdownMessageProps): React.JSX.Element => {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href) {
              const detected = detectPlaylistUrl(href);
              if (detected) {
                return (
                  <PlaylistUrlChip
                    href={href}
                    displayName={detected.displayName}
                    platform={detected.platform}
                  />
                );
              }
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
