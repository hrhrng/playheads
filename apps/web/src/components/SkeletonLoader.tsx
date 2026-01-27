/**
 * SkeletonLoader - Loading spinner component
 * @module components/SkeletonLoader
 */

/**
 * Simple loading spinner component
 * Displays a centered logo with pulse animation
 * Matches the main app loading screen style
 */
export const SkeletonLoader = (): React.JSX.Element => {
  return (
    <div className="flex h-full items-center justify-center bg-white rounded-3xl">
      {/* Logo with pulse animation - matches LoadingScreen in App.tsx */}
      <div className="w-16 h-16 rounded-full overflow-hidden grayscale animate-pulse">
        <img src="/logo.jpg" alt="Loading" className="w-full h-full object-cover" />
      </div>
    </div>
  );
};
