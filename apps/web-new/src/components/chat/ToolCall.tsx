
import { useState } from 'react';

interface ToolCallProps {
    id: string;
    tool_name: string;
    args: any;
    result?: any;
    status?: 'pending' | 'success' | 'error';
}

/**
 * ToolCall - 简洁的工具调用展示组件
 *
 * 设计理念：
 * - 简洁紧凑，不占用过多空间
 * - 状态通过图标和颜色清晰表达
 * - 保持音乐主题但更低调
 */
export const ToolCall = ({ id, tool_name, args, result, status = 'pending' }: ToolCallProps) => {
    const [isExpanded, setIsExpanded] = useState(true);  // 默认展开

    // 工具简化名称
    const toolDisplayNames: Record<string, string> = {
        search_music: 'Search',
        play_track: 'Play',
        skip_next: 'Skip',
        add_to_playlist: 'Add to Playlist',
        remove_from_playlist: 'Remove',
        get_now_playing: 'Now Playing',
        get_playlist: 'Get Playlist'
    };

    // 状态配置
    const statusConfig = {
        pending: { icon: '○', color: 'text-blue-500 bg-blue-50/50 border-blue-200', iconClass: 'animate-pulse' },
        success: { icon: '✓', color: 'text-green-600 bg-green-50/50 border-green-200', iconClass: '' },
        error: { icon: '✗', color: 'text-red-600 bg-red-50/50 border-red-200', iconClass: '' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const displayName = toolDisplayNames[tool_name] || tool_name || 'Tool';  // 确保总有显示名称

    return (
        <div className={`text-sm w-full border rounded-lg overflow-hidden ${config.color}`}>
            {/* Header - 总是可见 */}
            <div
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-black/5 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <span className={`font-mono text-base ${config.iconClass}`}>{config.icon}</span>
                    <span className="font-medium font-mono text-xs tracking-wide">
                        {displayName}
                    </span>
                </div>

                <div className="text-gray-400 text-xs">
                    {isExpanded ? '▼' : '▶'}
                </div>
            </div>

            {/* Details - 默认展开 */}
            {isExpanded && (
                <div className="border-t px-3 pb-3 pt-2 bg-white/50">
                    <div className="space-y-2">
                        {/* Arguments */}
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                INPUT
                            </div>
                            <pre className="bg-white border border-gray-200 p-2 rounded text-[11px] overflow-x-auto font-mono text-gray-700">
                                {JSON.stringify(args, null, 2)}
                            </pre>
                        </div>

                        {/* Result */}
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                OUTPUT
                            </div>
                            {result ? (
                                <pre className="bg-white border border-gray-200 p-2 rounded text-[11px] overflow-x-auto font-mono text-gray-700 whitespace-pre-wrap break-words max-h-48">
                                    {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                                </pre>
                            ) : (
                                <div className="bg-white border border-gray-200 p-2 rounded text-[11px] font-mono text-gray-400 italic">
                                    {status === 'pending' ? 'Executing...' : 'No output'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
