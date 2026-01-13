export const SkeletonLoader = () => {
    return (
        <div className="flex h-full items-center justify-center bg-white rounded-3xl">
            {/* Simple Spinner */}
            <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
    );
};
