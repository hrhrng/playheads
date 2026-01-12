const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID; // Need to set this
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || "http://localhost:5173/callback";

export const generateRandomString = (length) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

export const generateCodeChallenge = async (codeVerifier) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
};

export const loginWithSpotify = async () => {
    const codeVerifier = generateRandomString(128);
    const challenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(16);

    localStorage.setItem('code_verifier', codeVerifier);

    const scope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private streaming user-read-email user-read-private';

    const args = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI,
        state: state,
        code_challenge_method: 'S256',
        code_challenge: challenge
    });

    window.location.href = 'https://accounts.spotify.com/authorize?' + args;
};

export const getToken = async (code) => {
    const codeVerifier = localStorage.getItem('code_verifier');

    const payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
        }),
    };

    const response = await fetch('https://accounts.spotify.com/api/token', payload);
    return await response.json();
};
