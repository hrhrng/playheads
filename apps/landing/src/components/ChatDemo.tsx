import { useState, useRef } from 'react';

const SUGGESTIONS = [
  'A rainy Sunday with coffee',
  'Driving at 2am, windows down',
  'That feeling after a breakup',
];

interface Props {
  appUrl: string;
}

export default function ChatDemo({ appUrl }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const go = (text: string) => {
    const q = encodeURIComponent(text.trim());
    if (q) window.location.href = `${appUrl}?q=${q}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      go(input);
    }
  };

  return (
    <section className="px-6 h-screen flex flex-col justify-center snap-start">
      <div className="max-w-2xl mx-auto w-full">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-night-50">
            Hear Different.
          </h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-night-900 rounded-2xl p-2 pl-4 border border-night-700 focus-within:border-night-400 transition-colors">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe a vibe..."
              aria-label="Describe a vibe"
              className="flex-1 bg-transparent border-none outline-none text-night-50 placeholder-night-400 text-sm resize-none py-2 max-h-24"
            />
            <button
              onClick={() => go(input)}
              disabled={!input.trim()}
              aria-label="Go"
              className={`p-2 rounded-full transition-all shrink-0 ${
                input.trim()
                  ? 'bg-night-50 text-night-950 hover:bg-white'
                  : 'bg-night-700 text-night-400'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>

          <div className="flex gap-2 justify-center overflow-x-auto" role="group" aria-label="Suggested prompts">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="text-xs px-3 py-1.5 rounded-full border border-night-600 text-night-300 hover:border-night-400 hover:text-night-100 transition-all whitespace-nowrap shrink-0"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
