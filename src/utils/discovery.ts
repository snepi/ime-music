import type {
  FavoriteArtist,
  RecommendationItem,
  ArtistSummary,
  DiscoverySettings,
  WishlistItem,
  BlockedTrack,
  BlockedArtist,
  RecommendationsFilterMode,
  WavesSettings,
} from '../types';
import { splitArtists } from './artists';
import { DEFAULT_CHART_COUNTRY } from './chartCountries';

export const DEFAULT_WAVES: WavesSettings = {
  genre: 'all',
  language: 'any',
  mood: 'any',
  seed: 'taste',
  diversity: 'normal',
  skipKnown: true,
};

export const DEFAULT_DISCOVERY: DiscoverySettings = {
  filterMode: 'all',
  blockedArtists: [],
  blockedTracks: [],
  favoriteArtists: [],
  wishlist: [],
  chartCountry: DEFAULT_CHART_COUNTRY,
  waves: { ...DEFAULT_WAVES },
};

export function getWavesSettings(
  settings: { discovery?: DiscoverySettings } | null | undefined,
): WavesSettings {
  return { ...DEFAULT_WAVES, ...(getDiscovery(settings).waves || {}) };
}

export function artistBlockKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getDiscovery(settings: { discovery?: DiscoverySettings } | null | undefined): DiscoverySettings {
  const base = { ...DEFAULT_DISCOVERY, ...(settings?.discovery || {}) };
  return {
    ...base,
    waves: { ...DEFAULT_WAVES, ...(base.waves || {}) },
  };
}

export function toWishlistItem(item: RecommendationItem): WishlistItem {
  return {
    id: item.id,
    deezerId: item.deezerId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl,
    previewUrl: item.previewUrl,
    duration: item.duration,
    basedOnArtist: item.basedOnArtist,
    source: item.source,
    addedAt: Date.now(),
  };
}

export function toBlockedTrack(item: RecommendationItem): BlockedTrack {
  return {
    id: item.id,
    deezerId: item.deezerId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl,
    previewUrl: item.previewUrl,
    blockedAt: Date.now(),
  };
}

export function toBlockedArtist(name: string): BlockedArtist {
  const cleaned = String(name || '').trim();
  return {
    key: artistBlockKey(cleaned),
    name: cleaned,
    blockedAt: Date.now(),
  };
}

export function toFavoriteArtist(name: string, extra?: Partial<ArtistSummary>): FavoriteArtist {
  const cleaned = String(name || '').trim();
  return {
    key: artistBlockKey(cleaned),
    name: cleaned,
    deezerId: extra?.id ?? null,
    pictureUrl: extra?.pictureUrl ?? null,
    addedAt: Date.now(),
  };
}

export function isFavoriteArtist(
  settings: { discovery?: DiscoverySettings } | null | undefined,
  name: string,
): boolean {
  const key = artistBlockKey(name);
  return getDiscovery(settings).favoriteArtists.some((a) => a.key === key);
}

export function primaryArtistName(item: RecommendationItem): string {
  return splitArtists(item.artist)[0] || item.artist;
}

export const FILTER_LABELS: Record<RecommendationsFilterMode, string> = {
  all: 'Вся библиотека',
  liked: 'По избранному',
  current: 'По текущему треку',
  wishlist: 'По «Хочу послушать»',
  chart: 'Чарт',
};

export function platformSearchUrls(query: string): { id: string; label: string; url: string }[] {
  const q = encodeURIComponent(query);
  return [
    { id: 'deezer', label: 'Deezer', url: `https://www.deezer.com/search/${q}` },
    { id: 'youtube', label: 'YouTube', url: `https://www.youtube.com/results?search_query=${q}` },
    { id: 'spotify', label: 'Spotify', url: `https://open.spotify.com/search/${q}` },
    { id: 'yandex', label: 'Яндекс Музыка', url: `https://music.yandex.ru/search?text=${q}` },
  ];
}
