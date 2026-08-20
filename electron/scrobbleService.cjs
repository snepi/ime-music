const crypto = require('crypto');
const { logError } = require('./libraryStore.cjs');

function normalizeScrobble(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  return {
    listenBrainzEnabled: Boolean(base.listenBrainzEnabled),
    listenBrainzToken: String(base.listenBrainzToken || '').trim(),
    lastFmEnabled: Boolean(base.lastFmEnabled),
    lastFmApiKey: String(base.lastFmApiKey || '').trim(),
    lastFmApiSecret: String(base.lastFmApiSecret || '').trim(),
    lastFmSessionKey: String(base.lastFmSessionKey || '').trim(),
    lastFmUsername: String(base.lastFmUsername || '').trim(),
  };
}

async function submitListenBrainz(token, song) {
  const payload = {
    listen_type: 'single',
    payload: [
      {
        listened_at: Math.floor(Date.now() / 1000),
        track_metadata: {
          artist_name: song.artist || 'Unknown',
          track_name: song.title || 'Unknown',
          release_name: song.album || undefined,
          additional_info: {
            duration_ms: Math.round((song.duration || 0) * 1000) || undefined,
            media_player: 'IMe Music',
          },
        },
      },
    ],
  };
  const res = await fetch('https://api.listenbrainz.org/1/submit-listens', {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ListenBrainz HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

function lastFmSign(params, secret) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'format' && k !== 'callback')
    .sort();
  let str = '';
  for (const k of keys) str += k + params[k];
  str += secret;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

async function submitLastFm(cfg, song) {
  const params = {
    method: 'track.scrobble',
    api_key: cfg.lastFmApiKey,
    sk: cfg.lastFmSessionKey,
    artist: song.artist || 'Unknown',
    track: song.title || 'Unknown',
    timestamp: String(Math.floor(Date.now() / 1000)),
    album: song.album || '',
  };
  if (!params.album) delete params.album;
  params.api_sig = lastFmSign(params, cfg.lastFmApiSecret);
  params.format = 'json';

  const body = new URLSearchParams(params);
  const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.message || `Last.fm HTTP ${res.status}`);
  }
}

/**
 * Scrobble a library song to enabled services.
 */
async function scrobbleSong(settings, song) {
  const cfg = normalizeScrobble(settings?.scrobble);
  const results = { listenBrainz: null, lastFm: null };

  if (!song) return { ok: false, error: 'Нет трека', results };

  if (cfg.listenBrainzEnabled && cfg.listenBrainzToken) {
    try {
      await submitListenBrainz(cfg.listenBrainzToken, song);
      results.listenBrainz = 'ok';
    } catch (err) {
      results.listenBrainz = String(err?.message || err);
      logError('scrobble', 'ListenBrainz failed', err);
    }
  }

  if (
    cfg.lastFmEnabled &&
    cfg.lastFmApiKey &&
    cfg.lastFmApiSecret &&
    cfg.lastFmSessionKey
  ) {
    try {
      await submitLastFm(cfg, song);
      results.lastFm = 'ok';
    } catch (err) {
      results.lastFm = String(err?.message || err);
      logError('scrobble', 'Last.fm failed', err);
    }
  }

  const any =
    results.listenBrainz === 'ok' ||
    results.lastFm === 'ok' ||
    (!cfg.listenBrainzEnabled && !cfg.lastFmEnabled);
  return { ok: any || (!cfg.listenBrainzToken && !cfg.lastFmSessionKey), results };
}

module.exports = {
  normalizeScrobble,
  scrobbleSong,
};
