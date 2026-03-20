import { createContext, useContext } from 'react';

interface PlaylistSheetContextValue {
  openPlaylist: () => void;
  hasPlaylist: boolean;
  /** True when PlaylistSidebar is rendered inside the mobile bottom sheet */
  isMobileSheet: boolean;
}

export const PlaylistSheetContext = createContext<PlaylistSheetContextValue>({
  openPlaylist: () => {},
  hasPlaylist: false,
  isMobileSheet: false,
});

export const usePlaylistSheet = () => useContext(PlaylistSheetContext);
