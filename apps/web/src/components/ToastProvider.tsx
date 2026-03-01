/**
 * Toast notification provider using Sonner
 * Provides global toast notifications with consistent styling
 */

import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      duration={4000}
      toastOptions={{
        style: {
          background: '#1a1a1a',
          color: '#ffffff',
          border: '1px solid #333',
        },
        className: 'sonner-toast',
      }}
      richColors
    />
  );
}
