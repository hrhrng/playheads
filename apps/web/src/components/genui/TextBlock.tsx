/**
 * TextBlock — markdown text block with style variants (dark theme).
 */
import { MarkdownMessage } from '../chat/MarkdownMessage';

interface TextBlockProps {
  type?: string;
  content: string;
  style?: 'heading' | 'body' | 'caption';
}

const STYLE_CLASSES: Record<string, string> = {
  heading: 'text-sm font-semibold text-white/90',
  body: 'text-[13px] text-white/60 leading-relaxed',
  caption: 'text-[11px] text-white/40 leading-relaxed',
};

export function TextBlock({ content, style = 'body' }: TextBlockProps) {
  return (
    <div className={`${STYLE_CLASSES[style] || STYLE_CLASSES.body} animate-genui-slide-in [&_a]:text-blue-400 [&_a]:underline`}>
      <MarkdownMessage content={content} />
    </div>
  );
}
