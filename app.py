"""
ChargeSpot — Ahmedabad EV Charging Station Finder (Flask + SQLite Backend)
Run with: python app.py
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
import jinja2
from flask import Flask, Response, jsonify, render_template, request, send_from_directory

from seed_db import DEFAULT_DB_PATH, get_connection, seed_database

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(
    __name__,
    template_folder=TEMPLATES_DIR,
    static_folder=None,
)

# Dual-loader: checks templates/ first, falls back to root directory
app.jinja_loader = jinja2.ChoiceLoader([
    jinja2.FileSystemLoader(TEMPLATES_DIR),
    jinja2.FileSystemLoader(BASE_DIR),
])

# Reference center: Thaltej / SG Highway, Ahmedabad
DEFAULT_CENTER = {"lat": 23.0570, "lng": 72.5220}

VALID_REPORT_STATUSES = {"Working", "Busy", "Broken"}
VALID_REPORT_SOURCES = {"rider", "verified_visit"}
VALID_VEHICLE_TYPES = {"", "2W", "4W", "Both"}
VALID_EVENT_TYPES = {
    "page_view",
    "click",
    "task_complete",
    "success",
    "error",
    "test_run",
    "search",
    "station_view",
    "filter",
    "navigation",
}
VALID_EVENT_METHODS = {"", "chargespot", "google_maps"}

# Ensure SQLite tables and initial station directory exist at startup (stations start Unreported)
seed_database(DEFAULT_DB_PATH, reset=False)


def haversine_km(a: dict, b: dict) -> float:
    """Compute straight-line distance in kilometers between two GPS coordinates."""
    radius_km = 6371.0
    d_lat = math.radians(b["lat"] - a["lat"])
    d_lng = math.radians(b["lng"] - a["lng"])
    x = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a["lat"]))
        * math.cos(math.radians(b["lat"]))
        * math.sin(d_lng / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def parse_iso_utc(ts: str) -> datetime:
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def derive_station_status(station_reports: list[dict]) -> tuple[str, str]:
    """
    Status Rule: converts recent rider reports (last 24 hours) into station card status.
    - If no reports exist in the last 24h -> 'Unreported'
    - If >= 3 reports were submitted in the last 1 hour -> majority of the latest 3 reports
      (ties broken in favor of the newest report)
    - Otherwise -> the most recent report status ('Working', 'Busy', or 'Broken')
    """
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_1h = now - timedelta(hours=1)

    recent_24h = [r for r in station_reports if parse_iso_utc(r["createdAt"]) >= cutoff_24h]
    if not recent_24h:
        return "Unreported", "No rider reports in the last 24 hours"

    last_hour = [r for r in recent_24h if parse_iso_utc(r["createdAt"]) >= cutoff_1h]
    if len(last_hour) >= 3:
        top_three = last_hour[:3]
        counts = Counter(r["status"] for r in top_three)
        max_votes = max(counts.values())
        # Preserve newest-first priority on ties
        for report in top_three:
            if counts[report["status"]] == max_votes:
                winner = report["status"]
                return winner, f"Consensus of last 3 reports ({counts[winner]}/3 within 1h)"

    latest = recent_24h[0]
    return latest["status"], f"Latest rider report: {latest['status']}"


def load_stations_from_db(lat: float | None = None, lng: float | None = None) -> list[dict]:
    """Query stations and recent reports from SQLite and return enriched, distance-sorted list."""
    ref = {"lat": lat, "lng": lng} if (lat is not None and lng is not None) else DEFAULT_CENTER
    conn = get_connection(DEFAULT_DB_PATH)
    try:
        station_rows = conn.execute("SELECT * FROM stations ORDER BY station_num ASC").fetchall()
        report_rows = conn.execute(
            """
            SELECT id, station_id, report_status, source, vehicle_type, comment, created_at
            FROM reports
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
    finally:
        conn.close()

    reports_by_station: dict[str, list[dict]] = {}
    for row in report_rows:
        reports_by_station.setdefault(row["station_id"], []).append(
            {
                "id": row["id"],
                "status": row["report_status"],
                "source": row["source"],
                "vehicleType": row["vehicle_type"],
                "comment": row["comment"],
                "createdAt": row["created_at"],
            }
        )

    stations = []
    for row in station_rows:
        loc = {"lat": row["lat"], "lng": row["lng"]}
        station_reports = reports_by_station.get(row["id"], [])
        derived_status, status_reason = derive_station_status(station_reports)
        latest_ts = station_reports[0]["createdAt"] if station_reports else row["created_at"]

        stations.append(
            {
                "id": row["id"],
                "name": row["name"],
                "operator": row["operator"],
                "area": row["area"],
                "address": row["address"],
                "plusCode": row["plus_code"],
                "location": loc,
                "vehicleType": row["vehicle_type"],
                "chargerType": row["charger_type"],
                "maxRate": row["max_rate"],
                "points": row["points"],
                "connectorTypes": json.loads(row["connector_types"]),
                "distance": round(haversine_km(ref, loc), 1),
                "status": derived_status,
                "statusReason": status_reason,
                "reportCount": len(station_reports),
                "recentReports": station_reports[:5],
                "lastUpdated": latest_ts,
                "network": row["operator"],
                "mapsUri": f"https://www.google.com/maps/dir/?api=1&destination={loc['lat']},{loc['lng']}",
                "tariff": {
                    "baseRate": row["base_tariff"],
                    "unit": "₹/kWh",
                },
                "reviewNotes": row["review_notes"],
            }
        )

    stations.sort(key=lambda s: s["distance"])
    return stations


def compute_counts(stations: list[dict]) -> dict:
    """Compute summary counts from current station statuses."""
    working = sum(1 for s in stations if s["status"] == "Working")
    busy = sum(1 for s in stations if s["status"] == "Busy")
    broken = sum(1 for s in stations if s["status"] == "Broken")
    unreported = sum(1 for s in stations if s["status"] == "Unreported")
    total_points = sum(s["points"] for s in stations)
    total_reports = sum(s["reportCount"] for s in stations)
    four_wheeler = sum(1 for s in stations if s["vehicleType"] in ("4W", "Both"))
    two_wheeler = sum(1 for s in stations if s["vehicleType"] in ("2W", "Both"))

    return {
        "working": working,
        "busy": busy,
        "broken": broken,
        "unreported": unreported,
        "totalPoints": total_points,
        "totalReports": total_reports,
        "all": len(stations),
        "fourWheeler": four_wheeler,
        "twoWheeler": two_wheeler,
    }


def _render_or_fallback(template_name: str, **context) -> Response | tuple[str, int, dict[str, str]] | str:
    """Render template using Jinja or fallback to direct file read and compile."""
    try:
        return render_template(template_name, **context)
    except Exception:
        pass
    for folder in (TEMPLATES_DIR, BASE_DIR):
        file_path = os.path.join(folder, template_name)
        if os.path.isfile(file_path):
            with open(file_path, "r", encoding="utf-8") as fh:
                template_str = fh.read()
                try:
                    rendered = jinja2.Template(template_str).render(**context)
                    return rendered, 200, {"Content-Type": "text/html; charset=utf-8"}
                except Exception:
                    return template_str, 200, {"Content-Type": "text/html; charset=utf-8"}
    return f"<h1>ChargeSpot is live! Template '{template_name}' loading...</h1>", 200, {"Content-Type": "text/html; charset=utf-8"}


@app.route("/")
def index():
    """Serve the main ChargeSpot single-page web application with pre-rendered station cards."""
    stations = load_stations_from_db()
    counts = compute_counts(stations)
    area_counts = {}
    for st in stations:
        area_counts[st["area"]] = area_counts.get(st["area"], 0) + 1
    sorted_areas = sorted(area_counts.keys())
    return _render_or_fallback(
        "index.html",
        stations=stations,
        counts=counts,
        area_counts=area_counts,
        sorted_areas=sorted_areas,
    )


@app.route("/test")
def test_mode_page():
    """Serve the Test Mode usability logging page."""
    stations = load_stations_from_db()
    return _render_or_fallback("test.html", stations=stations)


@app.route("/usage")
def usage_dashboard_page():
    """Serve the self-recorded usage data and analytics dashboard."""
    return _render_or_fallback("usage.html")


@app.route("/static/<path:filename>")
def serve_static(filename: str):
    """Serve static files from static/ or root directory as fallback."""
    for folder in (STATIC_DIR, BASE_DIR):
        path = os.path.join(folder, filename)
        if os.path.isfile(path):
            return send_from_directory(folder, filename)
    return "", 404


@app.route("/<string:filename>")
def serve_root_asset(filename: str):
    """Serve static assets requested at root level (e.g. /styles.css, /app.js, /favicon.svg)."""
    if filename.endswith((".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".ico", ".json", ".txt")):
        for folder in (STATIC_DIR, BASE_DIR):
            path = os.path.join(folder, filename)
            if os.path.isfile(path):
                return send_from_directory(folder, filename)
    return "", 404


@app.route("/api/usage/summary")
def api_usage_summary():
    """Return aggregated telemetry and self-recorded usage data from SQLite."""
    conn = get_connection(DEFAULT_DB_PATH)
    try:
        total_events = conn.execute("SELECT COUNT(*) FROM usage_events").fetchone()[0]
        total_sessions = conn.execute(
            "SELECT COUNT(DISTINCT session_id) FROM usage_events WHERE session_id != ''"
        ).fetchone()[0]
        total_clicks = conn.execute(
            "SELECT COUNT(*) FROM usage_events WHERE event_type = 'click'"
        ).fetchone()[0]
        total_searches = conn.execute(
            "SELECT COUNT(*) FROM usage_events WHERE event_type = 'search'"
        ).fetchone()[0]
        total_views = conn.execute(
            "SELECT COUNT(*) FROM usage_events WHERE event_type = 'station_view' OR target LIKE '%station%'"
        ).fetchone()[0]
        total_directions = conn.execute(
            "SELECT COUNT(*) FROM usage_events WHERE target = 'google_maps'"
        ).fetchone()[0]
        total_reports = conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0]

        type_rows = conn.execute(
            """
            SELECT event_type, COUNT(*) AS count
            FROM usage_events
            GROUP BY event_type
            ORDER BY count DESC
            """
        ).fetchall()
        events_by_type = {r["event_type"]: r["count"] for r in type_rows}

        target_rows = conn.execute(
            """
            SELECT target, COUNT(*) AS count
            FROM usage_events
            WHERE target != ''
            GROUP BY target
            ORDER BY count DESC
            LIMIT 8
            """
        ).fetchall()
        top_targets = [{"target": r["target"], "count": r["count"]} for r in target_rows]

        recent_rows = conn.execute(
            """
            SELECT id, session_id, participant_code, method, task, event_type, target, station_id,
                   task_time_ms, seconds, clicks, errors, success, details, created_at
            FROM usage_events
            ORDER BY created_at DESC, id DESC
            LIMIT 25
            """
        ).fetchall()

        recent_events = [
            {
                "id": r["id"],
                "sessionId": r["session_id"],
                "participantCode": r["participant_code"],
                "method": r["method"],
                "task": r["task"],
                "eventType": r["event_type"],
                "target": r["target"],
                "stationId": r["station_id"],
                "taskTimeMs": r["task_time_ms"],
                "seconds": r["seconds"],
                "clicks": r["clicks"],
                "errors": r["errors"],
                "success": bool(r["success"]),
                "details": r["details"],
                "createdAt": r["created_at"],
            }
            for r in recent_rows
        ]
    finally:
        conn.close()

    return jsonify(
        {
            "totalEvents": total_events,
            "totalSessions": total_sessions,
            "totalClicks": total_clicks,
            "totalSearches": total_searches,
            "totalStationViews": total_views,
            "totalDirections": total_directions,
            "totalReports": total_reports,
            "eventsByType": events_by_type,
            "topTargets": top_targets,
            "recentEvents": recent_events,
        }
    )


@app.route("/api/stations")
def api_stations():
    """Return all stations with SQLite-backed rider status, optionally sorted by GPS."""
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    stations = load_stations_from_db(lat, lng)
    return jsonify({"stations": stations, "counts": compute_counts(stations)})


@app.route("/api/reports", methods=["POST"])
def api_create_report():
    """Validate and save a rider's Working, Busy, or Broken report into SQLite."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid JSON request body."}), 400

    station_id = str(body.get("stationId") or "").strip()
    report_status = str(body.get("status") or "").strip()
    source = str(body.get("source") or "rider").strip()
    vehicle_type = str(body.get("vehicleType") or "").strip()
    comment = body.get("comment", "")

    if not station_id:
        return jsonify({"error": "stationId is required."}), 400
    if report_status not in VALID_REPORT_STATUSES:
        return jsonify({"error": "status must be one of: Working, Busy, Broken."}), 400
    if source not in VALID_REPORT_SOURCES:
        return jsonify({"error": "source must be one of: rider, verified_visit."}), 400
    if vehicle_type not in VALID_VEHICLE_TYPES:
        return jsonify({"error": "vehicleType must be 2W, 4W, Both, or empty."}), 400
    if not isinstance(comment, str):
        return jsonify({"error": "comment must be a string."}), 400
    comment = comment.strip()
    if len(comment) > 300:
        return jsonify({"error": "comment must be 300 characters or fewer."}), 400

    lat = body.get("lat")
    lng = body.get("lng")
    now_iso = datetime.now(timezone.utc).isoformat()

    conn = get_connection(DEFAULT_DB_PATH)
    try:
        exists = conn.execute(
            "SELECT id FROM stations WHERE id = ?", (station_id,)
        ).fetchone()
        if not exists:
            return jsonify({"error": f"Unknown stationId: {station_id}"}), 404

        cur = conn.execute(
            """
            INSERT INTO reports (station_id, report_status, source, vehicle_type, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (station_id, report_status, source, vehicle_type, comment, now_iso),
        )
        conn.commit()
        report_id = cur.lastrowid
    finally:
        conn.close()

    stations = load_stations_from_db(
        float(lat) if lat is not None else None,
        float(lng) if lng is not None else None,
    )
    updated_station = next((s for s in stations if s["id"] == station_id), None)

    return (
        jsonify(
            {
                "report": {
                    "id": report_id,
                    "stationId": station_id,
                    "status": report_status,
                    "source": source,
                    "vehicleType": vehicle_type,
                    "comment": comment,
                    "createdAt": now_iso,
                },
                "station": updated_station,
                "stations": stations,
                "counts": compute_counts(stations),
            }
        ),
        201,
    )


@app.route("/api/events", methods=["GET", "POST"])
def api_events():
    """List recent logged events (GET) or store task timing, clicks, errors, and success (POST)."""
    if request.method == "GET":
        limit = min(max(request.args.get("limit", default=25, type=int), 1), 200)
        event_type_filter = (request.args.get("type") or "").strip()
        conn = get_connection(DEFAULT_DB_PATH)
        try:
            if event_type_filter:
                rows = conn.execute(
                    """
                    SELECT * FROM usage_events
                    WHERE event_type = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (event_type_filter, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM usage_events
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
        finally:
            conn.close()

        return jsonify(
            {
                "events": [
                    {
                        "id": r["id"],
                        "sessionId": r["session_id"],
                        "participantCode": r["participant_code"],
                        "method": r["method"],
                        "task": r["task"],
                        "eventType": r["event_type"],
                        "target": r["target"],
                        "stationId": r["station_id"],
                        "taskTimeMs": r["task_time_ms"],
                        "seconds": r["seconds"],
                        "clicks": r["clicks"],
                        "errors": r["errors"],
                        "success": bool(r["success"]),
                        "details": r["details"],
                        "createdAt": r["created_at"],
                    }
                    for r in rows
                ]
            }
        )

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid JSON request body."}), 400

    session_id = str(body.get("sessionId") or "").strip()[:64]
    participant_code = str(body.get("participantCode") or "").strip()[:64]
    method = str(body.get("method") if body.get("method") is not None else "chargespot").strip()
    task = str(body.get("task") or "").strip()[:300]
    event_type = str(body.get("eventType") or "").strip()
    target = str(body.get("target") or "").strip()[:100]
    station_id = str(body.get("stationId") or "").strip()[:64]
    details = str(body.get("details") or "").strip()[:500]
    success = 1 if body.get("success", True) else 0

    if not session_id:
        return jsonify({"error": "sessionId is required."}), 400
    if event_type not in VALID_EVENT_TYPES:
        return jsonify(
            {"error": f"eventType must be one of: {', '.join(sorted(VALID_EVENT_TYPES))}."}
        ), 400
    if method not in VALID_EVENT_METHODS:
        return jsonify({"error": "method must be chargespot, google_maps, or empty."}), 400

    task_time_ms = body.get("taskTimeMs")
    seconds = body.get("seconds")

    if task_time_ms is not None:
        if isinstance(task_time_ms, bool) or not isinstance(task_time_ms, (int, float)) or task_time_ms < 0:
            return jsonify({"error": "taskTimeMs must be a non-negative number."}), 400
        task_time_ms = int(round(task_time_ms))

    if seconds is not None and seconds != "":
        if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or seconds < 0:
            return jsonify({"error": "seconds must be a non-negative number."}), 400
        seconds = round(float(seconds), 2)
    else:
        seconds = None

    if seconds is not None and task_time_ms is None:
        task_time_ms = int(round(seconds * 1000))
    elif task_time_ms is not None and seconds is None:
        seconds = round(task_time_ms / 1000.0, 2)

    clicks = body.get("clicks", 0)
    if isinstance(clicks, bool) or not isinstance(clicks, int) or clicks < 0:
        return jsonify({"error": "clicks must be a non-negative integer."}), 400

    errors = body.get("errors", 0)
    if isinstance(errors, bool) or not isinstance(errors, int) or errors < 0:
        return jsonify({"error": "errors must be a non-negative integer."}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    conn = get_connection(DEFAULT_DB_PATH)
    try:
        cur = conn.execute(
            """
            INSERT INTO usage_events (
                session_id, participant_code, method, task, event_type, target,
                station_id, task_time_ms, seconds, clicks, errors, success, details, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                participant_code,
                method,
                task,
                event_type,
                target,
                station_id,
                task_time_ms,
                seconds,
                clicks,
                errors,
                success,
                details,
                now_iso,
            ),
        )
        conn.commit()
        event_id = cur.lastrowid
    finally:
        conn.close()

    return jsonify(
        {
            "ok": True,
            "id": event_id,
            "seconds": seconds,
            "createdAt": now_iso,
        }
    ), 201


@app.route("/export.csv")
def export_csv():
    """
    Export rider reports and usage events (or a specific table via ?table=...) as CSV for analysis.
    """
    table = (request.args.get("table") or "all").strip().lower()
    output = io.StringIO()
    writer = csv.writer(output)
    conn = get_connection(DEFAULT_DB_PATH)

    try:
        if table == "stations":
            writer.writerow(
                [
                    "id",
                    "name",
                    "operator",
                    "area",
                    "address",
                    "lat",
                    "lng",
                    "vehicle_type",
                    "charger_type",
                    "max_rate_kw",
                    "points",
                    "base_tariff",
                ]
            )
            rows = conn.execute("SELECT * FROM stations ORDER BY station_num ASC").fetchall()
            for r in rows:
                writer.writerow(
                    [
                        r["id"],
                        r["name"],
                        r["operator"],
                        r["area"],
                        r["address"],
                        r["lat"],
                        r["lng"],
                        r["vehicle_type"],
                        r["charger_type"],
                        r["max_rate"],
                        r["points"],
                        r["base_tariff"],
                    ]
                )
            filename = "chargespot_stations.csv"

        elif table == "reports":
            writer.writerow(
                [
                    "id",
                    "created_at",
                    "station_id",
                    "station_name",
                    "area",
                    "report_status",
                    "source",
                    "vehicle_type",
                    "comment",
                ]
            )
            rows = conn.execute(
                """
                SELECT r.id, r.created_at, r.station_id, s.name AS station_name, s.area,
                       r.report_status, r.source, r.vehicle_type, r.comment
                FROM reports r
                LEFT JOIN stations s ON s.id = r.station_id
                ORDER BY r.created_at DESC, r.id DESC
                """
            ).fetchall()
            for r in rows:
                writer.writerow(
                    [
                        r["id"],
                        r["created_at"],
                        r["station_id"],
                        r["station_name"] or "",
                        r["area"] or "",
                        r["report_status"],
                        r["source"],
                        r["vehicle_type"],
                        r["comment"],
                    ]
                )
            filename = "chargespot_reports.csv"

        elif table == "usage_events":
            writer.writerow(
                [
                    "id",
                    "created_at",
                    "session_id",
                    "participant_code",
                    "method",
                    "task",
                    "event_type",
                    "target",
                    "station_id",
                    "station_name",
                    "task_time_ms",
                    "seconds",
                    "clicks",
                    "errors",
                    "success",
                    "details",
                ]
            )
            rows = conn.execute(
                """
                SELECT u.id, u.created_at, u.session_id, u.participant_code, u.method, u.task,
                       u.event_type, u.target, u.station_id, s.name AS station_name,
                       u.task_time_ms, u.seconds, u.clicks, u.errors, u.success, u.details
                FROM usage_events u
                LEFT JOIN stations s ON s.id = u.station_id
                ORDER BY u.created_at DESC, u.id DESC
                """
            ).fetchall()
            for r in rows:
                writer.writerow(
                    [
                        r["id"],
                        r["created_at"],
                        r["session_id"],
                        r["participant_code"],
                        r["method"],
                        r["task"],
                        r["event_type"],
                        r["target"],
                        r["station_id"],
                        r["station_name"] or "",
                        r["task_time_ms"] if r["task_time_ms"] is not None else "",
                        r["seconds"] if r["seconds"] is not None else "",
                        r["clicks"],
                        r["errors"],
                        r["success"],
                        r["details"],
                    ]
                )
            filename = "chargespot_usage_events.csv"

        else:
            # Combined analysis view: all reports + usage_events with station metadata
            writer.writerow(
                [
                    "record_type",
                    "id",
                    "created_at",
                    "session_id",
                    "participant_code",
                    "method",
                    "task",
                    "station_id",
                    "station_name",
                    "station_area",
                    "status_or_event",
                    "source",
                    "target",
                    "vehicle_type",
                    "task_time_ms",
                    "seconds",
                    "clicks",
                    "errors",
                    "success",
                    "details",
                ]
            )
            rows = conn.execute(
                """
                SELECT * FROM (
                    SELECT 'report' AS record_type, r.id AS id, r.created_at AS created_at, '' AS session_id,
                           '' AS participant_code, '' AS method, '' AS task,
                           r.station_id, s.name AS station_name, s.area AS station_area,
                           r.report_status AS status_or_event, r.source AS source, 'rider_report' AS target,
                           r.vehicle_type, NULL AS task_time_ms, NULL AS seconds,
                           0 AS clicks, 0 AS errors, 1 AS success, r.comment AS details
                    FROM reports r
                    LEFT JOIN stations s ON s.id = r.station_id
                    UNION ALL
                    SELECT 'usage_event' AS record_type, u.id AS id, u.created_at AS created_at, u.session_id,
                           u.participant_code, u.method, u.task,
                           u.station_id, s.name AS station_name, s.area AS station_area,
                           u.event_type AS status_or_event, '' AS source, u.target,
                           '' AS vehicle_type, u.task_time_ms, u.seconds,
                           u.clicks, u.errors, u.success, u.details
                    FROM usage_events u
                    LEFT JOIN stations s ON s.id = u.station_id
                )
                ORDER BY created_at DESC, id DESC
                """
            ).fetchall()
            for r in rows:
                writer.writerow(
                    [
                        r["record_type"],
                        r["id"],
                        r["created_at"],
                        r["session_id"],
                        r["participant_code"],
                        r["method"],
                        r["task"],
                        r["station_id"],
                        r["station_name"] or "",
                        r["station_area"] or "",
                        r["status_or_event"],
                        r["source"],
                        r["target"],
                        r["vehicle_type"],
                        r["task_time_ms"] if r["task_time_ms"] is not None else "",
                        r["seconds"] if r["seconds"] is not None else "",
                        r["clicks"],
                        r["errors"],
                        r["success"],
                        r["details"],
                    ]
                )
            filename = "chargespot_export.csv"
    finally:
        conn.close()

    return Response(
        output.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0").strip().lower() in ("1", "true")
    print(f"ChargeSpot Flask server running at http://localhost:{port}/ (debug={debug})")
    app.run(host="0.0.0.0", port=port, debug=debug)
