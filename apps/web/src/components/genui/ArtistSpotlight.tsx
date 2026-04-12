/**
 * ArtistSpotlight — artist profile card with bio and key info.
 * Magazine-style layout for sharing.
 */
interface ArtistSpotlightProps {
  name: string;
  subtitle?: string;
  bio?: string;
  imageUrl?: string;
  stats?: { label: string; value: string }[];
}

export function ArtistSpotlight({ name, subtitle, bio, imageUrl, stats }: ArtistSpotlightProps) {
  return (
    <div className="rounded-2xl overflow-hidden bg-gray-50 animate-genui-slide-in">
      {/* Header with image */}
      <div className="relative h-40 bg-gradient-to-br from-gray-200 to-gray-300">
        {imageUrl && (
          <img src={imageUrl} alt={name} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5">
          <h3 className="text-xl font-bold text-white">{name}</h3>
          {subtitle && <p className="text-sm text-white/60 mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Stats row */}
      {stats && stats.length > 0 && (
        <div className="flex divide-x divide-gray-200 border-b border-gray-200">
          {stats.map((stat, i) => (
            <div key={i} className="flex-1 py-3 px-4 text-center">
              <p className="text-lg font-bold text-gray-900 tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bio */}
      {bio && (
        <div className="p-4">
          <p className="text-[13px] text-gray-700 leading-relaxed">{bio}</p>
        </div>
      )}
    </div>
  );
}
