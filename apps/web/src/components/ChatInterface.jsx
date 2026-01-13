import { useRef, useEffect, useState } from 'react';
import { RecordPlayer } from './RecordPlayer';
import { NewChatView } from './NewChatView';

const API_BASE = 'http://localhost:8000';

export const ChatInterface = ({
    isDJSpeaking,
    isPlaying,
    currentTrack,
    togglePlay,
    playbackTime,
    onSeek,
    sessionId,
    onAgentActions,
    syncToBackend,
    onEmptyChange
}) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const endRef = useRef(null);
    const textareaRef = useRef(null);

    // Load chat history when session ID changes
    useEffect(() => {
        const loadChatHistory = async () => {
            if (!sessionId) return;

            setIsLoading(true);
            try {
                const res = await fetch(`${API_BASE}/state?session_id=${sessionId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.chat_history && data.chat_history.length > 0) {
                        setMessages(data.chat_history.map(m => ({
                            role: m.role,
                            content: m.content
                        })));
                    } else {
                        setMessages([]);
                    }
                } else {
                    setMessages([]);
                }
            } catch (e) {
                console.error('Failed to load chat history:', e);
                setMessages([]);
            } finally {
                setIsLoading(false);
            }
            setInput('');
            setShowHistory(false);
        };

        loadChatHistory();
    }, [sessionId]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [input]);

    // Auto-scroll to bottom
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Notify parent about empty state
    useEffect(() => {
        if (onEmptyChange) {
            onEmptyChange(messages.length === 0);
        }
    }, [messages, onEmptyChange]);

    const sendMessage = async (overrideInput = null) => {
        const textToSend = overrideInput || input;
        if (!textToSend.trim() || isLoading) return;

        const userMessage = textToSend.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        // If coming from NewChatView, force history to show generally or just transition
        // But for this UI, if we have messages, we show the main player + transcript accessible

        // Sync state before sending message so agent has latest context
        if (syncToBackend) {
            await syncToBackend();
        }

        try {
            const response = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    session_id: sessionId
                })
            });
            const data = await response.json();

            // Add agent response to messages
            setMessages(prev => [...prev, { role: 'agent', content: data.response || 'No response' }]);

            // Execute any actions from the agent
            if (data.actions && data.actions.length > 0 && onAgentActions) {
                await onAgentActions(data.actions);
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'agent', content: 'Sorry, I had trouble connecting. Try again? 🎧' }]);
        } finally {
            setIsLoading(false);
        }
    };

    // If no messages, show New Chat View
    if (messages.length === 0) {
        return (
            <NewChatView
                onSend={(text) => sendMessage(text)}
                isDJSpeaking={isDJSpeaking}
                isPlaying={isPlaying}
            />
        );
    }

    return (
        <div className="flex flex-col h-full relative bg-white rounded-3xl overflow-hidden shadow-sm border border-white">
            {/* Hero Stage */}
            <div className="flex-1 flex flex-col items-center justify-center relative pb-48">
                {/* Visualizer Background */}
                {isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                        <div className="w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse" />
                    </div>
                )}

                {/* Record Player - Always Visible */}
                <div className="absolute inset-0 flex items-center justify-center pb-20">
                    <div className="relative z-10 w-full max-w-xl px-8">
                        <RecordPlayer
                            currentTrack={currentTrack}
                            isPaused={!isPlaying}
                            togglePlay={togglePlay}
                            playbackTime={playbackTime}
                            onSeek={onSeek}
                        />
                    </div>
                </div>

                {/* Transcript Overlay */}
                <div className={`absolute inset-0 z-20 flex flex-col items-center justify-start pt-12 pb-4 bg-white/60 backdrop-blur-xl transition-opacity duration-500 ease-out ${showHistory ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">
                        Studio Transcript
                    </h3>

                    <div className="w-full max-w-2xl px-6 overflow-y-auto no-scrollbar pb-40">
                        <div className="space-y-8 pb-12">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex flex-col w-full ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <span className="text-[10px] text-gray-500 mb-1 px-1 uppercase tracking-wider font-semibold">
                                        {msg.role === 'agent' ? 'DJ' : 'You'}
                                    </span>
                                    <div className={`text-2xl md:text-3xl font-medium leading-relaxed max-w-[90%] ${msg.role === 'user' ? 'text-gray-600 text-right italic' : 'text-gray-900'
                                        }`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex items-start">
                                    <span className="text-sm text-blue-600 font-medium animate-pulse tracking-widest">
                                        ON AIR...
                                    </span>
                                </div>
                            )}
                            <div ref={endRef} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Command Console - Fixed at Bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-6 pt-8 z-30 bg-gradient-to-t from-white via-white/95 to-transparent">
                {/* Toggle History Button */}
                <div className="max-w-3xl mx-auto mb-3 flex justify-start">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`p-2.5 rounded-full bg-white shadow-md border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all ${showHistory ? 'text-blue-600 border-blue-200' : ''}`}
                        title={showHistory ? 'Back to Player' : 'View Transcript'}
                    >
                        {showHistory ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 10l12-3" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Input Bar */}
                <div className="max-w-3xl mx-auto bg-gemini-bg rounded-3xl p-2 pl-4 pr-2 flex items-center gap-2 group focus-within:bg-white focus-within:shadow-md transition-all border border-transparent focus-within:border-gemini-border">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder={isDJSpeaking ? 'Push to Interrupt...' : isPlaying ? 'Ask the DJ...' : 'Start a vibe...'}
                        className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-gemini-text placeholder-gemini-subtext text-lg font-medium tracking-tight resize-none py-3 max-h-32 no-scrollbar"
                    />

                    <button
                        onClick={() => sendMessage()}
                        disabled={isLoading}
                        className={`p-3 rounded-full transition-all ${isLoading
                            ? 'bg-blue-400 text-white animate-pulse'
                            : input.trim()
                                ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
                                : 'bg-gray-200 text-gray-400'
                            }`}
                    >
                        {isLoading ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                        )}
                    </button>
                </div>

                <div className="text-center mt-3 text-[10px] text-gray-300 font-mono tracking-widest uppercase">
                    Playhead Radio &bull; Live
                </div>
            </div>
        </div>
    );
};
