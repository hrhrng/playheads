# Apple Music Kit Backend API

This backend provides Apple Music developer token generation and a small proxy for Apple Music API calls.

## 1) Environment Setup

Add the following to `apps/backend/.env` (or your production env):

```bash
APPLE_MUSIC_TEAM_ID=YOUR_TEAM_ID
APPLE_MUSIC_KEY_ID=YOUR_KEY_ID
APPLE_MUSIC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_XXXXXX.p8
# or inline PEM content (use \n for newlines)
APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APPLE_MUSIC_TOKEN_TTL_SECONDS=3600
```

Notes:
- `APPLE_MUSIC_TOKEN_TTL_SECONDS` is capped at 6 months (Apple limit).
- If both `APPLE_MUSIC_PRIVATE_KEY` and `APPLE_MUSIC_PRIVATE_KEY_PATH` are set, the inline value wins.

## 2) Developer Token Endpoint

`GET /apple-music/developer-token`

Response:

```json
{
  "token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ij...",
  "expires_at": 1730000000
}
```

## 3) Catalog APIs (No User Token Required)

These proxy to the Apple Music catalog API using your developer token.

### Search

`GET /apple-music/catalog/search?term=daft+punk&types=songs&storefront=us&limit=10&offset=0`

### Song

`GET /apple-music/catalog/songs/{song_id}?storefront=us`

### Album

`GET /apple-music/catalog/albums/{album_id}?storefront=us`

### Playlist

`GET /apple-music/catalog/playlists/{playlist_id}?storefront=us`

## 4) User Storefront (Requires Music-User-Token)

`GET /apple-music/me/storefront`

Headers:

```
Authorization: (handled server-side)
Music-User-Token: <token from MusicKit.authorize()>
```

Response includes the user's storefront (e.g. `us`, `cn`, `jp`).

## 5) MusicKit JS Integration

Current frontend uses `VITE_APPLE_DEVELOPER_TOKEN`. You can replace that with a fetch to the backend:

```js
const response = await fetch('http://localhost:8000/apple-music/developer-token');
const { token } = await response.json();
const mk = await window.MusicKit.configure({
  developerToken: token,
  app: { name: 'Playhead', build: '1.0.0' },
});
```

## 6) Common Errors

- 401 / 403 from Apple Music API: invalid developer token or expired key.
- 400 on `/apple-music/me/storefront`: missing `Music-User-Token` header.
