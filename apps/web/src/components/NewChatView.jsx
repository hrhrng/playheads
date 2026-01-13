import { useState, useRef, useEffect } from 'react';

export const NewChatView = ({ onSend, suggestions = [], isDJSpeaking, isPlaying }) => {
    const [input, setInput] = useState('');
    const textareaRef = useRef(null);

    const handleSend = () => {
        if (input.trim()) {
            onSend(input);
        }
    };

    const handleSuggestionClick = (suggestion) => {
        setInput(suggestion);
        // Focus the input maybe? Or just auto-fill
        textareaRef.current?.focus();
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [input]);

    const defaultSuggestions = [
        "Play something upbeat",
        "Create a workout playlist",
        "What is this song?"
    ];

    const activeSuggestions = suggestions.length > 0 ? suggestions : defaultSuggestions;

    return (
        <div className="flex flex-col items-center justify-center h-full w-full px-4 animate-fade-in relative">

            {/* Center Content */}
            <div className="flex flex-col items-center w-full max-w-2xl space-y-8 z-20">
                {/* Heading */}
                <h2 className="text-3xl font-semibold text-gray-800 tracking-tight">
                    Where should we play?
                </h2>

                {/* Input Area - Centered Style */}
                <div className="w-full relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-purple-100 rounded-3xl blur opacity-20 group-hover:opacity-30 transition-opacity" />
                    <div className="relative bg-white rounded-3xl shadow-sm border border-gray-200 flex items-center p-2 pl-4 pr-2 focus-within:shadow-md focus-within:border-blue-200 transition-all">
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder={isDJSpeaking ? 'Push to Interrupt...' : 'Start a vibe...'}
                            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-gray-800 placeholder-gray-400 text-lg font-medium resize-none py-3 max-h-32 no-scrollbar"
                            autoFocus
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim()}
                            className={`p-3 rounded-full transition-all flex-shrink-0 ${input.trim()
                                ? 'bg-black text-white hover:bg-gray-800 transform hover:scale-105'
                                : 'bg-gray-100 text-gray-300'
                                }`}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Suggestions */}
                <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                    {activeSuggestions.map((text, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleSuggestionClick(text)}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-all shadow-sm hover:shadow"
                        >
                            {text}
                        </button>
                    ))}
                </div>
            </div>

            {/* Mini Record Player - Shows when playing in background */}
            {isPlaying && (
                <div className="absolute bottom-6 right-6 z-30">
                    <div className="relative group cursor-pointer">
                        {/* Glow effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-rose-400 to-orange-400 rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity animate-pulse" />

                        {/* Record disc */}
                        <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 shadow-lg flex items-center justify-center animate-spin-slow border-2 border-gray-700">
                            {/* Grooves */}
                            <div className="absolute inset-1 rounded-full border border-gray-600/30" />
                            <div className="absolute inset-2 rounded-full border border-gray-600/20" />
                            <div className="absolute inset-3 rounded-full border border-gray-600/10" />

                            {/* Center label */}
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-inner">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-900" />
                            </div>
                        </div>

                        {/* Playing indicator dot */}
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg" />
                    </div>
                </div>
            )}

            {/* Disclaimer / Footer */}
            <div className="absolute bottom-6 text-center text-xs text-gray-300 font-mono">
                Playhead AI v2.1
            </div>
        </div>
    );
};
