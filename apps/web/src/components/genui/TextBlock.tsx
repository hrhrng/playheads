/**
 * TextBlock — markdown text block with style variants.
 */
import { MarkdownMessage } from '../chat/MarkdownMessage';

interface TextBlockProps {
  type?: string;
  content: string;
  style?: 'heading' | 'body' | 'caption';
}

const STYLE_CLASSES: Record<string, string> = {
  heading: 'text-base font-display font-semibold text-ink',
  body: 'text-[13px] font-display text-ink-2 leading-relaxed',
  caption: 'text-[11px] text-ink-3 leading-relaxed',
};

export function TextBlock({ content, style = 'body' }: TextBlockProps) {
  return (
    <div className={`${STYLE_CLASSES[style] || STYLE_CLASSES.body} animate-genui-slide-in`}>
      <MarkdownMessage content={content} />
    </div>
  );
}
