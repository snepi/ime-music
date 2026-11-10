(() => {
  const audio = new Audio();
  const volume = Number(document.body.dataset.volume || 0.8);
  audio.volume = Number.isFinite(volume) ? volume : 0.8;

  const byId = (id) => document.getElementById(id);
  const dialog = document.querySelector('.modal[role="dialog"]');
  if (dialog) dialog.focus();

  const titlebar = document.querySelector(".titlebar");
  if (titlebar) {
    titlebar.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest("button, a, input, .titlebar-btn")) return;
      if (window.ipc && window.ipc.postMessage) window.ipc.postMessage("drag");
    });
  }

  document.addEventListener("click", (event) => {
    const winBtn = event.target.closest("[data-win]");
    if (winBtn && window.ipc && window.ipc.postMessage) {
      event.preventDefault();
      event.stopPropagation();
      window.ipc.postMessage(winBtn.dataset.win);
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
      playId(row.dataset.play);
      return;
    }
    const act = event.target.closest("[data-act]");
    if (!act) return;
    const name = act.dataset.act;
    if (name === "toggle") toggle();
    if (name === "next") transport("next");
    if (name === "prev") transport("prev");
    if (name === "mute") post("mute").then(() => location.reload());
    if (name === "shuffle" || name === "repeat") post(name).then(() => location.reload());
    if (name === "waves-settings") {
      const box = document.querySelector(".home-waves-settings");
      if (box) box.hidden = !box.hidden;
    }
  });

  document.querySelectorAll("input[data-upload]").forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.files || !input.files.length) return;
      const body = new FormData();
      for (const file of input.files) body.append("files", file, file.name);
      await fetch("/import", { method: "POST", body });
      location.href = "/?view=all";
    });
  });

  document.querySelectorAll(".ui-select").forEach((select) => {
    const button = select.querySelector(".ui-select-trigger");
    const menu = select.querySelector(".ui-select-menu");
    if (!button || !menu) return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = menu.hasAttribute("hidden");
      document.querySelectorAll(".ui-select-menu").forEach((node) => node.setAttribute("hidden", ""));
      document.querySelectorAll(".ui-select").forEach((node) => node.classList.remove("open"));
      if (!willOpen) return;
      menu.removeAttribute("hidden");
      select.classList.add("open");
      button.setAttribute("aria-expanded", "true");
      const rect = button.getBoundingClientRect();
      menu.style.position = "fixed";
      menu.style.left = rect.left + "px";
      menu.style.top = rect.bottom + 6 + "px";
      menu.style.width = Math.max(rect.width, 160) + "px";
      menu.style.zIndex = "400";
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".ui-select, .ui-select-menu")) return;
    document.querySelectorAll(".ui-select-menu").forEach((node) => node.setAttribute("hidden", ""));
    document.querySelectorAll(".ui-select.open").forEach((node) => {
      node.classList.remove("open");
      const button = node.querySelector(".ui-select-trigger");
      if (button) button.setAttribute("aria-expanded", "false");
    });
  });

  const fill = document.querySelector(".progress-fill");
  const thumb = document.querySelector(".progress-thumb");
  const times = document.querySelectorAll(".player-time");
  const fmt = (value) => {
    const whole = Math.max(0, Math.floor(value || 0));
    return String(Math.floor(whole / 60)).padStart(2, "0") + ":" + String(whole % 60).padStart(2, "0");
  };
  audio.addEventListener("timeupdate", () => {
    const duration = audio.duration || 0;
    const ratio = duration ? (audio.currentTime / duration) * 100 : 0;
    if (fill) fill.style.width = ratio + "%";
    if (thumb) thumb.style.left = ratio + "%";
    if (times[0]) times[0].textContent = fmt(audio.currentTime);
    if (times[1]) times[1].textContent = fmt(duration);
  });
  audio.addEventListener("ended", () => transport("next"));

  const bar = document.querySelector(".volume-bar");
  if (bar) {
    bar.addEventListener("pointerdown", (event) => {
      const rect = bar.getBoundingClientRect();
      const next = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.volume = next;
      const width = next * 100 + "%";
      const volFill = bar.querySelector(".volume-fill");
      const volThumb = bar.querySelector(".volume-thumb");
      if (volFill) volFill.style.width = width;
      if (volThumb) volThumb.style.left = width;
    });
  }

  async function post(action, extra) {
    const body = new URLSearchParams({ action, ajax: "1", ...(extra || {}) });
    const response = await fetch("/act", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  async function playId(id) {
    if (!id) return;
    await post("play", { id });
    audio.src = "/audio/" + encodeURIComponent(id);
    await audio.play();
  }

  function toggle() {
    if (!audio.src && document.body.dataset.current) {
      playId(document.body.dataset.current);
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
  }

  async function transport(action) {
    const data = await post(action);
    if (data && data.id) {
      audio.src = "/audio/" + encodeURIComponent(data.id);
      await audio.play();
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    event.preventDefault();
    toggle();
  });
})();
