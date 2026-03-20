/**
 * Tests for detectPlaylistUrl — lightweight URL detection for playlist chips.
 */
import { describe, it, expect } from 'vitest';
import { detectPlaylistUrl, PLATFORM_COLORS } from '../playlistUrl';

describe('detectPlaylistUrl', () => {
  // ── Apple Music ──
  describe('Apple Music', () => {
    it('detects standard Apple Music playlist URL', () => {
      const result = detectPlaylistUrl(
        'https://music.apple.com/cn/playlist/some-name/pl.abc123def'
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('apple_music');
      expect(result!.displayName).toBe('Apple Music');
      expect(result!.url).toContain('music.apple.com');
    });

    it('detects Apple Music URL embedded in text', () => {
      const result = detectPlaylistUrl(
        '帮我加载这个歌单 https://music.apple.com/us/playlist/top-100/pl.xyz 谢谢'
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('apple_music');
    });
  });

  // ── Spotify ──
  describe('Spotify', () => {
    it('detects standard Spotify playlist URL', () => {
      const result = detectPlaylistUrl(
        'https://open.spotify.com/playlist/37i9dQZEVXd9As9cbyWkCC'
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('spotify');
      expect(result!.displayName).toBe('Spotify');
    });

    it('detects Spotify URL with tracking params', () => {
      const result = detectPlaylistUrl(
        'https://open.spotify.com/playlist/37i9dQZEVXd9As9cbyWkCC?si=abc&nd=1&dlsi=xyz'
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('spotify');
    });

    it('does not match non-playlist Spotify URLs', () => {
      const result = detectPlaylistUrl(
        'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh'
      );
      expect(result).toBeNull();
    });
  });

  // ── NetEase Cloud Music ──
  describe('NetEase', () => {
    it('detects hash-based NetEase URL', () => {
      const result = detectPlaylistUrl(
        'https://music.163.com/#/playlist?id=123456789'
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('netease');
      expect(result!.displayName).toBe('网易云音乐');
    });

    it('detects direct NetEase URL', () => {
      const result = detectPlaylistUrl(
        'https://music.163.com/playlist?id=987654321'
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('netease');
    });
  });

  // ── QQ Music ──
  describe('QQ Music', () => {
    it('detects QQ Music playlist URL', () => {
      const result = detectPlaylistUrl(
        'https://y.qq.com/n/ryqq/playlist/1234567890'
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('qqmusic');
      expect(result!.displayName).toBe('QQ音乐');
    });
  });

  // ── 汽水音乐 / Resso ──
  describe('Resso / 汽水音乐', () => {
    it('detects Resso short link', () => {
      const result = detectPlaylistUrl(
        'https://qishui.douyin.com/s/ixRD36co/'
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('resso');
      expect(result!.displayName).toBe('汽水音乐');
    });
  });

  // ── Negative cases ──
  describe('unsupported / no URL', () => {
    it('returns null for plain text', () => {
      expect(detectPlaylistUrl('hello world')).toBeNull();
    });

    it('returns null for unrelated URL', () => {
      expect(detectPlaylistUrl('https://example.com/page')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectPlaylistUrl('')).toBeNull();
    });

    it('returns null for YouTube URL', () => {
      expect(detectPlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });
  });
});

describe('PLATFORM_COLORS', () => {
  it('has colors for all supported platforms', () => {
    expect(PLATFORM_COLORS.apple_music).toBeDefined();
    expect(PLATFORM_COLORS.spotify).toBeDefined();
    expect(PLATFORM_COLORS.netease).toBeDefined();
    expect(PLATFORM_COLORS.qqmusic).toBeDefined();
    expect(PLATFORM_COLORS.resso).toBeDefined();
  });
});
