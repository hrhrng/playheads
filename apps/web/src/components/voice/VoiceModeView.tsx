/**
 * VoiceModeView — full-screen voice DJ surface.
 *
 * Opens over the whole app when the user taps the waveform button in the
 * composer (mirroring the iOS ChatBar.onVoice placeholder). Connects to
 * VoiceDJAgent via useVoiceDJ, which handles audio I/O, tool dispatch, and
 * music ducking.
 *
 * State machine (from @cloudflare/voice):
 *   idle       → standby before first turn
 *   listening  → user is talking; interim transcript streaming
 *   thinking   → LLM is generating
 *   speaking   → TTS playback; music is ducked
 *
 * Visual design follows iOS MusicAgent's dark palette + LXGW WenKai font.
 */
import { useMemo } from 'react';
import { useVoiceDJ } from '../../hooks/useVoiceDJ';
import type { AppleMusicProvider } from '../../providers/AppleMusicProvider';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';
import type { UnifiedTrack } from '../../providers/types';

interface VoiceModeViewProps {
  isOpen: boolean;
  onClose: () => void;
  /** Chat session ID — voice connects to the same DO instance as the chat. */
  sessionId: string | null;
  userId: string | null;
  storefront: string;
  provider: AppleMusicProvider | null;
  queueOps?: QueueOperations;
  currentTrack?: UnifiedTrack | null;
}

export function VoiceModeView({
  isOpen,
  onClose,
  sessionId,
  userId,
  storefront,
  provider,
  queueOps,
  currentTrack,
}: VoiceModeViewProps): React.JSX.Element | null {
  const voice = useVoiceDJ({
    enabled: isOpen,
    sessionId,
    userId,
    storefront,
    provider,
    queueOps,
  });

  // Status labels reflect the CF voice pipeline state, which has four phases:
  //   idle       — WS connected, VAD hasn't detected user speech yet (between turns)
  //   listening  — VAD caught voice, STT is streaming the utterance
  //   thinking   — transcript finalized, LLM generating
  //   speaking   — TTS audio is playing back
  const statusLabel = useMemo(() => {
    if (!voice.connected) return '连接中…';
    switch (voice.status) {
      case 'listening': return '正在聆听';
      case 'thinking':  return '思考中';
      case 'speaking':  return '正在说话';
      case 'idle':      return '请开口说话';
      default:          return '请开口说话';
    }
  }, [voice.status, voice.connected]);

  const lastMessage = voice.transcript[voice.transcript.length - 1];
  const lastMessageText = lastMessage?.text || '';
  const lastMessageRole = lastMessage?.role;

  if (!isOpen) return null;

  const artUrl = currentTrack?.artworkUrl
    ? currentTrack.artworkUrl.replace('{w}', '96').replace('{h}', '96')
    : '';

  return (
    <div className="fixed inset-0 z-[70] bg-[#0a0a0f] text-white flex flex-col select-none">
      {/* Ambient mood gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={`absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[140px] transition-opacity duration-700 ${
            voice.status === 'speaking' ? 'opacity-40' : 'opacity-20'
          }`}
          style={{ background: 'radial-gradient(circle, #5b6cff 0%, transparent 70%)' }}
        />
        <div
          className={`absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-[140px] transition-opacity duration-700 ${
            voice.status === 'listening' ? 'opacity-50' : 'opacity-15'
          }`}
          style={{ background: 'radial-gradient(circle, #ff5b8c 0%, transparent 70%)' }}
        />
      </div>

      {/* Top bar — status + close */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
          <StatusDot status={voice.status} />
          {statusLabel}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          title="退出语音模式"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Hero — breathing orb / waveform */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <VoiceOrb status={voice.status} audioLevel={voice.audioLevel} />

        {/* Error banner */}
        {voice.error && (
          <div className="max-w-md text-center text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
            {voice.error}
          </div>
        )}

        {/* Live caption — interim user speech OR latest DJ line */}
        <div className="max-w-lg text-center min-h-[4rem] px-4">
          {voice.interimTranscript ? (
            <p className="text-white/50 text-lg leading-relaxed italic">
              {voice.interimTranscript}
            </p>
          ) : lastMessageText ? (
            <p
              className={`text-lg leading-relaxed ${
                lastMessageRole === 'assistant' ? 'text-white' : 'text-white/60'
              }`}
            >
              {lastMessageText}
            </p>
          ) : (
            <p className="text-white/40 text-base">
              {voice.connected ? '开口说话吧' : '正在连接…'}
            </p>
          )}
        </div>
      </div>

      {/* Ducked music strip — shows what's playing while DJ talks */}
      {currentTrack && (
        <div className="relative z-10 px-6 pb-4">
          <div className="max-w-md mx-auto flex items-center gap-3 bg-white/5 backdrop-blur border border-white/10 rounded-full px-3 py-2">
            {artUrl ? (
              <img
                src={artUrl}
                alt=""
                className={`w-8 h-8 rounded-md object-cover transition-opacity duration-500 ${
                  voice.status === 'speaking' ? 'opacity-50' : 'opacity-100'
                }`}
              />
            ) : (
              <div className="w-8 h-8 rounded-md bg-white/10" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/80 truncate">
                {currentTrack.name}
              </div>
              <div className="text-[10px] text-white/50 truncate">
                {currentTrack.artist}
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-white/40">
              {voice.status === 'speaking' ? 'ducked' : 'playing'}
            </span>
          </div>
        </div>
      )}

      {/* Bottom controls — mute + end call */}
      <div className="relative z-10 pb-10 pt-4 flex items-center justify-center gap-6">
        <button
          onClick={voice.toggleMute}
          disabled={!voice.connected}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            voice.isMuted
              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
              : 'bg-white/10 text-white/80 border border-white/10 hover:bg-white/20'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={voice.isMuted ? '取消静音' : '静音'}
        >
          {voice.isMuted ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
            </svg>
          )}
        </button>

        <button
          onClick={onClose}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/40 transition-colors"
          title="结束通话"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4-4 4m8 8l-4 4-4-4" transform="rotate(135 12 12)" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }): React.JSX.Element {
  const color = {
    listening: 'bg-pink-400',
    thinking:  'bg-amber-400',
    speaking:  'bg-blue-400',
    idle:      'bg-white/40',
  }[status] || 'bg-white/40';
  const animate = status === 'listening' || status === 'speaking' ? 'animate-pulse' : '';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} ${animate}`} />;
}

/**
 * VoiceOrb — breathing circle that morphs based on state.
 *
 * - idle:      slow breathing
 * - listening: reacts to audioLevel
 * - thinking:  soft shimmer
 * - speaking:  wider pulse
 */
function VoiceOrb({
  status,
  audioLevel,
}: {
  status: string;
  audioLevel: number;
}): React.JSX.Element {
  // Scale driven by state — listening gets audio-reactive, speaking breathes wider
  const baseScale =
    status === 'listening'
      ? 1 + Math.min(0.35, audioLevel * 1.5)
      : status === 'speaking'
      ? 1.15
      : status === 'thinking'
      ? 1.05
      : 1;

  const glowColor =
    status === 'listening'
      ? 'rgba(255, 91, 140, 0.55)'
      : status === 'speaking'
      ? 'rgba(91, 108, 255, 0.55)'
      : status === 'thinking'
      ? 'rgba(251, 191, 36, 0.4)'
      : 'rgba(255, 255, 255, 0.25)';

  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      {/* Outer halo */}
      <div
        className={`absolute inset-0 rounded-full blur-2xl transition-all duration-200 ${
          status === 'idle' ? 'animate-voice-breathe' : ''
        }`}
        style={{
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          transform: `scale(${baseScale})`,
        }}
      />
      {/* Inner disc */}
      <div
        className="relative rounded-full bg-white/10 border border-white/20 backdrop-blur-sm transition-transform duration-150"
        style={{
          width: '10rem',
          height: '10rem',
          transform: `scale(${baseScale})`,
        }}
      >
        {/* Concentric rings that animate when speaking */}
        {status === 'speaking' && (
          <>
            <div className="absolute inset-0 rounded-full border border-white/20 animate-voice-ripple" />
            <div
              className="absolute inset-0 rounded-full border border-white/10 animate-voice-ripple"
              style={{ animationDelay: '0.4s' }}
            />
          </>
        )}
        {/* Audio-reactive bars when listening */}
        {status === 'listening' && (
          <div className="absolute inset-0 flex items-center justify-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1.5 rounded-full bg-white/90"
                style={{
                  height: `${20 + audioLevel * 80 * (1 + Math.sin(i) * 0.3)}%`,
                  transition: 'height 80ms ease-out',
                }}
              />
            ))}
          </div>
        )}
        {/* Thinking dots */}
        {status === 'thinking' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            {[0, 0.2, 0.4].map((delay) => (
              <div
                key={delay}
                className="w-2 h-2 rounded-full bg-white/80 animate-voice-bounce"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
