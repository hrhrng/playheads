import { useState } from 'react';

/**
 * ThinkingProcess - 简洁的思考过程展示
 *
 * 设计理念：
 * - 低调展示，不抢主要内容的视觉焦点
 * - 默认折叠，节省空间
 */
export const ThinkingProcess = ({ content }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!content) return null;

    return (
        <div className="text-sm w-full border border-indigo-200 bg-indigo-50/30 rounded-lg overflow-hidden">
            <div
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-indigo-100/30 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm">💭</span>
                    <span className="text-xs font-medium text-indigo-700 font-mono">
                        Thinking
                    </span>
                </div>
                <span className="text-gray-400 text-xs">
                    {isExpanded ? '▼' : '▶'}
                </span>
            </div>

            {isExpanded && (
                <div className="border-t border-indigo-200 px-3 py-2 text-xs text-gray-700 italic leading-relaxed bg-white/50">
                    {content}
                </div>
            )}
        </div>
    );
};
