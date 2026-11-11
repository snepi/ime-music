(() => {
  const audio = new Audio();
  let now = { title: "", artist: "", album: "", url: "", cover: "" };
  const rawVolume = document.body.dataset.volume;
  const parsedVolume = Number(rawVolume);
  audio.volume = rawVolume != null && rawVolume !== "" && Number.isFinite(parsedVolume) ? Math.min(1, Math.max(0, parsedVolume)) : 0.8;
  let drag = null;
  let sleep = { mode: "off", timer: 0 };
  const imports = [];
  let waves = { active: false, artist: false, queue: [], index: -1, seen: new Set() };
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
    const libraryMix = event.target.closest("[data-library-mix]");
    if (libraryMix) {
      event.preventDefault();
      const ids = (libraryMix.dataset.ids || "").split(",").filter(Boolean);
      const items = ids.map((id) => {
        const song = library.find((entry) => entry.id === id);
        return { id, title: song?.title || libraryMix.dataset.title || "", artist: song?.artist || "", preview: "" };
      });
      if (!items.length) return;
      listQueue = { items, index: 0 };
      artistQueue = null;
      waves.active = false;
      waves.artist = false;
      playId(items[0].id, items[0].title, items[0].artist, true);
      return;
    }
    const playMix = event.target.closest("[data-play-mix]");
    if (playMix) {
      event.preventDefault();
      playCreatedMix(playMix.dataset.playMix || "");
      return;
    }
    const downloadMix = event.target.closest("[data-download-mix]");
    if (downloadMix) {
      event.preventDefault();
      downloadCreatedMix(downloadMix.dataset.downloadMix || "");
      return;
    }
    if (event.target.closest("[data-download-all-mixes]")) {
      event.preventDefault();
      readCreatedMixes().forEach((mix) => downloadCreatedMix(mix.id));
      return;
    }
    const deleteMix = event.target.closest("[data-delete-mix]");
    if (deleteMix) {
      event.preventDefault();
      post("delete-mix", { id: deleteMix.dataset.deleteMix || "" }).then(() => navigate("/?view=archive"));
      return;
    }
    const archivePlay = event.target.closest("[data-archive-play]");
    if (archivePlay) {
      event.preventDefault();
      playUrl("/audio/" + encodeURIComponent(archivePlay.dataset.id || ""), archivePlay.dataset.title || "", archivePlay.dataset.artist || "");
      return;
    }
    const archiveLibrary = event.target.closest("[data-archive-library]");
    if (archiveLibrary) {
      event.preventDefault();
      archiveLibrary.disabled = true;
      post("archive-to-library", { id: archiveLibrary.dataset.id || "" }).then(() => navigate("/?view=archive"));
      return;
    }
    const tool = event.target.closest("[data-tool]");
    if (tool) {
      event.preventDefault();
      runTool(tool.dataset.tool);
      return;
    }
    const hotkeyBind = event.target.closest("[data-hotkey]");
    if (hotkeyBind) {
      event.preventDefault();
      listeningHotkey = hotkeyBind;
      hotkeyBind.textContent = "Нажмите клавишу…";
      return;
    }
    const groupToggle = event.target.closest(".theme-group-toggle");
    if (groupToggle) {
      event.preventDefault();
      groupToggle.closest(".theme-group")?.classList.toggle("is-collapsed");
      return;
    }
    const themeAct = event.target.closest("[data-theme-act]");
    if (themeAct) {
      event.preventDefault();
      runThemeAct(themeAct.dataset.themeAct);
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
      const buttons = [...document.querySelectorAll("[data-download-wish]")].filter((button) => !button.disabled);
      downloadAll.disabled = true;
      downloadAll.classList.add("is-busy");
      notify(`Скачать все: ${buttons.length} ${buttons.length === 1 ? "трек" : "треков"}`, "info");
      (async () => {
        let added = 0;
        let failed = 0;
        for (let index = 0; index < buttons.length; index += 1) {
          const button = buttons[index];
          const label = [button.dataset.artist, button.dataset.title].filter(Boolean).join(" — ");
          const status = document.querySelector(".wishlist-download-status");
          if (status) status.textContent = `${index + 1} из ${buttons.length}: ${label}`;
          const ok = await downloadWish(button, true, true);
          if (ok) added += 1;
          else failed += 1;
        }
        downloadAll.classList.remove("is-busy");
        downloadAll.disabled = false;
        notify(
          `Готово. Добавлено: ${added}. Ошибок: ${failed}.`,
          failed ? "error" : "success",
        );
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
      openPlatform(platform.dataset.platform || "");
      return;
    }
    const artistMore = event.target.closest("[data-artist-more]");
    if (artistMore && artistPage) {
      event.preventDefault();
      const box = document.querySelector("[data-artist-tracks]");
      if (box) box.innerHTML = artistTrackRows(artistPage.tracks);
      artistMore.replaceWith(trackCountNote(artistPage.tracks.length));
      return;
    }
    const artistPlay = event.target.closest("[data-artist-play], [data-artist-track]");
    if (artistPlay && artistPage) {
      event.preventDefault();
      const index = Number(artistPlay.dataset.artistTrack || 0);
      playArtistFrom(Number.isFinite(index) ? index : 0);
      return;
    }
    const artistFav = event.target.closest("[data-artist-fav]");
    if (artistFav && artistPage) {
      event.preventDefault();
      toggleFavoriteArtist(artistFav);
      return;
    }
    const artistMenu = event.target.closest("[data-artist-menu]");
    if (artistMenu && artistPage) {
      event.preventDefault();
      openArtistMenu(artistMenu);
      return;
    }
    const artistWave = event.target.closest("[data-artist-wave]");
    if (artistWave && artistPage) {
      event.preventDefault();
      document.querySelectorAll(".context-menu").forEach((node) => node.remove());
      startArtistWave(artistPage.name, artistPage.id);
      return;
    }
    const artistAbout = event.target.closest("[data-artist-about]");
    if (artistAbout && artistPage) {
      event.preventDefault();
      openArtistAbout();
      return;
    }
    if (event.target.closest("[data-about-close]")) {
      event.target.closest(".artist-about-overlay")?.remove();
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
      if (!removing) {
        const title = wish.dataset.title || "";
        const artist = wish.dataset.artist || "";
        void (async () => {
          let match = null;
          try {
            const response = await fetch(
              "/api/archive/match?title=" + encodeURIComponent(title) + "&artist=" + encodeURIComponent(artist),
            );
            match = await response.json();
          } catch { /* wishlist */ }
          if (match && match.id) {
            const data = await post("archive-to-library", { id: match.id });
            const songId = data.detail && data.detail.id;
            if (songId && !library.some((song) => song.id === songId)) {
              library.push({ id: songId, title, artist, liked: false });
              writeJsonSeed("library-seed", library);
            }
            document.querySelector(`[data-archive-id="${cssEscape(match.id)}"]`)?.remove();
            notify("Трек добавлен в библиотеку", "success");
            return;
          }
          post("wish", {
            title,
            artist,
            url: wish.dataset.url || "",
            cover: wish.dataset.cover || "",
            album: wish.dataset.album || "",
          });
          wished.add(key);
          document.querySelectorAll("[data-wish]").forEach((node) => {
            if (wishKey(node.dataset.title || "", node.dataset.artist || "") !== key) return;
            node.classList.add("liked");
            node.innerHTML = heartIcon(true);
          });
        })();
        return;
      }
      post("wish", {
        title: wish.dataset.title || "",
        artist: wish.dataset.artist || "",
        url: wish.dataset.url || "",
        cover: wish.dataset.cover || "",
        album: wish.dataset.album || "",
      });
      wished.delete(key);
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
      armAround(wishPlay);
      const local = librarySong(wishPlay.dataset.title || "", wishPlay.dataset.artist || "");
      if (local) playId(local.id, local.title, local.artist, true);
      else playQuery(wishPlay.dataset.title || "", wishPlay.dataset.artist || "");
      return;
    }
    const queryPlay = event.target.closest("[data-play-query]");
    if (queryPlay) {
      event.preventDefault();
      armAround(queryPlay);
      const local = librarySong(queryPlay.dataset.title || "", queryPlay.dataset.artist || "");
      if (local) playId(local.id, local.title, local.artist, true);
      else playQuery(queryPlay.dataset.title || "", queryPlay.dataset.artist || "");
      return;
    }
    const preview = event.target.closest("[data-preview]");
    if (preview) {
      event.preventDefault();
      armAround(preview);
      const local = librarySong(preview.dataset.title || "", preview.dataset.artist || "");
      if (local) {
        playId(local.id, local.title, local.artist, true);
        return;
      }
      waves.active = false;
      artistQueue = null;
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
      if (row.classList.contains("song-row") || row.closest(".song-list, .demo-tracks-grid, .wishlist-list, .rec-track-list")) {
        armAround(row);
        playId(row.dataset.play, row.dataset.title || "", row.dataset.artist || "", true);
      } else {
        playId(row.dataset.play, row.dataset.title || "", row.dataset.artist || "");
      }
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
      post("waves-setting", { field, value }).then(() => {
        if (waves.active) refreshWave();
      });
      return;
    }
    const recChip = event.target.closest("[data-rec-filter]");
    if (recChip) {
      event.preventDefault();
      recFilter = recChip.dataset.recFilter || "all";
      document.querySelectorAll("[data-rec-filter]").forEach((node) => {
        const on = node === recChip;
        node.classList.toggle("active", on);
        node.setAttribute("aria-selected", on ? "true" : "false");
      });
      loadRecommendations(recFilter, false);
      return;
    }
    const act = event.target.closest("[data-act]");
    if (!act) return;
    const name = act.dataset.act;
    if (name === "toggle") toggle();
    if (name === "next") playNext();
    if (name === "prev") playPrev();
    if (name === "waves-save") notify("Настройки волны сохранены", "success");
    if (name === "waves-reset") resetWaves();
    if (name === "waves-refresh") refreshWave();
    if (name === "refresh-rec") loadRecommendations(recFilter, true);
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
      const song = library.find((item) => item.id === String(data.get("id") || ""));
      if (song) song.liked = !song.liked;
      writeJsonSeed("library-seed", library);
      refreshRecommendationsIfOpen();
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
    if (input.dataset.setField) {
      const label = input.closest("label")?.querySelector("[data-range-label]");
      if (label) label.textContent = `${label.dataset.rangeLabel}: ${input.value}${input.dataset.setUnit || ""}`;
      applySettingLive(input.dataset.setField, input.value);
      return;
    }
    if (input.matches("[data-theme-search]")) {
      const query = input.value.trim().toLowerCase();
      document.querySelectorAll(".theme-color-row").forEach((row) => {
        row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query);
      });
      return;
    }
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
      `<button type="button" class="context-menu-item" data-open-artist="1" data-artist-name="${escapeAttr(name)}">Карточка артиста</button>` +
      platformMenu(name);
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
    const fade = Number(document.body.dataset.crossfade || 0);
    if (document.body.dataset.gapless !== "1" && fade > 0 && audio.duration && audio.duration - audio.currentTime < fade) {
      const left = Math.max(0, audio.duration - audio.currentTime);
      audio.volume = Math.max(0.05, (left / fade) * Number(document.body.dataset.volume || 0.8));
    }
  });
  audio.addEventListener("play", () => syncPlayButton());
  audio.addEventListener("pause", () => syncPlayButton());
  audio.addEventListener("ended", () => {
    if (sleep.mode === "track" || sleep.mode === "album") {
      finishSleep("Стоп в конце трека");
      return;
    }
    playNext();
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

  const library = [];
  function readLibrary(raw) {
    library.length = 0;
    try {
      const items = JSON.parse(raw || "[]");
      for (const item of items) library.push(item);
    } catch { /* seed */ }
  }
  readLibrary(document.getElementById("library-seed")?.textContent || "[]");

  function normTrack(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ");
  }

  function shuffleEnabled() {
    return Boolean(document.querySelector('[data-act="shuffle"].active'));
  }

  function armAround(el) {
    const container = el.closest(".song-list, .demo-tracks-grid, .wishlist-list, .rec-track-list");
    if (!container) return;
    const nodes = container.classList.contains("song-list")
      ? [...container.querySelectorAll(".song-row")]
      : [...container.querySelectorAll(".demo-track-play, .wishlist-play")];
    let items = nodes.map((node) => ({
      title: node.dataset.title || "",
      artist: node.dataset.artist || "",
      preview: node.dataset.preview || "",
      id: node.classList.contains("song-row") ? node.dataset.play || "" : node.dataset.play || "",
    }));
    const key = `${normTrack(el.dataset.title)}\n${normTrack(el.dataset.artist)}`;
    let index = items.findIndex((item) => `${normTrack(item.title)}\n${normTrack(item.artist)}` === key);
    if (index < 0) index = 0;
    if (container.classList.contains("song-list") && shuffleEnabled()) {
      const current = items[index];
      const rest = items.filter((_, itemIndex) => itemIndex !== index);
      shuffleTracks(rest);
      items = current ? [current, ...rest] : rest;
      index = 0;
    }
    listQueue = { items, index };
    artistQueue = null;
    waves.active = false;
    waves.artist = false;
  }

  function playQueued(index) {
    if (!listQueue) return;
    const item = listQueue.items[index];
    if (!item) return;
    listQueue.index = index;
    waves.active = false;
    const local = librarySong(item.title, item.artist);
    if (local) {
      playId(local.id, local.title || item.title, local.artist || item.artist, true);
      return;
    }
    if (item.id) {
      playId(item.id, item.title, item.artist, true);
      return;
    }
    if (item.preview) playUrl(item.preview, item.title, item.artist);
    else playQuery(item.title, item.artist);
  }

  function stepList(delta) {
    if (waves.active) {
      const next = waves.index + delta;
      if (next < 0 || next >= waves.queue.length) return true;
      playWavesIndex(next);
      return true;
    }
    if (artistQueue) {
      const next = artistQueue.index + delta;
      if (next < 0 || next >= artistQueue.items.length) return true;
      playArtistFrom(next);
      return true;
    }
    if (listQueue) {
      const next = listQueue.index + delta;
      if (next < 0 || next >= listQueue.items.length) return true;
      playQueued(next);
      return true;
    }
    return false;
  }

  function librarySong(title, artist) {
    const wantTitle = normTrack(title);
    const wantArtist = normTrack(artist);
    if (!wantTitle) return null;
    return (
      library.find((song) => normTrack(song.title) === wantTitle && (!wantArtist || normTrack(song.artist) === wantArtist)) ||
      null
    );
  }

  function playAttrs(track) {
    const local = librarySong(track.title, track.artist);
    if (local) return `data-play="${escapeAttr(local.id)}"`;
    if (track.preview) return `data-preview="${escapeAttr(track.preview)}"`;
    return `data-play-query="1"`;
  }

  function trackCard(track) {
    const play = playAttrs(track);
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

  let artistPage = null;
  let artistQueue = null;
  let listQueue = null;
  let recFilter = "all";
  const favorites = [];
  try {
    const seed = document.getElementById("favorite-artists-seed");
    const items = seed ? JSON.parse(seed.textContent || "[]") : [];
    for (const item of items) favorites.push(item);
  } catch { /* seed */ }

  function platformLinks(query, deezerId) {
    const q = encodeURIComponent(query);
    const deezer = deezerId
      ? `https://www.deezer.com/artist/${encodeURIComponent(deezerId)}`
      : `https://www.deezer.com/search/${q}`;
    return [
      { id: "deezer", label: "Deezer", url: deezer },
      { id: "spotify", label: "Spotify", url: `https://open.spotify.com/search/${q}` },
      { id: "yandex", label: "Яндекс Музыка", url: `https://music.yandex.ru/search?text=${q}` },
    ];
  }

  function platformMenu(name) {
    return platformLinks(name)
      .map(
        (item) =>
          `<button type="button" class="context-menu-item" data-platform="${escapeAttr(item.url)}">${escapeHtml(item.label)}</button>`,
      )
      .join("");
  }

  function openPlatform(url) {
    if (!/^https?:\/\//i.test(url)) return;
    post("open-url", { url });
    notify("Открываю", "info");
  }

  function isFavoriteArtist(name) {
    const key = String(name || "").trim().toLowerCase();
    return favorites.some((item) => String(item.name || "").trim().toLowerCase() === key);
  }

  async function toggleFavoriteArtist(button) {
    const page = artistPage;
    if (!page) return;
    const data = await post("favorite-artist", {
      artist: page.name,
      id: String(page.id || ""),
      cover: page.picture || "",
    });
    const on = Boolean(data.detail && data.detail.favorite);
    const key = page.name.trim().toLowerCase();
    const index = favorites.findIndex((item) => String(item.name || "").trim().toLowerCase() === key);
    if (on && index < 0) {
      favorites.unshift({ name: page.name, deezerId: String(page.id || ""), picture: page.picture || "" });
    }
    if (!on && index >= 0) favorites.splice(index, 1);
    writeJsonSeed("favorite-artists-seed", favorites);
    refreshRecommendationsIfOpen();
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.innerHTML = heartIcon(on);
    notify(data.message || (on ? "Артист добавлен в избранное" : "Артист убран из избранного"), "success");
  }

  function openArtistMenu(anchor) {
    document.querySelectorAll(".context-menu").forEach((node) => node.remove());
    const menu = document.createElement("div");
    menu.className = "context-menu";
    const rect = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, rect.left) + "px";
    menu.style.top = rect.bottom + 6 + "px";
    menu.innerHTML =
      `<div class="context-menu-header">${escapeHtml(artistPage.name)}</div>` +
      `<button type="button" class="context-menu-item" data-artist-wave="1">IMe Waves: ${escapeHtml(artistPage.name)}</button>`;
    document.body.appendChild(menu);
  }

  async function startArtistWave(name, id) {
    artistQueue = null;
    waves.active = true;
    waves.artist = true;
    waves.queue = [];
    waves.index = -1;
    waves.seen = new Set();
    notify(`Волна: ${name}`, "info");
    try {
      const response = await fetch(
        "/api/waves?artist=" + encodeURIComponent(name) + "&id=" + encodeURIComponent(id || ""),
      );
      const data = await response.json();
      const batch = (data.items || [])
        .filter((item) => item.previewUrl)
        .map((item) => ({
          url: item.previewUrl,
          title: item.title || name,
          artist: item.artist || name,
        }));
      for (const item of batch) {
        if (!item.url || waves.seen.has(item.url)) continue;
        waves.seen.add(item.url);
        waves.queue.push(item);
      }
    } catch { /* offline */ }
    if (!waves.queue.length) {
      waves.active = false;
      waves.artist = false;
      notify("Для этой волны нет демо", "error");
      return;
    }
    playWavesIndex(0);
    scheduleArchive();
  }

  async function artistBio(name) {
    const read = async (title) => {
      const response = await fetch(
        "https://ru.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(String(title).replace(/ /g, "_")),
      );
      if (!response.ok) return "";
      const data = await response.json();
      if (data.type === "disambiguation" || !data.extract) return "";
      return String(data.extract);
    };
    const direct = await read(name);
    if (direct) return direct;
    const response = await fetch(
      "https://ru.wikipedia.org/w/api.php?origin=*&action=opensearch&search=" +
        encodeURIComponent(`${name} певица`) +
        "&limit=1&namespace=0&format=json",
    );
    if (!response.ok) return "";
    const data = await response.json();
    const found = data[1] && data[1][0];
    return found ? read(found) : "";
  }

  async function openArtistAbout() {
    const page = artistPage;
    if (!page) return;
    document.querySelectorAll(".artist-about-overlay").forEach((node) => node.remove());
    let bio = "";
    try {
      bio = await artistBio(page.name);
    } catch { /* no article */ }
    const links = platformLinks(page.name, page.id)
      .map(
        (item) =>
          `<button type="button" class="artist-platform" data-platform="${escapeAttr(item.url)}">${escapeHtml(item.label)}</button>`,
      )
      .join("");
    const overlay = document.createElement("div");
    overlay.className = "artist-about-overlay";
    overlay.innerHTML = `<div class="artist-about" role="dialog" aria-modal="true" aria-labelledby="artist-about-title"><button type="button" class="artist-about-close" data-about-close="1" aria-label="Закрыть">×</button><p class="artist-kicker">Об исполнителе</p><h2 id="artist-about-title">${escapeHtml(page.name)}</h2><p class="artist-about-bio">${bio ? escapeHtml(bio) : "Описания нет. Площадки артиста ниже."}</p><div class="artist-platforms">${links}</div></div>`;
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function trackCountNote(count) {
    const note = document.createElement("p");
    note.className = "artist-view-section-count";
    note.textContent = `Всего: ${count} треков`;
    return note;
  }

  function artistTrackMarkup(track, index, play) {
    const cover = track.cover
      ? `<img class="artist-track-cover" src="${escapeAttr(track.cover)}" alt="">`
      : `<span class="artist-track-cover artist-track-cover-empty"></span>`;
    const artist = track.artist
      ? `<span class="artist-track-artist">${escapeHtml(track.artist)}</span>`
      : "";
    return `<li class="artist-track-row" data-title="${escapeAttr(track.title)}" data-artist="${escapeAttr(track.artist)}"><span class="artist-track-rank">${index + 1}</span><button type="button" class="artist-track-main" ${play} data-title="${escapeAttr(track.title)}" data-artist="${escapeAttr(track.artist)}"><span class="artist-track-cover-wrap">${cover}<span class="artist-track-glyph"></span></span><span class="artist-track-text"><span class="artist-track-title">${escapeHtml(track.title)}</span>${artist}</span></button>${wishButton(track)}</li>`;
  }

  function featureList(items) {
    return items.map((track, index) => artistTrackMarkup(track, index, playAttrs(track))).join("");
  }

  function playArtistFrom(index) {
    const track = artistPage && artistPage.tracks[index];
    if (!track) return;
    waves.active = false;
    waves.artist = false;
    listQueue = null;
    artistQueue = { items: artistPage.tracks, index };
    const local = librarySong(track.title, track.artist || artistPage.name);
    if (local) {
      playId(local.id, local.title || track.title, local.artist || artistPage.name, true);
      return;
    }
    if (track.preview) playUrl(track.preview, track.title, artistPage.name);
    else playQuery(track.title, artistPage.name).then(() => {
      if (artistPage) artistQueue = { items: artistPage.tracks, index };
    });
  }

  function artistTrackRows(tracks) {
    return tracks.map((track, index) => artistTrackMarkup(track, index, `data-artist-track="${index}"`)).join("");
  }

  async function deezerPages(path, cap) {
    const rows = [];
    let next = path;
    for (let guard = 0; next && rows.length < cap && guard < 8; guard += 1) {
      const page = await deezer(next);
      rows.push(...(page.data || []));
      const link = String(page.next || "");
      const at = link.indexOf("api.deezer.com");
      next = at >= 0 ? link.slice(at + "api.deezer.com".length) : "";
      if (!next.startsWith("/")) next = "";
    }
    return rows;
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
      const quoted = encodeURIComponent(`artist:"${artistName || ""}"`);
      const mentioned = encodeURIComponent(artistName || "");
      const [info, top, albumRows, searchRows, mentionRows, related] = await Promise.all([
        deezer("/artist/" + encodeURIComponent(artistId)),
        deezer("/artist/" + encodeURIComponent(artistId) + "/top?limit=100"),
        deezerPages("/artist/" + encodeURIComponent(artistId) + "/albums?limit=100", 400),
        deezerPages("/search/track?q=" + quoted + "&limit=100", 300),
        deezer("/search/track?q=" + mentioned + "&limit=80").catch(() => ({ data: [] })),
        deezer("/artist/" + encodeURIComponent(artistId) + "/related?limit=20").catch(() => ({ data: [] })),
      ]);
      const extraAlbums = [];
      for (let index = 0; index < albumRows.length; index += 8) {
        const chunk = albumRows.slice(index, index + 8);
        const lists = await Promise.all(chunk.map((album) => deezer("/album/" + album.id + "/tracks?limit=100").catch(() => ({ data: [] }))));
        for (const list of lists) {
          for (const row of list.data || []) {
            if (!row.artist) row.artist = { id: Number(artistId), name: artistName };
            extraAlbums.push(row);
          }
        }
      }
      renderArtist(host, info, top.data || [], searchRows, mentionRows.data || [], extraAlbums, albumRows, related.data || []);
    } catch {
      host.innerHTML =
        '<p class="home-discovery-search-error">Артист не найден</p><button type="button" class="btn btn-secondary" data-artist-back="1">Назад</button>';
    }
  }

  function renderArtist(host, info, topRows, searchRows, mentionRows, albumTrackRows, albumRows, relatedRows) {
    const artistId = Number(info.id);
    const artistName = String(info.name || "");
    const want = artistName.toLowerCase();
    const byId = new Map();
    for (const row of [...topRows, ...searchRows, ...albumTrackRows]) {
      if (!row?.id || Number(row.artist?.id) !== artistId) continue;
      if (/\bfeat\.|\bft\./i.test(row.title || "")) continue;
      const previous = byId.get(row.id);
      if (!previous || Number(row.rank || 0) > Number(previous.rank || 0)) byId.set(row.id, row);
    }
    const tracks = [...byId.values()]
      .sort((a, b) => Number(b.rank || 0) - Number(a.rank || 0))
      .map((row) => mapDeezerTrack(row, false))
      .filter(Boolean);
    const featureRows = [];
    const featureSeen = new Set();
    for (const row of mentionRows) {
      if (!row?.id || featureSeen.has(row.id) || Number(row.artist?.id) === artistId) continue;
      const title = String(row.title || "").toLowerCase();
      const contributors = (row.contributors || []).map((person) => String(person.name || "").toLowerCase());
      if (!title.includes(want) && !contributors.includes(want)) continue;
      featureSeen.add(row.id);
      featureRows.push(row);
    }
    featureRows.sort((a, b) => Number(b.rank || 0) - Number(a.rank || 0));
    const features = featureRows.map((row) => mapDeezerTrack(row, false)).filter(Boolean);
    const albums = albumRows
      .filter((album) => album && album.title)
      .sort((a, b) => Number(b.fans || 0) - Number(a.fans || 0) || String(b.release_date || "").localeCompare(String(a.release_date || "")));
    const picture = info.picture_xl || info.picture_big || info.picture_medium || "";
    artistPage = { id: artistId, name: artistName, picture, tracks };
    const fans = Number(info.nb_fan) || 0;
    const albumCount = Number(info.nb_album) || albums.length;
    const favorite = isFavoriteArtist(artistName);
    const previewTracks = tracks.slice(0, 8);
    const hidden = tracks.length - previewTracks.length;
    const albumCards = albums
      .map((album) => {
        const year = String(album.release_date || "").slice(0, 4);
        const kind = album.record_type === "single" ? "Сингл" : album.record_type === "ep" ? "EP" : album.record_type === "compile" ? "Сборник" : "";
        return `<li><button type="button" class="artist-release-card" data-open-album="1" data-album-id="${escapeAttr(album.id)}" data-album-title="${escapeAttr(album.title)}"><div class="artist-release-cover">${album.cover_medium ? `<img src="${escapeAttr(album.cover_medium)}" alt="">` : ""}</div><div class="artist-release-meta"><div class="artist-release-title">${escapeHtml(album.title)}</div><div class="artist-release-sub">${escapeHtml([year, kind].filter(Boolean).join(" · "))}</div></div></button></li>`;
      })
      .join("");
    const similar = (relatedRows || [])
      .filter((artist) => artist && artist.name)
      .map(
        (artist) =>
          `<li><button type="button" class="artist-chip" data-open-artist="1" data-artist-id="${escapeAttr(artist.id)}" data-artist-name="${escapeAttr(artist.name)}">${
            artist.picture_medium
              ? `<img class="artist-chip-avatar" src="${escapeAttr(artist.picture_medium)}" alt="">`
              : `<span class="artist-chip-avatar artist-chip-avatar-fallback">${svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>', 18)}</span>`
          }<span class="artist-chip-name">${escapeHtml(artist.name)}</span></button></li>`,
      )
      .join("");
    const platforms = platformLinks(artistName, artistId)
      .map(
        (item) =>
          `<button type="button" class="artist-platform" data-platform="${escapeAttr(item.url)}">${escapeHtml(item.label)}</button>`,
      )
      .join("");
    const glow = picture ? ` style="background-image:url('${escapeAttr(picture)}')"` : "";
    host.innerHTML = `<div class="artist-page artist-view"><button type="button" class="artist-view-back" data-artist-back="1"><span class="artist-view-back-icon" aria-hidden="true">${svg('<polyline points="9 18 15 12 9 6"/>', 16)}</span>Назад</button><header class="artist-hero"><div class="artist-hero-glow"${glow}></div><div class="artist-hero-cover">${picture ? `<img src="${escapeAttr(picture)}" alt="">` : svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>', 64)}</div><div class="artist-hero-copy"><p class="artist-kicker">Артист</p><h1>${escapeHtml(artistName)}</h1><p class="artist-hero-stats">${fans ? `${fans.toLocaleString("ru-RU")} фанатов` : ""}${fans && albumCount ? " · " : ""}${albumCount ? `${albumCount} альбомов` : ""}</p><div class="artist-hero-actions"><button type="button" class="btn btn-primary artist-play" data-artist-play="1">${svg(PLAY, 16)}<span>Слушать</span></button><button type="button" class="artist-icon-btn${favorite ? " is-on" : ""}" data-artist-fav="1" aria-pressed="${favorite ? "true" : "false"}" aria-label="Избранные артисты" title="Избранные артисты">${heartIcon(favorite)}</button><button type="button" class="artist-icon-btn" data-artist-menu="1" aria-label="Ещё">${svg('<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>', 18)}</button><button type="button" class="btn btn-secondary" data-artist-about="1">Об исполнителе</button></div><div class="artist-platforms">${platforms}</div></div></header><section class="artist-section"><div class="artist-section-head"><h2>Популярные треки</h2><span class="artist-view-tab-count">${tracks.length}</span></div>${tracks.length ? `<ol class="artist-track-list" data-artist-tracks>${artistTrackRows(previewTracks)}</ol>${hidden > 0 ? `<button type="button" class="btn btn-secondary artist-section-more" data-artist-more="1">Показать все (${hidden})</button>` : `<p class="artist-view-section-count">Всего: ${tracks.length} треков</p>`}` : '<p class="artist-view-empty">Нет треков</p>'}</section><section class="artist-section"><div class="artist-section-head"><h2>Альбомы</h2><span class="artist-view-tab-count">${albums.length}</span></div>${albumCards ? `<ul class="artist-releases-grid">${albumCards}</ul>` : '<p class="artist-view-empty">Нет альбомов</p>'}</section><section class="artist-section"><div class="artist-section-head"><h2>Фиты</h2><span class="artist-view-tab-count">${features.length}</span></div>${features.length ? `<ol class="artist-track-list">${featureList(features)}</ol>` : '<p class="artist-view-empty">Нет фитов</p>'}</section><section class="artist-section"><div class="artist-section-head"><h2>Похожие артисты</h2></div>${similar ? `<ul class="artist-chip-grid artist-similar">${similar}</ul>` : '<p class="artist-view-empty">Нет похожих артистов</p>'}</section></div>`;
    lastArtistHtml = host.innerHTML;
  }

  async function openAlbum(id) {
    const host = panelHost();
    if (!host || !id) return;
    const fromRecommendations = host.id === "recommendations-root";
    if (fromRecommendations) {
      host.dataset.restore = host.innerHTML;
      host.dataset.albumFromList = "1";
    } else if (host.querySelector(".artist-view") && !host.querySelector(".album-view")) lastArtistHtml = host.innerHTML;
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
      if (fromRecommendations && tracks.length) {
        const playable = tracks.map((track) => ({
          title: track.title,
          artist: track.artist || album.artist?.name || "",
          preview: track.preview || "",
          id: "",
        }));
        if (!playable[0].preview && playable[0].title) {
          const found = await deezer(
            "/search/track?q=" +
              encodeURIComponent(`track:"${playable[0].title}" artist:"${playable[0].artist}"`) +
              "&limit=5",
          );
          const hit = (found.data || []).find((row) => row.preview);
          if (hit?.preview) playable[0].preview = hit.preview;
        }
        listQueue = { items: playable, index: 0 };
        artistQueue = null;
        waves.active = false;
        const first = playable[0];
        const local = librarySong(first.title, first.artist);
        if (local) playId(local.id, local.title, local.artist, true);
        else if (first.preview) playUrl(first.preview, first.title, first.artist);
        else playQuery(first.title, first.artist);
      }
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

  function notify(text, kind) {
    let host = document.querySelector(".toast-container");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-container";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${kind}`;
    toast.setAttribute("role", "status");
    toast.textContent = text;
    host.appendChild(toast);
    window.setTimeout(() => toast.remove(), 7000);
  }

  function paintImport(data, button) {
    const status = document.querySelector(".wishlist-download-status");
    const panel = document.querySelector(".wishlist-download-panel");
    if (panel) panel.hidden = false;
    if (status) status.textContent = data.message || "";
    const bar = panel?.querySelector(".import-bar");
    const fill = bar?.querySelector(".import-bar-fill");
    if (bar && fill) {
      if (data.percent == null) bar.classList.add("import-bar-indeterminate");
      else {
        bar.classList.remove("import-bar-indeterminate");
        fill.style.width = `${data.percent}%`;
      }
    }
    if (button) {
      button.textContent = data.percent != null ? `Скачивание ${data.percent}%` : "Поиск…";
    }
  }

  async function downloadWish(button, quiet, stay) {
    const label = [button.dataset.artist, button.dataset.title].filter(Boolean).join(" — ");
    button.disabled = true;
    button.classList.add("is-busy");
    paintImport({ message: `Поиск: ${label}`, percent: null }, button);
    if (!quiet) notify(`Скачивание: ${label}`, "info");
    const timer = window.setInterval(async () => {
      const data = await fetch("/import-status").then((res) => res.json()).catch(() => null);
      if (data) paintImport(data, button);
    }, 400);
    const body = new URLSearchParams({
      title: button.dataset.title || "",
      artist: button.dataset.artist || "",
      album: button.dataset.album || "",
      cover: button.dataset.cover || "",
    });
    const response = await fetch("/import-search", { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    window.clearInterval(timer);
    paintImport({ message: data.message || data.error || "", percent: data.ok ? 100 : null }, button);
    notify(data.message || data.error || "Скачивание завершилось", data.ok ? "success" : "error");
    button.classList.remove("is-busy");
    if (!data.ok) button.textContent = "Скачать";
    if (data.ok && !stay) navigate("/?view=wishlist");
    else button.disabled = false;
    return Boolean(data.ok);
  }

  function panelHost() {
    return document.getElementById("discovery-results")
      || document.getElementById("recommendations-root")
      || document.getElementById("wishlist-body");
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
    waves.artist = false;
    artistQueue = null;
    waves.queue = [];
    waves.index = -1;
    waves.seen = new Set();
    await refillWaves();
    if (!waves.queue.length) {
      waves.active = false;
      return;
    }
    playWavesIndex(0);
    scheduleArchive();
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

  function waveChip(field) {
    return document.querySelector(`.waves-chip.is-active[data-waves-field="${field}"]`)?.dataset.wavesValue || "";
  }

  async function loadFallbackWaves() {
    const genre = waveChip("genre") || "all";
    const language = waveChip("language") || "any";
    const mood = waveChip("mood") || "any";
    let term = genre === "all" || genre === "ruRap" ? "music" : genre;
    if (language === "ru") term = `русский ${term}`;
    else if (language === "en") term = `${term} english`;
    if (mood !== "any") term = `${term} ${mood}`;
    const country = language === "en" ? "us" : "ru";
    const response = await fetch(
      `https://itunes.apple.com/search?entity=song&limit=40&country=${country}&term=` + encodeURIComponent(term),
    );
    const data = await response.json();
    return shuffleTracks(
      (data.results || [])
        .filter((item) => item.previewUrl)
        .filter((item) => {
          const text = `${item.trackName || ""} ${item.artistName || ""}`;
          const cyr = /[а-яё]/i.test(text);
          if (language === "ru") return cyr;
          if (language === "en") return !cyr;
          return true;
        })
        .map((item) => ({
          url: item.previewUrl,
          title: item.trackName || "IMe Waves",
          artist: item.artistName || "",
        })),
    );
  }

  async function refillWaves() {
    if (!waves.artist) {
      let batch = [];
      try {
        batch = await loadServerWaves();
      } catch {
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
    if (waves.active) scheduleArchive();
  }

  async function resetWaves() {
    await post("waves-reset");
    const defaults = { genre: "all", language: "any", mood: "any", seed: "taste", diversity: "normal" };
    for (const [field, value] of Object.entries(defaults)) {
      document.querySelectorAll(`[data-waves-field="${field}"]`).forEach((node) => {
        const on = node.dataset.wavesValue === value;
        node.classList.toggle("is-active", on);
        node.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    const skip = document.querySelector('[data-waves-field="skipKnown"]');
    if (skip) skip.checked = true;
    notify("Настройки волны сброшены", "info");
    if (waves.active) refreshWave();
  }

  async function refreshWave() {
    waves.queue = [];
    waves.index = -1;
    waves.seen = new Set();
    if (!waves.active) {
      await startWaves();
      return;
    }
    await refillWaves();
    if (waves.queue.length) playWavesIndex(0);
    else notify("По этим фильтрам нет треков", "info");
  }

  function readJsonSeed(id) {
    try {
      return JSON.parse(document.getElementById(id)?.textContent || "[]");
    } catch {
      return [];
    }
  }

  function writeJsonSeed(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = JSON.stringify(value);
  }

  function refreshRecommendationsIfOpen() {
    if (document.getElementById("recommendations-root")) loadRecommendations(recFilter);
  }

  function rankedArtists(songs) {
    const counts = new Map();
    for (const song of songs) {
      const name = String(song.artist || "").trim();
      if (!name) continue;
      const key = normTrack(name);
      const current = counts.get(key) || { name, score: 0 };
      current.score += 1 + (song.liked ? 3 : 0);
      counts.set(key, current);
    }
    return [...counts.values()].sort((a, b) => b.score - a.score).map((item) => item.name);
  }

  function recSource(mode) {
    if (mode === "liked") {
      const favorites = readJsonSeed("favorite-artists-seed").map((item) => item.name).filter(Boolean);
      return { artists: [...rankedArtists(library.filter((song) => song.liked)), ...favorites].filter((name, index, all) => all.findIndex((item) => normTrack(item) === normTrack(name)) === index), tracks: library.filter((song) => song.liked) };
    }
    if (mode === "wishlist") {
      const wishes = readJsonSeed("wishlist-seed");
      return { artists: rankedArtists(wishes), tracks: wishes };
    }
    if (mode === "current") {
      return { artists: now.artist ? [now.artist] : [], tracks: now.title ? [{ title: now.title, artist: now.artist }] : [] };
    }
    return { artists: rankedArtists(library), tracks: library };
  }

  async function resolveArtist(name) {
    const data = await deezer("/search/artist?q=" + encodeURIComponent(name) + "&limit=8");
    const want = normTrack(name);
    return (data.data || []).find((item) => item && normTrack(item.name) === want) || null;
  }

  function pushCatalogTrack(bucket, seen, row, artistName, strict) {
    if (strict && artistName && normTrack(row?.artist?.name) !== normTrack(artistName)) return;
    const track = mapDeezerTrack(row);
    if (!track || !track.preview) return;
    const key = `${normTrack(track.title)}\n${normTrack(track.artist)}`;
    if (seen.has(key)) return;
    seen.add(key);
    bucket.push(track);
  }

  async function catalogForArtists(names) {
    const tracks = [];
    const albums = [];
    const seenTracks = new Set();
    const seenAlbums = new Set();
    for (const name of names.slice(0, 4)) {
      const artist = await resolveArtist(name);
      if (!artist) continue;
      const [top, listed] = await Promise.all([
        deezer("/artist/" + artist.id + "/top?limit=100"),
        deezer("/artist/" + artist.id + "/albums?limit=50"),
      ]);
      const own = [];
      for (const row of top.data || []) pushCatalogTrack(own, seenTracks, row, artist.name, true);
      tracks.push(...own);
      if (own.length < 24) {
        const radio = await deezer("/artist/" + artist.id + "/radio?limit=40");
        const extra = [];
        for (const row of radio.data || []) pushCatalogTrack(extra, seenTracks, row, artist.name, false);
        tracks.push(...extra);
      }
      for (const album of listed.data || []) {
        if (!album?.id || seenAlbums.has(String(album.id))) continue;
        const by = album.artist?.name || artist.name;
        if (normTrack(by) !== normTrack(artist.name)) continue;
        if (album.record_type === "single") continue;
        seenAlbums.add(String(album.id));
        if (!album.artist?.name) album.artist = { name: artist.name, id: artist.id };
        albums.push(album);
      }
    }
    return { tracks, albums };
  }

  function trackKey(track) {
    return `${normTrack(track.title)}\n${normTrack(track.artist)}`;
  }

  function shuffleInPlace(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      const item = items[index];
      items[index] = items[swap];
      items[swap] = item;
    }
    return items;
  }

  function storedKeys(name) {
    try {
      const saved = JSON.parse(localStorage.getItem(name) || "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  }

  function pickFreshTracks(pool, previous, count, priorityArtists) {
    const unique = [];
    const seen = new Set();
    for (const track of pool) {
      if (!track?.title) continue;
      const key = trackKey(track);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(track);
    }
    const priority = new Set((priorityArtists || []).map((name) => normTrack(name)));
    const fresh = unique.filter((track) => !previous.has(trackKey(track)));
    const used = unique.filter((track) => previous.has(trackKey(track)));
    const boosted = fresh.filter((track) => priority.has(normTrack(track.artist)));
    const rest = fresh.filter((track) => !priority.has(normTrack(track.artist)));
    shuffleInPlace(boosted);
    shuffleInPlace(rest);
    shuffleInPlace(used);
    return [...boosted, ...rest, ...used].slice(0, count);
  }

  function rememberTracks(name, tracks) {
    try {
      localStorage.setItem(name, JSON.stringify(tracks.map(trackKey)));
    } catch { /* storage */ }
  }

  function newArtists(storageName, artists) {
    const current = artists.map((name) => normTrack(name)).filter(Boolean);
    let previous = [];
    try {
      previous = JSON.parse(localStorage.getItem(storageName) || "[]");
      if (!Array.isArray(previous)) previous = [];
    } catch {
      previous = [];
    }
    try {
      localStorage.setItem(storageName, JSON.stringify(current));
    } catch { /* storage */ }
    const known = new Set(previous);
    return current.filter((name) => !known.has(name));
  }

  const REC_TRACKS = 8;
  const ALBUM_ROW = 8;
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;
  const SIXTEEN_HOURS = 16 * 60 * 60 * 1000;

  function albumRowSize(poolLength) {
    let size = Math.min(ALBUM_ROW, poolLength);
    while (size > 2 && poolLength - size < Math.ceil(size / 2)) size -= 1;
    if (poolLength >= 2 && size < 2) size = Math.min(2, poolLength);
    return size;
  }

  function albumSnapshot(album) {
    return {
      id: String(album.id),
      title: album.title || "",
      cover_medium: album.cover_medium || album.cover || "",
      release_date: album.release_date || "",
      artist: { name: album.artist?.name || "", id: album.artist?.id || "" },
    };
  }

  function replaceAlbumHalf(slots, order, parity, hops) {
    const next = slots.slice();
    for (let hop = 0; hop < hops; hop += 1) {
      const indexes = [];
      for (let index = parity; index < next.length; index += 2) indexes.push(index);
      if (!indexes.length) break;
      const held = new Set(next.filter((_, index) => index % 2 !== parity).map((album) => album.id));
      const current = new Set(indexes.map((index) => next[index]?.id).filter(Boolean));
      let cursor = 0;
      const found = order.findIndex((album) => album.id === next[indexes[0]]?.id);
      if (found >= 0) cursor = (found + 1) % order.length;
      const picked = [];
      let guard = 0;
      const allowOverlap = order.length <= indexes.length;
      while (picked.length < indexes.length && guard < order.length * 2) {
        const album = order[cursor % order.length];
        cursor += 1;
        guard += 1;
        if (!album || picked.some((item) => item.id === album.id)) continue;
        if (!allowOverlap && (held.has(album.id) || current.has(album.id))) continue;
        picked.push(album);
      }
      if (picked.length < indexes.length) {
        guard = 0;
        while (picked.length < indexes.length && guard < order.length * 2) {
          const album = order[cursor % order.length];
          cursor += 1;
          guard += 1;
          if (!album || picked.some((item) => item.id === album.id)) continue;
          picked.push(album);
        }
      }
      indexes.forEach((index, offset) => {
        if (picked[offset]) next[index] = picked[offset];
      });
    }
    return next;
  }

  function rotateAlbumRow(pool, mode, now) {
    const incoming = [];
    const seen = new Set();
    for (const album of pool) {
      const snap = album?.id ? albumSnapshot(album) : null;
      if (!snap || seen.has(snap.id)) continue;
      seen.add(snap.id);
      incoming.push(snap);
    }
    if (!incoming.length) return [];
    const storageName = "ime-rec-albums:" + mode;
    let state = null;
    try {
      state = JSON.parse(localStorage.getItem(storageName) || "null");
    } catch {
      state = null;
    }
    const byId = new Map(incoming.map((album) => [album.id, album]));
    let order = Array.isArray(state?.order)
      ? state.order.map((album) => byId.get(String(album.id))).filter(Boolean)
      : [];
    const known = new Set(order.map((album) => album.id));
    for (const album of incoming) if (!known.has(album.id)) order.push(album);
    if (!order.length) order = incoming;
    const rowSize = albumRowSize(order.length);
    const step8 = Math.floor(now / EIGHT_HOURS);
    const step16 = Math.floor(now / SIXTEEN_HOURS);
    let slots = Array.isArray(state?.slots)
      ? state.slots.map((album) => byId.get(String(album.id))).filter(Boolean)
      : [];
    if (!slots.length) {
      slots = order.slice(0, rowSize);
      state = { step8, step16 };
    } else {
      const kept = slots.filter(Boolean).slice(0, rowSize);
      const have = new Set(kept.map((album) => album.id));
      slots = kept;
      for (const album of order) {
        if (slots.length >= rowSize) break;
        if (have.has(album.id)) continue;
        slots.push(album);
        have.add(album.id);
      }
      const hops8 = Math.max(0, step8 - (Number.isFinite(state.step8) ? state.step8 : step8));
      const hops16 = Math.max(0, step16 - (Number.isFinite(state.step16) ? state.step16 : step16));
      if (hops8) slots = replaceAlbumHalf(slots, order, 0, hops8);
      if (hops16) slots = replaceAlbumHalf(slots, order, 1, hops16);
    }
    try {
      localStorage.setItem(storageName, JSON.stringify({ step8, step16, slots, order }));
    } catch { /* storage */ }
    return slots;
  }

  function recAlbumCard(album) {
    const cover = album.cover_medium ? `<img src="${escapeAttr(album.cover_medium)}" alt="">` : "";
    const year = String(album.release_date || "").slice(0, 4);
    return `<li><button type="button" class="artist-release-card" data-open-album="1" data-album-id="${escapeAttr(album.id)}" data-album-title="${escapeAttr(album.title)}"><div class="artist-release-cover">${cover}</div><div class="artist-release-meta"><div class="artist-release-title">${escapeHtml(album.title)}</div><div class="artist-release-sub">${escapeHtml(album.artist?.name || year)}</div></div></button></li>`;
  }

  async function loadRecommendations(mode) {
    const root = document.getElementById("recommendations-root");
    if (!root) return;
    root.innerHTML = '<p class="home-discovery-search-hint">Загрузка…</p>';
    const source = recSource(mode === "chart" ? "all" : mode);
    const tasteTitle = mode === "liked"
      ? "По избранному"
      : mode === "wishlist"
        ? "По хочу послушать"
        : mode === "current"
          ? "По текущему треку"
          : "По вкусу";
    const emptyHint = mode === "liked"
      ? "В избранном пока нет треков и артистов"
      : mode === "wishlist"
        ? "Список «Хочу послушать» пуст"
        : "В библиотеке пока нет артистов";
    try {
      const chart = await deezer("/chart/0/tracks?limit=100");
      const chartPool = (chart.data || []).map((row) => mapDeezerTrack(row)).filter(Boolean);
      const chartKey = "ime-rec-tracks:chart";
      const chartTracks = pickFreshTracks(chartPool, storedKeys(chartKey), REC_TRACKS);
      rememberTracks(chartKey, chartTracks);
      const catalog = mode === "chart"
        ? await catalogForArtists([...new Set(chartPool.map((track) => track.artist).filter(Boolean))].slice(0, 3))
        : await catalogForArtists(source.artists);
      const tasteKey = "ime-rec-tracks:" + mode;
      const added = newArtists("ime-rec-artists:" + mode, source.artists);
      const taste = mode === "chart"
        ? []
        : pickFreshTracks(catalog.tracks, storedKeys(tasteKey), REC_TRACKS, added);
      if (mode !== "chart") rememberTracks(tasteKey, taste);
      const albums = rotateAlbumRow(catalog.albums, mode, Date.now());
      const sections = [];
      if (mode !== "chart") {
        sections.push({ title: tasteTitle, hint: source.artists.length ? source.artists.slice(0, 4).join(", ") : emptyHint, tracks: taste });
      }
      sections.push({ title: "Альбомы", albums });
      sections.push({ title: "Чарт", hint: "Топ Deezer", tracks: chartTracks });
      root.innerHTML = sections.map((section) => {
        if (section.albums) {
          const cards = section.albums.map(recAlbumCard).join("");
          return `<section class="rec-section"><div class="rec-section-head"><h2>${escapeHtml(section.title)}</h2></div>${cards ? `<ul class="artist-releases-grid">${cards}</ul>` : '<p class="artist-view-empty">Нет альбомов для этой подборки</p>'}</section>`;
        }
        const cards = (section.tracks || []).map(trackCard).join("");
        return `<section class="rec-section"><div class="rec-section-head"><h2>${escapeHtml(section.title)}</h2>${section.hint ? `<p>${escapeHtml(section.hint)}</p>` : ""}</div>${cards ? `<ul class="demo-tracks-grid rec-track-list">${cards}</ul>` : '<p class="artist-view-empty">Нет треков для этой подборки</p>'}</section>`;
      }).join("");
    } catch {
      root.innerHTML = '<p class="home-discovery-search-error">Не удалось загрузить рекомендации</p>';
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
    const local = librarySong(item.title, item.artist);
    const archived = local ? "" : await archiveFile(item.title, item.artist);
    const full = local ? "/audio/" + encodeURIComponent(local.id) : archived;
    playUrl(full || item.url, item.title, item.artist);
    scheduleArchive();
  }

  const archiveQueued = new Set();

  async function archiveFile(title, artist) {
    try {
      const response = await fetch(
        "/api/archive/match?title=" + encodeURIComponent(title || "") + "&artist=" + encodeURIComponent(artist || ""),
      );
      const data = await response.json();
      if (data && data.id) return "/audio/" + encodeURIComponent(data.id);
    } catch { /* preview */ }
    return "";
  }

  function readCreatedMixes() {
    try {
      return JSON.parse(document.getElementById("created-mixes-seed")?.textContent || "[]");
    } catch {
      return [];
    }
  }

  function writeCreatedMixes(mixes) {
    const node = document.getElementById("created-mixes-seed");
    if (node) node.textContent = JSON.stringify(mixes);
  }

  async function refreshMixFiles(mix) {
    let ready = 0;
    for (const track of mix.tracks || []) {
      if (track.file) {
        ready += 1;
        continue;
      }
      try {
        const response = await fetch(
          "/api/archive/match?title=" + encodeURIComponent(track.title || "") + "&artist=" + encodeURIComponent(track.artist || ""),
        );
        const data = await response.json();
        if (data && data.id) {
          track.file = data.id;
          ready += 1;
        }
      } catch { /* still downloading */ }
    }
    return ready;
  }

  async function playCreatedMix(id) {
    const mixes = readCreatedMixes();
    const mix = mixes.find((item) => item.id === id);
    if (!mix) return;
    const ready = await refreshMixFiles(mix);
    writeCreatedMixes(mixes);
    const total = (mix.tracks || []).length;
    if (!total || ready < total) {
      notify(ready ? `Микс ещё не готов: ${ready} из ${total}` : "Микс ещё скачивается", "info");
      return;
    }
    const items = mix.tracks.map((track) => ({
      id: track.file,
      title: track.title || "",
      artist: track.artist || "",
      preview: "",
    }));
    listQueue = { items, index: 0 };
    artistQueue = null;
    waves.active = false;
    waves.artist = false;
    playId(items[0].id, items[0].title, items[0].artist, true);
  }

  async function downloadCreatedMix(id) {
    const mixes = readCreatedMixes();
    const mix = mixes.find((item) => item.id === id);
    if (!mix) return;
    const button = document.querySelector(`[data-download-mix="${cssEscape(id)}"]`);
    if (button) {
      button.disabled = true;
      button.textContent = "Скачивание…";
    }
    notify(`Скачивание микса: ${mix.title}`, "info");
    await Promise.all((mix.tracks || []).map((track) => {
      const body = new URLSearchParams({
        title: track.title || "",
        artist: track.artist || "",
        id: mix.id,
        name: mix.title || "",
      });
      return fetch("/api/archive/fetch", { method: "POST", body }).catch(() => {});
    }));
    let ready = 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      ready = await refreshMixFiles(mix);
      if (ready === (mix.tracks || []).length) break;
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    writeCreatedMixes(mixes);
    const total = (mix.tracks || []).length;
    if (button) button.disabled = false;
    if (ready === total && total >= 8) {
      if (button) {
        button.textContent = "Слушать";
        button.classList.remove("btn-secondary");
        button.classList.add("btn-primary");
        button.dataset.playMix = id;
        delete button.dataset.downloadMix;
      }
      notify("Микс готов", "success");
      return;
    }
    if (button) button.textContent = "Скачать";
    notify(ready ? `Скачано ${ready} из ${total}. Микс можно слушать, когда скачаются все треки.` : "Скачивание продолжается в архиве", "info");
  }

  function scheduleArchive() {
    if (!waves.active) return;
    // Main IMe Waves and the artist wave share this prefetch and the archive limits.
    const ahead = Math.min(20, Math.max(2, Number(document.body.dataset.archiveAhead || 3)));
    const from = waves.index < 0 ? 0 : waves.index;
    for (const item of waves.queue.slice(from, from + ahead)) {
      const key = `${item.title}\n${item.artist}`;
      if (!item.title || archiveQueued.has(key)) continue;
      archiveQueued.add(key);
      const body = new URLSearchParams({ title: item.title, artist: item.artist || "", cover: item.cover || "" });
      fetch("/api/archive/fetch", { method: "POST", body }).catch(() => archiveQueued.delete(key));
    }
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
    artistQueue = null;
    playUrl(item.previewUrl, item.trackName || title, item.artistName || artist);
  }

  async function playUrl(url, title, artist) {
    audio.src = url;
    try { await audio.play(); } catch { /* autoplay */ }
    setNowPlaying(title, artist, { url: url || "", cover: "" });
    syncPlayButton();
  }

  async function playId(id, title, artist, keepQueue) {
    if (!id) return;
    waves.active = false;
    waves.artist = false;
    if (!keepQueue) {
      artistQueue = null;
      listQueue = null;
    }
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
    if (stepList(1)) return;
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
    if (stepList(-1)) return;
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
    syncRowGlyphs(playing);
  }

  function rowMatchesNow(node) {
    if (!now.title) return false;
    const id = node.dataset.play || "";
    if (id && document.body.dataset.current && id === document.body.dataset.current && node.classList.contains("song-row")) return true;
    return normTrack(node.dataset.title) === normTrack(now.title) && normTrack(node.dataset.artist) === normTrack(now.artist);
  }

  function syncRowGlyphs(playing) {
    document.querySelectorAll(".song-row").forEach((row) => {
      const on = row.dataset.play && row.dataset.play === document.body.dataset.current;
      row.classList.toggle("current", on);
      row.classList.toggle("is-playing", on && playing);
      const icon = row.querySelector(".index-play");
      if (icon) icon.innerHTML = svg(on && playing ? PAUSE : PLAY, 14);
    });
    document.querySelectorAll(".demo-track-card").forEach((card) => {
      const button = card.querySelector("button[data-title]");
      const on = button ? rowMatchesNow(button) : false;
      card.classList.toggle("is-active", on);
      card.classList.toggle("is-playing", on && playing);
      const icon = card.querySelector(".demo-track-play-icon");
      if (icon) icon.innerHTML = svg(on && playing ? PAUSE : PLAY, 18);
    });
    document.querySelectorAll(".artist-track-row").forEach((row) => {
      const button = row.querySelector("button[data-title]");
      const on = button ? rowMatchesNow(button) : false;
      row.classList.toggle("is-current", on);
      row.classList.toggle("is-playing", on && playing);
      const glyph = row.querySelector(".artist-track-glyph");
      if (glyph) glyph.innerHTML = on ? svg(playing ? PAUSE : PLAY, 16) : "";
    });
    document.querySelectorAll(".wishlist-row, .rec-track").forEach((row) => {
      const on = rowMatchesNow(row);
      row.classList.toggle("is-current", on);
      row.classList.toggle("is-playing", on && playing);
      const icon = row.querySelector(".wishlist-play-icon, .rec-track-glyph");
      if (icon) icon.innerHTML = svg(on && playing ? PAUSE : PLAY, 16);
    });
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
    const nextLibrary = doc.getElementById("library-seed");
    const libraryNode = document.getElementById("library-seed");
    if (nextLibrary && libraryNode) {
      libraryNode.textContent = nextLibrary.textContent;
      readLibrary(libraryNode.textContent);
    }
    for (const id of ["favorite-artists-seed", "wishlist-seed"]) {
      const incoming = doc.getElementById(id);
      const current = document.getElementById(id);
      if (incoming && current) current.textContent = incoming.textContent;
    }
    history.pushState({}, "", url);
    adoptDocument(doc);
    document.querySelectorAll(".ui-select").forEach(bindSelect);
    if (now.title) setNowPlaying(now.title, now.artist);
    syncPlayButton();
    paintProgress();
    if (document.getElementById("recommendations-root")) loadRecommendations(recFilter, false);
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

  let hotkeys = {};
  try {
    hotkeys = JSON.parse(document.getElementById("hotkeys-seed")?.textContent || "{}");
  } catch { /* seed */ }
  let listeningHotkey = null;

  function hotkeyName(code) {
    if (!code) return "Не назначена";
    return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Arrow/, "");
  }

  function runHotkey(action) {
    const current = document.body.dataset.current || "";
    if (action === "playPause") toggle();
    if (action === "next") playNext();
    if (action === "previous") playPrev();
    if (action === "volumeUp" || action === "volumeDown") {
      const step = action === "volumeUp" ? 0.05 : -0.05;
      audio.volume = Math.min(1, Math.max(0, audio.volume + step));
      paintVolume(audio.volume);
      paintMuteIcon();
      post("volume", { value: String(audio.volume) });
    }
    if (action === "mute") toggleMute();
    if (action === "like" && current) post("like", { id: current });
    if (action === "addToQueue" && current) post("queue-add", { id: current }).then((data) => toast(data.message, "info"));
    if (action === "search") document.querySelector(".search-input, .home-discovery-search input")?.focus();
    if (action === "settings") navigate("/?settings=appearance&section=general");
    if (action === "queue") toggleQueue();
    if (action === "toggleTheme") {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      post("set", { field: "theme", value: next });
    }
    if (action === "editMetadata" && current) editCurrent(current);
  }

  function editCurrent(id) {
    const row = document.querySelector(`[data-play="${cssEscape(id)}"]`);
    const title = window.prompt("Название", row?.dataset.title || "");
    if (title == null) return;
    const artist = window.prompt("Артист", row?.dataset.artist || "") || "";
    const album = window.prompt("Альбом", row?.dataset.album || "") || "";
    post("update-meta", { id, title, artist, album }).then(() => navigate(location.pathname + location.search));
  }

  document.addEventListener("keydown", (event) => {
    if (listeningHotkey) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        listeningHotkey.textContent = hotkeyName(hotkeys[listeningHotkey.dataset.hotkey] || "");
        listeningHotkey = null;
        return;
      }
      const action = listeningHotkey.dataset.hotkey;
      hotkeys[action] = event.code;
      listeningHotkey.textContent = hotkeyName(event.code);
      post("set", { field: "hotkey." + action, value: event.code });
      listeningHotkey = null;
      return;
    }
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.code === "Space" && document.body.dataset.space === "0") return;
    const action = Object.keys(hotkeys).find((key) => hotkeys[key] && hotkeys[key] === event.code);
    if (!action) return;
    event.preventDefault();
    runHotkey(action);
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
  function adoptDocument(doc) {
    const html = document.documentElement;
    const nextHtml = doc.documentElement;
    if (nextHtml) {
      html.lang = nextHtml.lang || html.lang;
      if (nextHtml.dataset.theme) html.dataset.theme = nextHtml.dataset.theme;
    }
    document.head.querySelectorAll("style[data-appearance]").forEach((node) => node.remove());
    doc.head.querySelectorAll("style[data-appearance]").forEach((style) => {
      const node = document.createElement("style");
      node.dataset.appearance = style.dataset.appearance || "1";
      node.textContent = style.textContent;
      document.head.appendChild(node);
    });
    const volume = document.body.dataset.volume;
    for (const key of Object.keys(document.body.dataset)) delete document.body.dataset[key];
    Object.assign(document.body.dataset, doc.body?.dataset || {});
    if (volume) document.body.dataset.volume = volume;
    const seed = doc.getElementById("hotkeys-seed");
    const live = document.getElementById("hotkeys-seed");
    if (seed && live) {
      live.textContent = seed.textContent;
      try { hotkeys = JSON.parse(seed.textContent || "{}"); } catch { /* seed */ }
    }
    const nextPlayer = doc.querySelector(".player-bar-wrap");
    const player = document.querySelector(".player-bar-wrap");
    if (nextPlayer && player) player.className = nextPlayer.className;
    const nextApp = doc.querySelector(".app");
    const app = document.querySelector(".app");
    if (nextApp && app) app.className = nextApp.className;
    tuneEq();
    if (document.body.dataset.normalize === "1") audio.volume = Math.min(audio.volume, 0.82);
  }

  function showWallpaper(src) {
    document.body.dataset.wallpaper = "on";
    const app = document.querySelector(".app");
    if (!app) return;
    let layer = app.querySelector(".app-wallpaper");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "app-wallpaper";
      app.prepend(layer);
    }
    layer.innerHTML = `<img class="app-wallpaper-photo" alt="" src="${src}">`;
  }

  function applySettingLive(field, value) {
    const root = document.documentElement;
    const set = (name, css) => root.style.setProperty(name, css);
    if (field === "ui.layout.uiScale") set("--ui-zoom", `${value}%`);
    if (field === "ui.layout.fontSize") set("--ui-font", `${value}px`);
    if (field === "ui.layout.sidebarWidth") set("--sidebar-width", `${value}px`);
    if (field === "ui.layout.playerHeight") set("--player-height", `${value}px`);
    if (field === "ui.layout.borderRadius") set("--radius", `${value}px`);
    if (field === "ui.player.coverSize") set("--player-cover-size", `${value}px`);
    if (field === "ui.library.coverSize") set("--list-cover-size", `${value}px`);
    if (field === "ui.covers.radius") set("--cover-radius", `${value}px`);
    if (field === "ui.covers.objectFit") set("--cover-fit", value);
    if (field === "ui.components.contentMaxWidth") set("--content-max", `${value}px`);
    if (field === "ui.components.titleSize") set("--title-size", `${value}px`);
    if (field === "crossfade") document.body.dataset.crossfade = value;
    if (field === "eq_bass") document.body.dataset.eqBass = value;
    if (field === "eq_mid") document.body.dataset.eqMid = value;
    if (field === "eq_treble") document.body.dataset.eqTreble = value;
    tuneEq();
  }

  function runThemeAct(name) {
    if (name === "expand") document.querySelectorAll(".theme-group").forEach((node) => node.classList.remove("is-collapsed"));
    if (name === "collapse") document.querySelectorAll(".theme-group").forEach((node) => node.classList.add("is-collapsed"));
    if (name === "apply" || name === "save") {
      document.querySelectorAll("[data-color-key]").forEach((row) => {
        const hex = row.querySelector(".theme-color-hex")?.value || row.querySelector('input[type="color"]')?.value;
        if (hex) applyColor(row.dataset.colorKey, hex, true);
      });
      toast("Тема применена", "success");
    }
    if (name === "cancel" || name === "reset") {
      document.querySelectorAll("[data-color-reset]").forEach((button) => applyColor(button.dataset.colorReset, button.dataset.colorDefault));
      if (name === "reset") post("preset", { value: "default" }).then(() => navigate(location.pathname + location.search));
    }
    if (name === "add" || name === "duplicate" || name === "rename") {
      const title = window.prompt("Название темы", name === "duplicate" ? "Копия" : "");
      if (!title) return;
      post("save-preset", { name: title }).then(() => navigate(location.pathname + location.search));
    }
    if (name === "delete") {
      const active = document.querySelector(".ui-select-option.active");
      const id = active?.closest("form")?.querySelector('[name="value"]')?.value || "";
      if (!id || id === "default") {
        toast("Встроенную тему нельзя удалить", "info");
        return;
      }
      post("delete-preset", { value: id }).then(() => navigate(location.pathname + location.search));
    }
    if (name === "export") {
      const colors = {};
      document.querySelectorAll("[data-color-key]").forEach((row) => {
        colors[row.dataset.colorKey] = row.querySelector(".theme-color-hex")?.value || "";
      });
      const blob = new Blob([JSON.stringify({ name: "IMe", colors }, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "ime-theme.json";
      link.click();
      URL.revokeObjectURL(link.href);
    }
    if (name === "import") document.getElementById("pick-preset")?.click();
    if (name === "palette") {
      const img = document.querySelector(".app-wallpaper img");
      if (!img || !img.complete) {
        toast("Сначала выберите изображение фона", "info");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0, 8, 8);
      const pixel = context.getImageData(3, 3, 1, 1).data;
      const hex = "#" + [...pixel.slice(0, 3)].map((part) => part.toString(16).padStart(2, "0")).join("");
      applyColor("accent", hex, true);
      applyColor("progress", hex, true);
      toast("Палитра обновлена", "success");
    }
  }

  let eqNodes = null;
  function tuneEq() {
    if (document.body.dataset.eq !== "1") return;
    try {
    if (!eqNodes) {
      const context = new AudioContext();
      const bass = context.createBiquadFilter();
      bass.type = "lowshelf";
      bass.frequency.value = 140;
      const mid = context.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1000;
      mid.Q.value = 0.9;
      const treble = context.createBiquadFilter();
      treble.type = "highshelf";
      treble.frequency.value = 4500;
      const source = context.createMediaElementSource(audio);
      source.connect(bass);
      bass.connect(mid);
      mid.connect(treble);
      treble.connect(context.destination);
      eqNodes = { context, bass, mid, treble };
    }
    eqNodes.bass.gain.value = Number(document.body.dataset.eqBass || 0);
    eqNodes.mid.gain.value = Number(document.body.dataset.eqMid || 0);
    eqNodes.treble.gain.value = Number(document.body.dataset.eqTreble || 0);
    eqNodes.context.resume().catch(() => {});
    } catch { /* equalizer is unavailable in this window */ }
  }

  function applyColor(key, hex, force) {
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
    const live = document.getElementById("live-apply");
    if (live && !live.checked && !force) return;
    const cssVar = {
      bgMain: "--bg-main",
      bgSidebar: "--bg-sidebar",
      bgElevated: "--bg-elevated",
      textPrimary: "--text-primary",
      textSecondary: "--text-secondary",
      textMuted: "--text-muted",
      accent: "--accent",
      accentHover: "--accent-hover",
      button: "--button-accent",
      progress: "--progress",
      like: "--like",
      danger: "--danger",
      success: "--success",
      warning: "--warning",
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
    if (input.dataset.archiveSetting) {
      const min = Number(input.min || 0);
      const max = Number(input.max || 0);
      let value = Number(input.value);
      if (Number.isFinite(min)) value = Math.max(min, value);
      if (Number.isFinite(max) && max) value = Math.min(max, value);
      input.value = String(value);
      if (input.dataset.archiveSetting === "archive_ahead") document.body.dataset.archiveAhead = String(value);
      if (input.dataset.archiveSetting === "archive_keep") document.body.dataset.archiveKeep = String(value);
      post("set", { field: input.dataset.archiveSetting, value: String(value) });
      return;
    }
    if (input.dataset.setField) {
      post("set", { field: input.dataset.setField, value: input.value });
      return;
    }
    if (input.id === "only-dirty") {
      document.querySelectorAll(".theme-color-row").forEach((row) => {
        const current = row.querySelector(".theme-color-hex")?.value || "";
        const fallback = row.querySelector("[data-color-default]")?.dataset.colorDefault || "";
        row.hidden = input.checked && current.toLowerCase() === fallback.toLowerCase();
      });
      return;
    }
    if (input.id === "pick-wallpaper" && input.files[0]) {
      const file = input.files[0];
      const preview = URL.createObjectURL(file);
      showWallpaper(preview);
      const body = new FormData();
      body.append("file", file);
      fetch("/wallpaper", { method: "POST", body })
        .then((res) => {
          if (!res.ok) throw new Error("upload");
          return navigate("/?view=home");
        })
        .then(() => toast("Фон установлен", "success"))
        .catch(() => toast("Фон не сохранился", "error"));
      input.value = "";
      return;
    }
    if (input.id === "pick-preset" && input.files[0]) {
      input.files[0].text().then(async (text) => {
        const data = JSON.parse(text);
        const colors = data.colors || data;
        if (colors && typeof colors === "object") {
          for (const [key, value] of Object.entries(colors)) {
            if (typeof value === "string" && value.startsWith("#")) await post("set-color", { field: key, value });
          }
        }
        if (data.name) await post("save-preset", { name: data.name });
        navigate(location.pathname + location.search);
      }).catch(() => toast("Не удалось прочитать тему", "error"));
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
    if (act === "delete") {
      if (document.body.dataset.confirmDelete === "1" && !window.confirm("Удалить трек из библиотеки?")) return;
      post("delete-song", { id }).then(() => navigate(location.pathname + location.search));
    }
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
  tuneEq();
  if (document.body.dataset.normalize === "1") audio.volume = Math.min(audio.volume, 0.82);
  if (document.body.dataset.focusSearch === "1") document.querySelector(".search-input")?.focus();
  if (document.body.dataset.autoResume === "1" && document.body.dataset.current) {
    const id = document.body.dataset.current;
    const row = document.querySelector(`[data-play="${cssEscape(id)}"]`);
    playId(id, row?.dataset.title || "", row?.dataset.artist || "");
  }
  document.addEventListener("dblclick", (event) => {
    const row = event.target.closest(".song-row");
    if (!row || document.body.dataset.doubleClick !== "editMetadata") return;
    editCurrent(row.dataset.play);
  });
  if (document.getElementById("recommendations-root")) loadRecommendations("all");
})();
