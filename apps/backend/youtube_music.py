"""
YouTube Music playlist extraction.

Uses ytmusicapi (unofficial reverse-engineered YTM client) to fetch
public playlists without requiring any API key. For private playlists
the caller must supply a YTM cookie header string via the env var
YTMUSIC_AUTH_HEADERS (JSON exported from ytmusicapi setup_oauth or
setup_headers_raw).
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

from fastapi import APIRouter, HTTPException

log = logging.getLogger("playhead.ytmusic")

router = APIRouter(prefix="/youtube-music", tags=["youtube-music"])


def _get_ytm():
    """Return an authenticated or anonymous YTMusic instance."""
    from ytmusicapi import YTMusic

    raw = os.getenv("YTMUSIC_AUTH_HEADERS")
    if raw:
        try:
            headers = json.loads(raw)
            return YTMusic(auth=headers)
        except Exception as exc:
            log.warning("YTMUSIC_AUTH_HEADERS invalid, falling back to anonymous: %s", exc)

    return YTMusic()


def _extract_playlist_id(url: str) -> str:
    """
    Pull the playlist ID out of a YouTube Music URL.

    Supported forms:
      https://music.youtube.com/playlist?list=PLxxxxxxxx
      https://music.youtube.com/watch?v=xxx&list=PLxxxxxxxx
    """
    match = re.search(r"[?&]list=([A-Za-z0-9_-]+)", url)
    if not match:
        raise ValueError(f"Could not find a playlist ID in URL: {url}")
    return match.group(1)


def _normalise_track(item: dict) -> Optional[dict]:
    """Convert a ytmusicapi playlist item to our standard track shape."""
    video_id = item.get("videoId")
    if not video_id:
        return None

    title = item.get("title") or "Unknown"

    artists = item.get("artists") or []
    artist = ", ".join(a.get("name", "") for a in artists if a.get("name")) or "Unknown Artist"

    album_obj = item.get("album") or {}
    album = album_obj.get("name") if isinstance(album_obj, dict) else None

    thumbnails = item.get("thumbnails") or []
    artwork_url = thumbnails[-1].get("url") if thumbnails else None

    duration_secs: Optional[float] = None
    dur = item.get("duration")
    if isinstance(dur, str):
        parts = dur.split(":")
        try:
            if len(parts) == 2:
                duration_secs = int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                duration_secs = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        except ValueError:
            pass
    elif isinstance(dur, (int, float)):
        duration_secs = float(dur)

    return {
        "id": video_id,
        "name": title,
        "artist": artist,
        "album": album,
        "artwork_url": artwork_url,
        "duration": duration_secs,
        "source": "youtube_music",
    }


@router.get("/playlist")
async def get_playlist(url: str):
    """
    Fetch a YouTube Music playlist by URL and return a normalised track list.

    Query param:
      url — full music.youtube.com playlist URL
    """
    try:
        playlist_id = _extract_playlist_id(url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        ytm = _get_ytm()
        # limit=None fetches all tracks (ytmusicapi handles pagination internally)
        data = ytm.get_playlist(playlist_id, limit=None)
    except Exception as exc:
        log.error("YTMusic.get_playlist failed for %s: %s", playlist_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch YouTube Music playlist: {exc}")

    tracks_raw = data.get("tracks") or []
    tracks = [t for item in tracks_raw if (t := _normalise_track(item)) is not None]

    return {
        "id": playlist_id,
        "title": data.get("title") or "YouTube Music Playlist",
        "description": data.get("description"),
        "track_count": len(tracks),
        "tracks": tracks,
        "source": "youtube_music",
    }
