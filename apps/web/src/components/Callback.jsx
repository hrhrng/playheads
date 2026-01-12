import { useEffect, useRef } from 'react';
import { getToken } from '../utils/spotifyAuth';

export const Callback = () => {
    const called = useRef(false);

    useEffect(() => {
        if (called.current) return;
        called.current = true;

        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
            getToken(code).then(response => {
                if (response.access_token) {
                    localStorage.setItem('spotify_access_token', response.access_token);
                    window.location.href = '/';
                }
            });
        }
    }, []);

    return (
        <div className="min-h-screen bg-honey-50 flex items-center justify-center font-mono">
            <div className="border-4 border-honey-black p-8 bg-white shadow-[8px_8px_0px_#F4C430] flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-t-honey-900 border-r-honey-900 border-b-honey-400 border-l-honey-400 rounded-full animate-spin"></div>
                <div className="text-xl font-black uppercase text-honey-black">Authenticating</div>
            </div>
        </div>
    );
};
