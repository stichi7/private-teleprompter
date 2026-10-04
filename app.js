(() => {
  "use strict";

  const STORAGE_KEY = "privateTeleprompter.v1";
  const DEFAULTS = {
    script: "",
    fontSize: 52,
    scrollSpeed: 35,
    mirrorMode: false,
    countdownMode: true,
    overlaySize: "third",
    overlayPosition: "top",
    overlayOpacity: 70,
  };
  const OVERLAY_SIZES = ["compact", "third", "half", "almost"];
  const OVERLAY_POSITIONS = ["top", "middle", "bottom"];
  const OVERLAY_OPACITIES = [40, 70, 100];

  const elements = {
    editorView: document.querySelector("#editorView"),
    cameraSetupView: document.querySelector("#cameraSetupView"),
    prompterView: document.querySelector("#prompterView"),
    cameraView: document.querySelector("#cameraView"),
    reviewView: document.querySelector("#reviewView"),
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
    openCameraSetup: document.querySelector("#openCameraSetup"),
    closeCameraSetup: document.querySelector("#closeCameraSetup"),
    cameraFontSize: document.querySelector("#cameraFontSize"),
    cameraFontSizeValue: document.querySelector("#cameraFontSizeValue"),
    cameraScrollSpeed: document.querySelector("#cameraScrollSpeed"),
    cameraScrollSpeedValue: document.querySelector("#cameraScrollSpeedValue"),
    cameraMirrorMode: document.querySelector("#cameraMirrorMode"),
    cameraCountdownMode: document.querySelector("#cameraCountdownMode"),
    cameraSetupStatus: document.querySelector("#cameraSetupStatus"),
    startCamera: document.querySelector("#startCamera"),
    exitPrompter: document.querySelector("#exitPrompter"),
    slower: document.querySelector("#slower"),
    faster: document.querySelector("#faster"),
    liveSpeed: document.querySelector("#liveSpeed"),
    scrollArea: document.querySelector("#scrollArea"),
    prompterText: document.querySelector("#prompterText"),
    countdown: document.querySelector("#countdown"),
    playState: document.querySelector("#playState"),
    cameraPreview: document.querySelector("#cameraPreview"),
    exitCamera: document.querySelector("#exitCamera"),
    switchCamera: document.querySelector("#switchCamera"),
    recordingIndicator: document.querySelector("#recordingIndicator"),
    cameraOverlay: document.querySelector("#cameraOverlay"),
    cameraScrollArea: document.querySelector("#cameraScrollArea"),
    cameraPrompterText: document.querySelector("#cameraPrompterText"),
    cameraSlower: document.querySelector("#cameraSlower"),
    cameraFaster: document.querySelector("#cameraFaster"),
    cameraLiveSpeed: document.querySelector("#cameraLiveSpeed"),
    startRecording: document.querySelector("#startRecording"),
    stopRecording: document.querySelector("#stopRecording"),
    cameraCountdown: document.querySelector("#cameraCountdown"),
    cameraPlayState: document.querySelector("#cameraPlayState"),
    cameraMessage: document.querySelector("#cameraMessage"),
    recordingPreview: document.querySelector("#recordingPreview"),
    recordingDetails: document.querySelector("#recordingDetails"),
    saveRecording: document.querySelector("#saveRecording"),
    shareRecording: document.querySelector("#shareRecording"),
    recordAgain: document.querySelector("#recordAgain"),
    finishRecording: document.querySelector("#finishRecording"),
  };

  let state = loadState();
  let isRunning = false;
  let isCountingDown = false;
  let animationFrame = 0;
  let lastFrameTime = 0;
  let saveTimer = 0;
  let saveStatusTimer = 0;
  let playStateTimer = 0;
  let countdownTimer = 0;
  let activeCountdownElement = null;
  let activeScrollArea = null;
  let activePlayState = null;
  let wakeLock = null;
  let cameraStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingBlob = null;
  let recordingUrl = "";
  let recordingFileName = "";
  let recordingStartedAt = 0;
  let currentFacingMode = "user";
  let isRecording = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const overlayOpacity = Number(saved.overlayOpacity ?? DEFAULTS.overlayOpacity);
      return {
        ...DEFAULTS,
        ...saved,
        script: typeof saved.script === "string" ? saved.script : DEFAULTS.script,
        fontSize: clamp(Number(saved.fontSize ?? DEFAULTS.fontSize), 28, 88),
        scrollSpeed: clamp(Number(saved.scrollSpeed ?? DEFAULTS.scrollSpeed), 8, 100),
        mirrorMode: Boolean(saved.mirrorMode),
        countdownMode: saved.countdownMode === undefined ? true : Boolean(saved.countdownMode),
        overlaySize: OVERLAY_SIZES.includes(saved.overlaySize) ? saved.overlaySize : DEFAULTS.overlaySize,
        overlayPosition: OVERLAY_POSITIONS.includes(saved.overlayPosition)
          ? saved.overlayPosition
          : DEFAULTS.overlayPosition,
        overlayOpacity: OVERLAY_OPACITIES.includes(overlayOpacity)
          ? overlayOpacity
          : DEFAULTS.overlayOpacity,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function selectedValue(name, fallback) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value ?? fallback;
  }

  function collectState() {
    state = {
      script: elements.scriptInput.value,
      fontSize: Number(elements.fontSize.value),
      scrollSpeed: Number(elements.scrollSpeed.value),
      mirrorMode: elements.mirrorMode.checked,
      countdownMode: elements.countdownMode.checked,
      overlaySize: selectedValue("overlaySize", DEFAULTS.overlaySize),
      overlayPosition: selectedValue("overlayPosition", DEFAULTS.overlayPosition),
      overlayOpacity: Number(selectedValue("overlayOpacity", DEFAULTS.overlayOpacity)),
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
    window.clearTimeout(saveStatusTimer);
    if (!persistent) {
      saveStatusTimer = window.setTimeout(() => {
        elements.saveStatus.textContent = "Lokal gespeichert";
      }, 1600);
    }
  }

  function setRadioValue(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = input.value === String(value);
    });
  }

  function renderSettings() {
    elements.scriptInput.value = state.script;
    elements.fontSize.value = String(state.fontSize);
    elements.cameraFontSize.value = String(state.fontSize);
    elements.scrollSpeed.value = String(state.scrollSpeed);
    elements.cameraScrollSpeed.value = String(state.scrollSpeed);
    elements.mirrorMode.checked = state.mirrorMode;
    elements.cameraMirrorMode.checked = state.mirrorMode;
    elements.countdownMode.checked = state.countdownMode;
    elements.cameraCountdownMode.checked = state.countdownMode;
    setRadioValue("overlaySize", state.overlaySize);
    setRadioValue("overlayPosition", state.overlayPosition);
    setRadioValue("overlayOpacity", state.overlayOpacity);
    updateSettingLabels();
  }

  function updateSettingLabels() {
    const fontLabel = `${elements.fontSize.value} px`;
    const speedLabel = `${elements.scrollSpeed.value} px/s`;
    elements.fontSizeValue.value = fontLabel;
    elements.fontSizeValue.textContent = fontLabel;
    elements.cameraFontSizeValue.value = fontLabel;
    elements.cameraFontSizeValue.textContent = fontLabel;
    elements.scrollSpeedValue.value = speedLabel;
    elements.scrollSpeedValue.textContent = speedLabel;
    elements.cameraScrollSpeedValue.value = speedLabel;
    elements.cameraScrollSpeedValue.textContent = speedLabel;
  }

  function setSetupMessage(message = "") {
    elements.cameraSetupStatus.textContent = message;
    elements.cameraSetupStatus.hidden = !message;
  }

  function setCameraMessage(message = "") {
    elements.cameraMessage.textContent = message;
    elements.cameraMessage.hidden = !message;
  }

  function showPlayState(message) {
    if (!activePlayState) return;
    activePlayState.textContent = message;
    activePlayState.classList.add("visible");
    window.clearTimeout(playStateTimer);
    playStateTimer = window.setTimeout(() => activePlayState?.classList.remove("visible"), 900);
  }

  function setRunning(nextRunning, announce = true) {
    isRunning = nextRunning;
    lastFrameTime = performance.now();
    if (announce) showPlayState(isRunning ? "Läuft" : "Pausiert");
  }

  function toggleRunning() {
    if (isCountingDown || !activeScrollArea) return;
    setRunning(!isRunning);
  }

  function scrollFrame(timestamp) {
    const elapsedSeconds = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    if (isRunning && activeScrollArea) {
      activeScrollArea.scrollTop += state.scrollSpeed * elapsedSeconds;
      const atEnd =
        activeScrollArea.scrollTop + activeScrollArea.clientHeight >=
        activeScrollArea.scrollHeight - 2;
      if (atEnd) setRunning(false);
    }

    animationFrame = window.requestAnimationFrame(scrollFrame);
  }

  function startScrollLoop(scrollArea, playState) {
    window.cancelAnimationFrame(animationFrame);
    activeScrollArea = scrollArea;
    activePlayState = playState;
    lastFrameTime = performance.now();
    animationFrame = window.requestAnimationFrame(scrollFrame);
  }

  function stopScrollLoop() {
    window.cancelAnimationFrame(animationFrame);
    window.clearTimeout(playStateTimer);
    isRunning = false;
    activeScrollArea = null;
    activePlayState?.classList.remove("visible");
    activePlayState = null;
  }

  function cancelCountdown() {
    window.clearInterval(countdownTimer);
    if (activeCountdownElement) activeCountdownElement.hidden = true;
    activeCountdownElement = null;
    isCountingDown = false;
  }

  function runCountdown(countdownElement, onComplete) {
    cancelCountdown();
    isCountingDown = true;
    activeCountdownElement = countdownElement;
    countdownElement.hidden = false;
    let remaining = 3;
    countdownElement.textContent = String(remaining);

    countdownTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        countdownElement.textContent = String(remaining);
        return;
      }
      cancelCountdown();
      onComplete();
    }, 1000);
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock) return;
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

  async function leaveFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // The app view can still be left if the browser refuses fullscreen exit.
      }
    }
  }

  function validateScript() {
    persistState(false);
    if (state.script.trim()) return true;
    elements.scriptInput.focus();
    setSaveStatus("Bitte Text eingeben", true);
    return false;
  }

  async function startPrompter() {
    if (!validateScript()) return;

    elements.prompterText.textContent = state.script.trim();
    elements.prompterText.style.fontSize = `${state.fontSize}px`;
    elements.prompterText.classList.toggle("mirrored", state.mirrorMode);
    elements.liveSpeed.value = String(state.scrollSpeed);
    elements.liveSpeed.textContent = String(state.scrollSpeed);
    elements.scrollArea.scrollTop = 0;
    elements.editorView.hidden = true;
    elements.prompterView.hidden = false;
    document.body.style.overflow = "hidden";
    startScrollLoop(elements.scrollArea, elements.playState);

    void requestWakeLock();
    void tryFullscreen();

    const begin = () => {
      setRunning(true, false);
      showPlayState("Läuft");
    };
    if (state.countdownMode) runCountdown(elements.countdown, begin);
    else begin();
  }

  async function exitPrompter() {
    cancelCountdown();
    stopScrollLoop();
    elements.prompterView.hidden = true;
    elements.editorView.hidden = false;
    document.body.style.overflow = "";
    await releaseWakeLock();
    await leaveFullscreen();
    elements.startPrompter.focus();
  }

  function adjustSpeed(delta) {
    state.scrollSpeed = clamp(state.scrollSpeed + delta, 8, 100);
    elements.scrollSpeed.value = String(state.scrollSpeed);
    elements.cameraScrollSpeed.value = String(state.scrollSpeed);
    elements.liveSpeed.value = String(state.scrollSpeed);
    elements.liveSpeed.textContent = String(state.scrollSpeed);
    elements.cameraLiveSpeed.value = String(state.scrollSpeed);
    elements.cameraLiveSpeed.textContent = String(state.scrollSpeed);
    updateSettingLabels();
    persistState(false);
    showPlayState(`${state.scrollSpeed} px/s`);
  }

  function openCameraSetup() {
    persistState(false);
    setSetupMessage("");
    elements.editorView.hidden = true;
    elements.cameraSetupView.hidden = false;
    window.scrollTo(0, 0);
    elements.closeCameraSetup.focus();
  }

  function closeCameraSetup() {
    persistState(false);
    setSetupMessage("");
    elements.cameraSetupView.hidden = true;
    elements.editorView.hidden = false;
    window.scrollTo(0, 0);
    elements.openCameraSetup.focus();
  }

  function getCameraErrorMessage(error) {
    switch (error?.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Kamera oder Mikrofon wurde nicht erlaubt. Bitte erlaube beides in den Safari-Einstellungen und versuche es erneut.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "Keine passende Kamera oder kein Mikrofon wurde gefunden.";
      case "NotReadableError":
      case "TrackStartError":
        return "Kamera oder Mikrofon wird bereits von einer anderen App verwendet.";
      case "OverconstrainedError":
        return "Die gewünschte Kameraeinstellung wird auf diesem Gerät nicht unterstützt.";
      case "SecurityError":
        return "Die Kamera ist nur über eine sichere HTTPS-Verbindung verfügbar.";
      default:
        return "Kamera und Mikrofon konnten nicht gestartet werden. Bitte prüfe die Browser-Berechtigungen.";
    }
  }

  function stopMediaStream() {
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    elements.cameraPreview.srcObject = null;
  }

  async function updateCameraSwitchAvailability() {
    elements.switchCamera.hidden = true;
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      elements.switchCamera.hidden = devices.filter((device) => device.kind === "videoinput").length < 2;
    } catch {
      elements.switchCamera.hidden = true;
    }
  }

  function renderCameraOverlay() {
    elements.cameraOverlay.className = `camera-overlay size-${state.overlaySize} position-${state.overlayPosition}`;
    elements.cameraOverlay.style.setProperty("--overlay-alpha", String(state.overlayOpacity / 100));
    elements.cameraPrompterText.textContent = state.script.trim();
    elements.cameraPrompterText.style.fontSize = `${state.fontSize}px`;
    elements.cameraPrompterText.classList.toggle("mirrored", state.mirrorMode);
    elements.cameraLiveSpeed.value = String(state.scrollSpeed);
    elements.cameraLiveSpeed.textContent = String(state.scrollSpeed);
    elements.cameraScrollArea.scrollTop = 0;
  }

  async function startCameraPreview() {
    persistState(false);
    if (!state.script.trim()) {
      setSetupMessage("Bitte zuerst einen Skripttext eingeben.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setSetupMessage("Dieser Browser unterstützt den Kamerazugriff nicht. Bitte verwende eine aktuelle Safari-Version über HTTPS.");
      return;
    }
    if (!("MediaRecorder" in window)) {
      setSetupMessage("Videoaufnahmen werden von diesem Browser nicht unterstützt. Der reine Teleprompter bleibt nutzbar.");
      return;
    }

    setSetupMessage("Kamera und Mikrofon werden angefordert …");
    elements.startCamera.disabled = true;
    currentFacingMode = "user";
    void tryFullscreen();

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      elements.cameraPreview.srcObject = cameraStream;
      elements.cameraPreview.classList.add("is-front");
      await elements.cameraPreview.play();
      renderCameraOverlay();
      elements.startRecording.hidden = false;
      elements.startRecording.disabled = false;
      elements.stopRecording.hidden = true;
      elements.stopRecording.disabled = false;
      elements.recordingIndicator.hidden = true;
      setCameraMessage("");
      elements.cameraSetupView.hidden = true;
      elements.cameraView.hidden = false;
      document.body.style.overflow = "hidden";
      startScrollLoop(elements.cameraScrollArea, elements.cameraPlayState);
      setRunning(false, false);
      showPlayState("Bereit");
      void requestWakeLock();
      void updateCameraSwitchAvailability();
      setSetupMessage("");
    } catch (error) {
      stopMediaStream();
      setSetupMessage(getCameraErrorMessage(error));
      await leaveFullscreen();
    } finally {
      elements.startCamera.disabled = false;
    }
  }

  async function switchCamera() {
    if (!cameraStream || isRecording || isCountingDown) return;
    const nextFacingMode = currentFacingMode === "user" ? "environment" : "user";
    elements.switchCamera.disabled = true;
    setCameraMessage("");

    try {
      const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacingMode } },
        audio: false,
      });
      const oldVideoTracks = cameraStream.getVideoTracks();
      const audioTracks = cameraStream.getAudioTracks();
      cameraStream = new MediaStream([...videoOnlyStream.getVideoTracks(), ...audioTracks]);
      oldVideoTracks.forEach((track) => track.stop());
      elements.cameraPreview.srcObject = cameraStream;
      currentFacingMode = nextFacingMode;
      elements.cameraPreview.classList.toggle("is-front", currentFacingMode === "user");
      await elements.cameraPreview.play();
    } catch (error) {
      setCameraMessage(`Kamera konnte nicht gewechselt werden. ${getCameraErrorMessage(error)}`);
    } finally {
      elements.switchCamera.disabled = false;
    }
  }

  function chooseRecordingMimeType() {
    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    if (typeof MediaRecorder.isTypeSupported !== "function") return "";
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function resetRecordingControls() {
    isRecording = false;
    elements.recordingIndicator.hidden = true;
    elements.stopRecording.hidden = true;
    elements.stopRecording.disabled = false;
    elements.startRecording.hidden = false;
    elements.startRecording.disabled = false;
    void updateCameraSwitchAvailability();
  }

  function startCameraRecording() {
    if (!cameraStream || isRecording || isCountingDown) return;
    recordedChunks = [];
    elements.cameraScrollArea.scrollTop = 0;
    elements.startRecording.disabled = true;
    elements.switchCamera.hidden = true;
    setCameraMessage("");

    try {
      const mimeType = chooseRecordingMimeType();
      mediaRecorder = mimeType
        ? new MediaRecorder(cameraStream, { mimeType })
        : new MediaRecorder(cameraStream);
    } catch (error) {
      resetRecordingControls();
      setCameraMessage(`Die Aufnahme konnte nicht vorbereitet werden. ${getCameraErrorMessage(error)}`);
      return;
    }

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) recordedChunks.push(event.data);
    });
    mediaRecorder.addEventListener("error", () => {
      setCameraMessage("Während der Aufnahme ist ein Browserfehler aufgetreten.");
    });
    mediaRecorder.addEventListener("stop", finalizeRecording, { once: true });

    const begin = () => {
      try {
        mediaRecorder.start(1000);
        recordingStartedAt = Date.now();
        isRecording = true;
        elements.startRecording.hidden = true;
        elements.startRecording.disabled = false;
        elements.stopRecording.hidden = false;
        elements.recordingIndicator.hidden = false;
        setRunning(true, false);
        showPlayState("Läuft");
      } catch {
        resetRecordingControls();
        setCameraMessage("Die Aufnahme konnte nicht gestartet werden.");
      }
    };

    if (state.countdownMode) runCountdown(elements.cameraCountdown, begin);
    else begin();
  }

  function stopCameraRecording() {
    if (isCountingDown) {
      cancelCountdown();
      resetRecordingControls();
      setRunning(false, false);
      showPlayState("Aufnahme abgebrochen");
      return;
    }
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    setRunning(false, false);
    isRecording = false;
    elements.stopRecording.disabled = true;
    elements.recordingIndicator.hidden = true;
    mediaRecorder.stop();
  }

  function getRecordingExtension(type) {
    return type.includes("mp4") ? "mp4" : "webm";
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function finalizeRecording() {
    const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000));
    const mimeType = mediaRecorder?.mimeType || recordedChunks[0]?.type || "video/webm";
    recordingBlob = new Blob(recordedChunks, { type: mimeType });
    mediaRecorder = null;
    recordedChunks = [];
    stopMediaStream();
    stopScrollLoop();
    elements.cameraView.hidden = true;
    document.body.style.overflow = "";
    await releaseWakeLock();
    await leaveFullscreen();

    if (!recordingBlob.size) {
      cleanupRecording();
      elements.cameraSetupView.hidden = false;
      setSetupMessage("Die Aufnahme war leer. Bitte versuche es erneut.");
      return;
    }

    showRecordingReview(durationSeconds);
  }

  function showRecordingReview(durationSeconds) {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    const extension = getRecordingExtension(recordingBlob.type);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    recordingFileName = `teleprompter-${timestamp}.${extension}`;
    recordingUrl = URL.createObjectURL(recordingBlob);
    elements.recordingPreview.src = recordingUrl;
    elements.saveRecording.href = recordingUrl;
    elements.saveRecording.download = recordingFileName;
    elements.recordingDetails.textContent = `${durationSeconds} Sek. · ${formatBytes(recordingBlob.size)} · ${extension.toUpperCase()}`;
    elements.shareRecording.hidden = !canShareRecording();
    elements.reviewView.hidden = false;
    window.scrollTo(0, 0);
  }

  function makeRecordingFile() {
    if (!recordingBlob || !("File" in window)) return null;
    return new File([recordingBlob], recordingFileName, { type: recordingBlob.type });
  }

  function canShareRecording() {
    const file = makeRecordingFile();
    if (!file || typeof navigator.canShare !== "function" || typeof navigator.share !== "function") return false;
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  async function shareRecording() {
    const file = makeRecordingFile();
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "Teleprompter-Aufnahme" });
    } catch (error) {
      if (error?.name !== "AbortError") {
        elements.recordingDetails.textContent = "Teilen war nicht möglich. Verwende stattdessen „Video sichern“.";
      }
    }
  }

  function cleanupRecording() {
    elements.recordingPreview.pause();
    elements.recordingPreview.removeAttribute("src");
    elements.recordingPreview.load();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = "";
    recordingBlob = null;
    recordingFileName = "";
  }

  async function exitCamera() {
    if (isRecording || (mediaRecorder && mediaRecorder.state !== "inactive")) {
      stopCameraRecording();
      return;
    }
    cancelCountdown();
    stopScrollLoop();
    stopMediaStream();
    mediaRecorder = null;
    recordedChunks = [];
    elements.cameraView.hidden = true;
    elements.cameraSetupView.hidden = false;
    document.body.style.overflow = "";
    await releaseWakeLock();
    await leaveFullscreen();
    elements.startCamera.focus();
  }

  function recordAgain() {
    cleanupRecording();
    elements.reviewView.hidden = true;
    elements.cameraSetupView.hidden = false;
    setSetupMessage("");
    window.scrollTo(0, 0);
    elements.startCamera.focus();
  }

  function finishRecording() {
    cleanupRecording();
    elements.reviewView.hidden = true;
    elements.editorView.hidden = false;
    window.scrollTo(0, 0);
    elements.openCameraSetup.focus();
  }

  function bindSyncedRange(primary, secondary) {
    primary.addEventListener("input", () => {
      secondary.value = primary.value;
      updateSettingLabels();
      scheduleSave();
    });
    secondary.addEventListener("input", () => {
      primary.value = secondary.value;
      updateSettingLabels();
      scheduleSave();
    });
  }

  function bindSyncedToggle(primary, secondary) {
    primary.addEventListener("change", () => {
      secondary.checked = primary.checked;
      scheduleSave();
    });
    secondary.addEventListener("change", () => {
      primary.checked = secondary.checked;
      scheduleSave();
    });
  }

  elements.scriptInput.addEventListener("input", scheduleSave);
  bindSyncedRange(elements.fontSize, elements.cameraFontSize);
  bindSyncedRange(elements.scrollSpeed, elements.cameraScrollSpeed);
  bindSyncedToggle(elements.mirrorMode, elements.cameraMirrorMode);
  bindSyncedToggle(elements.countdownMode, elements.cameraCountdownMode);

  document.querySelectorAll('input[name^="overlay"]').forEach((control) => {
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
  elements.openCameraSetup.addEventListener("click", openCameraSetup);
  elements.closeCameraSetup.addEventListener("click", closeCameraSetup);
  elements.startCamera.addEventListener("click", startCameraPreview);
  elements.exitCamera.addEventListener("click", exitCamera);
  elements.switchCamera.addEventListener("click", switchCamera);
  elements.cameraSlower.addEventListener("click", () => adjustSpeed(-5));
  elements.cameraFaster.addEventListener("click", () => adjustSpeed(5));
  elements.startRecording.addEventListener("click", startCameraRecording);
  elements.stopRecording.addEventListener("click", stopCameraRecording);
  elements.shareRecording.addEventListener("click", shareRecording);
  elements.recordAgain.addEventListener("click", recordAgain);
  elements.finishRecording.addEventListener("click", finishRecording);

  [elements.scrollArea, elements.cameraScrollArea].forEach((scrollArea) => {
    scrollArea.addEventListener("click", toggleRunning);
    scrollArea.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        toggleRunning();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    const fullScreenMode = !elements.prompterView.hidden || !elements.cameraView.hidden;
    if (!fullScreenMode) return;
    if (event.key === "Escape") {
      if (!elements.cameraView.hidden) void exitCamera();
      else void exitPrompter();
    } else if (event.key === "ArrowUp") {
      adjustSpeed(5);
    } else if (event.key === "ArrowDown") {
      adjustSpeed(-5);
    }
  });

  document.addEventListener("visibilitychange", () => {
    const activeFullScreenView = !elements.prompterView.hidden || !elements.cameraView.hidden;
    if (document.visibilityState === "visible" && activeFullScreenView) {
      void requestWakeLock();
      lastFrameTime = performance.now();
    }
  });

  window.addEventListener("pagehide", () => {
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    stopMediaStream();
  });
  window.addEventListener("beforeunload", () => persistState(false));

  renderSettings();
  setSaveStatus(state.script ? "Lokal gespeichert" : "Bereit", true);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // The app remains usable online if service-worker registration fails.
      });
    });
  }
})();
