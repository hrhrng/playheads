"""
Apple Music API helpers and routes.
"""
from __future__ import annotations

import os
import time
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, Header, HTTPException

APPLE_MUSIC_API_BASE = "https://api.music.apple.com"
APPLE_MUSIC_TOKEN_MAX_TTL_SECONDS = 60 * 60 * 24 * 180  # 6 months

router = APIRouter(prefix="/apple-music", tags=["apple-music"])

_token_cache: dict[str, int | str] = {}


def _load_private_key() -> str:
    key_pem = os.getenv("APPLE_MUSIC_PRIVATE_KEY")
    key_path = os.getenv("APPLE_MUSIC_PRIVATE_KEY_PATH")

    if key_pem:
        return key_pem.replace("\\n", "\n").strip()

    if key_path:
        try:
            with open(key_path, "r", encoding="utf-8") as handle:
                return handle.read().strip()
        except OSError as exc:
            raise RuntimeError(f"Failed to read APPLE_MUSIC_PRIVATE_KEY_PATH: {exc}") from exc

    raise RuntimeError("APPLE_MUSIC_PRIVATE_KEY or APPLE_MUSIC_PRIVATE_KEY_PATH is required")


def _generate_developer_token() -> tuple[str, int]:
    team_id = os.getenv("APPLE_MUSIC_TEAM_ID")
    key_id = os.getenv("APPLE_MUSIC_KEY_ID")
    ttl_seconds = int(os.getenv("APPLE_MUSIC_TOKEN_TTL_SECONDS", "3600"))

    if not team_id or not key_id:
        raise RuntimeError("APPLE_MUSIC_TEAM_ID and APPLE_MUSIC_KEY_ID are required")

    ttl_seconds = min(max(ttl_seconds, 60), APPLE_MUSIC_TOKEN_MAX_TTL_SECONDS)
    now = int(time.time())
    expires_at = now + ttl_seconds

    payload = {
        "iss": team_id,
        "iat": now,
        "exp": expires_at,
    }
    headers = {"alg": "ES256", "kid": key_id}

    private_key = _load_private_key()
    token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
    return token, expires_at


def get_developer_token() -> tuple[str, int]:
    cached_token = _token_cache.get("token")
    cached_exp = _token_cache.get("exp")
    now = int(time.time())

    if cached_token and cached_exp and now < int(cached_exp) - 60:
        return str(cached_token), int(cached_exp)

    token, exp = _generate_developer_token()
    _token_cache["token"] = token
    _token_cache["exp"] = exp
    return token, exp


def _build_headers(user_token: Optional[str] = None) -> dict[str, str]:
    token, _ = get_developer_token()
    headers = {"Authorization": f"Bearer {token}"}
    if user_token:
        headers["Music-User-Token"] = user_token
    return headers


async def _apple_music_get(
    path: str,
    params: Optional[dict[str, str | int]] = None,
    user_token: Optional[str] = None,
) -> dict:
    url = f"{APPLE_MUSIC_API_BASE}/{path.lstrip('/')}"
    headers = _build_headers(user_token=user_token)
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, headers=headers, params=params)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()


@router.get("/developer-token")
async def developer_token():
    """Return a signed Apple Music developer token."""
    try:
        token, exp = get_developer_token()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"token": token, "expires_at": exp}


@router.get("/catalog/search")
async def catalog_search(
    term: str,
    types: str = "songs",
    storefront: str = "us",
    limit: int = 10,
    offset: int = 0,
):
    """Search the Apple Music catalog."""
    params = {
        "term": term,
        "types": types,
        "limit": limit,
        "offset": offset,
    }
    return await _apple_music_get(f"v1/catalog/{storefront}/search", params=params)


@router.get("/catalog/songs/{song_id}")
async def catalog_song(song_id: str, storefront: str = "us"):
    """Fetch a song by catalog ID."""
    return await _apple_music_get(f"v1/catalog/{storefront}/songs/{song_id}")


@router.get("/catalog/albums/{album_id}")
async def catalog_album(album_id: str, storefront: str = "us"):
    """Fetch an album by catalog ID."""
    return await _apple_music_get(f"v1/catalog/{storefront}/albums/{album_id}")


@router.get("/catalog/playlists/{playlist_id}")
async def catalog_playlist(playlist_id: str, storefront: str = "us"):
    """Fetch a playlist by catalog ID."""
    return await _apple_music_get(f"v1/catalog/{storefront}/playlists/{playlist_id}")


@router.get("/me/storefront")
async def user_storefront(music_user_token: Optional[str] = Header(default=None, alias="Music-User-Token")):
    """Get the user's storefront based on their Music-User-Token."""
    if not music_user_token:
        raise HTTPException(status_code=400, detail="Music-User-Token header is required")
    return await _apple_music_get("v1/me/storefront", user_token=music_user_token)
