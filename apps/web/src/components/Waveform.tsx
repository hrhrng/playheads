/**
 * Waveform - Animated waveform component
 * @module components/Waveform
 */

interface WaveformProps {
  /** Whether the audio is currently speaking */
  isSpeaking: boolean;
}

/**
 * Animated waveform component
 * Shows animated music bars when audio is playing
 */
export const Waveform = ({ isSpeaking }: WaveformProps): React.JSX.Element | null => {
  if (!isSpeaking) return null;

  return (
    <div className="flex items-center gap-1 h-8 px-4 py-2 glass rounded-full transition-all duration-300">
      <span className="text-xs font-semibold text-accent uppercase tracking-widest mr-2 animate-pulse">On Air</span>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="w-1 bg-accent rounded-full animate-music-bar-1"
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
          className="w-1 bg-accent-2 rounded-full animate-music-bar-2"
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
