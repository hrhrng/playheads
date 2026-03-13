export function LoadingScreen() {
  return (
    <div className="min-h-screen w-full bg-air-50 flex items-center justify-center">
      <div className="w-16 h-16 rounded-full overflow-hidden grayscale animate-pulse">
        <img src="/logo.jpg" alt="Loading" className="w-full h-full object-cover" />
      </div>
    </div>
  );
}
