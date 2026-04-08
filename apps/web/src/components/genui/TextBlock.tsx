/**
 * TextBlock — markdown text block with style variants.
 */
import { MarkdownMessage } from '../chat/MarkdownMessage';
import type { TextNode } from '../../types/genui';

const STYLE_CLASSES: Record<string, string> = {
  heading: 'text-base font-semibold text-gray-900',
  body: 'text-[13px] text-gray-700 leading-relaxed',
  caption: 'text-[11px] text-gray-500 leading-relaxed',
};

export function TextBlock({ content, style = 'body' }: TextNode) {
  return (
    <div className={`${STYLE_CLASSES[style] || STYLE_CLASSES.body} animate-genui-slide-in`}>
      <MarkdownMessage content={content} />
    </div>
  );
}
