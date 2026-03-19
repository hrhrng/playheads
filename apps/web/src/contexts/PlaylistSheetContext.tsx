import { createContext, useContext } from 'react';

interface PlaylistSheetContextValue {
  openPlaylist: () => void;
  hasPlaylist: boolean;
}

export const PlaylistSheetContext = createContext<PlaylistSheetContextValue>({
  openPlaylist: () => {},
  hasPlaylist: false,
});

export const usePlaylistSheet = () => useContext(PlaylistSheetContext);
