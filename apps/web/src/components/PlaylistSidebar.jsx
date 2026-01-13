import React from 'react';


export const PlaylistSidebar = ({ currentTrack, isPlaying, queue: propQueue, onPlayTrack, collapsed, toggleCollapse, showQueue = true }) => {

    const formatArtwork = (url, size = 100) => {
        if (!url) return 'https://placehold.co/100';
        return url.replace('{w}', size).replace('{h}', size);
    };

    const queue = (propQueue && propQueue.length > 0) ? propQueue.map(item => ({
        id: item.id || Math.random().toString(),
        title: item.title || item.attributes?.name || 'Unknown Title',
        artist: item.artistName || item.attributes?.artistName || 'Unknown Artist',
        cover: formatArtwork(item.artworkURL || item.artwork?.url || item.attributes?.artwork?.url)
    })) : [];

    return (
        <div
            className={`h-full flex flex-col bg-gemini-bg p-4 pl-4 transition-all duration-500 ease-in-out ${collapsed ? 'w-24' : 'w-[360px]'}`}
        >
            {/* Playlist Container */}
            <div className="flex-1 bg-white rounded-3xl flex flex-col shadow-sm overflow-hidden relative border border-white transition-all">

                {/* Toggle Button - Absolute Positioned or Flex */}
                <div className={`flex ${collapsed ? 'justify-center py-6' : 'justify-between p-6 pb-2'} items-center`}>
                    {!collapsed && <h2 className="text-lg font-sans font-medium text-gemini-text">Playlist</h2>}
                    <button
                        onClick={toggleCollapse}
                        className="p-2 rounded-xl hover:bg-gray-100 text-gemini-subtext hover:text-gemini-text transition-all duration-300 group focus:outline-none focus:ring-0"
                        title={collapsed ? "Expand Playlist" : "Collapse Playlist"}
                    >
                        {collapsed ? (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Content */}
                {collapsed ? (
                    /* Mini View - Vertical Player Strip */
                    <div className="flex-1 flex flex-col items-center pt-8 gap-6 opacity-100 transition-opacity duration-500 delay-100">

                        {/* Mini Vinyl Spinner */}
                        <div className={`w-12 h-12 rounded-full bg-black border-2 border-gray-200 flex items-center justify-center ${!!currentTrack && isPlaying ? 'animate-spin-slow' : ''} shadow-md`}>
                            <div className="w-4 h-4 rounded-full bg-white border border-gray-300" />
                        </div>

                        {/* Status Indicator */}
                        <div className="flex flex-col items-center gap-2">
                            {isPlaying ? (
                                <div className="flex gap-1 h-3 items-end">
                                    <div className="w-1 bg-blue-500 rounded-full animate-music-bar-1 h-full"></div>
                                    <div className="w-1 bg-blue-500 rounded-full animate-music-bar-2 h-2/3"></div>
                                    <div className="w-1 bg-blue-500 rounded-full animate-music-bar-3 h-1/2"></div>
                                </div>
                            ) : (
                                <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Full Expanded View */
                    <div className="flex-1 flex flex-col min-w-0 opacity-100 transition-opacity duration-300">

                        {/* Queue List */}
                        {showQueue && (
                            <div className="flex-1 overflow-y-auto space-y-2 px-4 pb-4">
                                <h3 className="text-xs font-medium text-gemini-subtext uppercase tracking-wider mb-2 px-2">Up Next</h3>
                                {queue.map((track, index) => (
                                    <div
                                        key={track.id}
                                        onClick={() => onPlayTrack && onPlayTrack(index)}
                                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-gemini-bg cursor-pointer group transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-gray-200 overflow-hidden relative shrink-0">
                                            <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-gemini-text truncate">{track.title}</div>
                                            <div className="text-xs text-gemini-subtext truncate">{track.artist}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
