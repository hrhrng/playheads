/**
 * LoadingSkeleton — shimmer placeholder shown while GenUI tool is executing.
 */
export function GenUILoadingSkeleton() {
  return (
    <div className="w-full max-w-[calc(100vw-48px)] animate-pulse">
      <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
        {/* Header skeleton */}
        <div className="px-5 py-5 bg-gradient-to-r from-gray-200 to-gray-300">
          <div className="h-5 w-48 bg-white/30 rounded" />
          <div className="h-3 w-32 bg-white/20 rounded mt-2" />
        </div>

        {/* Content skeleton */}
        <div className="p-4 space-y-4">
          {/* Fake timeline */}
          <div className="flex gap-6 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-gray-200" />
                <div className="h-2 w-12 bg-gray-200 rounded mt-2" />
                <div className="w-[120px] h-[120px] bg-gray-200 rounded-xl mt-3" />
                <div className="h-2 w-20 bg-gray-200 rounded mt-2" />
                <div className="h-2 w-16 bg-gray-100 rounded mt-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Footer skeleton */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <div className="h-2 w-16 bg-gray-100 rounded" />
          <div className="h-2 w-24 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}
