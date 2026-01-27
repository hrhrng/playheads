
import { useEffect } from 'react';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  conversationTitle?: string;
}

/**
 * Modern confirmation dialog for deleting conversations
 * Features:
 * - Backdrop blur effect
 * - Smooth animations
 * - Keyboard support (Escape to cancel, Enter to confirm)
 * - Accessible design
 */
export const DeleteConfirmDialog = ({ isOpen, onConfirm, onCancel, conversationTitle }: DeleteConfirmDialogProps) => {
    // Handle keyboard shortcuts
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            } else if (e.key === 'Enter') {
                onConfirm();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onConfirm, onCancel]);

    // Prevent body scroll when dialog is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={onCancel}
        >
            {/* Backdrop with blur effect */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />

            {/* Dialog */}
            <div
                className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon */}
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-50 rounded-full">
                    <svg
                        className="w-6 h-6 text-red-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                </div>

                {/* Title */}
                <h3 className="text-xl font-semibold text-center text-gemini-text mb-2">
                    Delete Conversation?
                </h3>

                {/* Description */}
                <p className="text-center text-gemini-subtext text-sm mb-6">
                    {conversationTitle ? (
                        <>
                            Are you sure you want to delete <span className="font-medium text-gemini-text">"{conversationTitle}"</span>? This action cannot be undone.
                        </>
                    ) : (
                        'Are you sure you want to delete this conversation? This action cannot be undone.'
                    )}
                </p>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    {/* Cancel Button */}
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gemini-text bg-gemini-hover hover:bg-gemini-hover/80 transition-all active:scale-95"
                    >
                        Cancel
                    </button>

                    {/* Delete Button */}
                    <button
                        onClick={onConfirm}
                        className="flex-1 px-4 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 transition-all active:scale-95 shadow-sm hover:shadow-md"
                    >
                        Delete
                    </button>
                </div>

                {/* Keyboard Hints */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-center gap-4 text-xs text-gemini-subtext">
                    <div className="flex items-center gap-1.5">
                        <kbd className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-mono">ESC</kbd>
                        <span>Cancel</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <kbd className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-mono">ENTER</kbd>
                        <span>Delete</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
