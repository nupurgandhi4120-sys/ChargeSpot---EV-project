(() => {
  const TEST_STORAGE_KEY = "chargespot_test_session";
  const SESSION_ID = "testmode_" + Date.now().toString(36);

  const state = {
    running: false,
    startedAtMs: 0,
    timerInterval: null,
    autoSuccess: true,
    manualSuccess: true,
  };

  const dom = {
    consentCheckbox: document.getElementById("consentCheckbox"),
    participantCodeInput: document.getElementById("participantCodeInput"),
    methodSelect: document.getElementById("methodSelect"),
    taskInput: document.getElementById("taskInput"),
    chargespotTimerPanel: document.getElementById("chargespotTimerPanel"),
    googleMapsPanel: document.getElementById("googleMapsPanel"),
    timerClockDisplay: document.getElementById("timerClockDisplay"),
    startTimerBtn: document.getElementById("startTimerBtn"),
    stopTimerBtn: document.getElementById("stopTimerBtn"),
    toggleEmbedBtn: document.getElementById("toggleEmbedBtn"),
    embedAppFrame: document.getElementById("embedAppFrame"),
    autoSecondsInput: document.getElementById("autoSecondsInput"),
    autoClicksInput: document.getElementById("autoClicksInput"),
    autoErrorsInput: document.getElementById("autoErrorsInput"),
    addClickBtn: document.getElementById("addClickBtn"),
    addErrorBtn: document.getElementById("addErrorBtn"),
    saveAutoRunBtn: document.getElementById("saveAutoRunBtn"),
    manualSecondsInput: document.getElementById("manualSecondsInput"),
    manualClicksInput: document.getElementById("manualClicksInput"),
    manualErrorsInput: document.getElementById("manualErrorsInput"),
    saveManualRunBtn: document.getElementById("saveManualRunBtn"),
    testFeedbackBox: document.getElementById("testFeedbackBox"),
    runsTableBody: document.getElementById("runsTableBody"),
    refreshRunsBtn: document.getElementById("refreshRunsBtn"),
  };

  function escapeHtml(val) {
    return String(val ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showFeedback(ok, msg) {
    dom.testFeedbackBox.classList.remove("hidden", "is-ok", "is-err");
    dom.testFeedbackBox.classList.add(ok ? "is-ok" : "is-err");
    dom.testFeedbackBox.textContent = msg;
  }

  function readStorageSession() {
    try {
      const raw = localStorage.getItem(TEST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorageSession(obj) {
    try {
      localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore storage errors
    }
  }

  function validateCommonSetup() {
    if (!dom.consentCheckbox.checked) {
      showFeedback(false, "Please check the consent box before starting or logging a run.");
      return null;
    }
    const participantCode = dom.participantCodeInput.value.trim();
    if (!participantCode) {
      showFeedback(false, "Please enter a participant code (e.g. P01).");
      return null;
    }
    const task = dom.taskInput.value.trim();
    if (!task) {
      showFeedback(false, "Please enter a task description.");
      return null;
    }
    return { participantCode, task, method: dom.methodSelect.value };
  }

  function syncCountersFromStorage() {
    if (!state.running) return;
    const sess = readStorageSession();
    if (!sess) return;
    dom.autoClicksInput.value = Number(sess.clicks) || 0;
    dom.autoErrorsInput.value = Number(sess.errors) || 0;
  }

  function startTimer() {
    const setup = validateCommonSetup();
    if (!setup) return;

    state.running = true;
    state.startedAtMs = Date.now();
    dom.startTimerBtn.disabled = true;
    dom.stopTimerBtn.disabled = false;
    dom.autoSecondsInput.value = "0.0";
    dom.autoClicksInput.value = "0";
    dom.autoErrorsInput.value = "0";
    dom.timerClockDisplay.textContent = "0.0 s";
    dom.testFeedbackBox.classList.add("hidden");

    writeStorageSession({
      active: true,
      participantCode: setup.participantCode,
      method: "chargespot",
      task: setup.task,
      startedAtMs: state.startedAtMs,
      clicks: 0,
      errors: 0,
    });

    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      const sec = Math.max(0, (Date.now() - state.startedAtMs) / 1000);
      dom.timerClockDisplay.textContent = `${sec.toFixed(1)} s`;
      dom.autoSecondsInput.value = sec.toFixed(1);
      syncCountersFromStorage();
    }, 200);
  }

  function stopTimer() {
    if (!state.running) return;
    syncCountersFromStorage();
    const sec = Math.max(0, (Date.now() - state.startedAtMs) / 1000);
    state.running = false;
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    dom.startTimerBtn.disabled = false;
    dom.stopTimerBtn.disabled = true;
    dom.timerClockDisplay.textContent = `${sec.toFixed(1)} s`;
    dom.autoSecondsInput.value = sec.toFixed(1);

    const existing = readStorageSession() || {};
    writeStorageSession({ ...existing, active: false });
    showFeedback(true, `Timer stopped at ${sec.toFixed(1)}s. Confirm Task Success and click Log ChargeSpot Run.`);
  }

  async function submitRun({ participantCode, method, task, seconds, clicks, errors, success }) {
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          participantCode,
          method,
          task,
          eventType: "test_run",
          target: `${method}_test_mode`,
          seconds,
          clicks,
          errors,
          success,
          details: `seconds=${seconds};clicks=${clicks};errors=${errors};success=${success}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to log run");
      }
      showFeedback(
        true,
        `Logged ${method} run for ${participantCode}: ${seconds}s, ${clicks} clicks, ${errors} errors (${success ? "Success" : "Failed"}).`
      );
      fetchRuns();
    } catch (err) {
      showFeedback(false, err && err.message ? err.message : "Could not save run.");
    }
  }

  async function fetchRuns() {
    try {
      const res = await fetch("/api/events?type=test_run&limit=25");
      const data = await res.json();
      const events = data.events || [];
      if (!events.length) {
        dom.runsTableBody.innerHTML = '<tr><td colspan="8" style="color:#64748b;">No test runs logged yet.</td></tr>';
        return;
      }
      dom.runsTableBody.innerHTML = events
        .map(
          (ev) => `
          <tr>
            <td><strong>${escapeHtml(ev.participantCode || "-")}</strong></td>
            <td>${escapeHtml(ev.method || "-")}</td>
            <td class="task-cell">${escapeHtml(ev.task || ev.target || "-")}</td>
            <td>${ev.seconds !== null && ev.seconds !== undefined ? Number(ev.seconds).toFixed(1) : "-"}</td>
            <td>${ev.clicks ?? 0}</td>
            <td>${ev.errors ?? 0}</td>
            <td>${ev.success ? '<span class="status-pill status-working">Success</span>' : '<span class="status-pill status-broken">Failed</span>'}</td>
            <td style="color:#64748b;">${escapeHtml(new Date(ev.createdAt).toLocaleTimeString())}</td>
          </tr>`
        )
        .join("");
    } catch {
      dom.runsTableBody.innerHTML = '<tr><td colspan="8" style="color:#dc2626;">Could not load runs.</td></tr>';
    }
  }

  function updateMethodView() {
    const isManual = dom.methodSelect.value === "google_maps";
    dom.chargespotTimerPanel.classList.toggle("hidden", isManual);
    dom.googleMapsPanel.classList.toggle("hidden", !isManual);
    dom.testFeedbackBox.classList.add("hidden");
  }

  dom.methodSelect.addEventListener("change", updateMethodView);
  dom.startTimerBtn.addEventListener("click", startTimer);
  dom.stopTimerBtn.addEventListener("click", stopTimer);
  dom.refreshRunsBtn.addEventListener("click", fetchRuns);

  dom.toggleEmbedBtn.addEventListener("click", () => {
    const isHidden = dom.embedAppFrame.classList.contains("hidden");
    if (isHidden) {
      if (!dom.embedAppFrame.getAttribute("src")) {
        dom.embedAppFrame.setAttribute("src", "/");
      }
      dom.embedAppFrame.classList.remove("hidden");
      dom.toggleEmbedBtn.textContent = "Hide ChargeSpot Frame";
    } else {
      dom.embedAppFrame.classList.add("hidden");
      dom.toggleEmbedBtn.textContent = "Show ChargeSpot Frame";
    }
  });

  dom.addClickBtn.addEventListener("click", () => {
    dom.autoClicksInput.value = (parseInt(dom.autoClicksInput.value, 10) || 0) + 1;
  });
  dom.addErrorBtn.addEventListener("click", () => {
    dom.autoErrorsInput.value = (parseInt(dom.autoErrorsInput.value, 10) || 0) + 1;
  });

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      dom.taskInput.value = btn.getAttribute("data-preset");
    });
  });

  document.querySelectorAll("[data-auto-success]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.autoSuccess = btn.getAttribute("data-auto-success") === "true";
      document.querySelectorAll("[data-auto-success]").forEach((b) => {
        b.classList.remove("is-pass", "is-fail");
      });
      btn.classList.add(state.autoSuccess ? "is-pass" : "is-fail");
    });
  });

  document.querySelectorAll("[data-manual-success]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.manualSuccess = btn.getAttribute("data-manual-success") === "true";
      document.querySelectorAll("[data-manual-success]").forEach((b) => {
        b.classList.remove("is-pass", "is-fail");
      });
      btn.classList.add(state.manualSuccess ? "is-pass" : "is-fail");
    });
  });

  dom.saveAutoRunBtn.addEventListener("click", () => {
    if (state.running) stopTimer();
    const setup = validateCommonSetup();
    if (!setup) return;

    const seconds = Number(dom.autoSecondsInput.value);
    const clicks = parseInt(dom.autoClicksInput.value, 10) || 0;
    const errors = parseInt(dom.autoErrorsInput.value, 10) || 0;
    if (!Number.isFinite(seconds) || seconds < 0) {
      showFeedback(false, "Seconds must be 0 or greater.");
      return;
    }

    submitRun({
      participantCode: setup.participantCode,
      method: "chargespot",
      task: setup.task,
      seconds: Number(seconds.toFixed(2)),
      clicks,
      errors,
      success: state.autoSuccess,
    });
  });

  dom.saveManualRunBtn.addEventListener("click", () => {
    const setup = validateCommonSetup();
    if (!setup) return;

    const rawSec = dom.manualSecondsInput.value.trim();
    const seconds = Number(rawSec);
    if (rawSec === "" || !Number.isFinite(seconds) || seconds < 0) {
      showFeedback(false, "Please enter a valid non-negative number of seconds for Google Maps.");
      return;
    }
    const clicks = Math.max(0, parseInt(dom.manualClicksInput.value, 10) || 0);
    const errors = Math.max(0, parseInt(dom.manualErrorsInput.value, 10) || 0);

    submitRun({
      participantCode: setup.participantCode,
      method: "google_maps",
      task: setup.task,
      seconds: Number(seconds.toFixed(2)),
      clicks,
      errors,
      success: state.manualSuccess,
    });
  });

  window.addEventListener("storage", (ev) => {
    if (ev.key === TEST_STORAGE_KEY) {
      syncCountersFromStorage();
    }
  });

  updateMethodView();
  fetchRuns();
})();
