import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type {
  Song,
  Playlist,
  AppSettings,
  ViewType,
  QueueItem,
  RecommendationItem,
  RepeatMode,
  SleepTimerMode,
} from '../types';
import { DEFAULT_APPEARANCE, DEFAULT_HOTKEYS } from '../appearance/schema';
import { resolvePreviewUrl } from '../utils/preview';
import { toFileUrl, getCoverSrc } from '../utils/media';
import { createPlaybackGraph, type PlaybackGraph } from '../utils/audioGraph';
import { DEFAULT_PLAYBACK, getPlayback, sameAlbum } from '../utils/playbackSettings';

function shuffleIds(ids: string[], keepFirst?: string): string[] {
  const rest = ids.filter((id) => id !== keepFirst);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return keepFirst ? [keepFirst, ...rest] : rest;
}

export type PlaybackErrorKind = 'missing' | 'decode' | 'ffmpeg' | 'unknown' | null;

interface PlayerState {
  songs: Song[];
  playlists: Playlist[];
  settings: AppSettings;
  currentView: ViewType;
  currentSongId: string | null;
  fallbackIds: string[];
  fallbackIndex: number;
  playbackQueue: QueueItem[];
  isPlaying: boolean;
  currentTime: number;
  loading: boolean;
  muted: boolean;
  playbackError: PlaybackErrorKind;
  playbackErrorMessage: string | null;
  isSeeking: boolean;
  /** Official ~30s Deezer demo from Recommendations */
  previewItem: RecommendationItem | null;
  previewPlaying: boolean;
  previewTime: number;
  previewError: string | null;
  sleepMode: SleepTimerMode;
  sleepEndsAt: number | null;
  /** IMe Waves endless recommendation radio */
  wavesActive: boolean;
}

type Action =
  | { type: 'SET_LIBRARY'; songs: Song[]; playlists: Playlist[]; settings: AppSettings }
  | { type: 'SET_VIEW'; view: ViewType }
  | { type: 'UPDATE_SONG'; song: Song }
  | { type: 'REMOVE_SONG'; id: string }
  | { type: 'ADD_PLAYLIST'; playlist: Playlist }
  | { type: 'UPDATE_PLAYLIST'; playlist: Playlist }
  | { type: 'DELETE_PLAYLIST'; id: string }
  | { type: 'UPDATE_SETTINGS'; settings: AppSettings }
  | { type: 'SET_PLAYBACK_QUEUE'; items: QueueItem[] }
  | {
      type: 'SET_TRACK';
      songId: string;
      fallbackIds?: string[];
      fallbackIndex?: number;
      resumeTime?: number;
    }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_TIME'; time: number }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_SEEKING'; isSeeking: boolean }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'SET_ERROR'; kind: PlaybackErrorKind; message: string | null }
  | {
      type: 'RESTORE_PLAYBACK';
      songId: string | null;
      time: number;
      fallbackIds: string[];
      fallbackIndex: number;
    }
  | { type: 'STOP' }
  | { type: 'SET_PREVIEW'; item: RecommendationItem | null; playing?: boolean }
  | { type: 'SET_PREVIEW_PLAYING'; playing: boolean }
  | { type: 'SET_PREVIEW_TIME'; time: number }
  | { type: 'SET_PREVIEW_ERROR'; message: string | null }
  | { type: 'CLEAR_PREVIEW_ERROR' }
  | { type: 'SET_SLEEP'; mode: SleepTimerMode; endsAt: number | null }
  | { type: 'SET_WAVES_ACTIVE'; active: boolean };

const initialSettings: AppSettings = {
  ffmpegPath: '',
  ytdlpPath: '',
  ytdlpProxy: '',
  sortBy: 'title',
  sortOrder: 'asc',
  globalVolume: 0.8,
  muted: false,
  theme: 'dark',
  locale: 'ru',
  appearance: DEFAULT_APPEARANCE,
  hotkeys: DEFAULT_HOTKEYS,
  uiPresets: [],
  playback: { ...DEFAULT_PLAYBACK },
};

function reducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case 'SET_LIBRARY':
      return {
        ...state,
        songs: action.songs,
        playlists: action.playlists,
        settings: action.settings,
        muted: Boolean(action.settings.muted),
      };
    case 'SET_VIEW':
      return { ...state, currentView: action.view };
    case 'UPDATE_SONG':
      return { ...state, songs: state.songs.map((s) => (s.id === action.song.id ? action.song : s)) };
    case 'REMOVE_SONG':
      return {
        ...state,
        songs: state.songs.filter((s) => s.id !== action.id),
        playbackQueue: state.playbackQueue.filter((q) => q.trackId !== action.id),
        fallbackIds: state.fallbackIds.filter((id) => id !== action.id),
        currentSongId: state.currentSongId === action.id ? null : state.currentSongId,
        isPlaying: state.currentSongId === action.id ? false : state.isPlaying,
        playbackError: state.currentSongId === action.id ? null : state.playbackError,
        playbackErrorMessage: state.currentSongId === action.id ? null : state.playbackErrorMessage,
      };
    case 'ADD_PLAYLIST':
      return { ...state, playlists: [...state.playlists, action.playlist] };
    case 'UPDATE_PLAYLIST':
      return {
        ...state,
        playlists: state.playlists.map((p) => (p.id === action.playlist.id ? action.playlist : p)),
      };
    case 'DELETE_PLAYLIST':
      return { ...state, playlists: state.playlists.filter((p) => p.id !== action.id) };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: action.settings, muted: Boolean(action.settings.muted) };
    case 'SET_PLAYBACK_QUEUE':
      return { ...state, playbackQueue: action.items };
    case 'SET_TRACK':
      return {
        ...state,
        currentSongId: action.songId,
        fallbackIds: action.fallbackIds ?? state.fallbackIds,
        fallbackIndex:
          action.fallbackIndex ??
          (action.fallbackIds ?? state.fallbackIds).indexOf(action.songId),
        currentTime: action.resumeTime ?? 0,
        playbackError: null,
        playbackErrorMessage: null,
        previewItem: null,
        previewPlaying: false,
        previewTime: 0,
      };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying };
    case 'SET_TIME':
      return { ...state, currentTime: action.time };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_SEEKING':
      return { ...state, isSeeking: action.isSeeking };
    case 'SET_MUTED':
      return { ...state, muted: action.muted };
    case 'SET_ERROR':
      return {
        ...state,
        playbackError: action.kind,
        playbackErrorMessage: action.message,
        isPlaying: action.kind ? false : state.isPlaying,
        loading: action.kind ? false : state.loading,
      };
    case 'RESTORE_PLAYBACK':
      return {
        ...state,
        currentSongId: action.songId,
        currentTime: action.time,
        fallbackIds: action.fallbackIds,
        fallbackIndex: action.fallbackIndex,
        isPlaying: false,
      };
    case 'STOP':
      return {
        ...state,
        isPlaying: false,
        currentTime: 0,
        previewItem: null,
        previewPlaying: false,
        previewTime: 0,
        wavesActive: false,
      };
    case 'SET_PREVIEW':
      return {
        ...state,
        previewItem: action.item,
        previewPlaying: action.item ? Boolean(action.playing) : false,
        previewTime: 0,
        previewError: action.item ? null : state.previewError,
      };
    case 'SET_PREVIEW_PLAYING':
      return { ...state, previewPlaying: action.playing };
    case 'SET_PREVIEW_TIME':
      return { ...state, previewTime: action.time };
    case 'SET_PREVIEW_ERROR':
      return { ...state, previewError: action.message };
    case 'CLEAR_PREVIEW_ERROR':
      return { ...state, previewError: null };
    case 'SET_SLEEP':
      return { ...state, sleepMode: action.mode, sleepEndsAt: action.endsAt };
    case 'SET_WAVES_ACTIVE':
      return { ...state, wavesActive: action.active };
    default:
      return state;
  }
}

interface PlayerContextValue {
  state: PlayerState;
  dispatch: React.Dispatch<Action>;
  getVisibleSongs: () => Song[];
  playNow: (songId: string) => void;
  playSong: (songId: string) => void;
  togglePlayPause: () => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => Promise<void>;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleLike: (songId: string) => Promise<void>;
  toggleMute: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  refreshPlaybackQueue: () => Promise<void>;
  addToQueue: (trackId: string) => Promise<void>;
  addToQueueNext: (trackId: string) => Promise<void>;
  removeFromQueue: (queueRowId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  reorderQueue: (orderedQueueRowIds: string[]) => Promise<void>;
  seek: (time: number) => void;
  removeMissingCurrent: () => Promise<void>;
  clearPlaybackError: () => void;
  playPreview: (item: RecommendationItem) => Promise<void>;
  stopPreview: () => void;
  togglePreview: (item: RecommendationItem) => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeat: () => Promise<void>;
  queueSimilarNext: () => Promise<number>;
  startLibraryMix: () => Promise<number>;
  startImeWaves: (opts?: { force?: boolean }) => Promise<number>;
  stopImeWaves: () => void;
  setSleepTimer: (mode: SleepTimerMode, minutes?: number) => void;
  clearSleepTimer: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function sortSongs(songs: Song[], settings: AppSettings): Song[] {
  const sorted = [...songs];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (settings.sortBy === 'title') {
      cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    } else if (settings.sortBy === 'dateAdded') {
      cmp = a.dateAdded - b.dateAdded;
    } else {
      cmp = a.dateModified - b.dateModified;
    }
    return settings.sortOrder === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

function debugPlayback(action: string, detail?: Record<string, unknown>) {
  void window.imeMusic?.logError?.(
    'playback',
    action,
    detail ? JSON.stringify(detail) : undefined,
  );
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    songs: [],
    playlists: [],
    settings: initialSettings,
    currentView: { kind: 'home' },
    currentSongId: null,
    fallbackIds: [],
    fallbackIndex: 0,
    playbackQueue: [],
    isPlaying: false,
    currentTime: 0,
    loading: true,
    muted: false,
    playbackError: null,
    playbackErrorMessage: null,
    isSeeking: false,
    previewItem: null,
    previewPlaying: false,
    previewTime: 0,
    previewError: null,
    sleepMode: 'off',
    sleepEndsAt: null,
    wavesActive: false,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<PlaybackGraph | null>(null);
  const listenRecordedForRef = useRef<string | null>(null);
  const radioModeRef = useRef(false);
  const radioRecentRef = useRef<string[]>([]);
  const wavesActiveRef = useRef(false);
  const wavesQueueRef = useRef<RecommendationItem[]>([]);
  const wavesIndexRef = useRef(0);
  const advanceWavesRef = useRef<(opts?: { manual?: boolean; delta?: number }) => Promise<void>>(
    async () => undefined,
  );
  const operationIdRef = useRef(0);
  const transitionInProgressRef = useRef(false);
  const loadedTrackIdRef = useRef<string | null>(null);
  const shouldAutoPlayRef = useRef(false);
  const resumeTimeRef = useRef(0);
  const restoredRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadingRef = useRef(false);
  const crossfadeArmedRef = useRef(false);
  const sleepStopAfterRef = useRef(false);
  const sleepAlbumRef = useRef(false);
  const nowPlayingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNowPlayingSongRef = useRef<string | null>(null);
  const lastNowPlayingPlayingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const targetVolume = useCallback(() => {
    const s = stateRef.current;
    const song = s.songs.find((x) => x.id === s.currentSongId);
    return s.muted ? 0 : s.settings.globalVolume * (song?.volume ?? 1);
  }, []);

  const applyOutputGain = useCallback(() => {
    if (fadingRef.current) return;
    const vol = targetVolume();
    const graph = graphRef.current;
    const audio = audioRef.current;
    if (graph) {
      if (audio) audio.volume = 1;
      graph.setOutputGain(vol);
    } else if (audio) {
      audio.volume = Math.min(1, Math.max(0, vol));
      audio.muted = stateRef.current.muted;
    }
  }, [targetVolume]);

  const clearSleepInternal = useCallback(() => {
    sleepStopAfterRef.current = false;
    sleepAlbumRef.current = false;
    dispatch({ type: 'SET_SLEEP', mode: 'off', endsAt: null });
  }, []);

  const setSleepTimer = useCallback((mode: SleepTimerMode, minutes = 30) => {
    if (mode === 'off') {
      clearSleepInternal();
      return;
    }
    sleepStopAfterRef.current = mode === 'endOfTrack';
    sleepAlbumRef.current = mode === 'endOfAlbum';
    const endsAt = mode === 'minutes' ? Date.now() + Math.max(1, minutes) * 60_000 : null;
    if (mode === 'minutes') {
      sleepStopAfterRef.current = false;
    }
    dispatch({ type: 'SET_SLEEP', mode, endsAt });
  }, [clearSleepInternal]);

  const clearSleepTimer = useCallback(() => {
    clearSleepInternal();
  }, [clearSleepInternal]);

  const recordListenIfNeeded = useCallback(async (songId: string, force = false) => {
    if (!songId || !window.imeMusic?.recordListen) return;
    if (!force && listenRecordedForRef.current === songId) return;
    listenRecordedForRef.current = songId;
    try {
      const updated = await window.imeMusic.recordListen(songId);
      if (updated) dispatch({ type: 'UPDATE_SONG', song: updated });
      void window.imeMusic.scrobbleTrack?.(songId);
    } catch {
      /* ignore */
    }
  }, []);

  const bumpOperation = useCallback((reason: string) => {
    operationIdRef.current += 1;
    debugPlayback(reason, { operationId: operationIdRef.current });
    return operationIdRef.current;
  }, []);

  const refreshPlaybackQueue = useCallback(async () => {
    if (!window.imeMusic?.getQueue) return;
    const items = await window.imeMusic.getQueue();
    dispatch({ type: 'SET_PLAYBACK_QUEUE', items });
  }, []);

  const refreshLibrary = useCallback(async () => {
    if (!window.imeMusic) {
      dispatch({ type: 'SET_LOADING', loading: false });
      return;
    }
    const data = await window.imeMusic.getLibrary();
    dispatch({ type: 'SET_LIBRARY', songs: data.songs, playlists: data.playlists, settings: data.settings });
    await refreshPlaybackQueue();

    if (!restoredRef.current) {
      restoredRef.current = true;
      const s = data.settings;
      const appearance = s.appearance || DEFAULT_APPEARANCE;
      const behavior = appearance.behavior || DEFAULT_APPEARANCE.behavior;

      let startView: ViewType = { kind: 'home' };
      if (behavior.restoreLastPage && s.lastView && typeof s.lastView === 'object' && s.lastView.kind) {
        startView = s.lastView as ViewType;
      } else if (behavior.startView === 'liked') {
        startView = { kind: 'liked' };
      } else if (behavior.startView === 'all') {
        startView = { kind: 'all' };
      } else if (behavior.startView === 'home' || behavior.startView === 'last') {
        startView =
          behavior.startView === 'last' && s.lastView?.kind
            ? (s.lastView as ViewType)
            : { kind: 'home' };
      }
      if (startView.kind === 'playlist') {
        const playlistId = startView.id;
        const exists = data.playlists.some((p) => p.id === playlistId);
        if (!exists) startView = { kind: 'home' };
      }
      dispatch({ type: 'SET_VIEW', view: startView });

      const songId = s.playbackSongId ?? null;
      if (behavior.restoreTrack !== false && songId && data.songs.some((song) => song.id === songId)) {
        const fallbackIds = data.songs.map((song) => song.id);
        const fallbackIndex = Math.max(0, fallbackIds.indexOf(songId));
        resumeTimeRef.current = Number(s.playbackTime) || 0;
        shouldAutoPlayRef.current = Boolean(behavior.autoResumeOnLaunch);
        loadedTrackIdRef.current = null;
        dispatch({
          type: 'RESTORE_PLAYBACK',
          songId,
          time: resumeTimeRef.current,
          fallbackIds,
          fallbackIndex,
        });
      }
    }

    dispatch({ type: 'SET_LOADING', loading: false });
  }, [refreshPlaybackQueue]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const persistPlayback = useCallback(() => {
    if (!window.imeMusic) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const s = stateRef.current;
      void window.imeMusic.updateSettings({
        playbackSongId: s.currentSongId,
        playbackTime: s.currentTime,
        muted: s.muted,
        globalVolume: s.settings.globalVolume,
      });
    }, 500);
  }, []);

  useEffect(() => {
    if (state.loading) return;
    persistPlayback();
  }, [state.currentSongId, state.currentTime, state.muted, state.settings.globalVolume, state.loading, persistPlayback]);

  const getVisibleSongs = useCallback((): Song[] => {
    let filtered = state.songs;
    if (state.currentView.kind === 'liked') {
      filtered = state.songs.filter((s) => s.liked);
    } else if (state.currentView.kind === 'playlist') {
      const view = state.currentView;
      const pl = state.playlists.find((p) => p.id === view.id);
      if (pl) {
        filtered = pl.songIds
          .map((sid: string) => state.songs.find((s) => s.id === sid))
          .filter(Boolean) as Song[];
      } else filtered = [];
    }
    return sortSongs(filtered, state.settings);
  }, [state.songs, state.playlists, state.currentView, state.settings]);

  const setTrack = useCallback(
    (songId: string, opts?: { fallbackIds?: string[]; fallbackIndex?: number; resumeTime?: number; autoPlay?: boolean }) => {
      if (!opts?.fallbackIds) {
        radioModeRef.current = false;
      }
      // Switching to a local library track stops IMe Waves
      if (wavesActiveRef.current) {
        wavesActiveRef.current = false;
        wavesQueueRef.current = [];
        wavesIndexRef.current = 0;
        dispatch({ type: 'SET_WAVES_ACTIVE', active: false });
      }
      const visible = getVisibleSongs();
      let fallbackIds = opts?.fallbackIds ?? visible.map((s) => s.id);
      const playback = getPlayback(stateRef.current.settings);
      if (playback.shuffle && !opts?.fallbackIds) {
        fallbackIds = shuffleIds(fallbackIds, songId);
      }
      const fallbackIndex = opts?.fallbackIndex ?? Math.max(0, fallbackIds.indexOf(songId));
      resumeTimeRef.current = opts?.resumeTime ?? 0;
      shouldAutoPlayRef.current = opts?.autoPlay ?? true;
      loadedTrackIdRef.current = null;
      listenRecordedForRef.current = null;
      dispatch({
        type: 'SET_TRACK',
        songId,
        fallbackIds,
        fallbackIndex,
        resumeTime: resumeTimeRef.current,
      });
      debugPlayback('setTrack', { songId, autoPlay: shouldAutoPlayRef.current, operationId: operationIdRef.current });
    },
    [getVisibleSongs],
  );

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    debugPlayback('pause()', { operationId: operationIdRef.current });
    audio.pause();
  }, []);

  const stopPreview = useCallback(() => {
    const preview = previewAudioRef.current;
    if (preview) {
      preview.pause();
      preview.removeAttribute('src');
      preview.load();
    }
    dispatch({ type: 'SET_PREVIEW', item: null });
  }, []);

  const stopImeWaves = useCallback(() => {
    wavesActiveRef.current = false;
    wavesQueueRef.current = [];
    wavesIndexRef.current = 0;
    dispatch({ type: 'SET_WAVES_ACTIVE', active: false });
    stopPreview();
  }, [stopPreview]);

  const playPreview = useCallback(
    async (item: RecommendationItem) => {
      const preview = previewAudioRef.current;
      if (!preview) return;

      pause();
      dispatch({ type: 'SET_PLAYING', isPlaying: false });

      const previewUrl = await resolvePreviewUrl(item);
      if (!previewUrl) {
        dispatch({ type: 'SET_PREVIEW_ERROR', message: 'unavailable' });
        if (wavesActiveRef.current) {
          void advanceWavesRef.current({ manual: true, delta: 1 });
        }
        return;
      }

      try {
        preview.pause();
        preview.src = previewUrl;
        preview.muted = stateRef.current.muted;
        preview.volume = Math.min(1, Math.max(0, stateRef.current.settings.globalVolume));
        dispatch({ type: 'SET_PREVIEW', item, playing: true });
        await preview.play();
        dispatch({ type: 'SET_PREVIEW_PLAYING', playing: true });
      } catch {
        dispatch({ type: 'SET_PREVIEW', item: null });
        dispatch({ type: 'SET_PREVIEW_ERROR', message: 'unavailable' });
        if (wavesActiveRef.current) {
          void advanceWavesRef.current({ manual: true, delta: 1 });
        }
      }
    },
    [pause],
  );

  const advanceWaves = useCallback(
    async (opts?: { manual?: boolean; delta?: number }) => {
      if (!wavesActiveRef.current) return;
      const delta = opts?.delta ?? 1;
      let next = wavesIndexRef.current + delta;
      const queue = wavesQueueRef.current;

      if (next < 0) {
        next = 0;
      }

      // Near the end — reshuffle / refetch
      if (next >= queue.length - 3) {
        try {
          const res = await window.imeMusic.getWavesPool?.({ force: next >= queue.length });
          const fresh = (res?.items || []).filter((item) => item?.previewUrl);
          if (fresh.length) {
            const seen = new Set(queue.map((q) => q.id));
            const extras = fresh.filter((item) => !seen.has(item.id));
            if (extras.length) {
              wavesQueueRef.current = [...queue, ...extras];
            } else if (next >= queue.length) {
              wavesQueueRef.current = fresh;
              next = 0;
            }
          } else if (next >= queue.length && queue.length) {
            next = 0;
          }
        } catch {
          if (next >= queue.length && queue.length) next = 0;
        }
      }

      const activeQueue = wavesQueueRef.current;
      if (!activeQueue.length) {
        stopImeWaves();
        return;
      }
      if (next >= activeQueue.length) next = 0;
      wavesIndexRef.current = next;
      await playPreview(activeQueue[next]);
    },
    [playPreview, stopImeWaves],
  );
  advanceWavesRef.current = advanceWaves;

  const startImeWaves = useCallback(
    async (opts?: { force?: boolean }) => {
      radioModeRef.current = false;
      await window.imeMusic.clearQueue?.();
      await refreshPlaybackQueue();

      const res = await window.imeMusic.getWavesPool?.({ force: Boolean(opts?.force) });
      const items = (res?.items || []).filter((item) => item?.previewUrl);
      if (!items.length) return 0;

      wavesQueueRef.current = items;
      wavesIndexRef.current = 0;
      wavesActiveRef.current = true;
      dispatch({ type: 'SET_WAVES_ACTIVE', active: true });
      bumpOperation('imeWaves');
      await playPreview(items[0]);
      return items.length;
    },
    [bumpOperation, playPreview, refreshPlaybackQueue],
  );

  const togglePreview = useCallback(
    async (item: RecommendationItem) => {
      // Manual demo from grids exits Waves radio mode
      if (wavesActiveRef.current) {
        wavesActiveRef.current = false;
        wavesQueueRef.current = [];
        wavesIndexRef.current = 0;
        dispatch({ type: 'SET_WAVES_ACTIVE', active: false });
      }
      const s = stateRef.current;
      const preview = previewAudioRef.current;
      if (s.previewItem?.id === item.id) {
        if (!preview) {
          stopPreview();
          return;
        }
        if (s.previewPlaying && !preview.paused) {
          preview.pause();
          dispatch({ type: 'SET_PREVIEW_PLAYING', playing: false });
          return;
        }
        try {
          preview.muted = s.muted;
          preview.volume = Math.min(1, Math.max(0, s.settings.globalVolume));
          await preview.play();
          dispatch({ type: 'SET_PREVIEW_PLAYING', playing: true });
        } catch {
          stopPreview();
        }
        return;
      }
      await playPreview(item);
    },
    [playPreview, stopPreview],
  );

  const resume = useCallback(async () => {
    stopPreview();
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!audio || !s.currentSongId || s.playbackError) return;
    if (!audio.paused) return;
    if (loadedTrackIdRef.current !== s.currentSongId) return;

    debugPlayback('resume()', { operationId: operationIdRef.current, songId: s.currentSongId });
    try {
      await graphRef.current?.resume();
      await audio.play();
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      debugPlayback('resume() rejected', { name: e?.name, message: e?.message });
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
    }
  }, [stopPreview]);

  const advancePlayback = useCallback(async (opts?: { manual?: boolean }) => {
    if (transitionInProgressRef.current) {
      debugPlayback('advancePlayback blocked', { reason: 'transitionInProgress' });
      return;
    }

    stopPreview();
    const manual = Boolean(opts?.manual);
    const playback = getPlayback(stateRef.current.settings);
    const audio = audioRef.current;
    const currentId = stateRef.current.currentSongId;
    const currentSong = stateRef.current.songs.find((x) => x.id === currentId) || null;

    if (!manual && sleepStopAfterRef.current) {
      clearSleepInternal();
      crossfadeArmedRef.current = false;
      fadingRef.current = false;
      dispatch({ type: 'STOP' });
      audio?.pause();
      applyOutputGain();
      return;
    }

    if (currentId && (audio?.currentTime || 0) >= 5) {
      void recordListenIfNeeded(currentId, true);
    }

    if (playback.repeat === 'one' && currentId && !manual) {
      if (audio) {
        audio.currentTime = 0;
        dispatch({ type: 'SET_TIME', time: 0 });
        crossfadeArmedRef.current = false;
        fadingRef.current = false;
        applyOutputGain();
        try {
          await graphRef.current?.resume();
          await audio.play();
        } catch {
          dispatch({ type: 'SET_PLAYING', isPlaying: false });
        }
      }
      return;
    }

    const peekNextId = (): string | null => {
      const s = stateRef.current;
      if (s.playbackQueue.length > 0) return s.playbackQueue[0].trackId;
      if (s.fallbackIds.length > 0 && s.fallbackIndex < s.fallbackIds.length - 1) {
        return s.fallbackIds[s.fallbackIndex + 1];
      }
      if (playback.repeat === 'all' && s.fallbackIds.length > 0) return s.fallbackIds[0];
      return null;
    };

    if (!manual && sleepAlbumRef.current && currentSong) {
      const nextId = peekNextId();
      const nextSong = nextId ? stateRef.current.songs.find((x) => x.id === nextId) : null;
      if (!nextSong || !sameAlbum(currentSong, nextSong)) {
        clearSleepInternal();
        crossfadeArmedRef.current = false;
        fadingRef.current = false;
        dispatch({ type: 'STOP' });
        audio?.pause();
        applyOutputGain();
        return;
      }
    }

    transitionInProgressRef.current = true;
    const opId = bumpOperation('next/ended');
    crossfadeArmedRef.current = false;
    fadingRef.current = false;

    try {
      audio?.pause();

      const fromQueue = await window.imeMusic.takeQueueHead();
      if (opId !== operationIdRef.current) return;

      if (fromQueue) {
        setTrack(fromQueue, { autoPlay: true, resumeTime: 0 });
        await refreshPlaybackQueue();
        return;
      }

      const s = stateRef.current;
      if (s.fallbackIds.length > 0 && s.fallbackIndex < s.fallbackIds.length - 1) {
        const nextIndex = s.fallbackIndex + 1;
        setTrack(s.fallbackIds[nextIndex], {
          fallbackIds: s.fallbackIds,
          fallbackIndex: nextIndex,
          autoPlay: true,
          resumeTime: 0,
        });
        return;
      }

      if (playback.repeat === 'all' && s.fallbackIds.length > 0) {
        setTrack(s.fallbackIds[0], {
          fallbackIds: s.fallbackIds,
          fallbackIndex: 0,
          autoPlay: true,
          resumeTime: 0,
        });
        return;
      }

      if (radioModeRef.current) {
        try {
          const mix = await window.imeMusic.getLibraryMix({ size: 24 });
          const recent = new Set(radioRecentRef.current);
          const nextSong = (mix.songs || []).find((song) => !recent.has(song.id));
          if (nextSong) {
            if (!manual && sleepAlbumRef.current && currentSong && !sameAlbum(currentSong, nextSong)) {
              clearSleepInternal();
              dispatch({ type: 'STOP' });
              audio?.pause();
              return;
            }
            radioRecentRef.current = [...radioRecentRef.current, nextSong.id].slice(-20);
            const moreIds = (mix.trackIds || []).filter((id) => id !== nextSong.id).slice(0, 15);
            setTrack(nextSong.id, {
              fallbackIds: [nextSong.id, ...moreIds],
              fallbackIndex: 0,
              autoPlay: true,
              resumeTime: 0,
            });
            return;
          }
        } catch {
          /* fall through */
        }
      }

      if (sleepAlbumRef.current) clearSleepInternal();
      dispatch({ type: 'STOP' });
      audio?.pause();
    } finally {
      transitionInProgressRef.current = false;
    }
  }, [
    applyOutputGain,
    bumpOperation,
    clearSleepInternal,
    recordListenIfNeeded,
    refreshPlaybackQueue,
    setTrack,
    stopPreview,
  ]);

  const playSong = useCallback(
    (songId: string) => {
      stopPreview();
      const s = stateRef.current;
      const audio = audioRef.current;

      if (s.currentSongId === songId && loadedTrackIdRef.current === songId && audio) {
        if (audio.paused) {
          void resume();
        } else {
          pause();
        }
        debugPlayback('playSong same-track toggle', { songId, paused: audio.paused });
        return;
      }

      bumpOperation('playSong');
      setTrack(songId, { resumeTime: 0, autoPlay: true });
    },
    [bumpOperation, pause, resume, setTrack, stopPreview],
  );

  const playNow = useCallback(
    (songId: string) => {
      stopPreview();
      const s = stateRef.current;
      const audio = audioRef.current;

      bumpOperation('playNow');

      if (s.currentSongId === songId && loadedTrackIdRef.current === songId && audio) {
        audio.currentTime = 0;
        dispatch({ type: 'SET_TIME', time: 0 });
        resumeTimeRef.current = 0;
        shouldAutoPlayRef.current = true;
        void audio.play().catch((err: unknown) => {
          const e = err as { name?: string; message?: string };
          debugPlayback('playNow restart rejected', { name: e?.name, message: e?.message });
          dispatch({ type: 'SET_PLAYING', isPlaying: false });
        });
        return;
      }

      setTrack(songId, { resumeTime: 0, autoPlay: true });
    },
    [bumpOperation, setTrack, stopPreview],
  );

  const togglePlayPause = useCallback(() => {
    const s = stateRef.current;
    const audio = audioRef.current;
    const preview = previewAudioRef.current;

    if (s.previewItem) {
      if (!preview) {
        stopPreview();
        return;
      }
      if (s.previewPlaying && !preview.paused) {
        preview.pause();
        dispatch({ type: 'SET_PREVIEW_PLAYING', playing: false });
        return;
      }
      void (async () => {
        try {
          preview.muted = s.muted;
          preview.volume = Math.min(1, Math.max(0, s.settings.globalVolume));
          await preview.play();
          dispatch({ type: 'SET_PREVIEW_PLAYING', playing: true });
        } catch {
          stopPreview();
        }
      })();
      return;
    }

    if (!s.currentSongId) {
      const visible = getVisibleSongs();
      if (visible.length > 0) playSong(visible[0].id);
      return;
    }

    if (!audio) return;

    if (audio.paused) {
      void resume();
    } else {
      pause();
    }
  }, [getVisibleSongs, pause, playSong, resume, stopPreview]);

  const nextTrack = useCallback(() => {
    if (wavesActiveRef.current) {
      void advanceWavesRef.current({ manual: true, delta: 1 });
      return;
    }
    if (stateRef.current.previewItem) {
      stopPreview();
      return;
    }
    void advancePlayback({ manual: true });
  }, [advancePlayback, stopPreview]);

  const prevTrack = useCallback(() => {
    if (transitionInProgressRef.current) return;

    if (wavesActiveRef.current) {
      const preview = previewAudioRef.current;
      if (preview && preview.currentTime > 1) {
        preview.currentTime = 0;
        dispatch({ type: 'SET_PREVIEW_TIME', time: 0 });
        return;
      }
      void advanceWavesRef.current({ manual: true, delta: -1 });
      return;
    }

    if (stateRef.current.previewItem) {
      const preview = previewAudioRef.current;
      if (preview && preview.currentTime > 1) {
        preview.currentTime = 0;
        dispatch({ type: 'SET_PREVIEW_TIME', time: 0 });
        return;
      }
      stopPreview();
      return;
    }

    const s = stateRef.current;
    const audio = audioRef.current;

    if (audio && s.currentSongId && s.currentTime > 3) {
      audio.currentTime = 0;
      dispatch({ type: 'SET_TIME', time: 0 });
      debugPlayback('previous restart', { songId: s.currentSongId });
      return;
    }

    if (s.fallbackIds.length === 0 || s.fallbackIndex <= 0) return;

    transitionInProgressRef.current = true;
    const opId = bumpOperation('previous');

    try {
      audio?.pause();
      const prevIndex = s.fallbackIndex - 1;
      setTrack(s.fallbackIds[prevIndex], {
        fallbackIds: s.fallbackIds,
        fallbackIndex: prevIndex,
        autoPlay: true,
        resumeTime: 0,
      });
    } finally {
      if (opId === operationIdRef.current) {
        transitionInProgressRef.current = false;
      }
    }
  }, [bumpOperation, setTrack, stopPreview]);

  const addToQueue = useCallback(
    async (trackId: string) => {
      await window.imeMusic.addToQueue(trackId);
      await refreshPlaybackQueue();
    },
    [refreshPlaybackQueue],
  );

  const addToQueueNext = useCallback(
    async (trackId: string) => {
      await window.imeMusic.addToQueueNext(trackId);
      await refreshPlaybackQueue();
    },
    [refreshPlaybackQueue],
  );

  const removeFromQueue = useCallback(
    async (queueRowId: string) => {
      await window.imeMusic.removeFromQueue(queueRowId);
      await refreshPlaybackQueue();
    },
    [refreshPlaybackQueue],
  );

  const clearQueue = useCallback(async () => {
    await window.imeMusic.clearQueue();
    await refreshPlaybackQueue();
  }, [refreshPlaybackQueue]);

  const reorderQueue = useCallback(
    async (orderedQueueRowIds: string[]) => {
      await window.imeMusic.reorderQueue(orderedQueueRowIds);
      await refreshPlaybackQueue();
    },
    [refreshPlaybackQueue],
  );

  const toggleLike = useCallback(async (songId: string) => {
    const song = stateRef.current.songs.find((s) => s.id === songId);
    if (!song) return;
    const updated = await window.imeMusic.updateSong(songId, { liked: !song.liked });
    if (updated) dispatch({ type: 'UPDATE_SONG', song: updated });
  }, []);

  const toggleMute = useCallback(async () => {
    const next = !stateRef.current.muted;
    dispatch({ type: 'SET_MUTED', muted: next });
    const settings = await window.imeMusic.updateSettings({ muted: next });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  }, []);

  const clearPlaybackError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', kind: null, message: null });
  }, []);

  const removeMissingCurrent = useCallback(async () => {
    const id = stateRef.current.currentSongId;
    if (!id) return;
    await window.imeMusic.removeSong(id);
    dispatch({ type: 'REMOVE_SONG', id });
    dispatch({ type: 'SET_ERROR', kind: null, message: null });
    await refreshPlaybackQueue();
  }, [refreshPlaybackQueue]);

  const currentSong = state.songs.find((s) => s.id === state.currentSongId);

  const seek = useCallback((time: number) => {
    const s = stateRef.current;
    if (s.previewItem && previewAudioRef.current) {
      const preview = previewAudioRef.current;
      if (!Number.isFinite(time)) return;
      const clamped = Math.max(0, Math.min(time, preview.duration || s.previewItem.duration || time));
      preview.currentTime = clamped;
      dispatch({ type: 'SET_PREVIEW_TIME', time: clamped });
      return;
    }
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    const clamped = Math.max(0, Math.min(time, audio.duration || time));
    dispatch({ type: 'SET_SEEKING', isSeeking: true });
    audio.currentTime = clamped;
    dispatch({ type: 'SET_TIME', time: clamped });
    dispatch({ type: 'SET_SEEKING', isSeeking: false });
  }, []);

  const advancePlaybackRef = useRef(advancePlayback);
  advancePlaybackRef.current = advancePlayback;

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    try {
      graphRef.current = createPlaybackGraph(audio);
    } catch (err) {
      graphRef.current = null;
      debugPlayback('audioGraph failed', { err: String(err) });
    }

    const onPlay = () => {
      dispatch({ type: 'SET_PLAYING', isPlaying: true });
      debugPlayback('event:play', { operationId: operationIdRef.current });
      void graphRef.current?.resume();
    };

    const onPlaying = () => {
      dispatch({ type: 'SET_PLAYING', isPlaying: true });
      dispatch({ type: 'SET_LOADING', loading: false });
      debugPlayback('event:playing', { operationId: operationIdRef.current });
    };

    const onPause = () => {
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
      debugPlayback('event:pause', { operationId: operationIdRef.current });
    };

    const onTimeUpdate = () => {
      if (stateRef.current.isSeeking) return;
      dispatch({ type: 'SET_TIME', time: audio.currentTime });
      const songId = stateRef.current.currentSongId;
      if (songId && audio.currentTime >= 15) {
        void recordListenIfNeeded(songId);
      }

      const pb = getPlayback(stateRef.current.settings);
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (!duration || audio.paused || transitionInProgressRef.current) return;
      const remaining = duration - audio.currentTime;

      if (
        stateRef.current.sleepMode === 'minutes' &&
        stateRef.current.sleepEndsAt &&
        Date.now() >= stateRef.current.sleepEndsAt &&
        !sleepStopAfterRef.current
      ) {
        sleepStopAfterRef.current = true;
      }

      if (pb.crossfadeSeconds > 0 && remaining <= pb.crossfadeSeconds && remaining > 0.02) {
        if (!crossfadeArmedRef.current) {
          crossfadeArmedRef.current = true;
          fadingRef.current = true;
          const graph = graphRef.current;
          if (graph) {
            void graph.fadeTo(0, remaining).then(() => {
              if (transitionInProgressRef.current) return;
              void advancePlaybackRef.current();
            });
          } else {
            void advancePlaybackRef.current();
          }
        }
        return;
      }

      if (
        (pb.gaplessEnabled || pb.crossfadeSeconds > 0) &&
        remaining <= (pb.crossfadeSeconds > 0 ? 0.05 : 0.08) &&
        remaining >= 0
      ) {
        if (!crossfadeArmedRef.current) {
          crossfadeArmedRef.current = true;
          void advancePlaybackRef.current();
        }
      }
    };

    const onEnded = () => {
      debugPlayback('event:ended', { operationId: operationIdRef.current });
      if (transitionInProgressRef.current) return;
      void advancePlaybackRef.current();
    };

    const onWaiting = () => dispatch({ type: 'SET_LOADING', loading: true });

    const onCanPlay = () => dispatch({ type: 'SET_LOADING', loading: false });

    const onError = () => {
      dispatch({ type: 'SET_LOADING', loading: false });
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
      const mediaError = audio.error;
      const message =
        mediaError?.code === 4
          ? 'Файл не найден или формат не поддерживается'
          : 'Не удалось декодировать аудиофайл';
      dispatch({
        type: 'SET_ERROR',
        kind: mediaError?.code === 4 ? 'missing' : 'decode',
        message,
      });
      debugPlayback('event:error', {
        code: mediaError?.code,
        message: mediaError?.message,
        operationId: operationIdRef.current,
      });
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('error', onError);
      try {
        void graphRef.current?.ctx.close();
      } catch {
        /* ignore */
      }
      graphRef.current = null;
      audioRef.current = null;
    };
  }, [recordListenIfNeeded]);

  useEffect(() => {
    const preview = new Audio();
    preview.preload = 'none';
    previewAudioRef.current = preview;

    const onTimeUpdate = () => {
      dispatch({ type: 'SET_PREVIEW_TIME', time: preview.currentTime });
    };
    const onPlay = () => dispatch({ type: 'SET_PREVIEW_PLAYING', playing: true });
    const onPause = () => {
      if (stateRef.current.previewItem) {
        dispatch({ type: 'SET_PREVIEW_PLAYING', playing: false });
      }
    };
    const onEnded = () => {
      if (wavesActiveRef.current) {
        void advanceWavesRef.current({ delta: 1 });
        return;
      }
      dispatch({ type: 'SET_PREVIEW', item: null });
    };
    const onError = () => {
      if (wavesActiveRef.current) {
        void advanceWavesRef.current({ manual: true, delta: 1 });
        return;
      }
      dispatch({ type: 'SET_PREVIEW', item: null });
      dispatch({ type: 'SET_PREVIEW_ERROR', message: 'unavailable' });
    };

    preview.addEventListener('timeupdate', onTimeUpdate);
    preview.addEventListener('play', onPlay);
    preview.addEventListener('pause', onPause);
    preview.addEventListener('ended', onEnded);
    preview.addEventListener('error', onError);

    return () => {
      preview.pause();
      preview.removeAttribute('src');
      preview.load();
      preview.removeEventListener('timeupdate', onTimeUpdate);
      preview.removeEventListener('play', onPlay);
      preview.removeEventListener('pause', onPause);
      preview.removeEventListener('ended', onEnded);
      preview.removeEventListener('error', onError);
      previewAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (loadedTrackIdRef.current === currentSong.id) return;

    const opId = operationIdRef.current;
    const songId = currentSong.id;
    let cancelled = false;

    (async () => {
      dispatch({ type: 'SET_LOADING', loading: true });
      dispatch({ type: 'SET_ERROR', kind: null, message: null });

      audio.pause();

      const exists = await window.imeMusic?.checkFileExists?.(currentSong.filePath);
      if (cancelled || opId !== operationIdRef.current) return;

      if (exists === false) {
        loadedTrackIdRef.current = songId;
        dispatch({
          type: 'SET_ERROR',
          kind: 'missing',
          message: 'Файл не найден. Возможно, он был удалён или перемещён.',
        });
        dispatch({ type: 'SET_LOADING', loading: false });
        debugPlayback('missing file', { songId, filePath: currentSong.filePath });
        return;
      }

      const resumeAt = resumeTimeRef.current;
      audio.src = toFileUrl(currentSong.filePath);
      audio.load();

      await new Promise<void>((resolve) => {
        const onReady = () => {
          audio.removeEventListener('loadeddata', onReady);
          audio.removeEventListener('canplay', onReady);
          resolve();
        };
        if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          resolve();
          return;
        }
        audio.addEventListener('loadeddata', onReady, { once: true });
        audio.addEventListener('canplay', onReady, { once: true });
      });

      if (cancelled || opId !== operationIdRef.current) return;

      loadedTrackIdRef.current = songId;
      audio.muted = false;
      crossfadeArmedRef.current = false;
      const pb = getPlayback(stateRef.current.settings);
      const graph = graphRef.current;
      if (graph) {
        graph.applyEq(pb.eqEnabled, {
          bass: pb.eqBass,
          mid: pb.eqMid,
          treble: pb.eqTreble,
        });
        graph.applyNormalize(pb.normalizeVolume);
      }

      const vol = targetVolume();
      const fadeIn = pb.crossfadeSeconds > 0 ? Math.min(pb.crossfadeSeconds, 3) : 0;
      if (graph && fadeIn > 0 && shouldAutoPlayRef.current) {
        fadingRef.current = true;
        graph.setOutputGain(0);
      } else {
        fadingRef.current = false;
        applyOutputGain();
      }

      if (resumeAt > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(resumeAt, audio.duration || resumeAt);
        dispatch({ type: 'SET_TIME', time: audio.currentTime });
      }

      dispatch({ type: 'SET_LOADING', loading: false });

      if (shouldAutoPlayRef.current) {
        shouldAutoPlayRef.current = false;
        try {
          await graphRef.current?.resume();
          await audio.play();
          if (graph && fadeIn > 0) {
            await graph.fadeTo(vol, fadeIn);
            fadingRef.current = false;
            applyOutputGain();
          }
        } catch (err: unknown) {
          fadingRef.current = false;
          if (opId !== operationIdRef.current) return;
          const e = err as { name?: string; message?: string };
          debugPlayback('autoPlay rejected', { name: e?.name, message: e?.message });
          dispatch({ type: 'SET_PLAYING', isPlaying: false });
        }
      } else {
        fadingRef.current = false;
        applyOutputGain();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyOutputGain, currentSong?.id, currentSong?.filePath, targetVolume]);

  useEffect(() => {
    applyOutputGain();
    const preview = previewAudioRef.current;
    if (preview) {
      preview.muted = state.muted;
      preview.volume = Math.min(1, Math.max(0, state.settings.globalVolume));
    }
  }, [applyOutputGain, currentSong?.volume, state.settings.globalVolume, currentSong?.id, state.muted]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const pb = getPlayback(state.settings);
    graph.applyEq(pb.eqEnabled, {
      bass: pb.eqBass,
      mid: pb.eqMid,
      treble: pb.eqTreble,
    });
    graph.applyNormalize(pb.normalizeVolume);
  }, [
    state.settings.playback?.eqEnabled,
    state.settings.playback?.eqBass,
    state.settings.playback?.eqMid,
    state.settings.playback?.eqTreble,
    state.settings.playback?.normalizeVolume,
  ]);

  const toggleShuffle = useCallback(async () => {
    const pb = getPlayback(stateRef.current.settings);
    const settings = await window.imeMusic.updateSettings({
      playback: { ...pb, shuffle: !pb.shuffle },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  }, []);

  const cycleRepeat = useCallback(async () => {
    const pb = getPlayback(stateRef.current.settings);
    const order: RepeatMode[] = ['off', 'all', 'one'];
    const next = order[(order.indexOf(pb.repeat) + 1) % order.length];
    const settings = await window.imeMusic.updateSettings({
      playback: { ...pb, repeat: next },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  }, []);

  const queueSimilarNext = useCallback(async () => {
    const s = stateRef.current;
    const current = s.songs.find((x) => x.id === s.currentSongId);
    if (!current) return 0;
    const artist = current.artist.trim().toLowerCase();
    const genre = (current.genre || '').trim().toLowerCase();
    const queued = new Set(s.playbackQueue.map((q) => q.trackId));
    queued.add(current.id);
    const candidates = s.songs.filter((song) => {
      if (queued.has(song.id)) return false;
      const a = song.artist.trim().toLowerCase();
      if (artist && a === artist) return true;
      if (genre && (song.genre || '').trim().toLowerCase() === genre) return true;
      return false;
    });
    const sameArtist = candidates.filter((x) => x.artist.trim().toLowerCase() === artist);
    const pool = (sameArtist.length >= 3 ? sameArtist : candidates).slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const pick = pool.slice(0, 5);
    for (const song of [...pick].reverse()) {
      await window.imeMusic.addToQueueNext(song.id);
    }
    await refreshPlaybackQueue();
    return pick.length;
  }, [refreshPlaybackQueue]);

  const startLibraryMix = useCallback(async () => {
    if (wavesActiveRef.current) {
      wavesActiveRef.current = false;
      wavesQueueRef.current = [];
      wavesIndexRef.current = 0;
      dispatch({ type: 'SET_WAVES_ACTIVE', active: false });
      stopPreview();
    }
    const mix = await window.imeMusic.getLibraryMix({ size: 40 });
    if (!mix.trackIds.length) return 0;
    radioModeRef.current = true;
    radioRecentRef.current = mix.trackIds.slice(0, 8);
    await window.imeMusic.clearQueue();
    for (const id of mix.trackIds.slice(1, 10)) {
      await window.imeMusic.addToQueue(id);
    }
    await refreshPlaybackQueue();
    bumpOperation('libraryMix');
    setTrack(mix.trackIds[0], {
      fallbackIds: mix.trackIds,
      fallbackIndex: 0,
      autoPlay: true,
      resumeTime: 0,
    });
    return mix.trackIds.length;
  }, [bumpOperation, refreshPlaybackQueue, setTrack, stopPreview]);

  useEffect(() => {
    if (!window.imeMusic?.onPlaybackCommand) return undefined;
    return window.imeMusic.onPlaybackCommand((cmd) => {
      if (cmd === 'playPause') togglePlayPause();
      else if (cmd === 'next') nextTrack();
      else if (cmd === 'previous') prevTrack();
      else if (cmd === 'show') {
        /* main process focuses window */
      }
    });
  }, [nextTrack, prevTrack, togglePlayPause]);

  useEffect(() => {
    if (!window.imeMusic?.pushNowPlaying) return;
    const song = state.songs.find((s) => s.id === state.currentSongId);
    const payload = {
      title: song?.title || null,
      artist: song?.artist || null,
      coverUrl: song ? getCoverSrc(song) : null,
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      duration: song?.duration || 0,
    };
    const immediate =
      !song ||
      state.currentSongId !== lastNowPlayingSongRef.current ||
      state.isPlaying !== lastNowPlayingPlayingRef.current;
    lastNowPlayingSongRef.current = state.currentSongId;
    lastNowPlayingPlayingRef.current = state.isPlaying;
    if (immediate) {
      window.imeMusic.pushNowPlaying(payload);
      return;
    }
    if (nowPlayingTimerRef.current) return;
    nowPlayingTimerRef.current = setTimeout(() => {
      nowPlayingTimerRef.current = null;
      const s = stateRef.current;
      const cur = s.songs.find((x) => x.id === s.currentSongId);
      window.imeMusic.pushNowPlaying({
        title: cur?.title || null,
        artist: cur?.artist || null,
        coverUrl: cur ? getCoverSrc(cur) : null,
        isPlaying: s.isPlaying,
        currentTime: s.currentTime,
        duration: cur?.duration || 0,
      });
    }, 400);
  }, [
    state.currentSongId,
    state.isPlaying,
    state.currentTime,
    state.songs,
  ]);

  useEffect(() => {
    if (state.sleepMode !== 'minutes' || !state.sleepEndsAt) return undefined;
    const id = window.setInterval(() => {
      if (!stateRef.current.sleepEndsAt) return;
      if (Date.now() >= stateRef.current.sleepEndsAt) {
        sleepStopAfterRef.current = true;
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.sleepMode, state.sleepEndsAt]);

  useEffect(() => {
    if (state.loading) return;
    const view = state.currentView;
    void window.imeMusic?.updateSettings?.({ lastView: view });
  }, [state.currentView, state.loading]);

  return (
    <PlayerContext.Provider
      value={{
        state,
        dispatch,
        getVisibleSongs,
        playNow,
        playSong,
        togglePlayPause,
        togglePlay: togglePlayPause,
        pause,
        resume,
        nextTrack,
        prevTrack,
        toggleLike,
        toggleMute,
        refreshLibrary,
        refreshPlaybackQueue,
        addToQueue,
        addToQueueNext,
        removeFromQueue,
        clearQueue,
        reorderQueue,
        seek,
        removeMissingCurrent,
        clearPlaybackError,
        playPreview,
        stopPreview,
        togglePreview,
        toggleShuffle,
        cycleRepeat,
        queueSimilarNext,
        startLibraryMix,
        startImeWaves,
        stopImeWaves,
        setSleepTimer,
        clearSleepTimer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

export function formatTime(seconds: number, showSeconds = true): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (!showSeconds) return `${String(m).padStart(2, '0')}:00`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
