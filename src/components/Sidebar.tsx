import { useState } from 'react';
import { usePlayer } from '../store/playerStore';
import { getCoverSrc } from '../utils/media';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { CreatePlaylistModal } from './modals/CreatePlaylistModal';
import { useToast } from './ui/Toast';
import { DEFAULT_APPEARANCE } from '../appearance/schema';
import { getEffectiveAppearance } from '../utils/applyAppearance';
import { ArtistLink } from './ArtistLink';
import { useI18n } from '../i18n';
import { playlistDisplayName } from '../i18n/messages';

export function Sidebar() {
  const { state, dispatch, toggleLike } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [playlistsOpen, setPlaylistsOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const appearance = getEffectiveAppearance(state.settings.appearance || DEFAULT_APPEARANCE);
  const side = appearance.components.sidebar;

  const currentSong = state.songs.find((s) => s.id === state.currentSongId);
  const coverSrc = currentSong ? getCoverSrc(currentSong) : null;
  const likedCount = state.songs.filter((s) => s.liked).length;
  const discoveryWishCount = state.settings.discovery?.wishlist?.length || 0;

  const handleCreatePlaylist = async (name: string) => {
    const playlist = await window.imeMusic.createPlaylist(name);
    dispatch({ type: 'ADD_PLAYLIST', playlist });
    showToast(t('playlist.created', { name }), 'success');
  };

  return (
    <>
      <aside
        className={`sidebar ${collapsed ? 'collapsed' : ''}`}
        style={{ opacity: appearance.layers.sidebarOpacity }}
      >
        <div className="sidebar-top">
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <Icon name="panelLeft" size={16} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label={t('nav.library')}>
          {side.showSectionLabels && !collapsed ? (
            <div className="sidebar-section-label">{t('nav.library')}</div>
          ) : null}
          <button
            type="button"
            className={`nav-item ${state.currentView.kind === 'home' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'home' } })}
          >
            <Icon name="sun" size={18} />
            {!collapsed && <span className="nav-label">{t('nav.home')}</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${state.currentView.kind === 'all' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'all' } })}
          >
            <Icon name="music" size={18} />
            {!collapsed && <span className="nav-label">{t('nav.all')}</span>}
            {!collapsed && side.showTrackCounts ? (
              <span className="nav-count">{state.songs.length}</span>
            ) : null}
          </button>
          {!side.hideLiked ? (
            <button
              type="button"
              className={`nav-item ${state.currentView.kind === 'liked' ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'liked' } })}
            >
              <Icon name="heartOutline" size={18} />
              {!collapsed && <span className="nav-label">{t('nav.liked')}</span>}
              {!collapsed && side.showTrackCounts ? (
                <span className="nav-count">{likedCount}</span>
              ) : null}
            </button>
          ) : null}
          <button
            type="button"
            className={`nav-item ${state.currentView.kind === 'recommendations' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'recommendations' } })}
          >
            <Icon name="disc" size={18} />
            {!collapsed && <span className="nav-label">{t('nav.recommendations')}</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${state.currentView.kind === 'wishlist' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'wishlist' } })}
          >
            <Icon name="heartOutline" size={18} />
            {!collapsed && <span className="nav-label">{t('nav.wishlist')}</span>}
            {!collapsed && side.showTrackCounts && discoveryWishCount > 0 ? (
              <span className="nav-count">{discoveryWishCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`nav-item ${state.currentView.kind === 'history' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'history' } })}
          >
            <Icon name="history" size={18} />
            {!collapsed && <span className="nav-label">{t('nav.history')}</span>}
          </button>
        </nav>

        {!collapsed && !side.hidePlaylists ? (
          <>
            <div className="playlists-header">
              <button
                type="button"
                className="playlists-toggle"
                onClick={() => setPlaylistsOpen(!playlistsOpen)}
                aria-expanded={playlistsOpen}
              >
                <Icon name={playlistsOpen ? 'chevronDown' : 'chevronRight'} size={14} />
                <span>{t('nav.playlists')}</span>
              </button>
              <Button
                variant="icon"
                className="icon-btn"
                onClick={() => setCreateOpen(true)}
                aria-label={t('nav.createPlaylist')}
                title={t('nav.createPlaylist')}
              >
                <Icon name="add" size={16} />
              </Button>
            </div>

            {playlistsOpen && (
              <div className="playlists-list">
                {state.playlists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    className={`nav-item ${state.currentView.kind === 'playlist' && state.currentView.id === pl.id ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'playlist', id: pl.id } })}
                  >
                    <Icon name="playlist" size={18} />
                    <span className="nav-label">{playlistDisplayName(pl, t)}</span>
                    {side.showTrackCounts ? (
                      <span className="nav-count">{pl.songIds.length}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}

        {currentSong && !collapsed && (
          <div className="sidebar-now-playing">
            {coverSrc ? (
              <img className="sidebar-cover" src={coverSrc} alt="" />
            ) : (
              <div className="sidebar-cover sidebar-cover-fallback">
                <Icon name="disc" size={20} />
              </div>
            )}
            <div className="sidebar-song-info">
              <div className="sidebar-song-title" title={currentSong.title}>
                {currentSong.title}
              </div>
              <ArtistLink artist={currentSong.artist} className="sidebar-song-artist" />
            </div>
            <button
              type="button"
              className={`like-btn ${currentSong.liked ? 'liked' : ''}`}
              onClick={() => void toggleLike(currentSong.id)}
              aria-label={currentSong.liked ? t('player.unlike') : t('player.like')}
            >
              <Icon name={currentSong.liked ? 'heart' : 'heartOutline'} size={16} />
            </button>
          </div>
        )}
      </aside>

      <CreatePlaylistModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreatePlaylist}
      />
    </>
  );
}
