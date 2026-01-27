
import { useState } from 'react';
import { supabase } from '../utils/supabase';
import { useAuthStore } from '../store/authStore';

interface AppleMusicLinkOverlayProps {
    onDismiss: () => void;
    onLinkSuccess: () => void;
}

export const AppleMusicLinkOverlay = ({ onDismiss, onLinkSuccess }: AppleMusicLinkOverlayProps) => {
    const session = useAuthStore(state => state.session);

    const handleLinkApple = async () => {
        if (!window.MusicKit) return;
        const mk = window.MusicKit.getInstance();
        if (!mk) return;

        try {
            await mk.authorize();

            if (mk.isAuthorized && session?.user?.id) {
                const token = mk.musicUserToken;
                if (token) {
                    const { error } = await supabase
                        .from('profiles')
                        .update({ apple_music_token: token })
                        .eq('id', session.user.id);

                    if (!error) {
                        onLinkSuccess();
                    } else {
                        console.error('Link Error:', error);
                        alert('Failed to save Apple Music link. Please try again.');
                    }
                }
            }
        } catch (err) {
            console.error('Authorization failed:', err);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 relative">
                <button
                    onClick={onDismiss}
                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="text-center space-y-6">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center">
                        <svg className="w-8 h-8 text-white" viewBox="0 0 39 44" fill="currentColor">
                            <path d="M19.8196726,13.1384615 C20.902953,13.1384615 22.2608678,12.406103 23.0695137,11.4296249 C23.8018722,10.5446917 24.3358837,9.30883662 24.3358837,8.07298156 C24.3358837,7.9051494 24.3206262,7.73731723 24.2901113,7.6 C23.0847711,7.64577241 21.6353115,8.4086459 20.7656357,9.43089638 C20.0790496,10.2090273 19.4534933,11.4296249 19.4534933,12.6807374 C19.4534933,12.8638271 19.4840083,13.0469167 19.4992657,13.1079466 C19.5755531,13.1232041 19.6976128,13.1384615 19.8196726,13.1384615 Z M16.0053051,31.6 C17.4852797,31.6 18.1413509,30.6082645 19.9875048,30.6082645 C21.8641736,30.6082645 22.2608678,31.5694851 23.923932,31.5694851 C25.5412238,31.5694851 26.6245041,30.074253 27.6467546,28.6095359 C28.7910648,26.9312142 29.2640464,25.2834075 29.2945613,25.2071202 C29.1877591,25.1766052 26.0904927,23.9102352 26.0904927,20.3552448 C26.0904927,17.2732359 28.5316879,15.8848061 28.6690051,15.7780038 C27.0517133,13.4588684 24.5952606,13.3978385 23.923932,13.3978385 C22.1082931,13.3978385 20.6283185,14.4963764 19.6976128,14.4963764 C18.6906198,14.4963764 17.36322,13.4588684 15.7917006,13.4588684 C12.8012365,13.4588684 9.765,15.9305785 9.765,20.5993643 C9.765,23.4982835 10.8940528,26.565035 12.2824825,28.548506 C13.4725652,30.2268277 14.5100731,31.6 16.0053051,31.6 Z" fillRule="nonzero" />
                        </svg>
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-xl font-semibold text-gray-900">Connect Apple Music</h2>
                        <p className="text-gray-500 text-sm">Link your Apple Music account to enable music playback and personalized recommendations.</p>
                    </div>

                    <div className="space-y-3 pt-2">
                        <button
                            onClick={handleLinkApple}
                            className="w-full h-12 rounded-xl bg-black text-white font-medium text-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-3"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 39 44" fill="currentColor">
                                <path d="M19.8196726,13.1384615 C20.902953,13.1384615 22.2608678,12.406103 23.0695137,11.4296249 C23.8018722,10.5446917 24.3358837,9.30883662 24.3358837,8.07298156 C24.3358837,7.9051494 24.3206262,7.73731723 24.2901113,7.6 C23.0847711,7.64577241 21.6353115,8.4086459 20.7656357,9.43089638 C20.0790496,10.2090273 19.4534933,11.4296249 19.4534933,12.6807374 C19.4534933,12.8638271 19.4840083,13.0469167 19.4992657,13.1079466 C19.5755531,13.1232041 19.6976128,13.1384615 19.8196726,13.1384615 Z M16.0053051,31.6 C17.4852797,31.6 18.1413509,30.6082645 19.9875048,30.6082645 C21.8641736,30.6082645 22.2608678,31.5694851 23.923932,31.5694851 C25.5412238,31.5694851 26.6245041,30.074253 27.6467546,28.6095359 C28.7910648,26.9312142 29.2640464,25.2834075 29.2945613,25.2071202 C29.1877591,25.1766052 26.0904927,23.9102352 26.0904927,20.3552448 C26.0904927,17.2732359 28.5316879,15.8848061 28.6690051,15.7780038 C27.0517133,13.4588684 24.5952606,13.3978385 23.923932,13.3978385 C22.1082931,13.3978385 20.6283185,14.4963764 19.6976128,14.4963764 C18.6906198,14.4963764 17.36322,13.4588684 15.7917006,13.4588684 9.765,15.9305785 9.765,20.5993643 C9.765,23.4982835 10.8940528,26.565035 12.2824825,28.548506 C13.4725652,30.2268277 14.5100731,31.6 16.0053051,31.6 Z" fillRule="nonzero" />
                            </svg>
                            Connect Apple Music
                        </button>

                        <button
                            onClick={onDismiss}
                            className="w-full h-10 text-gray-500 text-sm hover:text-gray-700 transition-colors"
                        >
                            Maybe Later
                        </button>
                    </div>

                    <p className="text-xs text-gray-400 leading-relaxed">
                        You can always connect later from settings.
                    </p>
                </div>
            </div>
        </div>
    );
};
