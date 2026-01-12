import React from 'react';

export const Waveform = ({ isSpeaking }) => {
    if (!isSpeaking) return null;

    return (
        <div className="flex items-center gap-1 h-8 px-4 py-2 bg-gemini-bg/50 backdrop-blur-sm rounded-full border border-white/20 shadow-sm transition-all duration-300">
            <span className="text-xs font-bold text-blue-500 uppercase tracking-widest mr-2 animate-pulse">On Air</span>
            {[...Array(5)].map((_, i) => (
                <div
                    key={i}
                    className="w-1 bg-blue-500 rounded-full animate-music-bar-1"
                    style={{
                        height: '40%',
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: '0.6s'
                    }}
                ></div>
            ))}
            {[...Array(5)].map((_, i) => (
                <div
                    key={i + 5}
                    className="w-1 bg-purple-500 rounded-full animate-music-bar-2"
                    style={{
                        height: '60%',
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: '0.7s'
                    }}
                ></div>
            ))}
        </div>
    );
};
