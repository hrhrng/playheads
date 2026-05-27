export function LoadingScreen() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <div className="w-16 h-16 rounded-full overflow-hidden shadow-cover animate-pulse-soft">
        <img src="/logo.jpg" alt="Loading" className="w-full h-full object-cover" />
      </div>
    </div>
  );
}
