(() => {
  const FAVORITES_KEY = "chargespot_favs_v1";
  const SESSION_KEY = "chargespot_session_v1";

  const SESSION_ID = (() => {
    try {
      let existing = sessionStorage.getItem(SESSION_KEY);
      if (!existing) {
        existing = "sess_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
        sessionStorage.setItem(SESSION_KEY, existing);
      }
      return existing;
    } catch {
      return "sess_" + Date.now().toString(36);
    }
  })();

  const taskStartMs = performance.now();
  let hasLoggedFirstTask = false;

  const STATUS_META = {
    Working: { pillClass: "status-working", dotClass: "dot-working", pinColor: "#10b981" },
    Busy: { pillClass: "status-busy", dotClass: "dot-busy", pinColor: "#f97316" },
    Broken: { pillClass: "status-broken", dotClass: "dot-broken", pinColor: "#ef4444" },
    Unreported: { pillClass: "status-unreported", dotClass: "dot-unreported", pinColor: "#94a3b8" },
  };

  const state = {
    stations: [],
    counts: {
      working: 0,
      busy: 0,
      broken: 0,
      unreported: 0,
      totalPoints: 0,
      totalReports: 0,
      all: 0,
      fourWheeler: 0,
      twoWheeler: 0,
    },
    vehicleFilter: "all",
    searchQuery: "",
    selectedArea: "All Areas",
    statusFilter: "all",
    chargerTypeFilter: "all",
    networkFilter: "all",
    favorites: loadFavorites(),
    userLocation: null,
    isLocating: false,
    geoAlert: null,
    showRadar: true,
    mapZoom: 1,
    selectedStationId: null,
    highlightedStationId: null,
    copiedId: null,
    selectedReportStatus: "Working",
    selectedReportSource: "rider",
    selectedReportVehicle: "",
    reportComment: "",
    submittingReport: false,
    reportFeedback: null,
  };

  const dom = {
    headerNearMeBtn: document.getElementById("headerNearMeBtn"),
    headerNearMeLabel: document.getElementById("headerNearMeLabel"),
    mobileMenuToggle: document.getElementById("mobileMenuToggle"),
    mobileMenu: document.getElementById("mobileMenu"),
    mobileNearMeBtn: document.getElementById("mobileNearMeBtn"),
    heroBtn4W: document.getElementById("heroBtn4W"),
    heroLabel4W: document.getElementById("heroLabel4W"),
    heroBtn2W: document.getElementById("heroBtn2W"),
    heroLabel2W: document.getElementById("heroLabel2W"),
    directorySummaryCopy: document.getElementById("directorySummaryCopy"),
    statCardsGrid: document.getElementById("statCardsGrid"),
    toggleRadarBtn: document.getElementById("toggleRadarBtn"),
    radarPanel: document.getElementById("radarPanel"),
    radarGunSummary: document.getElementById("radarGunSummary"),
    radarWorkingCount: document.getElementById("radarWorkingCount"),
    radarBusyCount: document.getElementById("radarBusyCount"),
    radarBrokenCount: document.getElementById("radarBrokenCount"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomResetBtn: document.getElementById("zoomResetBtn"),
    radarSvg: document.getElementById("radarSvg"),
    radarUserLayer: document.getElementById("radarUserLayer"),
    radarPinsLayer: document.getElementById("radarPinsLayer"),
    radarHoverCard: document.getElementById("radarHoverCard"),
    tabVehicleAll: document.getElementById("tabVehicleAll"),
    tabLabelAll: document.getElementById("tabLabelAll"),
    tabVehicle4W: document.getElementById("tabVehicle4W"),
    tabLabel4W: document.getElementById("tabLabel4W"),
    tabVehicle2W: document.getElementById("tabVehicle2W"),
    tabLabel2W: document.getElementById("tabLabel2W"),
    searchInputBox: document.getElementById("searchInputBox"),
    stationSearchInput: document.getElementById("stationSearchInput"),
    searchNearMeBtn: document.getElementById("searchNearMeBtn"),
    searchNearMeLabel: document.getElementById("searchNearMeLabel"),
    liveLocationBanner: document.getElementById("liveLocationBanner"),
    geoAlertBanner: document.getElementById("geoAlertBanner"),
    areaPillsRow: document.getElementById("areaPillsRow"),
    statusFilterSelect: document.getElementById("statusFilterSelect"),
    typeFilterSelect: document.getElementById("typeFilterSelect"),
    networkFilterSelect: document.getElementById("networkFilterSelect"),
    showingCountLabel: document.getElementById("showingCountLabel"),
    sortSubtitle: document.getElementById("sortSubtitle"),
    stationsCountHeading: document.getElementById("stationsCountHeading"),
    stationsGrid: document.getElementById("stationsGrid"),
    stationModalBackdrop: document.getElementById("stationModalBackdrop"),
    stationModalSheet: document.getElementById("stationModalSheet"),
    headerEventsCount: document.getElementById("headerEventsCount"),
    usageKpiTotalEvents: document.getElementById("usageKpiTotalEvents"),
    usageKpiSessions: document.getElementById("usageKpiSessions"),
    usageKpiStationViews: document.getElementById("usageKpiStationViews"),
    usageKpiReports: document.getElementById("usageKpiReports"),
    usageFeedList: document.getElementById("usageFeedList"),
    refreshUsageBtn: document.getElementById("refreshUsageBtn"),
  };

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
    } catch {
      // Ignore storage quota errors
    }
  }

  function getActiveTestSession() {
    try {
      const raw = localStorage.getItem("chargespot_test_session");
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.active ? parsed : null;
    } catch {
      return null;
    }
  }

  function bumpTestCounter(field) {
    try {
      const raw = localStorage.getItem("chargespot_test_session");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.active) {
        parsed[field] = (Number(parsed[field]) || 0) + 1;
        localStorage.setItem("chargespot_test_session", JSON.stringify(parsed));
      }
    } catch {
      // Ignore storage errors
    }
  }

  function logEvent(eventType, target, opts = {}) {
    const activeTest = getActiveTestSession();
    if (eventType === "click") bumpTestCounter("clicks");
    if (eventType === "error") bumpTestCounter("errors");

    const payload = {
      sessionId: SESSION_ID,
      participantCode: opts.participantCode || (activeTest ? activeTest.participantCode : ""),
      method: opts.method || (activeTest ? activeTest.method : "chargespot"),
      task: opts.task || (activeTest ? activeTest.task : ""),
      eventType,
      target: target || "",
      stationId: opts.stationId || "",
      taskTimeMs: typeof opts.taskTimeMs === "number" ? Math.round(opts.taskTimeMs) : null,
      clicks: eventType === "click" ? 1 : 0,
      errors: eventType === "error" ? 1 : 0,
      success: typeof opts.success === "boolean" ? opts.success : true,
      details: opts.details || "",
    };

    try {
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then(() => {
          fetchUsageTelemetrySummary();
        })
        .catch(() => {});
    } catch {
      // Non-blocking telemetry
    }
  }

  let usageSummaryDebounce = null;
  async function fetchUsageTelemetrySummary() {
    clearTimeout(usageSummaryDebounce);
    usageSummaryDebounce = setTimeout(async () => {
      try {
        const res = await fetch("/api/usage/summary");
        if (!res.ok) return;
        const data = await res.json();

        if (dom.headerEventsCount) {
          dom.headerEventsCount.textContent = data.totalEvents || 0;
        }
        if (dom.usageKpiTotalEvents) {
          dom.usageKpiTotalEvents.textContent = data.totalEvents || 0;
        }
        if (dom.usageKpiSessions) {
          dom.usageKpiSessions.textContent = data.totalSessions || 0;
        }
        if (dom.usageKpiStationViews) {
          dom.usageKpiStationViews.textContent =
            (data.totalStationViews || 0) + (data.totalDirections || 0);
        }
        if (dom.usageKpiReports) {
          dom.usageKpiReports.textContent = data.totalReports || 0;
        }

        if (dom.usageFeedList) {
          const recent = data.recentEvents || [];
          if (!recent.length) {
            dom.usageFeedList.innerHTML =
              '<div class="usage-feed-loading">No interactions recorded yet. Interact with the app above to see live events.</div>';
            return;
          }
          dom.usageFeedList.innerHTML = recent
            .slice(0, 10)
            .map((ev) => {
              const rel = formatRelativeTime(ev.createdAt);
              const badgeType = ev.eventType || "click";
              let actionDesc = ev.target || "user_action";
              if (ev.eventType === "search") {
                actionDesc = `Searched: ${ev.details || "stations"}`;
              } else if (ev.eventType === "station_view") {
                actionDesc = `Viewed station: ${ev.details || ev.stationId}`;
              } else if (ev.target === "google_maps") {
                actionDesc = `Directions requested for ${ev.stationId || "station"}`;
              } else if (ev.target === "near_me") {
                actionDesc = "Near Me GPS location clicked";
              } else if (ev.target === "submit_report") {
                actionDesc = `Submitted rider report (${ev.details || "status"})`;
              } else if (ev.eventType === "page_view") {
                actionDesc = "Session started / Page loaded";
              } else if (ev.details) {
                actionDesc = `${ev.target}: ${ev.details}`;
              }
              const shortSession = (ev.sessionId || "").slice(0, 10);
              return `
                <div class="usage-feed-item">
                  <div class="usage-feed-left">
                    <span class="status-pill status-${ev.success ? "working" : "broken"}">${escapeHtml(badgeType)}</span>
                    <strong>${escapeHtml(actionDesc)}</strong>
                    <span style="font-size:11px;color:#94a3b8;font-family:monospace;">(${escapeHtml(shortSession)})</span>
                  </div>
                  <div class="usage-feed-time">${escapeHtml(rel)}</div>
                </div>`;
            })
            .join("");
        }
      } catch {
        // Non-blocking telemetry
      }
    }, 200);
  }

  function recordTaskSuccess(target, stationId, details) {
    const elapsed = performance.now() - taskStartMs;
    logEvent(hasLoggedFirstTask ? "success" : "task_complete", target, {
      stationId,
      taskTimeMs: elapsed,
      success: true,
      details,
    });
    hasLoggedFirstTask = true;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return "Recently";
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (!Number.isFinite(diffMs) || diffMs < 60000) return "Just now";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function vehicleBadgeHtml(vehicleType) {
    if (vehicleType === "2W") {
      return '<span class="badge-2w">2-Wheeler</span>';
    }
    if (vehicleType === "4W") {
      return '<span class="badge-4w">4-Wheeler</span>';
    }
    return '<span class="badge-both">2W + 4W</span>';
  }

  function statusPillHtml(status) {
    const meta = STATUS_META[status] || STATUS_META.Unreported;
    return `<span class="status-pill ${meta.pillClass}"><span class="status-dot ${meta.dotClass}"></span>${escapeHtml(status)}</span>`;
  }

  function matchesVehicle(station, filter) {
    if (filter === "all") return true;
    return station.vehicleType === filter || station.vehicleType === "Both";
  }

  function getFilteredStations() {
    const q = state.searchQuery.trim().toLowerCase();
    return state.stations.filter((st) => {
      if (!matchesVehicle(st, state.vehicleFilter)) return false;
      if (state.selectedArea !== "All Areas" && st.area !== state.selectedArea) return false;
      if (state.statusFilter !== "all" && st.status !== state.statusFilter) return false;
      if (state.chargerTypeFilter !== "all" && st.chargerType !== state.chargerTypeFilter) return false;
      if (state.networkFilter !== "all" && st.network !== state.networkFilter) return false;
      if (q) {
        const hay = `${st.name} ${st.area} ${st.address} ${st.operator} ${st.network} ${st.chargerType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  async function fetchStations() {
    const params = new URLSearchParams();
    if (state.userLocation) {
      params.set("lat", state.userLocation.lat.toFixed(6));
      params.set("lng", state.userLocation.lng.toFixed(6));
    }
    const qs = params.toString();
    const url = qs ? `/api/stations?${qs}` : "/api/stations";
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load stations");
      }
      state.stations = data.stations || [];
      state.counts = data.counts || state.counts;
      populateDropdowns();
      renderAll();
    } catch (err) {
      logEvent("error", "fetch_stations", {
        success: false,
        details: err && err.message ? err.message : "Network error",
      });
    }
  }

  function populateDropdowns() {
    const networks = Array.from(new Set(state.stations.map((s) => s.network).filter(Boolean))).sort();
    const prevNetwork = state.networkFilter;
    dom.networkFilterSelect.innerHTML =
      '<option value="all">Network: All Operators</option>' +
      networks.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    dom.networkFilterSelect.value = networks.includes(prevNetwork) ? prevNetwork : "all";
  }

  function renderHeroAndTabs() {
    const c = state.counts;
    dom.heroLabel4W.textContent = `4-Wheeler Cars (${c.fourWheeler})`;
    dom.heroLabel2W.textContent = `2-Wheeler Scooters (${c.twoWheeler})`;

    dom.tabLabelAll.textContent = `All (${c.all})`;
    dom.tabLabel4W.textContent = `4W Cars (${c.fourWheeler})`;
    dom.tabLabel2W.textContent = `2W Scooters (${c.twoWheeler})`;

    dom.tabVehicleAll.className = `vehicle-tab ${state.vehicleFilter === "all" ? "active-all" : ""}`;
    dom.tabVehicle4W.className = `vehicle-tab ${state.vehicleFilter === "4W" ? "active-4w" : ""}`;
    dom.tabVehicle2W.className = `vehicle-tab ${state.vehicleFilter === "2W" ? "active-2w" : ""}`;

    dom.heroBtn4W.setAttribute("aria-pressed", String(state.vehicleFilter === "4W"));
    dom.heroBtn2W.setAttribute("aria-pressed", String(state.vehicleFilter === "2W"));

    dom.directorySummaryCopy.textContent = `${c.all} verified charging stations across Ahmedabad — click any station card to verify or report Working, Busy, or Broken status.`;
  }

  function renderStatCards() {
    const c = state.counts;
    const cards = [
      {
        label: "Working Stations",
        value: c.working,
        sub: "Confirmed ready by riders",
        tone: "tone-emerald",
        icon: '<svg class="icon-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      },
      {
        label: "Busy Stations",
        value: c.busy,
        sub: "Queue or active charging",
        tone: "tone-amber",
        icon: '<svg class="icon-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      },
      {
        label: "Broken Stations",
        value: c.broken,
        sub: "Reported offline or faulted",
        tone: "tone-red",
        icon: '<svg class="icon-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      },
      {
        label: "Charging Points",
        value: c.totalPoints,
        sub: `${c.unreported || 0} unreported • ${c.totalReports || 0} reports`,
        tone: "tone-cyan",
        icon: '<svg class="icon-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      },
    ];

    dom.statCardsGrid.innerHTML = cards
      .map(
        (card) => `
        <div class="stat-card">
          <div class="stat-icon-box ${card.tone}">${card.icon}</div>
          <div class="stat-value">${card.value}</div>
          <div class="stat-label">${card.label}</div>
          <div class="stat-sub">${card.sub}</div>
        </div>`
      )
      .join("");
  }

  function renderAreaPills() {
    const countsByArea = { "All Areas": state.stations.length };
    for (const st of state.stations) {
      countsByArea[st.area] = (countsByArea[st.area] || 0) + 1;
    }
    const areas = ["All Areas", ...Object.keys(countsByArea).filter((a) => a !== "All Areas").sort()];
    dom.areaPillsRow.innerHTML = areas
      .map((area) => {
        const active = state.selectedArea === area ? "is-active" : "";
        return `<button type="button" class="area-pill ${active}" data-area="${escapeHtml(area)}">${escapeHtml(area)} (${countsByArea[area]})</button>`;
      })
      .join("");
  }

  function renderLocationBanners() {
    const nearText = state.isLocating ? "Locating..." : "Near Me";
    dom.headerNearMeLabel.textContent = nearText;
    dom.searchNearMeLabel.textContent = state.isLocating ? "Finding GPS..." : "Near Me";

    if (state.userLocation) {
      const closest = state.stations[0];
      dom.liveLocationBanner.classList.remove("hidden");
      dom.liveLocationBanner.innerHTML = `
        <div class="live-gps-banner-inner">
          <div>
            <strong>GPS Lock Active</strong> — Showing stations sorted nearest to (${state.userLocation.lat.toFixed(4)}, ${state.userLocation.lng.toFixed(4)}).
            ${closest ? `<br><span>Closest station: <strong>${escapeHtml(closest.name)}</strong> (${closest.distance.toFixed(2)} km • ${escapeHtml(closest.status)})</span>` : ""}
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${closest ? `<button type="button" class="btn-outline-sm" data-open-closest="${escapeHtml(closest.id)}">View Closest</button>` : ""}
            <button type="button" class="btn-outline-sm" id="clearLocationBtn">Clear GPS</button>
          </div>
        </div>`;
      const clearBtn = document.getElementById("clearLocationBtn");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          state.userLocation = null;
          state.geoAlert = null;
          logEvent("click", "clear_gps");
          fetchStations();
        });
      }
      const closestBtn = dom.liveLocationBanner.querySelector("[data-open-closest]");
      if (closestBtn) {
        closestBtn.addEventListener("click", () => {
          openModal(closestBtn.getAttribute("data-open-closest"));
        });
      }
    } else {
      dom.liveLocationBanner.classList.add("hidden");
      dom.liveLocationBanner.innerHTML = "";
    }

    if (state.geoAlert) {
      dom.geoAlertBanner.classList.remove("hidden");
      dom.geoAlertBanner.textContent = state.geoAlert;
    } else {
      dom.geoAlertBanner.classList.add("hidden");
      dom.geoAlertBanner.textContent = "";
    }
  }

  function projectToRadar(lat, lng, bounds) {
    const padX = 75;
    const padY = 55;
    const w = 800 - padX * 2;
    const h = 420 - padY * 2;
    const nx = (lng - bounds.minLng) / Math.max(0.001, bounds.maxLng - bounds.minLng);
    const ny = 1 - (lat - bounds.minLat) / Math.max(0.001, bounds.maxLat - bounds.minLat);
    const cx = 400;
    const cy = 210;
    const rawX = padX + nx * w;
    const rawY = padY + ny * h;
    return {
      x: cx + (rawX - cx) * state.mapZoom,
      y: cy + (rawY - cy) * state.mapZoom,
    };
  }

  function renderRadarMap(filteredStations) {
    dom.radarPanel.classList.toggle("hidden", !state.showRadar);
    dom.toggleRadarBtn.textContent = state.showRadar ? "Hide Map" : "Show Map";
    if (!state.showRadar) return;

    const workingCount = filteredStations.filter((s) => s.status === "Working").length;
    const busyCount = filteredStations.filter((s) => s.status === "Busy").length;
    const brokenCount = filteredStations.filter((s) => s.status === "Broken").length;
    const totalGuns = filteredStations.reduce((sum, s) => sum + (s.points || 0), 0);

    dom.radarWorkingCount.textContent = workingCount;
    dom.radarBusyCount.textContent = busyCount;
    dom.radarBrokenCount.textContent = brokenCount;
    dom.radarGunSummary.textContent = `${filteredStations.length} Stations • ${totalGuns} Points`;

    const allStations = state.stations.length ? state.stations : filteredStations;
    if (!allStations.length) {
      dom.radarPinsLayer.innerHTML = "";
      dom.radarUserLayer.innerHTML = "";
      return;
    }

    const lats = allStations.map((s) => s.location.lat);
    const lngs = allStations.map((s) => s.location.lng);
    const bounds = {
      minLat: Math.min(...lats) - 0.01,
      maxLat: Math.max(...lats) + 0.01,
      minLng: Math.min(...lngs) - 0.01,
      maxLng: Math.max(...lngs) + 0.01,
    };

    if (state.userLocation) {
      const up = projectToRadar(state.userLocation.lat, state.userLocation.lng, bounds);
      dom.radarUserLayer.innerHTML = `
        <g transform="translate(${up.x.toFixed(1)}, ${up.y.toFixed(1)})">
          <circle r="18" fill="rgba(59,130,246,0.2)" stroke="#60a5fa" stroke-width="1.5" />
          <circle r="6" fill="#3b82f6" stroke="#ffffff" stroke-width="2" />
          <text y="-12" text-anchor="middle" fill="#93c5fd" font-size="10" font-weight="700">You</text>
        </g>`;
    } else {
      dom.radarUserLayer.innerHTML = "";
    }

    dom.radarPinsLayer.innerHTML = filteredStations
      .map((st, idx) => {
        const pt = projectToRadar(st.location.lat, st.location.lng, bounds);
        const meta = STATUS_META[st.status] || STATUS_META.Unreported;
        const isHighlighted = state.highlightedStationId === st.id;
        const isClosest = Boolean(state.userLocation && idx === 0);
        const radius = isHighlighted || isClosest ? 9 : 6.5;
        return `
          <g class="radar-pin" data-pin-id="${escapeHtml(st.id)}" transform="translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})">
            ${isClosest ? '<circle r="16" fill="rgba(16,185,129,0.22)" stroke="#34d399" stroke-width="1.5" />' : ""}
            <circle r="${radius}" fill="${meta.pinColor}" stroke="#020617" stroke-width="2" />
            <text y="${radius + 12}" text-anchor="middle" fill="#e2e8f0" font-size="9.5" font-weight="700">${escapeHtml(st.area)}</text>
          </g>`;
      })
      .join("");
  }

  function renderStationCards(filteredStations) {
    dom.showingCountLabel.textContent = `Showing ${filteredStations.length} of ${state.stations.length} stations`;
    dom.stationsCountHeading.textContent = `${filteredStations.length} Stations Shown`;
    dom.sortSubtitle.textContent = state.userLocation
      ? "Sorted closest to your live GPS location"
      : "Sorted alphabetically — click Near Me to sort by distance";

    if (!filteredStations.length) {
      dom.stationsGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;text-align:center;padding:3rem 1.5rem;background:#fff;border-radius:1.5rem;border:1px dashed #cbd5e1;">
          <h3 style="margin:0 0 0.5rem;">No stations match these filters</h3>
          <p style="margin:0 0 1rem;color:#64748b;">Try clearing your search query or resetting vehicle/status filters.</p>
          <button type="button" class="btn-reset-filters" id="resetFiltersBtn">Reset All Filters</button>
        </div>`;
      const resetBtn = document.getElementById("resetFiltersBtn");
      if (resetBtn) {
        resetBtn.addEventListener("click", resetFilters);
      }
      return;
    }

    dom.stationsGrid.innerHTML = filteredStations
      .map((st, idx) => {
        const isFav = state.favorites.includes(st.id);
        const isClosest = Boolean(state.userLocation && idx === 0);
        const isHighlighted = state.highlightedStationId === st.id;
        const distanceLabel = state.userLocation
          ? `${st.distance.toFixed(2)} km`
          : `${st.area}`;
        const reportLabel = st.reportCount === 1 ? "1 rider report" : `${st.reportCount || 0} rider reports`;

        return `
          <article class="station-card ${isHighlighted ? "is-highlighted" : ""}" id="card-${escapeHtml(st.id)}">
            <div class="card-top-row">
              <div class="card-badges">
                ${statusPillHtml(st.status)}
                ${vehicleBadgeHtml(st.vehicleType)}
                ${isClosest ? '<span class="badge-closest">Closest</span>' : ""}
              </div>
              <button type="button" class="heart-btn ${isFav ? "is-fav" : ""}" data-fav-id="${escapeHtml(st.id)}" aria-label="Toggle favorite">
                ${isFav ? "♥" : "♡"}
              </button>
            </div>

            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem;margin-top:0.75rem;">
              <h3 class="card-title">${escapeHtml(st.name)}</h3>
              <span class="distance-pill">${escapeHtml(distanceLabel)}</span>
            </div>

            <p class="card-address">${escapeHtml(st.address)}</p>

            <div class="card-specs">
              <span class="spec-chip">${escapeHtml(st.chargerType)}</span>
              <span class="spec-chip">${escapeHtml(st.maxRate)}</span>
              <span class="spec-chip">${escapeHtml(st.points)} pts</span>
              <span class="spec-chip">${escapeHtml(st.network)}</span>
            </div>

            <div class="card-availability">
              <div><strong>Status basis:</strong> ${escapeHtml(st.statusReason || "Community status")}</div>
              <div class="freshness-text">${escapeHtml(reportLabel)} • Updated ${escapeHtml(formatRelativeTime(st.lastUpdated))} • Tariff ₹${escapeHtml(st.tariff.baseRate)}/${escapeHtml(st.tariff.unit)}</div>
            </div>

            <div class="card-footer">
              <div class="card-footer-actions">
                <a class="btn-gmaps" href="${escapeHtml(st.mapsUri)}" target="_blank" rel="noopener noreferrer" data-maps-id="${escapeHtml(st.id)}">Google Maps</a>
                <button type="button" class="btn-copy-gps" data-copy-id="${escapeHtml(st.id)}">${state.copiedId === st.id ? "Copied GPS" : "Copy GPS"}</button>
              </div>
              <button type="button" class="details-link" data-details-id="${escapeHtml(st.id)}">Report / Details →</button>
            </div>
          </article>`;
      })
      .join("");
  }

  function renderModal() {
    if (!state.selectedStationId) {
      dom.stationModalBackdrop.classList.add("hidden");
      dom.stationModalSheet.innerHTML = "";
      return;
    }

    const st = state.stations.find((s) => s.id === state.selectedStationId);
    if (!st) {
      closeModal();
      return;
    }

    const connectorsHtml = (st.connectorTypes || [])
      .map((c) => {
        if (typeof c === "string") {
          return `
          <div class="connector-row">
            <div><strong>${escapeHtml(c)}</strong></div>
            <div style="font-size:0.75rem;font-weight:700;color:#0f172a;">${escapeHtml(st.chargerType)} • ${escapeHtml(st.maxRate)} kW</div>
          </div>`;
        }
        return `
        <div class="connector-row">
          <div>
            <strong>${escapeHtml(c.type)}</strong>
            <span style="color:#64748b;font-size:0.75rem;margin-left:0.5rem;">${escapeHtml(c.power)}</span>
          </div>
          <div style="font-size:0.75rem;font-weight:700;color:#0f172a;">
            ${escapeHtml(c.available)}/${escapeHtml(c.total)} connectors
          </div>
        </div>`;
      })
      .join("");

    const recentHtml = (st.recentReports || []).length
      ? st.recentReports
          .map(
            (r) => `
            <div class="recent-report-item">
              <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                ${statusPillHtml(r.status)}
                <span class="spec-chip">${r.source === "verified_visit" ? "Verified visit" : "Rider"}</span>
                ${r.vehicleType ? `<span class="spec-chip">${escapeHtml(r.vehicleType)}</span>` : ""}
              </div>
              <span style="color:#64748b;">${escapeHtml(formatRelativeTime(r.createdAt))}</span>
              ${r.comment ? `<p class="recent-report-comment">${escapeHtml(r.comment)}</p>` : ""}
            </div>`
          )
          .join("")
      : '<p style="margin:0.5rem 0 0;font-size:0.75rem;color:#64748b;">No reports logged yet. Be the first rider to confirm status.</p>';

    const feedbackHtml = state.reportFeedback
      ? `<div class="report-feedback ${state.reportFeedback.ok ? "is-ok" : "is-err"}">${escapeHtml(state.reportFeedback.message)}</div>`
      : "";

    dom.stationModalBackdrop.classList.remove("hidden");
    dom.stationModalSheet.innerHTML = `
      <div class="modal-header">
        <div>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:0.5rem;">
            ${statusPillHtml(st.status)}
            ${vehicleBadgeHtml(st.vehicleType)}
            <span class="spec-chip">${escapeHtml(st.network)}</span>
          </div>
          <h2 class="modal-title">${escapeHtml(st.name)}</h2>
          <p class="modal-address">${escapeHtml(st.address)} • Plus Code: ${escapeHtml(st.plusCode || "Ahmedabad")}</p>
        </div>
        <button type="button" class="modal-close-btn" id="modalCloseBtn" aria-label="Close modal">✕</button>
      </div>

      <div class="grid-4">
        <div class="metric-box">
          <div style="font-size:11px;color:#64748b;">Status Rule</div>
          <div style="font-size:0.8125rem;font-weight:700;margin-top:0.2rem;">${escapeHtml(st.statusReason)}</div>
        </div>
        <div class="metric-box">
          <div style="font-size:11px;color:#64748b;">Charger Type</div>
          <div style="font-size:0.8125rem;font-weight:700;margin-top:0.2rem;">${escapeHtml(st.chargerType)} (${escapeHtml(st.maxRate)})</div>
        </div>
        <div class="metric-box">
          <div style="font-size:11px;color:#64748b;">Tariff</div>
          <div style="font-size:0.8125rem;font-weight:700;margin-top:0.2rem;">₹${escapeHtml(st.tariff.baseRate)} / ${escapeHtml(st.tariff.unit)}</div>
        </div>
        <div class="metric-box">
          <div style="font-size:11px;color:#64748b;">Coordinates</div>
          <div style="font-size:0.8125rem;font-weight:700;margin-top:0.2rem;">${st.location.lat.toFixed(4)}, ${st.location.lng.toFixed(4)}</div>
        </div>
      </div>

      <div class="report-box">
        <div class="report-box-head">
          <strong style="font-size:0.9375rem;">Report Live Charger Status</strong>
          <span style="font-size:0.75rem;color:#64748b;">Saved immediately to SQLite</span>
        </div>
        <div class="report-btn-grid">
          <button type="button" class="report-choice-btn ${state.selectedReportStatus === "Working" ? "is-selected-working" : ""}" data-report-status="Working">● Working</button>
          <button type="button" class="report-choice-btn ${state.selectedReportStatus === "Busy" ? "is-selected-busy" : ""}" data-report-status="Busy">● Busy</button>
          <button type="button" class="report-choice-btn ${state.selectedReportStatus === "Broken" ? "is-selected-broken" : ""}" data-report-status="Broken">● Broken</button>
        </div>
        <form id="reportSubmitForm" class="report-form-row">
          <select id="reportSourceInput" class="report-vehicle-select" aria-label="Report source">
            <option value="rider" ${state.selectedReportSource === "rider" ? "selected" : ""}>Source: Rider</option>
            <option value="verified_visit" ${state.selectedReportSource === "verified_visit" ? "selected" : ""}>Source: Verified Visit</option>
          </select>
          <select id="reportVehicleInput" class="report-vehicle-select" aria-label="Vehicle type">
            <option value="" ${state.selectedReportVehicle === "" ? "selected" : ""}>Vehicle (optional)</option>
            <option value="2W" ${state.selectedReportVehicle === "2W" ? "selected" : ""}>2-Wheeler</option>
            <option value="4W" ${state.selectedReportVehicle === "4W" ? "selected" : ""}>4-Wheeler</option>
            <option value="Both" ${state.selectedReportVehicle === "Both" ? "selected" : ""}>Both</option>
          </select>
          <input id="reportCommentInput" class="report-comment-input" type="text" maxlength="300" placeholder="Optional note (e.g. Gun B free, CCS2 fast)" value="${escapeHtml(state.reportComment)}" />
          <button type="submit" class="btn-submit-report" ${state.submittingReport ? "disabled" : ""}>${state.submittingReport ? "Saving..." : "Submit Report"}</button>
        </form>
        ${feedbackHtml}
      </div>

      <div style="margin-top:1.25rem;">
        <h3 style="margin:0 0 0.5rem;font-size:0.875rem;font-weight:800;">Recent Rider Reports (${(st.recentReports || []).length})</h3>
        <div class="recent-reports-list">${recentHtml}</div>
      </div>

      <div style="margin-top:1.25rem;display:flex;flex-direction:column;gap:0.5rem;">
        <h3 style="margin:0 0 0.25rem;font-size:0.875rem;font-weight:800;">Connector Hardware</h3>
        ${connectorsHtml}
      </div>

      <a class="btn-modal-directions" href="${escapeHtml(st.mapsUri)}" target="_blank" rel="noopener noreferrer" data-maps-id="${escapeHtml(st.id)}">
        Open Directions in Google Maps
      </a>`;

    document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
    dom.stationModalSheet.querySelectorAll("[data-report-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedReportStatus = btn.getAttribute("data-report-status");
        state.reportFeedback = null;
        renderModal();
      });
    });

    const sourceInput = document.getElementById("reportSourceInput");
    const vehicleInput = document.getElementById("reportVehicleInput");
    const commentInput = document.getElementById("reportCommentInput");
    sourceInput.addEventListener("change", () => {
      state.selectedReportSource = sourceInput.value;
    });
    vehicleInput.addEventListener("change", () => {
      state.selectedReportVehicle = vehicleInput.value;
    });
    commentInput.addEventListener("input", () => {
      state.reportComment = commentInput.value;
    });

    document.getElementById("reportSubmitForm").addEventListener("submit", handleReportSubmit);
  }

  async function handleReportSubmit(e) {
    e.preventDefault();
    if (!state.selectedStationId || state.submittingReport) return;

    state.submittingReport = true;
    state.reportFeedback = null;
    renderModal();

    const body = {
      stationId: state.selectedStationId,
      status: state.selectedReportStatus,
      source: state.selectedReportSource,
      vehicleType: state.selectedReportVehicle,
      comment: state.reportComment.trim(),
    };
    if (state.userLocation) {
      body.lat = state.userLocation.lat;
      body.lng = state.userLocation.lng;
    }

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not save report");
      }

      state.stations = data.stations || state.stations;
      state.counts = data.counts || state.counts;
      state.reportComment = "";
      state.reportFeedback = {
        ok: true,
        message: `Saved "${body.status}" report. Live status is now ${data.station.status}.`,
      };
      recordTaskSuccess("submit_report", state.selectedStationId, `status=${body.status}`);
      renderAll();
    } catch (err) {
      const msg = err && err.message ? err.message : "Failed to save report";
      state.reportFeedback = { ok: false, message: msg };
      logEvent("error", "submit_report", {
        stationId: state.selectedStationId,
        success: false,
        details: msg,
      });
    } finally {
      state.submittingReport = false;
      renderModal();
    }
  }

  function openModal(stationId) {
    state.selectedStationId = stationId;
    state.highlightedStationId = stationId;
    state.reportFeedback = null;
    const st = state.stations.find((s) => s.id === stationId);
    logEvent("station_view", "view_station_details", {
      stationId,
      details: st ? `${st.name} (${st.area})` : "",
    });
    recordTaskSuccess("open_station_modal", stationId, "station_details_opened");
    renderModal();
  }

  function closeModal() {
    state.selectedStationId = null;
    state.reportFeedback = null;
    renderModal();
  }

  function renderAll() {
    const filtered = getFilteredStations();
    renderHeroAndTabs();
    renderStatCards();
    renderAreaPills();
    renderLocationBanners();
    renderRadarMap(filtered);
    renderStationCards(filtered);
    if (state.selectedStationId) {
      renderModal();
    }
  }

  function resetFilters() {
    state.vehicleFilter = "all";
    state.searchQuery = "";
    state.selectedArea = "All Areas";
    state.statusFilter = "all";
    state.chargerTypeFilter = "all";
    state.networkFilter = "all";
    dom.stationSearchInput.value = "";
    dom.statusFilterSelect.value = "all";
    dom.typeFilterSelect.value = "all";
    dom.networkFilterSelect.value = "all";
    logEvent("click", "reset_filters");
    renderAll();
  }

  function triggerNearMe() {
    logEvent("click", "near_me");
    if (!navigator.geolocation) {
      state.geoAlert = "Geolocation is not supported in this browser.";
      logEvent("error", "near_me_gps", { success: false, details: "geolocation_unsupported" });
      renderLocationBanners();
      return;
    }
    state.isLocating = true;
    state.geoAlert = null;
    renderLocationBanners();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.isLocating = false;
        state.userLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        recordTaskSuccess("near_me_gps", "", `lat=${state.userLocation.lat.toFixed(4)}`);
        fetchStations();
      },
      (err) => {
        state.isLocating = false;
        state.geoAlert = err.message || "Location access denied. Please allow browser location access.";
        logEvent("error", "near_me_gps", {
          success: false,
          details: state.geoAlert,
        });
        renderLocationBanners();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function bindEvents() {
    dom.headerNearMeBtn.addEventListener("click", triggerNearMe);
    dom.searchNearMeBtn.addEventListener("click", triggerNearMe);
    dom.mobileNearMeBtn.addEventListener("click", () => {
      dom.mobileMenu.classList.add("hidden");
      triggerNearMe();
    });

    dom.mobileMenuToggle.addEventListener("click", () => {
      dom.mobileMenu.classList.toggle("hidden");
    });

    dom.heroBtn4W.addEventListener("click", () => {
      state.vehicleFilter = state.vehicleFilter === "4W" ? "all" : "4W";
      logEvent("click", "hero_4w", { details: state.vehicleFilter });
      renderAll();
      document.getElementById("stations").scrollIntoView({ behavior: "smooth" });
    });

    dom.heroBtn2W.addEventListener("click", () => {
      state.vehicleFilter = state.vehicleFilter === "2W" ? "all" : "2W";
      logEvent("click", "hero_2w", { details: state.vehicleFilter });
      renderAll();
      document.getElementById("stations").scrollIntoView({ behavior: "smooth" });
    });

    dom.tabVehicleAll.addEventListener("click", () => {
      state.vehicleFilter = "all";
      logEvent("click", "vehicle_tab", { details: "all" });
      renderAll();
    });
    dom.tabVehicle4W.addEventListener("click", () => {
      state.vehicleFilter = "4W";
      logEvent("click", "vehicle_tab", { details: "4W" });
      renderAll();
    });
    dom.tabVehicle2W.addEventListener("click", () => {
      state.vehicleFilter = "2W";
      logEvent("click", "vehicle_tab", { details: "2W" });
      renderAll();
    });

    dom.toggleRadarBtn.addEventListener("click", () => {
      state.showRadar = !state.showRadar;
      logEvent("click", "radar_toggle", { details: String(state.showRadar) });
      renderAll();
    });
    dom.zoomInBtn.addEventListener("click", () => {
      state.mapZoom = Math.min(2.5, Number((state.mapZoom + 0.25).toFixed(2)));
      renderRadarMap(getFilteredStations());
    });
    dom.zoomOutBtn.addEventListener("click", () => {
      state.mapZoom = Math.max(0.75, Number((state.mapZoom - 0.25).toFixed(2)));
      renderRadarMap(getFilteredStations());
    });
    dom.zoomResetBtn.addEventListener("click", () => {
      state.mapZoom = 1;
      renderRadarMap(getFilteredStations());
    });

    let searchDebounceTimer = null;
    dom.stationSearchInput.addEventListener("input", () => {
      state.searchQuery = dom.stationSearchInput.value;
      renderAll();
      clearTimeout(searchDebounceTimer);
      const q = state.searchQuery.trim();
      if (q.length >= 2) {
        searchDebounceTimer = setTimeout(() => {
          const matchCount = getFilteredStations().length;
          logEvent("search", "search_stations", {
            details: `query="${q}"; matches=${matchCount}`,
          });
        }, 550);
      }
    });

    dom.statusFilterSelect.addEventListener("change", () => {
      state.statusFilter = dom.statusFilterSelect.value;
      logEvent("click", "status_filter", { details: state.statusFilter });
      renderAll();
    });
    dom.typeFilterSelect.addEventListener("change", () => {
      state.chargerTypeFilter = dom.typeFilterSelect.value;
      logEvent("click", "type_filter", { details: state.chargerTypeFilter });
      renderAll();
    });
    dom.networkFilterSelect.addEventListener("change", () => {
      state.networkFilter = dom.networkFilterSelect.value;
      logEvent("click", "network_filter", { details: state.networkFilter });
      renderAll();
    });

    dom.areaPillsRow.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-area]");
      if (!btn) return;
      state.selectedArea = btn.getAttribute("data-area");
      logEvent("click", "area_pill", { details: state.selectedArea });
      renderAll();
    });

    dom.radarPinsLayer.addEventListener("click", (e) => {
      const pin = e.target.closest("[data-pin-id]");
      if (!pin) return;
      const id = pin.getAttribute("data-pin-id");
      state.highlightedStationId = id;
      logEvent("click", "radar_pin", { stationId: id });
      renderAll();
      const card = document.getElementById(`card-${id}`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    dom.radarPinsLayer.addEventListener("mouseover", (e) => {
      const pin = e.target.closest("[data-pin-id]");
      if (!pin) return;
      const st = state.stations.find((s) => s.id === pin.getAttribute("data-pin-id"));
      if (!st) return;
      dom.radarHoverCard.classList.remove("hidden");
      dom.radarHoverCard.innerHTML = `<strong>${escapeHtml(st.name)}</strong> • ${escapeHtml(st.status)} • ${escapeHtml(st.chargerType)} (${escapeHtml(st.area)})`;
    });
    dom.radarPinsLayer.addEventListener("mouseout", () => {
      dom.radarHoverCard.classList.add("hidden");
    });

    dom.stationsGrid.addEventListener("click", (e) => {
      const favBtn = e.target.closest("[data-fav-id]");
      if (favBtn) {
        const id = favBtn.getAttribute("data-fav-id");
        if (state.favorites.includes(id)) {
          state.favorites = state.favorites.filter((x) => x !== id);
        } else {
          state.favorites = [...state.favorites, id];
        }
        saveFavorites();
        logEvent("click", "favorite", { stationId: id });
        renderStationCards(getFilteredStations());
        return;
      }

      const copyBtn = e.target.closest("[data-copy-id]");
      if (copyBtn) {
        const id = copyBtn.getAttribute("data-copy-id");
        const st = state.stations.find((s) => s.id === id);
        if (st && navigator.clipboard) {
          navigator.clipboard.writeText(`${st.location.lat}, ${st.location.lng}`).catch(() => {});
        }
        state.copiedId = id;
        logEvent("click", "copy_gps", { stationId: id });
        renderStationCards(getFilteredStations());
        setTimeout(() => {
          if (state.copiedId === id) {
            state.copiedId = null;
            renderStationCards(getFilteredStations());
          }
        }, 1800);
        return;
      }

      const mapsLink = e.target.closest("[data-maps-id]");
      if (mapsLink) {
        logEvent("click", "google_maps", { stationId: mapsLink.getAttribute("data-maps-id") });
        return;
      }

      const detailsBtn = e.target.closest("[data-details-id]");
      if (detailsBtn) {
        openModal(detailsBtn.getAttribute("data-details-id"));
      }
    });

    dom.stationModalBackdrop.addEventListener("click", (e) => {
      if (e.target === dom.stationModalBackdrop) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.selectedStationId) {
        closeModal();
      }
    });

    const exportLink = document.querySelector(".footer-export-link");
    if (exportLink) {
      exportLink.addEventListener("click", () => {
        logEvent("click", "export_csv");
      });
    }

    if (dom.refreshUsageBtn) {
      dom.refreshUsageBtn.addEventListener("click", () => {
        logEvent("click", "refresh_usage_telemetry");
        fetchUsageTelemetrySummary();
      });
    }

    window.addEventListener("beforeunload", () => {
      const elapsedMs = Math.round(performance.now() - taskStartMs);
      const sec = Number((elapsedMs / 1000).toFixed(1));
      const payload = JSON.stringify({
        sessionId: SESSION_ID,
        eventType: "task_complete",
        target: "session_duration",
        taskTimeMs: elapsedMs,
        seconds: sec,
        details: `session_duration=${sec}s`,
        success: true,
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
      }
    });

    window.addEventListener("error", (ev) => {
      logEvent("error", "window_error", {
        success: false,
        details: ev && ev.message ? ev.message : "Unhandled script error",
      });
    });

    window.addEventListener("unhandledrejection", (ev) => {
      logEvent("error", "unhandled_rejection", {
        success: false,
        details: ev && ev.reason ? String(ev.reason) : "Unhandled promise rejection",
      });
    });
  }

  bindEvents();
  logEvent("page_view", "app_init", { success: true });
  fetchStations();
  fetchUsageTelemetrySummary();
})();
