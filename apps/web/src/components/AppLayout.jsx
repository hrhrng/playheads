import { useState } from 'react';

export const AppLayout = ({ children, rightPanel, onNewChat, onSelectConversation, conversations = [] }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="flex h-screen bg-gemini-bg font-sans text-gemini-text overflow-hidden selection:bg-gemini-primary selection:text-white">

            {/* 1. Left Sidebar (Navigation) */}
            <nav className={`${expanded ? 'w-64' : 'w-[72px]'} flex flex-col py-6 shrink-0 z-20 transition-all duration-300 ease-in-out`}>
                <div className={`mb-8 w-full flex items-center ${expanded ? 'justify-between px-4' : 'justify-center'}`}>
                    {/* Burger Menu / toggle */}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-3 rounded-xl hover:bg-gemini-hover transition-colors text-gemini-subtext hover:text-gemini-text"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                </div>

                <div className="bg-gemini-hover/50 rounded-3xl mx-2 px-1 py-4 flex flex-col gap-2 w-[calc(100%-16px)]">
                    {/* New Chat */}
                    <button
                        onClick={onNewChat}
                        className={`p-3 rounded-2xl bg-gemini-hover text-gemini-text shadow-sm hover:shadow-md transition-all flex items-center ${expanded ? 'gap-3' : ''} overflow-hidden whitespace-nowrap ${expanded ? 'justify-start px-4' : 'justify-center'}`}
                    >
                        <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                        <span className={`transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>New Chat</span>
                    </button>

                    {/* Conversation List - Empty state or actual conversations */}
                    {conversations.length === 0 ? (
                        <div className={`p-3 text-gemini-subtext text-sm text-center ${expanded ? '' : 'hidden'}`}>
                            No conversations yet
                        </div>
                    ) : (
                        conversations.slice(0, 5).map((conv, idx) => (
                            <button
                                key={conv.id || idx}
                                onClick={() => onSelectConversation && onSelectConversation(conv.id)}
                                className={`p-3 rounded-xl hover:bg-white text-gemini-subtext transition-colors flex items-center ${expanded ? 'gap-3' : ''} overflow-hidden whitespace-nowrap ${expanded ? 'justify-start px-4' : 'justify-center'}`}
                            >
                                <svg className="w-6 h-6 shrink-0 text-gemini-subtext" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                </svg>
                                <span className={`transition-opacity duration-300 truncate ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>{conv.title || `Chat ${idx + 1}`}</span>
                            </button>
                        ))
                    )}
                </div>

                <div className="mt-auto flex flex-col gap-2 mb-2 w-full px-2">
                    <button className={`p-3 rounded-xl hover:bg-gemini-hover text-gemini-subtext transition-colors flex items-center ${expanded ? 'gap-3' : ''} overflow-hidden whitespace-nowrap ${expanded ? 'justify-start px-4' : 'justify-center'}`}>
                        <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <span className={`transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>Settings</span>
                    </button>
                    <div className={`p-1 flex items-center ${expanded ? 'gap-3' : ''} overflow-hidden whitespace-nowrap ${expanded ? 'justify-start px-4' : 'justify-center'}`}>
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0">XY</div>
                        <div className={`flex flex-col text-sm transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
                            <span className="font-medium text-gemini-text">Xiaoyang</span>
                            <span className="text-[10px] text-gemini-subtext">Free Plan</span>
                        </div>
                    </div>
                </div>
            </nav>

            {/* 2. Main Content Area (Rounded White Card) */}
            <main className="flex-1 h-full py-4 relative z-10 min-w-0">
                <div className="bg-white h-full w-full rounded-3xl shadow-sm overflow-hidden border border-white relative flex flex-col">
                    {children}
                </div>
            </main>

            {/* 3. Right Sidebar (Playlist) */}
            <aside className="shrink-0 z-10">
                {rightPanel}
            </aside>

        </div>
    );
};
