(() => {
  "use strict";

  const STORAGE_KEY = "privateTeleprompter.v1";
  const DEFAULTS = {
    script: "",
    fontSize: 52,
    scrollSpeed: 35,
    mirrorMode: false,
    countdownMode: true,
  };

  const elements = {
    editorView: document.querySelector("#editorView"),
    prompterView: document.querySelector("#prompterView"),
    scriptInput: document.querySelector("#scriptInput"),
    clearScript: document.querySelector("#clearScript"),
    saveStatus: document.querySelector("#saveStatus"),
    fontSize: document.querySelector("#fontSize"),
    fontSizeValue: document.querySelector("#fontSizeValue"),
    scrollSpeed: document.querySelector("#scrollSpeed"),
    scrollSpeedValue: document.querySelector("#scrollSpeedValue"),
    mirrorMode: document.querySelector("#mirrorMode"),
    countdownMode: document.querySelector("#countdownMode"),
    startPrompter: document.querySelector("#startPrompter"),
    exitPrompter: document.querySelector("#exitPrompter"),
    slower: document.querySelector("#slower"),
    faster: document.querySelector("#faster"),
    liveSpeed: document.querySelector("#liveSpeed"),
    scrollArea: document.querySelector("#scrollArea"),
    prompterText: document.querySelector("#prompterText"),
    countdown: document.querySelector("#countdown"),
    playState: document.querySelector("#playState"),
  };

  let state = loadState();
  let isRunning = false;
  let isCountingDown = false;
  let animationFrame = 0;
  let lastFrameTime = 0;
  let saveTimer = 0;
  let statusTimer = 0;
  let countdownTimer = 0;
  let wakeLock = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        ...DEFAULTS,
        ...saved,
        fontSize: clamp(Number(saved.fontSize ?? DEFAULTS.fontSize), 28, 88),
        scrollSpeed: clamp(Number(saved.scrollSpeed ?? DEFAULTS.scrollSpeed), 8, 100),
        mirrorMode: Boolean(saved.mirrorMode),
        countdownMode: saved.countdownMode === undefined ? true : Boolean(saved.countdownMode),
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function collectState() {
    state = {
      script: elements.scriptInput.value,
      fontSize: Number(elements.fontSize.value),
      scrollSpeed: Number(elements.scrollSpeed.value),
      mirrorMode: elements.mirrorMode.checked,
      countdownMode: elements.countdownMode.checked,
    };
    return state;
  }

  function persistState(showStatus = true) {
    collectState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (showStatus) setSaveStatus("Gespeichert");
    } catch {
      if (showStatus) setSaveStatus("Speichern nicht möglich", true);
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    setSaveStatus("Speichert …");
    saveTimer = window.setTimeout(() => persistState(), 350);
  }

  function setSaveStatus(message, persistent = false) {
    elements.saveStatus.textContent = message;
    window.clearTimeout(statusTimer);
    if (!persistent) {
      statusTimer = window.setTimeout(() => {
        elements.saveStatus.textContent = "Lokal gespeichert";
      }, 1600);
    }
  }

  function renderSettings() {
    elements.scriptInput.value = state.script;
    elements.fontSize.value = String(state.fontSize);
    elements.scrollSpeed.value = String(state.scrollSpeed);
    elements.mirrorMode.checked = state.mirrorMode;
    elements.countdownMode.checked = state.countdownMode;
    updateSettingLabels();
  }

  function updateSettingLabels() {
    elements.fontSizeValue.value = `${elements.fontSize.value} px`;
    elements.fontSizeValue.textContent = `${elements.fontSize.value} px`;
    elements.scrollSpeedValue.value = `${elements.scrollSpeed.value} px/s`;
    elements.scrollSpeedValue.textContent = `${elements.scrollSpeed.value} px/s`;
  }

  function showPlayState(message) {
    elements.playState.textContent = message;
    elements.playState.classList.add("visible");
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => elements.playState.classList.remove("visible"), 900);
  }

  function setRunning(nextRunning, announce = true) {
    isRunning = nextRunning;
    lastFrameTime = performance.now();
    if (announce) showPlayState(isRunning ? "Läuft" : "Pausiert");
  }

  function toggleRunning() {
    if (isCountingDown) return;
    setRunning(!isRunning);
  }

  function scrollFrame(timestamp) {
    const elapsedSeconds = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    if (isRunning) {
      elements.scrollArea.scrollTop += state.scrollSpeed * elapsedSeconds;
      const atEnd =
        elements.scrollArea.scrollTop + elements.scrollArea.clientHeight >=
        elements.scrollArea.scrollHeight - 2;
      if (atEnd) setRunning(false);
    }

    animationFrame = window.requestAnimationFrame(scrollFrame);
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try {
      await wakeLock.release();
    } catch {
      // The browser may already have released it when the page became hidden.
    }
    wakeLock = null;
  }

  async function tryFullscreen() {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      } catch {
        // iOS Safari may not support the Fullscreen API; standalone mode still works.
      }
    }
  }

  function beginCountdown() {
    isCountingDown = true;
    elements.countdown.hidden = false;
    let remaining = 3;
    elements.countdown.textContent = String(remaining);

    countdownTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        elements.countdown.textContent = String(remaining);
        return;
      }
      window.clearInterval(countdownTimer);
      elements.countdown.hidden = true;
      isCountingDown = false;
      setRunning(true, false);
      showPlayState("Läuft");
    }, 1000);
  }

  async function startPrompter() {
    persistState(false);
    const script = state.script.trim();
    if (!script) {
      elements.scriptInput.focus();
      setSaveStatus("Bitte Text eingeben", true);
      return;
    }

    elements.prompterText.textContent = script;
    elements.prompterText.style.fontSize = `${state.fontSize}px`;
    elements.prompterText.classList.toggle("mirrored", state.mirrorMode);
    elements.liveSpeed.value = String(state.scrollSpeed);
    elements.liveSpeed.textContent = String(state.scrollSpeed);
    elements.scrollArea.scrollTop = 0;
    elements.editorView.hidden = true;
    elements.prompterView.hidden = false;
    document.body.style.overflow = "hidden";
    lastFrameTime = performance.now();
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(scrollFrame);

    void requestWakeLock();
    void tryFullscreen();

    if (state.countdownMode) {
      beginCountdown();
    } else {
      setRunning(true, false);
      showPlayState("Läuft");
    }
  }

  async function exitPrompter() {
    window.clearInterval(countdownTimer);
    window.cancelAnimationFrame(animationFrame);
    isCountingDown = false;
    isRunning = false;
    elements.countdown.hidden = true;
    elements.playState.classList.remove("visible");
    elements.prompterView.hidden = true;
    elements.editorView.hidden = false;
    document.body.style.overflow = "";
    await releaseWakeLock();

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // Leaving the app view remains possible even if fullscreen exit fails.
      }
    }
    elements.startPrompter.focus();
  }

  function adjustSpeed(delta) {
    state.scrollSpeed = clamp(state.scrollSpeed + delta, 8, 100);
    elements.scrollSpeed.value = String(state.scrollSpeed);
    elements.liveSpeed.value = String(state.scrollSpeed);
    elements.liveSpeed.textContent = String(state.scrollSpeed);
    updateSettingLabels();
    persistState(false);
    showPlayState(`${state.scrollSpeed} px/s`);
  }

  elements.scriptInput.addEventListener("input", scheduleSave);

  [elements.fontSize, elements.scrollSpeed].forEach((control) => {
    control.addEventListener("input", () => {
      updateSettingLabels();
      scheduleSave();
    });
  });

  [elements.mirrorMode, elements.countdownMode].forEach((control) => {
    control.addEventListener("change", scheduleSave);
  });

  elements.clearScript.addEventListener("click", () => {
    if (!elements.scriptInput.value || window.confirm("Gespeicherten Text wirklich löschen?")) {
      elements.scriptInput.value = "";
      persistState();
      elements.scriptInput.focus();
    }
  });

  elements.startPrompter.addEventListener("click", startPrompter);
  elements.exitPrompter.addEventListener("click", exitPrompter);
  elements.slower.addEventListener("click", () => adjustSpeed(-5));
  elements.faster.addEventListener("click", () => adjustSpeed(5));

  elements.scrollArea.addEventListener("click", toggleRunning);
  elements.scrollArea.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      toggleRunning();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (elements.prompterView.hidden) return;
    if (event.key === "Escape") {
      void exitPrompter();
    } else if (event.key === "ArrowUp") {
      adjustSpeed(5);
    } else if (event.key === "ArrowDown") {
      adjustSpeed(-5);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !elements.prompterView.hidden) {
      void requestWakeLock();
      lastFrameTime = performance.now();
    }
  });

  window.addEventListener("beforeunload", () => persistState(false));

  renderSettings();
  setSaveStatus(state.script ? "Lokal gespeichert" : "Bereit", true);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // The app remains fully usable online if service-worker registration fails.
      });
    });
  }
})();
