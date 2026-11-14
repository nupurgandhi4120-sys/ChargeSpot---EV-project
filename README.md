# ChargeSpot Ahmedabad — Community EV Station Status

Plain HTML/CSS/JavaScript frontend served by a Python **Flask** + **SQLite** backend (`app.py`). Riders can locate nearby 2-wheeler and 4-wheeler EV charging stations across Ahmedabad, check community-verified **Working / Busy / Broken / Unreported** status, submit new rider or verified-visit reports, run usability comparisons on **Test Mode** (`/test`), and export analysis data as CSV.

## Project Structure

- `app.py` — Flask application serving `/`, `/test`, JSON APIs (`/api/stations`, `/api/reports`, `/api/events`), and `/export.csv`.
- `seed_db.py` — Creates SQLite tables (`stations`, `reports`, `usage_events`) in `chargespot.db` and seeds the 24 Ahmedabad stations only (every station starts as `Unreported` with zero seeded reports).
- `templates/index.html` — Main single-page EV station finder with live self-recorded usage data section.
- `templates/usage.html` — Dedicated Usage Data & Autonomous Telemetry Dashboard.
- `templates/test.html` — Usability Test Mode page (consent checkbox, participant code, task description, timed `chargespot` runner, and manual `google_maps` entry).
- `static/styles.css` — Styling (responsive layout, 2W/4W vehicle filters, radar map, station cards, modal report UI).
- `static/app.js` — Client logic (station filtering, Haversine "Near Me" GPS sorting, interactive radar map, status report submission, and usage event logging).
- `static/test.js` — Client logic for `/test` (start/stop timer, click/error sync, manual Google Maps entry, recent runs log).
- `requirements.txt` — Python dependencies (`Flask>=3.0.0`).

## Quick Start

1. Install Flask:

   ```bash
   pip install -r requirements.txt
   ```

2. (Optional) Reset and re-seed `stations` in the SQLite database (`app.py` also initializes `chargespot.db` automatically on startup without adding fake reports):

   ```bash
   python seed_db.py --reset
   ```

3. Run the Flask server:

   ```bash
   python app.py
   ```

   - Main app: `http://127.0.0.1:5000`
   - Usage Analytics: `http://127.0.0.1:5000/usage`
   - Test mode: `http://127.0.0.1:5000/test`

## Deploy to Render (render.com)

This repository includes `render.yaml`, `Procfile`, and `gunicorn` for 1-click cloud deployment on [Render](https://render.com).

### Option A: Automatic Blueprint (Recommended)
1. Push this repository to GitHub.
2. In Render Dashboard, click **New +** &rarr; **Blueprint**.
3. Select your repository. Render will automatically detect `render.yaml` and configure the web service.
4. Click **Apply**.

### Option B: Manual Web Service
1. In Render Dashboard, click **New +** &rarr; **Web Service**.
2. Connect your GitHub repository.
3. Configure the settings:
   - **Language / Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt && python seed_db.py`
   - **Start Command**: `gunicorn app:app`
   - **Plan**: `Free`
4. Click **Deploy Web Service**. Render will build and deploy your live app URL (e.g. `https://chargespot.onrender.com`).

## SQLite Schema (`chargespot.db`)

- `stations`: Seeded directory of 24 Ahmedabad EV charging hubs (`id`, `station_num`, `name`, `operator`, `area`, `address`, `plus_code`, `lat`, `lng`, `vehicle_type`, `charger_type`, `max_rate`, `points`, `connector_types`, `base_tariff`, `review_signal`, `review_notes`, `created_at`).
- `reports`: Status reports (`id`, `station_id`, `report_status` in `'Working' | 'Busy' | 'Broken'`, `source` in `'rider' | 'verified_visit'`, `vehicle_type`, `comment`, `created_at`).
- `usage_events`: Interaction and usability test logs (`id`, `session_id`, `participant_code`, `method` in `'chargespot' | 'google_maps' | ''`, `task`, `event_type`, `target`, `station_id`, `task_time_ms`, `seconds`, `clicks`, `errors`, `success`, `details`, `created_at`).

## Status Derivation Rule (`derive_station_status`)

Each station's displayed status is computed dynamically from `reports` created within the last 24 hours:

1. **No reports in the last 24 hours**: `"Unreported"` (all 24 stations start here until reports are submitted).
2. **3 or more reports in the last 1 hour**: Majority vote among the 3 newest reports in that 1-hour window (ties break in favor of the newest report).
3. **Otherwise**: Most recent report within the last 24 hours (`"Working"`, `"Busy"`, or `"Broken"`).

## API Endpoints & Pages

- `GET /` — Main EV station finder with live self-recorded usage data section and real-time telemetry feed.
- `GET /usage` — Dedicated Usage Data & Autonomous Telemetry Dashboard.
- `GET /test` — Usability Test Mode runner (`consent`, `participant_code`, `task`, `chargespot` start/stop timer logging `seconds`, `clicks`, `errors`, `success`, plus manual `seconds` & `success` entry for `google_maps`).
- `GET /api/usage/summary` — Returns aggregated self-recorded usage metrics (total events, sessions, searches, views, directions, reports, and recent events).
- `GET /api/stations?lat=<lat>&lng=<lng>` — Returns `{ stations, counts }` with derived status, recent reports (including `source`), and optional Haversine distance sorting.
- `POST /api/reports` — Validates `{ stationId, status, source?, vehicleType?, comment?, lat?, lng? }` (`source`: `'rider'` default or `'verified_visit'`) and returns HTTP `201`.
- `GET /api/events` & `POST /api/events` — Logs or lists `usage_events` including `participantCode`, `method`, `task`, `seconds`, `taskTimeMs`, `clicks`, `errors`, and `success`.
- `GET /export.csv?table=all|reports|usage_events|stations` — Downloads CSV with `source` on reports and `participant_code`, `method`, `task`, `seconds`, `clicks`, `errors`, `success` on usage events.
