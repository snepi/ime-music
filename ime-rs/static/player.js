(() => {
  const audio = new Audio();
  let now = { title: "", artist: "", album: "", url: "", cover: "" };
  const rawVolume = document.body.dataset.volume;
  const parsedVolume = Number(rawVolume);
  audio.volume = rawVolume != null && rawVolume !== "" && Number.isFinite(parsedVolume) ? Math.min(1, Math.max(0, parsedVolume)) : 0.8;
  let drag = null;
  let sleep = { mode: "off", timer: 0 };
  const imports = [];
  let waves = { active: false, queue: [], index: -1, seen: new Set() };
  const fallbackSeeds = ["pop", "rock", "electronic", "hip hop", "jazz", "indie", "dance", "metal", "soul", "r&b", "house", "ambient"];

  const svg = (inner, size) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const PLAY = '<polygon points="6 4 20 12 6 20 6 4"/>';
  const PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
  const HEART_PATH =
    "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";
  const wished = new Set();
  const VOL = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
  const VOL_MUTE = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  let lastSearchHtml = "";
  let lastArtistHtml = "";

  const byId = (id) => document.getElementById(id);

  document.addEventListener("pointerdown", (event) => {
    const titlebar = event.target.closest(".titlebar");
    if (titlebar && event.button === 0 && !event.target.closest("button, a, input, .titlebar-btn")) {
      if (window.ipc && window.ipc.postMessage) window.ipc.postMessage("drag");
    }
    const progress = event.target.closest(".progress-bar");
    if (progress) {
      drag = { kind: "seek", el: progress };
      try { progress.setPointerCapture(event.pointerId); } catch { /* capture */ }
      seekTo(progress, event.clientX);
    }
    const volume = event.target.closest(".volume-bar");
    if (volume) {
      drag = { kind: "volume", el: volume };
      try { volume.setPointerCapture(event.pointerId); } catch { /* capture */ }
      setVolume(volume, event.clientX);
    }
  });
  document.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (drag.kind === "seek") seekTo(drag.el, event.clientX);
    if (drag.kind === "volume") setVolume(drag.el, event.clientX, false);
  });
  document.addEventListener("pointerup", () => {
    if (drag && drag.kind === "volume") post("volume", { value: String(audio.volume) });
    drag = null;
  });
  document.addEventListener("pointercancel", () => {
    drag = null;
  });

  document.addEventListener("click", (event) => {
    const scrim = event.target.closest(".modal-overlay-dismiss");
    if (scrim) {
      event.preventDefault();
      navigate(scrim.dataset.href || "/");
      return;
    }
    const resetColor = event.target.closest("[data-color-reset]");
    if (resetColor) {
      event.preventDefault();
      applyColor(resetColor.dataset.colorReset, resetColor.dataset.colorDefault);
      return;
    }
    if (event.target.closest("[data-color-reset-all]")) {
      event.preventDefault();
      document.querySelectorAll("[data-color-reset]").forEach((btn) => applyColor(btn.dataset.colorReset, btn.dataset.colorDefault));
      return;
    }
    const tool = event.target.closest("[data-tool]");
    if (tool) {
      event.preventDefault();
      runTool(tool.dataset.tool);
      return;
    }
    const menuBtn = event.target.closest("[data-menu]");
    if (menuBtn) {
      event.preventDefault();
      event.stopPropagation();
      openTrackMenu(menuBtn);
      return;
    }
    if (event.target.closest("[data-bell]")) {
      event.preventDefault();
      toggleBell();
      return;
    }
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
    const downloadAll = event.target.closest("[data-download-all]");
    if (downloadAll) {
      event.preventDefault();
      const buttons = [...document.querySelectorAll("[data-download-wish]")];
      downloadAll.disabled = true;
      (async () => {
        for (const button of buttons) {
          if (button.disabled) continue;
          await downloadWish(button);
        }
        downloadAll.disabled = false;
      })();
      return;
    }
    const downloadOne = event.target.closest("[data-download-wish]");
    if (downloadOne) {
      event.preventDefault();
      downloadWish(downloadOne);
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
    if (name === "queue") toggleQueue();
    if (name === "sleep") toggleSleep(act);
    if (name === "mini") toggleMini();
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
    const count = input.files.length;
    const body = new FormData();
    for (const file of input.files) body.append("files", file, file.name);
    const res = await fetch("/import", { method: "POST", body, redirect: "follow" });
    imports.unshift({ title: "Импорт файлов", state: "Завершено", meta: String(count) });
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
  audio.addEventListener("timeupdate", () => {
    if (drag && drag.kind === "seek") return;
    paintProgress();
  });
  audio.addEventListener("play", () => syncPlayButton());
  audio.addEventListener("pause", () => syncPlayButton());
  audio.addEventListener("ended", () => {
    if (sleep.mode === "track" || sleep.mode === "album") {
      finishSleep("Стоп в конце трека");
      return;
    }
    if (waves.active) playWavesIndex(waves.index + 1);
    else playNext();
  });

  let discoveryTimer = 0;
  function scheduleDiscovery(value) {
    window.clearTimeout(discoveryTimer);
    discoveryTimer = window.setTimeout(() => runDiscovery(value.trim()), 280);
  }

  function wishKey(title, artist) {
    return `${title}\n${artist}`.trim().toLowerCase();
  }
  try {
    const seed = document.getElementById("wishlist-seed");
    const items = seed ? JSON.parse(seed.textContent || "[]") : [];
    for (const item of items) wished.add(wishKey(item.title || "", item.artist || ""));
  } catch { /* seed */ }

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
    const artistName = String(name || "").trim();
    const blocked = ["неизвестный исполнитель", "unknown artist", "unknown", "—", "-"];
    if (!id && (!artistName || blocked.includes(artistName.toLowerCase()))) return;
    let host = panelHost();
    if (!host) {
      await navigate("/?view=home");
      host = document.getElementById("discovery-results");
    }
    if (!host) return;
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

  async function downloadWish(button) {
    const status = document.querySelector(".wishlist-download-status");
    button.disabled = true;
    if (status) status.textContent = "Запуск…";
    const body = new URLSearchParams({
      title: button.dataset.title || "",
      artist: button.dataset.artist || "",
      album: button.dataset.album || "",
      cover: button.dataset.cover || "",
    });
    const response = await fetch("/import-search", { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (status) status.textContent = data.message || data.error || "";
    if (data.ok) navigate("/?view=wishlist");
    else button.disabled = false;
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
    const nextAlbum = data.album || row?.dataset.album || "";
    if (sleep.mode === "album" && now.album && nextAlbum && nextAlbum !== now.album) {
      finishSleep("Стоп в конце альбома");
      return;
    }
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
      const restored = Number(audio.dataset.prev);
      audio.volume = Number.isFinite(restored) && restored > 0 ? restored : 0.8;
    }
    paintVolume(audio.volume);
    paintMuteIcon();
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

  function paintProgress(at) {
    const duration = audio.duration || 0;
    const time = typeof at === "number" ? at : audio.currentTime || 0;
    const ratio = duration ? (time / duration) * 100 : 0;
    const fill = document.querySelector(".progress-fill");
    const thumb = document.querySelector(".progress-thumb");
    const times = document.querySelectorAll(".player-time");
    if (fill) fill.style.width = ratio + "%";
    if (thumb) thumb.style.left = ratio + "%";
    if (times[0]) times[0].textContent = fmt(time);
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
      album: extra && Object.prototype.hasOwnProperty.call(extra, "album") ? extra.album || "" : now.album,
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

  function barRatio(el, clientX) {
    const rect = el.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }
  function seekTo(el, clientX) {
    const duration = Number(audio.duration);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const time = barRatio(el, clientX) * duration;
    paintProgress(time);
    try {
      audio.currentTime = time;
    } catch { /* seek */ }
  }
  function setVolume(el, clientX) {
    audio.volume = barRatio(el, clientX);
    paintVolume(audio.volume);
    paintMuteIcon();
  }
  document.addEventListener("wheel", (event) => {
    if (!event.target.closest(".player-volume")) return;
    event.preventDefault();
    const step = 0.05;
    const delta = event.deltaY < 0 ? step : -step;
    audio.volume = Math.min(1, Math.max(0, audio.volume + delta));
    paintVolume(audio.volume);
    paintMuteIcon();
    post("volume", { value: String(audio.volume) });
  }, { passive: false });
  function paintMuteIcon() {
    const btn = document.querySelector('[data-act="mute"]');
    if (!btn) return;
    const muted = audio.volume <= 0.001;
    btn.innerHTML = svg(muted ? VOL_MUTE : VOL, 18);
    btn.setAttribute("aria-label", muted ? "Включить звук" : "Без звука");
  }
  function toast(message, kind) {
    if (!message) return;
    let box = document.querySelector(".toast-container");
    if (!box) {
      box = document.createElement("div");
      box.className = "toast-container";
      document.body.appendChild(box);
    }
    const node = document.createElement("div");
    node.className = "toast toast-" + (kind || "info");
    node.textContent = message;
    box.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  }
  function applyColor(key, hex) {
    if (!key || !hex) return;
    const row = document.querySelector(`[data-color-key="${cssEscape(key)}"]`);
    if (row) {
      const swatch = row.querySelector('input[type="color"]');
      const field = row.querySelector(".theme-color-hex");
      const preview = row.querySelector(".theme-color-preview");
      if (swatch) swatch.value = hex;
      if (field) field.value = hex;
      if (preview) preview.style.background = hex;
    }
    const cssVar = {
      bgMain: "--bg-main",
      bgElevated: "--bg-elevated",
      textPrimary: "--text-primary",
      textSecondary: "--text-secondary",
      textMuted: "--text-muted",
      accent: "--accent",
    }[key];
    if (cssVar) document.documentElement.style.setProperty(cssVar, hex);
    post("set-color", { field: key, value: hex });
  }
  document.addEventListener("input", (event) => {
    const row = event.target.closest && event.target.closest("[data-color-key]");
    if (!row || !event.target.matches('input[type="color"], .theme-color-hex')) return;
    applyColor(row.dataset.colorKey, event.target.value);
  });
  function closePopups() {
    document.querySelectorAll(".context-menu, .player-sleep-menu, .import-notifications-portal, .queue-overlay, .phone-sync-modal").forEach((node) => {
      if (!node.classList.contains("queue-overlay") || node.dataset.sticky !== "1") node.remove();
    });
  }
  async function runTool(name) {
    if (name === "releases") {
      window.open("https://github.com/snepi/ime-music/releases", "_blank", "noopener");
      return;
    }
    if (name === "updates") {
      const data = await fetch("/api/updates").then((res) => res.json()).catch(() => ({ message: "Не удалось проверить обновления" }));
      toast(data.message || "Проверено", data.update ? "info" : "success");
      return;
    }
    if (name === "export-backup") {
      const blob = await fetch("/backup").then((res) => res.blob());
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "ime-music-backup.json";
      link.click();
      URL.revokeObjectURL(link.href);
      toast("Бэкап скачан", "success");
      return;
    }
    if (name === "import-backup") {
      document.getElementById("pick-backup")?.click();
      return;
    }
    if (name === "playlist-file") {
      document.getElementById("pick-playlist")?.click();
      return;
    }
    if (name === "playlist-url") {
      const url = document.getElementById("playlist-url")?.value || "";
      const data = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ url }),
      }).then((res) => res.json());
      toast(data.message || "Готово", data.ok ? "success" : "error");
      return;
    }
    if (name === "phone") {
      const data = await fetch("/api/phone/start", { method: "POST" }).then((res) => res.json());
      const status = data.status || {};
      const join = status.joinUrl ? (status.joinUrl.startsWith("http") ? status.joinUrl : location.origin + status.joinUrl) : "";
      const box = document.createElement("div");
      box.className = "modal-overlay";
      box.innerHTML = `<div class="modal phone-sync-modal" role="dialog" style="max-width:520px;position:relative"><div class="modal-header"><h2>Синхронизация с телефоном</h2></div><div class="modal-body"><p class="field-hint">ПК → телефон, только новые файлы. Одна домашняя сеть. Откройте эту ссылку в приложении на Android.</p><code class="phone-sync-url">${escapeHtml(join)}</code><p class="field-hint">${escapeHtml((status.lanAddresses || []).join(", "))}</p></div><div class="modal-footer"><button type="button" class="btn btn-danger" data-phone-stop="1">Остановить</button><button type="button" class="btn btn-ghost" data-close-pop="1">Закрыть</button></div></div>`;
      document.body.appendChild(box);
      return;
    }
    if (name === "meta") {
      toast("Синхронизация обложек и тегов…", "info");
      const data = await fetch("/api/meta", { method: "POST" }).then((res) => res.json());
      toast(data.message || "Готово", data.ok ? "success" : "error");
      if (data.ok) navigate(location.pathname + location.search);
      return;
    }
    if (name === "rebuild-autos" || name === "find-dupes" || name === "merge-dupes") {
      const action = name === "rebuild-autos" ? "rebuild-autos" : name;
      const data = await post(action);
      toast(data.message || "Готово", "success");
      if (name === "merge-dupes" || name === "rebuild-autos") navigate(location.pathname + location.search);
    }
  }
  document.addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.id === "pick-backup" && input.files[0]) {
      const text = await input.files[0].text();
      const data = await fetch("/import-backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: text }).then((res) => res.json());
      toast(data.message || "Импортировано", data.ok ? "success" : "error");
      input.value = "";
      return;
    }
    if (input.id === "pick-playlist" && input.files[0]) {
      const text = await input.files[0].text();
      const data = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text }),
      }).then((res) => res.json());
      toast(data.message || "Импортировано", data.ok ? "success" : "error");
      input.value = "";
    }
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-pop]")) {
      event.target.closest(".modal-overlay, .queue-overlay, .import-notifications-portal, .context-menu, .player-sleep-menu")?.remove();
    }
    if (event.target.closest("[data-phone-stop]")) {
      fetch("/api/phone/stop", { method: "POST" });
      event.target.closest(".modal-overlay")?.remove();
      toast("Синхронизация остановлена", "info");
    }
    const menuItem = event.target.closest("[data-menu-act]");
    if (!menuItem) return;
    const id = menuItem.dataset.id;
    const act = menuItem.dataset.menuAct;
    document.querySelectorAll(".context-menu").forEach((node) => node.remove());
    if (act === "play") playId(id, menuItem.dataset.title || "", menuItem.dataset.artist || "");
    if (act === "next") post("queue-next", { id }).then((data) => toast(data.message, "info"));
    if (act === "queue") post("queue-add", { id }).then((data) => toast(data.message, "info"));
    if (act === "like") post("like", { id });
    if (act === "playlist") post("add-playlist", { id, value: menuItem.dataset.playlist }).then(() => toast("Добавлено в плейлист", "success"));
    if (act === "edit") {
      const title = window.prompt("Название", menuItem.dataset.title || "");
      if (title == null) return;
      const artist = window.prompt("Артист", menuItem.dataset.artist || "") || "";
      const album = window.prompt("Альбом", menuItem.dataset.album || "") || "";
      post("update-meta", { id, title, artist, album }).then(() => navigate(location.pathname + location.search));
    }
    if (act === "reveal") post("reveal", { id }).then((data) => toast(data.message || "Файл", "info"));
    if (act === "delete") post("delete-song", { id }).then(() => navigate(location.pathname + location.search));
  });
  async function openTrackMenu(button) {
    document.querySelectorAll(".context-menu").forEach((node) => node.remove());
    const id = button.dataset.menu;
    const meta = await fetch("/api/queue").then((res) => res.json()).catch(() => ({ playlists: [] }));
    const playlists = (meta.playlists || [])
      .map((pl) => `<button type="button" class="context-menu-item" data-menu-act="playlist" data-id="${escapeAttr(id)}" data-playlist="${escapeAttr(pl.id)}">${escapeHtml(pl.name)}</button>`)
      .join("");
    const menu = document.createElement("div");
    menu.className = "context-menu";
    const rect = button.getBoundingClientRect();
    menu.style.left = Math.max(8, rect.left - 160) + "px";
    menu.style.top = rect.bottom + 6 + "px";
    const attrs = `data-id="${escapeAttr(id)}" data-title="${escapeAttr(button.dataset.title || "")}" data-artist="${escapeAttr(button.dataset.artist || "")}" data-album="${escapeAttr(button.dataset.album || "")}"`;
    menu.innerHTML =
      `<button type="button" class="context-menu-item" data-menu-act="play" ${attrs}>Воспроизвести сейчас</button>` +
      `<button type="button" class="context-menu-item" data-menu-act="next" ${attrs}>Добавить следующим</button>` +
      `<button type="button" class="context-menu-item" data-menu-act="queue" ${attrs}>Добавить в очередь</button>` +
      (playlists ? `<div class="context-menu-header">В плейлист</div>${playlists}` : "") +
      `<button type="button" class="context-menu-item" data-menu-act="like" ${attrs}>Нравится</button>` +
      `<button type="button" class="context-menu-item" data-menu-act="edit" ${attrs}>Редактировать метаданные</button>` +
      `<button type="button" class="context-menu-item" data-menu-act="reveal" ${attrs}>Открыть расположение</button>` +
      `<button type="button" class="context-menu-item danger" data-menu-act="delete" ${attrs}>Удалить из библиотеки</button>`;
    document.body.appendChild(menu);
  }
  async function toggleQueue() {
    const existing = document.querySelector(".queue-overlay");
    if (existing) {
      existing.remove();
      return;
    }
    const data = await fetch("/api/queue").then((res) => res.json());
    const rows = (data.items || [])
      .map((item) => `<li class="queue-row"><button type="button" class="context-menu-item" data-menu-act="play" data-id="${escapeAttr(item.id)}" data-title="${escapeAttr(item.title)}" data-artist="${escapeAttr(item.artist)}">${escapeHtml(item.title)} — ${escapeHtml(item.artist)}</button><button type="button" class="icon-btn" data-queue-remove="${escapeAttr(item.id)}" aria-label="Удалить из очереди">×</button></li>`)
      .join("");
    const panel = document.createElement("div");
    panel.className = "queue-overlay";
    panel.dataset.sticky = "1";
    panel.innerHTML = `<aside class="queue-panel" role="dialog" aria-label="Очередь"><div class="queue-panel-header"><h3>Очередь</h3><button type="button" class="icon-btn" data-close-pop="1" aria-label="Закрыть">×</button></div><p class="queue-hint">Сюда попадают треки из меню «Добавить в очередь».</p>${rows ? `<ul class="queue-list">${rows}</ul>` : '<p class="queue-hint">Очередь пуста</p>'}<div class="queue-panel-footer"><button type="button" class="btn btn-ghost" data-queue-clear="1">Очистить очередь</button></div></aside>`;
    document.body.appendChild(panel);
  }
  document.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-queue-remove]");
    if (remove) {
      post("queue-remove", { id: remove.dataset.queueRemove }).then(() => {
        document.querySelector(".queue-overlay")?.remove();
        toggleQueue();
      });
    }
    if (event.target.closest("[data-queue-clear]")) {
      post("queue-clear").then(() => document.querySelector(".queue-overlay")?.remove());
    }
    const sleepBtn = event.target.closest("[data-sleep]");
    if (sleepBtn) {
      const mode = sleepBtn.dataset.sleep;
      window.clearTimeout(sleep.timer);
      sleep.mode = mode;
      document.querySelectorAll(".player-sleep-menu").forEach((node) => node.remove());
      const playerBtn = document.querySelector('[data-act="sleep"]');
      if (playerBtn) playerBtn.classList.toggle("active", mode !== "off");
      if (mode === "off") toast("Сон-таймер выключен", "info");
      else if (mode === "track") toast("Стоп в конце трека", "success");
      else if (mode === "album") toast("Стоп в конце альбома", "success");
      else {
        const minutes = Number(mode);
        toast("Сон через " + minutes + " мин", "success");
        sleep.mode = "minutes";
        sleep.timer = window.setTimeout(() => finishSleep("Сон-таймер"), minutes * 60 * 1000);
      }
    }
  });
  function finishSleep(message) {
    window.clearTimeout(sleep.timer);
    sleep.mode = "off";
    audio.pause();
    syncPlayButton();
    const playerBtn = document.querySelector('[data-act="sleep"]');
    if (playerBtn) playerBtn.classList.remove("active");
    toast(message, "info");
  }
  function toggleSleep(button) {
    const existing = document.querySelector(".player-sleep-menu");
    if (existing) {
      existing.remove();
      return;
    }
    const rect = button.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "player-sleep-menu";
    menu.style.left = rect.left + "px";
    menu.style.bottom = window.innerHeight - rect.top + 8 + "px";
    menu.innerHTML = ["off:Выкл", "15:15 мин", "30:30 мин", "45:45 мин", "60:60 мин", "track:Конец трека", "album:Конец альбома"]
      .map((item) => {
        const [id, label] = item.split(":");
        return `<button type="button" data-sleep="${id}">${label}</button>`;
      })
      .join("");
    document.body.appendChild(menu);
  }
  function toggleMini() {
    let mini = document.querySelector(".mini-player");
    if (mini) {
      mini.remove();
      return;
    }
    mini = document.createElement("div");
    mini.className = "mini-player";
    mini.style.cssText = "position:fixed;right:16px;bottom:92px;width:420px;height:108px;z-index:320;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.45)";
    mini.innerHTML = `<div class="mini-player-art-fallback">${svg(PLAY, 22)}</div><div class="mini-player-meta"><div class="mini-player-title">${escapeHtml(now.title || "Ничего не играет")}</div><div class="mini-player-artist">${escapeHtml(now.artist || "")}</div><div class="mini-player-progress"><div class="mini-player-progress-fill" style="width:${audio.duration ? (audio.currentTime / audio.duration) * 100 : 0}%"></div></div></div><button type="button" class="player-btn play-pause" data-act="toggle" aria-label="Играть">${svg(audio.paused ? PLAY : PAUSE, 22)}</button>`;
    document.body.appendChild(mini);
    syncPlayButton();
  }
  function toggleBell() {
    const existing = document.querySelector(".import-notifications-portal");
    if (existing) {
      existing.remove();
      return;
    }
    const anchor = document.querySelector("[data-bell]");
    const rect = anchor ? anchor.getBoundingClientRect() : { bottom: 40, right: 80 };
    const list = imports
      .map((item) => `<li class="import-notifications-item"><div class="import-notifications-item-main"><span class="import-notifications-item-title">${escapeHtml(item.title)}</span><span class="import-notifications-item-state">${escapeHtml(item.state)}</span></div><div class="import-notifications-item-meta">${escapeHtml(item.meta || "")}</div></li>`)
      .join("");
    const panel = document.createElement("div");
    panel.className = "import-notifications import-notifications-portal";
    panel.style.top = rect.bottom + 8 + "px";
    panel.style.right = Math.max(8, window.innerWidth - rect.right) + "px";
    panel.innerHTML = `<div class="import-notifications-header"><strong>Установки</strong><button type="button" class="icon-btn" data-close-pop="1" aria-label="Скрыть">×</button></div><p class="import-notifications-empty">${imports.length ? "" : "Сейчас ничего не скачивается"}</p>${list ? `<ul class="import-notifications-list">${list}</ul>` : ""}`;
    document.body.appendChild(panel);
  }

  paintMuteIcon();
  syncPlayButton();
})();
