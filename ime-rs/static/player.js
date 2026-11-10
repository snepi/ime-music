(() => {
  const audio = new Audio();
  let now = { title: "", artist: "", url: "", cover: "" };
  audio.volume = Number(document.body.dataset.volume || 0.8) || 0.8;
  let waves = { active: false, queue: [], index: -1, seen: new Set() };
  const fallbackSeeds = ["pop", "rock", "electronic", "hip hop", "jazz", "indie", "dance", "metal", "soul", "r&b", "house", "ambient"];

  const svg = (inner, size) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const PLAY = '<polygon points="6 4 20 12 6 20 6 4"/>';
  const PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
  const HEART_PATH =
    "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";
  const wished = new Set();
  let lastSearchHtml = "";
  let lastArtistHtml = "";

  const byId = (id) => document.getElementById(id);

  document.addEventListener("pointerdown", (event) => {
    const titlebar = event.target.closest(".titlebar");
    if (titlebar && event.button === 0 && !event.target.closest("button, a, input, .titlebar-btn")) {
      if (window.ipc && window.ipc.postMessage) window.ipc.postMessage("drag");
    }
    const progress = event.target.closest(".progress-bar");
    if (progress && audio.duration) {
      const rect = progress.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * audio.duration;
    }
  });

  document.addEventListener("click", (event) => {
    const winBtn = event.target.closest("[data-win]");
    if (winBtn && window.ipc && window.ipc.postMessage) {
      event.preventDefault();
      event.stopPropagation();
      window.ipc.postMessage(winBtn.dataset.win);
      return;
    }
    const back = event.target.closest("[data-artist-back]");
    if (back) {
      event.preventDefault();
      const host = panelHost();
      if (host?.dataset.restore) {
        host.innerHTML = host.dataset.restore;
        delete host.dataset.restore;
      } else if (host) host.innerHTML = lastSearchHtml;
      return;
    }
    const albumBack = event.target.closest("[data-album-back]");
    if (albumBack) {
      event.preventDefault();
      const host = panelHost();
      if (host?.dataset.albumFromList && host.dataset.restore) {
        host.innerHTML = host.dataset.restore;
        delete host.dataset.restore;
        delete host.dataset.albumFromList;
      } else if (host) host.innerHTML = lastArtistHtml;
      return;
    }
    const albumQuery = event.target.closest("[data-open-album-query]");
    if (albumQuery) {
      event.preventDefault();
      event.stopPropagation();
      openAlbumByName(albumQuery.dataset.albumTitle || "", albumQuery.dataset.artistName || "");
      return;
    }
    const albumBtn = event.target.closest("[data-open-album]");
    if (albumBtn) {
      event.preventDefault();
      event.stopPropagation();
      openAlbum(albumBtn.dataset.albumId || "", albumBtn.dataset.albumTitle || "");
      return;
    }
    const platform = event.target.closest("[data-platform]");
    if (platform) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const artistBtn = event.target.closest("[data-open-artist]");
    if (artistBtn) {
      event.preventDefault();
      event.stopPropagation();
      openArtist(artistBtn.dataset.artistId || "", artistBtn.dataset.artistName || artistBtn.textContent || "");
      return;
    }
    const wish = event.target.closest("[data-wish]");
    if (wish) {
      event.preventDefault();
      event.stopPropagation();
      const key = wishKey(wish.dataset.title || "", wish.dataset.artist || "");
      const removing = wish.classList.contains("liked") || wished.has(key);
      post("wish", {
        title: wish.dataset.title || "",
        artist: wish.dataset.artist || "",
        url: wish.dataset.url || "",
        cover: wish.dataset.cover || "",
        album: wish.dataset.album || "",
      });
      if (removing) wished.delete(key);
      else wished.add(key);
      document.querySelectorAll("[data-wish]").forEach((node) => {
        if (wishKey(node.dataset.title || "", node.dataset.artist || "") !== key) return;
        const on = !removing;
        node.classList.toggle("liked", on);
        node.innerHTML = heartIcon(on);
      });
      const row = wish.closest(".wishlist-row");
      if (removing && row) {
        row.remove();
        const list = document.querySelector(".wishlist-list");
        if (list && !list.querySelector(".wishlist-row")) navigate("/?view=wishlist");
      }
      return;
    }
    const wishPlay = event.target.closest(".wishlist-play");
    if (wishPlay && !wishPlay.dataset.preview) {
      event.preventDefault();
      playQuery(wishPlay.dataset.title || "", wishPlay.dataset.artist || "");
      return;
    }
    const queryPlay = event.target.closest("[data-play-query]");
    if (queryPlay) {
      event.preventDefault();
      playQuery(queryPlay.dataset.title || "", queryPlay.dataset.artist || "");
      return;
    }
    const preview = event.target.closest("[data-preview]");
    if (preview) {
      event.preventDefault();
      waves.active = false;
      playUrl(preview.dataset.preview, preview.dataset.title || "", preview.dataset.artist || "");
      return;
    }
    const pick = event.target.closest("[data-pick]");
    if (pick) {
      const input = byId(pick.dataset.pick);
      if (input) input.click();
      return;
    }
    const row = event.target.closest("[data-play]");
    if (row && !event.target.closest("form, button.like-btn, button.song-menu-btn")) {
      waves.active = false;
      playId(row.dataset.play, row.dataset.title || "", row.dataset.artist || "");
      return;
    }
    const waveChip = event.target.closest("[data-waves-field]");
    if (waveChip && waveChip.tagName === "BUTTON") {
      event.preventDefault();
      const field = waveChip.dataset.wavesField;
      const value = waveChip.dataset.wavesValue;
      const row = waveChip.parentElement;
      if (row) {
        row.querySelectorAll("[data-waves-field]").forEach((node) => {
          const on = node === waveChip;
          node.classList.toggle("is-active", on);
          node.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
      post("waves-setting", { field, value });
      return;
    }
    const act = event.target.closest("[data-act]");
    if (!act) return;
    const name = act.dataset.act;
    if (name === "toggle") toggle();
    if (name === "next") playNext();
    if (name === "prev") playPrev();
    if (name === "mute") toggleMute();
    if (name === "shuffle" || name === "repeat") {
      post(name).then(() => act.classList.toggle("active"));
    }
    if (name === "waves-settings") toggleWavesSettings();
    if (name === "waves") startWaves();
  });

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.wavesField !== "skipKnown") return;
    post("waves-setting", { field: "skipKnown", value: input.checked ? "1" : "0" });
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const data = new FormData(form);
    if (data.get("action") === "like") {
      const body = new URLSearchParams(data);
      body.set("ajax", "1");
      fetch("/act", { method: "POST", body });
      const btn = form.querySelector(".like-btn");
      if (btn) btn.classList.toggle("liked");
      return;
    }
    const method = (form.getAttribute("method") || "get").toLowerCase();
    if (method === "get") {
      const params = new URLSearchParams(data);
      const base = form.getAttribute("action") || "/";
      const joiner = base.includes("?") ? "&" : "?";
      navigate(base + joiner + params.toString());
      return;
    }
    const body = new URLSearchParams(data);
    fetch(form.getAttribute("action") || "/act", { method: "POST", body, redirect: "follow" })
      .then(async (res) => navigate(res.url, await res.text()));
  });

  document.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.closest(".home-discovery-search")) {
      scheduleDiscovery(input.value);
      return;
    }
    if (input.classList.contains("search-input")) filterLibrary(input.value);
  });

  document.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.classList.contains("wish-sort")) return;
    const list = document.querySelector(".wishlist-list");
    if (!list) return;
    const [field, order] = select.value.split(":");
    const rows = [...list.querySelectorAll(".wishlist-row")];
    const valueOf = (row) => {
      if (field === "title") return row.dataset.title || "";
      if (field === "artist") return row.dataset.artist || "";
      if (field === "album") return row.dataset.album || "";
      return row.dataset.order || "";
    };
    rows.sort((a, b) => {
      const cmp = valueOf(a).localeCompare(valueOf(b), "ru", { numeric: true, sensitivity: "base" });
      if (field === "added") return order === "asc" ? -cmp : cmp;
      return order === "desc" ? -cmp : cmp;
    });
    rows.forEach((row) => list.appendChild(row));
  });

  document.addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches("input[data-upload]")) return;
    if (!input.files || !input.files.length) return;
    const body = new FormData();
    for (const file of input.files) body.append("files", file, file.name);
    const res = await fetch("/import", { method: "POST", body, redirect: "follow" });
    navigate(res.url, await res.text());
  });

  document.addEventListener("contextmenu", (event) => {
    const artist = event.target.closest("[data-open-artist]");
    if (!artist) return;
    event.preventDefault();
    document.querySelectorAll(".context-menu").forEach((node) => node.remove());
    const name = artist.dataset.artistName || artist.textContent || "";
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = event.clientX + "px";
    menu.style.top = event.clientY + "px";
    menu.innerHTML =
      `<div class="context-menu-header">${escapeHtml(name)}</div>` +
      `<button type="button" class="context-menu-item" data-open-artist="1" data-artist-name="${escapeAttr(name)}">Карточка артиста</button>`;
    document.body.appendChild(menu);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".context-menu")) {
      document.querySelectorAll(".context-menu").forEach((node) => node.remove());
    }
    if (event.target.closest(".ui-select, .ui-select-menu")) return;
    document.querySelectorAll(".ui-select-menu").forEach((node) => node.setAttribute("hidden", ""));
    document.querySelectorAll(".ui-select.open").forEach((node) => node.classList.remove("open"));
  });

  document.querySelectorAll(".ui-select").forEach(bindSelect);
  function bindSelect(select) {
    const button = select.querySelector(".ui-select-trigger");
    const menu = select.querySelector(".ui-select-menu");
    if (!button || !menu || button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = menu.hasAttribute("hidden");
      document.querySelectorAll(".ui-select-menu").forEach((node) => node.setAttribute("hidden", ""));
      if (!willOpen) return;
      menu.removeAttribute("hidden");
      select.classList.add("open");
      const rect = button.getBoundingClientRect();
      menu.style.position = "fixed";
      menu.style.left = rect.left + "px";
      menu.style.top = rect.bottom + 6 + "px";
      menu.style.width = Math.max(rect.width, 160) + "px";
      menu.style.zIndex = "400";
    });
  }

  const fmt = (value) => {
    const whole = Math.max(0, Math.floor(value || 0));
    return String(Math.floor(whole / 60)).padStart(2, "0") + ":" + String(whole % 60).padStart(2, "0");
  };
  audio.addEventListener("timeupdate", () => paintProgress());
  audio.addEventListener("play", () => syncPlayButton());
  audio.addEventListener("pause", () => syncPlayButton());
  audio.addEventListener("ended", () => {
    if (waves.active) playWavesIndex(waves.index + 1);
    else playNext();
  });

  const volumeBar = document.querySelector(".volume-bar");
  if (volumeBar) {
    volumeBar.addEventListener("pointerdown", (event) => {
      const rect = volumeBar.getBoundingClientRect();
      const next = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.volume = next;
      paintVolume(next);
      post("volume", { value: String(next) });
    });
  }

  let discoveryTimer = 0;
  function scheduleDiscovery(value) {
    window.clearTimeout(discoveryTimer);
    discoveryTimer = window.setTimeout(() => runDiscovery(value.trim()), 280);
  }

  function wishKey(title, artist) {
    return `${title}\n${artist}`.trim().toLowerCase();
  }

  function heartIcon(on) {
    return svg(on ? `<path d="${HEART_PATH}" fill="currentColor" stroke="none"/>` : `<path d="${HEART_PATH}"/>`, 16);
  }

  function wishButton(track) {
    const on = wished.has(wishKey(track.title, track.artist));
    return `<button type="button" class="like-btn wish-heart${on ? " liked" : ""}" data-wish="1" data-title="${escapeAttr(track.title)}" data-artist="${escapeAttr(track.artist)}" data-album="${escapeAttr(track.album || "")}" data-url="${escapeAttr(track.preview || "")}" data-cover="${escapeAttr(track.cover || "")}" aria-label="Добавить в «Хочу послушать»" title="Добавить в «Хочу послушать»">${heartIcon(on)}</button>`;
  }

  function trackCard(track) {
    const play = track.preview
      ? `data-preview="${escapeAttr(track.preview)}"`
      : `data-play-query="1"`;
    const cover = track.cover ? `<img src="${escapeAttr(track.cover)}" alt="">` : "";
    return `<li class="demo-track-card"><button type="button" class="demo-track-play" ${play} data-title="${escapeAttr(track.title)}" data-artist="${escapeAttr(track.artist)}">${cover}<span class="demo-track-play-icon">${svg(PLAY, 18)}</span></button><div class="demo-track-names"><div class="demo-track-meta"><div class="demo-track-title">${escapeHtml(track.title)}</div><button type="button" class="artist-link demo-track-artist" data-open-artist="1" data-artist-id="${escapeAttr(track.artistId || "")}" data-artist-name="${escapeAttr(track.artist)}">${escapeHtml(track.artist)}</button></div>${wishButton(track)}</div></li>`;
  }

  function mapDeezerTrack(row, requirePreview = true) {
    if (!row || !row.title || (requirePreview && !row.preview)) return null;
    return {
      id: row.id,
      title: row.title_short || row.title,
      artist: row.artist?.name || "",
      artistId: row.artist?.id || "",
      album: row.album?.title || "",
      cover: row.album?.cover_medium || row.album?.cover || "",
      preview: row.preview,
    };
  }

  async function deezer(path) {
    const response = await fetch("/api/deezer?path=" + encodeURIComponent(path));
    if (!response.ok) throw new Error("deezer");
    return response.json();
  }

  async function runDiscovery(query) {
    const host = document.getElementById("discovery-results");
    if (!host) return;
    if (query.length < 2) {
      host.innerHTML = "";
      lastSearchHtml = "";
      return;
    }
    host.innerHTML = '<p class="home-discovery-search-hint">Поиск…</p>';
    try {
      const [artistData, trackData] = await Promise.all([
        deezer("/search/artist?q=" + encodeURIComponent(query) + "&limit=8"),
        deezer("/search/track?q=" + encodeURIComponent(query) + "&limit=25"),
      ]);
      const artists = (artistData.data || []).filter((item) => item && item.id && item.name);
      const tracks = (trackData.data || []).map(mapDeezerTrack).filter(Boolean);
      if (!artists.length && !tracks.length) {
        host.innerHTML = '<p class="home-discovery-search-empty">Ничего не найдено</p>';
        lastSearchHtml = host.innerHTML;
        return;
      }
      const artistHtml = artists.length
        ? `<div class="home-discovery-section"><h3 class="home-discovery-section-title">Артисты</h3><ul class="artist-chip-grid">${artists
            .map(
              (artist) =>
                `<li><button type="button" class="artist-chip" data-open-artist="1" data-artist-id="${escapeAttr(artist.id)}" data-artist-name="${escapeAttr(artist.name)}">${
                  artist.picture_medium
                    ? `<img class="artist-chip-avatar" src="${escapeAttr(artist.picture_medium)}" alt="">`
                    : `<span class="artist-chip-avatar artist-chip-avatar-fallback">${svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>', 18)}</span>`
                }<span class="artist-chip-name">${escapeHtml(artist.name)}</span></button></li>`,
            )
            .join("")}</ul></div>`
        : "";
      const trackHtml = tracks.length
        ? `<div class="home-discovery-section"><h3 class="home-discovery-section-title">Треки с демо</h3><ul class="demo-tracks-grid">${tracks.map(trackCard).join("")}</ul></div>`
        : "";
      host.innerHTML = artistHtml + trackHtml;
      lastSearchHtml = host.innerHTML;
    } catch {
      host.innerHTML = '<p class="home-discovery-search-error">Не удалось выполнить поиск</p>';
    }
  }

  async function openArtist(id, name) {
    const host = panelHost();
    if (!host) return;
    const artistName = String(name || "").trim();
    if (!artistName && !id) return;
    rememberPanel(host);
    host.innerHTML = '<p class="home-discovery-search-hint">Загрузка…</p>';
    try {
      let artistId = String(id || "");
      if (!artistId) {
        const found = await deezer("/search/artist?q=" + encodeURIComponent(artistName) + "&limit=8");
        const want = artistName.toLowerCase();
        const hit = (found.data || []).find((item) => String(item.name || "").toLowerCase() === want) || (found.data || [])[0];
        artistId = hit ? String(hit.id) : "";
      }
      if (!artistId) throw new Error("missing");
      const [info, top, albums, foundTracks] = await Promise.all([
        deezer("/artist/" + encodeURIComponent(artistId)),
        deezer("/artist/" + encodeURIComponent(artistId) + "/top?limit=100"),
        deezer("/artist/" + encodeURIComponent(artistId) + "/albums?limit=100"),
        deezer("/search/track?q=" + encodeURIComponent(artistName || "") + "&limit=100"),
      ]);
      await renderArtist(host, info, top.data || [], albums.data || [], foundTracks.data || []);
    } catch {
      host.innerHTML =
        '<p class="home-discovery-search-error">Артист не найден</p><button type="button" class="btn btn-secondary" data-artist-back="1">Назад</button>';
    }
  }

  async function renderArtist(host, info, topRows, albumRows, searchRows) {
    const artistId = Number(info.id);
    const artistName = String(info.name || "");
    const want = artistName.toLowerCase();
    const own = [];
    const seen = new Set();
    for (const row of [...topRows, ...searchRows]) {
      const track = mapDeezerTrack(row, false);
      const key = String(track?.id || track?.preview || "");
      if (!track || !key || seen.has(key)) continue;
      if (Number(row.artist?.id) !== artistId) continue;
      if (/\bfeat\.|\bft\./i.test(row.title || "")) continue;
      seen.add(key);
      own.push(track);
    }
    const featureRows = [];
    const featureIds = new Set();
    for (const row of [...searchRows, ...topRows]) {
      if (!row?.id || featureIds.has(row.id) || Number(row.artist?.id) === artistId) continue;
      featureIds.add(row.id);
      featureRows.push(row);
    }
    const details = await Promise.all(featureRows.slice(0, 10).map((row) => deezer("/track/" + row.id).catch(() => null)));
    const features = [];
    for (const detail of details) {
      const names = (detail?.contributors || []).map((person) => String(person.name || "").toLowerCase());
      const mentioned = names.includes(want) || String(detail?.title || "").toLowerCase().includes(want);
      if (!mentioned) continue;
      const track = mapDeezerTrack(detail);
      if (!track || seen.has(track.preview)) continue;
      seen.add(track.preview);
      features.push(track);
    }
    const albums = albumRows.filter((album) => album && album.title && (album.record_type === "album" || album.record_type === "compile"));
    const fans = Number(info.nb_fan) || 0;
    const albumCount = Number(info.nb_album) || albums.length;
    const albumCards = albums
      .map((album) => {
        const year = String(album.release_date || "").slice(0, 4);
        return `<li><button type="button" class="artist-release-card" data-open-album="1" data-album-id="${escapeAttr(album.id)}" data-album-title="${escapeAttr(album.title)}"><div class="artist-release-cover">${album.cover_medium ? `<img src="${escapeAttr(album.cover_medium)}" alt="">` : ""}</div><div class="artist-release-meta"><div class="artist-release-title">${escapeHtml(album.title)}</div><div class="artist-release-sub">${escapeHtml(year)}</div></div></button></li>`;
      })
      .join("");
    host.innerHTML = `<div class="artist-view"><div class="artist-view-header"><button type="button" class="artist-view-back" data-artist-back="1"><span class="artist-view-back-icon" aria-hidden="true">${svg('<polyline points="9 18 15 12 9 6"/>', 16)}</span>Назад</button><div class="artist-view-hero"><div class="artist-view-cover">${info.picture_medium ? `<img src="${escapeAttr(info.picture_xl || info.picture_big || info.picture_medium)}" alt="">` : ""}</div><div class="artist-view-info"><h1>${escapeHtml(artistName)}</h1><p class="artist-view-stats">${fans ? `${fans.toLocaleString("ru-RU")} фанатов` : ""}${fans && albumCount ? " · " : ""}${albumCount ? `${albumCount} альбомов` : ""}</p></div></div></div><section class="artist-view-section"><h2>Треки <span class="artist-view-tab-count">${own.length}</span></h2>${own.length ? `<ul class="demo-tracks-grid">${own.map(trackCard).join("")}</ul>` : '<p class="artist-view-empty">Нет треков</p>'}</section><section class="artist-view-section"><h2>Альбомы</h2>${albumCards ? `<ul class="artist-releases-grid">${albumCards}</ul>` : '<p class="artist-view-empty">Нет альбомов</p>'}</section><section class="artist-view-section"><h2>Фиты</h2>${features.length ? `<ul class="demo-tracks-grid">${features.map(trackCard).join("")}</ul>` : '<p class="artist-view-empty">Нет фитов</p>'}</section></div>`;
    lastArtistHtml = host.innerHTML;
  }

  async function openAlbum(id) {
    const host = panelHost();
    if (!host || !id) return;
    if (host.querySelector(".artist-view") && !host.querySelector(".album-view")) lastArtistHtml = host.innerHTML;
    else if (!host.dataset.restore) rememberPanel(host);
    host.innerHTML = '<p class="home-discovery-search-hint">Загрузка…</p>';
    try {
      const [album, listed] = await Promise.all([
        deezer("/album/" + encodeURIComponent(id)),
        deezer("/album/" + encodeURIComponent(id) + "/tracks?limit=100"),
      ]);
      const rows = listed.data || album.tracks?.data || [];
      const tracks = rows
        .map((row) => {
          if (!row.album) row.album = { title: album.title || "", cover_medium: album.cover_medium || album.cover || "" };
          if (!row.artist && album.artist) row.artist = album.artist;
          return mapDeezerTrack(row, false);
        })
        .filter(Boolean);
      const cover = album.cover_medium || album.cover_xl || "";
      host.innerHTML = `<div class="album-view artist-view"><div class="artist-view-header"><button type="button" class="artist-view-back" data-album-back="1"><span class="artist-view-back-icon" aria-hidden="true">${svg('<polyline points="9 18 15 12 9 6"/>', 16)}</span>Назад</button><div class="artist-view-hero"><div class="artist-view-cover">${cover ? `<img src="${escapeAttr(cover)}" alt="">` : ""}</div><div class="artist-view-info"><h1>${escapeHtml(album.title || "")}</h1><p class="artist-view-stats">${escapeHtml(album.artist?.name || "")}${tracks.length ? ` · ${tracks.length} треков` : ""}</p></div></div></div><section class="artist-view-section"><h2>Треки альбома</h2>${tracks.length ? `<ul class="demo-tracks-grid">${tracks.map(trackCard).join("")}</ul>` : '<p class="artist-view-empty">Нет треков</p>'}</section></div>`;
    } catch {
      host.innerHTML = '<p class="home-discovery-search-error">Альбом не открылся</p><button type="button" class="btn btn-secondary" data-album-back="1">Назад</button>';
    }
  }

  function filterLibrary(query) {
    const needle = query.trim().toLowerCase();
    document.querySelectorAll(".song-row, .wishlist-row, .history-row").forEach((row) => {
      const blob = (
        (row.dataset.title || "") +
        " " +
        (row.dataset.artist || "") +
        " " +
        (row.dataset.album || "") +
        " " +
        row.textContent
      ).toLowerCase();
      row.hidden = Boolean(needle) && !blob.includes(needle);
    });
    const wishRows = document.querySelectorAll(".wishlist-row");
    if (wishRows.length) {
      const visible = [...wishRows].filter((row) => !row.hidden).length;
      const count = document.querySelector(".wishlist-search-count");
      if (count) {
        count.hidden = !needle;
        count.textContent = `${visible} из ${wishRows.length}`;
      }
      const empty = document.querySelector(".wishlist-search-empty");
      if (empty) empty.hidden = !needle || visible > 0;
    }
  }

  function panelHost() {
    return document.getElementById("discovery-results") || document.getElementById("wishlist-body");
  }

  async function openAlbumByName(title, artist) {
    const host = panelHost();
    if (!host) return;
    rememberPanel(host);
    host.dataset.albumFromList = "1";
    host.innerHTML = '<p class="home-discovery-search-hint">Загрузка…</p>';
    try {
      const data = await deezer(
        "/search/album?q=" + encodeURIComponent(`${title} ${artist}`.trim()) + "&limit=8",
      );
      const want = title.trim().toLowerCase();
      const hit =
        (data.data || []).find((album) => String(album.title || "").toLowerCase() === want) ||
        (data.data || [])[0];
      if (!hit?.id) throw new Error("missing");
      await openAlbum(String(hit.id));
    } catch {
      host.innerHTML =
        '<p class="home-discovery-search-error">Альбом не найден</p><button type="button" class="btn btn-secondary" data-album-back="1">Назад</button>';
    }
  }

  function rememberPanel(host) {
    if (!host || host.querySelector(".artist-view") || host.querySelector(".album-view")) return;
    if (host.id === "discovery-results") lastSearchHtml = host.innerHTML;
    else host.dataset.restore = host.innerHTML;
  }

  async function startWaves() {
    if (waves.active && audio.src && !audio.paused) {
      audio.pause();
      syncPlayButton();
      return;
    }
    if (waves.active && audio.src && audio.paused) {
      await audio.play();
      syncPlayButton();
      return;
    }
    waves.active = true;
    waves.queue = [];
    waves.index = -1;
    waves.seen = new Set();
    await refillWaves();
    if (!waves.queue.length) {
      waves.active = false;
      return;
    }
    playWavesIndex(0);
  }

  function toggleWavesSettings() {
    const panel = document.querySelector(".home-waves-settings");
    const button = document.querySelector('[data-act="waves-settings"]');
    if (!panel) return;
    const willOpen = panel.hasAttribute("hidden");
    panel.toggleAttribute("hidden", !willOpen);
    if (button) button.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }

  function shuffleTracks(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  }

  async function loadServerWaves() {
    const response = await fetch("/api/waves");
    if (!response.ok) return [];
    const data = await response.json();
    return (data.items || [])
      .filter((item) => item.previewUrl)
      .map((item) => ({
        url: item.previewUrl,
        title: item.title || "IMe Waves",
        artist: item.artist || "",
      }));
  }

  async function loadFallbackWaves() {
    const genre = document.querySelector('.waves-chip.is-active[data-waves-field="genre"]');
    const genreValue = genre ? genre.dataset.wavesValue : "all";
    const term = !genreValue || genreValue === "all"
      ? fallbackSeeds[Math.floor(Math.random() * fallbackSeeds.length)]
      : genreValue;
    const response = await fetch(
      "https://itunes.apple.com/search?entity=song&limit=40&country=ru&term=" + encodeURIComponent(term),
    );
    const data = await response.json();
    return shuffleTracks(
      (data.results || [])
        .filter((item) => item.previewUrl)
        .map((item) => ({
          url: item.previewUrl,
          title: item.trackName || "IMe Waves",
          artist: item.artistName || "",
        })),
    );
  }

  async function refillWaves() {
    let batch = [];
    try {
      batch = await loadServerWaves();
    } catch { /* offline */ }
    if (!batch.length) {
      try {
        batch = await loadFallbackWaves();
      } catch { /* no previews */ }
    }
    for (const item of batch) {
      if (!item.url || waves.seen.has(item.url)) continue;
      waves.seen.add(item.url);
      waves.queue.push(item);
    }
  }

  async function playWavesIndex(index) {
    if (index >= waves.queue.length - 3) await refillWaves();
    const item = waves.queue[index];
    if (!item) {
      waves.active = false;
      syncPlayButton();
      return;
    }
    waves.index = index;
    post("waves-heard", { url: item.url });
    const title = document.querySelector(".home-waves-title");
    const meta = document.querySelector(".home-waves-meta");
    if (title) title.textContent = item.title;
    if (meta) meta.innerHTML = artistLink(item.artist);
    playUrl(item.url, item.title, item.artist);
  }

  async function playQuery(title, artist) {
    const response = await fetch(
      "https://itunes.apple.com/search?entity=song&limit=1&country=ru&term=" +
        encodeURIComponent(`${title} ${artist}`.trim()),
    );
    const data = await response.json();
    const item = (data.results || []).find((entry) => entry.previewUrl);
    if (!item) return;
    waves.active = false;
    playUrl(item.previewUrl, item.trackName || title, item.artistName || artist);
  }

  async function playUrl(url, title, artist) {
    audio.src = url;
    try { await audio.play(); } catch { /* autoplay */ }
    setNowPlaying(title, artist, { url: url || "", cover: "" });
    syncPlayButton();
  }

  async function playId(id, title, artist) {
    if (!id) return;
    waves.active = false;
    const data = await post("play", { id });
    audio.src = "/audio/" + encodeURIComponent(id);
    try { await audio.play(); } catch { /* autoplay */ }
    setNowPlaying(title || data.title || "", artist || data.artist || "", { url: "", cover: "" });
    markCurrent(id);
    syncPlayButton();
  }

  function toggle() {
    if (waves.active && audio.src) {
      if (audio.paused) audio.play();
      else audio.pause();
      syncPlayButton();
      return;
    }
    if (!audio.src && document.body.dataset.current) {
      const row = document.querySelector(`[data-play="${cssEscape(document.body.dataset.current)}"]`);
      playId(document.body.dataset.current, row?.dataset.title || "", row?.dataset.artist || "");
      return;
    }
    if (!audio.src) return;
    if (audio.paused) {
      audio.play();
      post("resume");
    } else {
      audio.pause();
      post("pause");
    }
    syncPlayButton();
  }

  async function playNext() {
    if (waves.active) {
      playWavesIndex(waves.index + 1);
      return;
    }
    const data = await post("next");
    if (!data.id) return;
    const row = document.querySelector(`[data-play="${cssEscape(data.id)}"]`);
    audio.src = "/audio/" + encodeURIComponent(data.id);
    try { await audio.play(); } catch { /* autoplay */ }
    setNowPlaying(data.title || row?.dataset.title || now.title, data.artist || row?.dataset.artist || now.artist, { url: "", cover: "" });
    markCurrent(data.id);
    syncPlayButton();
  }

  async function playPrev() {
    if (waves.active) {
      playWavesIndex(Math.max(0, waves.index - 1));
      return;
    }
    const data = await post("prev");
    if (!data.id) return;
    const row = document.querySelector(`[data-play="${cssEscape(data.id)}"]`);
    audio.src = "/audio/" + encodeURIComponent(data.id);
    try { await audio.play(); } catch { /* autoplay */ }
    setNowPlaying(data.title || row?.dataset.title || now.title, data.artist || row?.dataset.artist || now.artist, { url: "", cover: "" });
    markCurrent(data.id);
    syncPlayButton();
  }

  function toggleMute() {
    if (audio.volume > 0) {
      audio.dataset.prev = String(audio.volume);
      audio.volume = 0;
    } else {
      audio.volume = Number(audio.dataset.prev || 0.8);
    }
    paintVolume(audio.volume);
    post("volume", { value: String(audio.volume) });
  }

  function syncPlayButton() {
    const playing = Boolean(audio.src) && !audio.paused;
    const btn = document.querySelector(".play-pause");
    if (btn) {
      btn.innerHTML = svg(playing ? PAUSE : PLAY, 22);
      btn.setAttribute("aria-label", playing ? "Пауза" : "Играть");
    }
    const wavesIcon = document.querySelector(".home-waves-play");
    if (wavesIcon) wavesIcon.innerHTML = svg(waves.active && playing ? PAUSE : PLAY, 22);
  }

  function paintProgress() {
    const duration = audio.duration || 0;
    const ratio = duration ? (audio.currentTime / duration) * 100 : 0;
    const fill = document.querySelector(".progress-fill");
    const thumb = document.querySelector(".progress-thumb");
    const times = document.querySelectorAll(".player-time");
    if (fill) fill.style.width = ratio + "%";
    if (thumb) thumb.style.left = ratio + "%";
    if (times[0]) times[0].textContent = fmt(audio.currentTime);
    if (times[1]) times[1].textContent = fmt(duration);
  }

  function paintVolume(level) {
    const width = Math.round(level * 100) + "%";
    const fill = document.querySelector(".volume-fill");
    const thumb = document.querySelector(".volume-thumb");
    if (fill) fill.style.width = width;
    if (thumb) thumb.style.left = width;
  }

  function artistLink(name, className) {
    const artist = String(name || "").trim();
    if (!artist) return "";
    return `<button type="button" class="artist-link ${className || ""}" data-open-artist="1" data-artist-name="${escapeAttr(artist)}">${escapeHtml(artist)}</button>`;
  }

  function setNowPlaying(title, artist, extra) {
    now = {
      title: title || "",
      artist: artist || "",
      url: extra && Object.prototype.hasOwnProperty.call(extra, "url") ? extra.url || "" : now.url,
      cover: extra && Object.prototype.hasOwnProperty.call(extra, "cover") ? extra.cover || "" : now.cover,
    };
    const box = document.querySelector(".player-track-info");
    if (!box) return;
    const link = artistLink(now.artist, "player-track-artist");
    const heart = now.title ? wishButton({ title: now.title, artist: now.artist, preview: now.url, cover: now.cover }) : "";
    box.innerHTML = `<div class="player-track-names"><div class="player-track-text"><div class="player-track-title">${escapeHtml(now.title || "Ничего не играет")}</div>${link}</div>${heart}</div>`;
  }

  function markCurrent(id) {
    document.querySelectorAll(".song-row.current").forEach((row) => row.classList.remove("current"));
    const row = document.querySelector(`[data-play="${cssEscape(id)}"]`);
    if (row) row.classList.add("current");
    document.body.dataset.current = id;
  }

  async function navigate(url, html) {
    if (!html) {
      const res = await fetch(url);
      html = await res.text();
      url = res.url || url;
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nextApp = doc.querySelector(".app");
    const app = document.querySelector(".app");
    const player = document.querySelector(".player-bar-wrap");
    if (!nextApp || !app || !player) {
      location.href = url;
      return;
    }
    const incomingPlayer = nextApp.querySelector(".player-bar-wrap");
    if (incomingPlayer) incomingPlayer.remove();
    app.replaceChildren(...nextApp.childNodes);
    const body = app.querySelector(".app-body");
    if (body) body.insertAdjacentElement("afterend", player);
    else app.appendChild(player);
    history.pushState({}, "", url);
    document.querySelectorAll(".ui-select").forEach(bindSelect);
    if (now.title) setNowPlaying(now.title, now.artist);
    syncPlayButton();
    paintProgress();
  }

  async function post(action, extra) {
    const body = new URLSearchParams({ action, ajax: "1", ...(extra || {}) });
    const response = await fetch("/act", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }
  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }
  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
  }

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    event.preventDefault();
    toggle();
  });

  syncPlayButton();
})();
