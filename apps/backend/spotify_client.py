import spotipy
from spotipy.oauth2 import SpotifyOAuth
import os

class SpotifyClient:
    def __init__(self):
        self.sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
            client_id=os.getenv("SPOTIPY_CLIENT_ID"),
            client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
            redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
            scope="user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private"
        ))

    def search_track(self, query: str, limit: int = 5):
        results = self.sp.search(q=query, limit=limit, type='track')
        tracks = results['tracks']['items']
        return [{"name": t['name'], "artist": t['artists'][0]['name'], "uri": t['uri']} for t in tracks]

    def play_track(self, uri: str):
        try:
            self.sp.start_playback(uris=[uri])
            return f"Started playing {uri}"
        except Exception as e:
            return f"Error playing track: {str(e)}"
    
    def add_to_queue(self, uri: str):
        try:
            self.sp.add_to_queue(uri)
            return f"Added {uri} to queue"
        except Exception as e:
            return f"Error adding to queue: {str(e)}"
