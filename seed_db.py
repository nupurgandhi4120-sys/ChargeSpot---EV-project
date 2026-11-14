"""
SQLite Database Schema & Seeder for ChargeSpot
Creates `stations`, `reports`, and `usage_events` tables in chargespot.db.

Run directly:
    python seed_db.py           # creates tables and seeds if empty
    python seed_db.py --reset   # drops & recreates tables with fresh seed data
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.environ.get("DATABASE_PATH") or os.path.join(BASE_DIR, "chargespot.db")
_db_dir = os.path.dirname(DEFAULT_DB_PATH)
if _db_dir:
    os.makedirs(_db_dir, exist_ok=True)

STATION_DIRECTORY = [
    {
        "id": 1,
        "name": "GLIDA Charging Station",
        "operator": "GLIDA",
        "area": "Thaltej",
        "address": "3G5C+4FC, Sarkhej - Gandhinagar Hwy, Thaltej, Ahmedabad, Gujarat 380054",
        "plusCode": "3G5C+4FC",
        "location": {"lat": 23.057806, "lng": 72.521139},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 60,
        "points": 2,
        "connectorTypes": ["CCS2", "Type 2 AC"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Located on SG Highway near Thaltej junction. High-speed 60kW DC fast charging with drive-in car bays.",
    },
    {
        "id": 2,
        "name": "Bolt.Earth Charging Station",
        "operator": "Bolt.Earth",
        "area": "Memnagar",
        "address": "17, Maple Trade Ctr Rd, Memnagar, Ahmedabad, Gujarat 380052",
        "plusCode": "3G4H+7X",
        "location": {"lat": 23.055705, "lng": 72.528150},
        "vehicleType": "Both",
        "chargerType": "AC/DC",
        "maxRate": 50,
        "points": 3,
        "connectorTypes": ["CCS2", "Type 2 AC", "15A 3-Pin (2W Socket)"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Dual compatibility: Car DC charging plus dedicated 2-wheeler smart plugs for all electric scooters and bikes.",
    },
    {
        "id": 3,
        "name": "Torrent Power, Saurabh Society",
        "operator": "Torrent Power",
        "area": "Naranpura",
        "address": "3HM6+82R, Saurabh Society, AEC Char Rasta, Naranpura, Ahmedabad, Gujarat 380013",
        "plusCode": "3HM6+82R",
        "location": {"lat": 23.053215, "lng": 72.551820},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 60,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Both car guns reported working. Reliable Torrent grid feeder with stable power.",
    },
    {
        "id": 4,
        "name": "MobiLane, Usmanpura",
        "operator": "MobiLane",
        "area": "Usmanpura",
        "address": "2HP9+5M, Ashram Rd, Opposite Usmanpura Municipal Garden, Usmanpura, Ahmedabad, Gujarat 380013",
        "plusCode": "2HP9+5M",
        "location": {"lat": 23.045618, "lng": 72.568412},
        "vehicleType": "Both",
        "chargerType": "DC",
        "maxRate": 80,
        "points": 3,
        "connectorTypes": ["CCS2 (Car)", "Type 2 AC", "15A Socket (2W/3W)"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "80kW dual CCS fast charger for 4-wheelers, plus dedicated plug bay for 2 and 3 wheelers.",
    },
    {
        "id": 5,
        "name": "MobiLane, Prahlad Nagar (AMC parking)",
        "operator": "MobiLane",
        "area": "Prahlad Nagar",
        "address": "2G9F+3VJ, Prahaladnagar Trade Center, 100 Feet Rd, Prahlad Nagar, Ahmedabad, Gujarat 380015",
        "plusCode": "2G9F+3VJ",
        "location": {"lat": 23.013524, "lng": 72.508719},
        "vehicleType": "Both",
        "chargerType": "DC",
        "maxRate": 60,
        "points": 3,
        "connectorTypes": ["CCS2 (Car)", "Bharat AC-001 (2W)"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Inside multi-level AMC municipal parking. Ground floor dedicated 2W scooter plugs and 4W car fast chargers.",
    },
    {
        "id": 6,
        "name": "Tata Power, Ellisbridge",
        "operator": "Tata Power",
        "area": "Ellisbridge",
        "address": "2HV9+7C, Ellisbridge Gymkhana Rd, Ellisbridge, Ahmedabad, Gujarat 380006",
        "plusCode": "2HV9+7C",
        "location": {"lat": 23.023412, "lng": 72.571430},
        "vehicleType": "4W",
        "chargerType": "AC/DC",
        "maxRate": 60,
        "points": 2,
        "connectorTypes": ["CCS2", "Type 2 AC"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Basement car parking bay with Tata Power EZ Charge app integration. 24x7 security.",
    },
    {
        "id": 7,
        "name": "Statiq, ITC Narmada (near IIM)",
        "operator": "Statiq",
        "area": "Near IIM",
        "address": "2HMJ+8W, Judges Bungalow Rd, Near IIM Ahmedabad, Vastrapur, Ahmedabad, Gujarat 380015",
        "plusCode": "2HMJ+8W",
        "location": {"lat": 23.032145, "lng": 72.532681},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 120,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Ultra-fast 120kW dual gun dispenser at ITC Narmada valet entrance. Lounge access for car drivers.",
    },
    {
        "id": 8,
        "name": "Ather Grid, Ratnam Royal",
        "operator": "Ather",
        "area": "Chandkheda",
        "address": "4HM7+4V, New CG Road, Chandkheda, Ahmedabad, Gujarat 382424",
        "plusCode": "4HM7+4V",
        "location": {"lat": 23.107510, "lng": 72.585230},
        "vehicleType": "2W",
        "chargerType": "DC",
        "maxRate": 15,
        "points": 2,
        "connectorTypes": ["Ather Grid Connector", "15A 3-Pin Socket"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Dedicated 2-Wheeler Ather Grid Fast Point. Charges Ather 450X up to 1.5 km/min.",
    },
    {
        "id": 9,
        "name": "Ather Grid, Prahlad Nagar",
        "operator": "Ather",
        "area": "Prahlad Nagar",
        "address": "2G8F+7R, Anand Nagar Rd, Near Sachin Tower, Prahlad Nagar, Ahmedabad, Gujarat 380015",
        "plusCode": "2G8F+7R",
        "location": {"lat": 23.012840, "lng": 72.511890},
        "vehicleType": "2W",
        "chargerType": "DC",
        "maxRate": 15,
        "points": 2,
        "connectorTypes": ["Ather Grid Fast DC", "Type 6 LEV-DC"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Top-rated 2-wheeler charging hub in Prahlad Nagar. Quick cafes nearby while scooter charges.",
    },
    {
        "id": 10,
        "name": "Ola Hypercharger, SG Highway",
        "operator": "Ola Electric",
        "area": "Bodakdev",
        "address": "3G37+5J, SG Highway, Near Iscon Cross Road, Bodakdev, Ahmedabad, Gujarat 380054",
        "plusCode": "3G37+5J",
        "location": {"lat": 23.038920, "lng": 72.512340},
        "vehicleType": "2W",
        "chargerType": "DC",
        "maxRate": 18,
        "points": 4,
        "connectorTypes": ["Ola Proprietary DC", "Type 6 LEV"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "High-speed 2-wheeler Hypercharger for Ola S1 Pro / Air / X. 0-50% in 15 minutes.",
    },
    {
        "id": 11,
        "name": "Kazam EV 2W Station, Siddheshwar Park",
        "operator": "Kazam",
        "area": "Prahlad Nagar",
        "address": "2G7H+3P, Anand Nagar Rd, Siddheshwar Park, Prahlad Nagar, Ahmedabad, Gujarat 380015",
        "plusCode": "2G7H+3P",
        "location": {"lat": 23.014520, "lng": 72.513410},
        "vehicleType": "2W",
        "chargerType": "AC",
        "maxRate": 3.3,
        "points": 2,
        "connectorTypes": ["15A Industrial 3-Pin", "Type 6 (LEV)"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Universal 2-wheeler charging post compatible with TVS iQube, Bajaj Chetak, Hero Vida, Ola and Ather.",
    },
    {
        "id": 12,
        "name": "Jio-bp pulse, 100 Feet Rd",
        "operator": "Jio-bp pulse",
        "area": "Prahlad Nagar",
        "address": "2G8H+6Q, 100 Feet Anand Nagar Rd, Prahlad Nagar, Ahmedabad, Gujarat 380015",
        "plusCode": "2G8H+6Q",
        "location": {"lat": 23.011240, "lng": 72.512450},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 120,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Rated 4.5 for passenger cars. Fast charging with Jio-bp Pulse app and cafe on-site.",
    },
    {
        "id": 13,
        "name": "Mercedes-Benz, Ellisbridge",
        "operator": "Mercedes-Benz",
        "area": "Ellisbridge",
        "address": "2HV8+3M, Ashram Rd, Ellisbridge, Ahmedabad, Gujarat 380006",
        "plusCode": "2HV8+3M",
        "location": {"lat": 23.021540, "lng": 72.569810},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 150,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "High-output 150kW DC fast charger for electric cars. Compatible with all CCS2 passenger EVs.",
    },
    {
        "id": 14,
        "name": "ChargeZone x TATA.ev MegaCharger",
        "operator": "ChargeZone",
        "area": "Bodakdev",
        "address": "3G38+9M, Sindhu Bhavan Marg, Bodakdev, Ahmedabad, Gujarat 380054",
        "plusCode": "3G38+9M",
        "location": {"lat": 23.041630, "lng": 72.515820},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 120,
        "points": 4,
        "connectorTypes": ["CCS2", "GB/T"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Major 4-wheeler charging hub on Sindhu Bhavan Road with 4 high-speed bays.",
    },
    {
        "id": 15,
        "name": "Bolt.Earth 2-Wheeler Hub, Satellite",
        "operator": "Bolt.Earth",
        "area": "Satellite",
        "address": "2H65+8M, Shivranjani Cross Roads, Satellite, Ahmedabad, Gujarat 380015",
        "plusCode": "2H65+8M",
        "location": {"lat": 23.026710, "lng": 72.524150},
        "vehicleType": "2W",
        "chargerType": "AC",
        "maxRate": 7.4,
        "points": 4,
        "connectorTypes": ["15A Smart Socket", "Type 6 LEV-DC"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Dedicated 2W parking zone at Shivranjani. Supports all electric scooters and motorcycles.",
    },
    {
        "id": 16,
        "name": "MobiLane, Kankaria (AMC parking)",
        "operator": "MobiLane",
        "area": "Kankaria",
        "address": "XJXC+6W, Gate 3, Kankaria Lake Front, Kankaria, Ahmedabad, Gujarat 380028",
        "plusCode": "XJXC+6W",
        "location": {"lat": 22.998410, "lng": 72.602140},
        "vehicleType": "Both",
        "chargerType": "DC",
        "maxRate": 80,
        "points": 3,
        "connectorTypes": ["CCS2 (Car)", "15A Socket (2W)"],
        "reviewSignal": "Mixed",
        "reviewNotes": "Convenient for lake visitors. Has both car fast charger and separate electric scooter charging ports.",
    },
    {
        "id": 17,
        "name": "TVS Smart EV Charging Hub, Vastrapur",
        "operator": "TVS Motor",
        "area": "Vastrapur",
        "address": "2HM5+7K, Vastrapur Lake Rd, Near AlphaOne Mall, Vastrapur, Ahmedabad, Gujarat 380015",
        "plusCode": "2HM5+7K",
        "location": {"lat": 23.035410, "lng": 72.527620},
        "vehicleType": "2W",
        "chargerType": "AC",
        "maxRate": 3.3,
        "points": 3,
        "connectorTypes": ["TVS Smart Socket", "15A 3-Pin"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Optimized for TVS iQube, Ather, Chetak and other 2-wheelers. Shaded parking near mall.",
    },
    {
        "id": 18,
        "name": "Mercedes-Benz, Thaltej underbridge",
        "operator": "Mercedes-Benz",
        "area": "Thaltej",
        "address": "3G46+7X, SG Highway, Thaltej Underbridge, Thaltej, Ahmedabad, Gujarat 380054",
        "plusCode": "3G46+7X",
        "location": {"lat": 23.058820, "lng": 72.503940},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 150,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Mixed",
        "reviewNotes": "150kW fast charger for cars just off SG Highway. Output may vary between 60kW to 150kW.",
    },
    {
        "id": 19,
        "name": "Shell Recharge, Patan Highway",
        "operator": "Shell Recharge",
        "area": "Chandkheda",
        "address": "4HR3+8G, Ahmedabad-Patan Highway, Chandkheda, Ahmedabad, Gujarat 382424",
        "plusCode": "4HR3+8G",
        "location": {"lat": 23.112450, "lng": 72.589120},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 60,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Mixed",
        "reviewNotes": "Shell petrol station forecourt for 4-wheelers. Snack shop and cafe available during charge.",
    },
    {
        "id": 20,
        "name": "ChargeZone, Tapovan Circle",
        "operator": "ChargeZone",
        "area": "Chandkheda",
        "address": "4HP5+9J, SP Ring Road, Tapovan Circle, Chandkheda, Ahmedabad, Gujarat 382424",
        "plusCode": "4HP5+9J",
        "location": {"lat": 23.118920, "lng": 72.581230},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 60,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Mixed",
        "reviewNotes": "Convenient 4-wheeler stop on SP Ring Road intersection. Multiple food options nearby.",
    },
    {
        "id": 21,
        "name": "Tata Power, Gota Gam Rd",
        "operator": "Tata Power",
        "area": "Gota",
        "address": "4G2F+7W, Gota Gam Rd, Gota, Ahmedabad, Gujarat 382481",
        "plusCode": "4G2F+7W",
        "location": {"lat": 23.094520, "lng": 72.529810},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 60,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Mixed",
        "reviewNotes": "Convenient for Gota and Chandlodiya car drivers. App reservation recommended.",
    },
    {
        "id": 22,
        "name": "HP e-Charge, Narol",
        "operator": "HP",
        "area": "Narol",
        "address": "XHG5+9Q, Narol-Sarkhej Highway, Narol, Ahmedabad, Gujarat 382405",
        "plusCode": "XHG5+9Q",
        "location": {"lat": 22.973410, "lng": 72.593620},
        "vehicleType": "Both",
        "chargerType": "DC",
        "maxRate": 60,
        "points": 3,
        "connectorTypes": ["CCS2 (Car)", "15A Socket (2W)"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Highway station offering fast DC charging for cars and separate 15A socket bays for electric scooters.",
    },
    {
        "id": 23,
        "name": "Zeon Charging Station, GIFT City",
        "operator": "Zeon",
        "area": "GIFT City",
        "address": "5MG2+8P, GIFT City Rd, Gandhinagar / Ahmedabad, Gujarat 382355",
        "plusCode": "5MG2+8P",
        "location": {"lat": 23.158520, "lng": 72.684210},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 120,
        "points": 4,
        "connectorTypes": ["CCS2", "Type 2 AC"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "High-speed multi-gun station for 4-wheelers servicing the GIFT City financial tech district.",
    },
    {
        "id": 24,
        "name": "Tata Power, Shapath V",
        "operator": "Tata Power",
        "area": "Prahlad Nagar",
        "address": "2G9F+8M, SG Highway, Opposite Crowne Plaza, Prahlad Nagar, Ahmedabad, Gujarat 380015",
        "plusCode": "2G9F+8M",
        "location": {"lat": 23.014120, "lng": 72.509820},
        "vehicleType": "4W",
        "chargerType": "DC",
        "maxRate": 60,
        "points": 2,
        "connectorTypes": ["CCS2"],
        "reviewSignal": "Reviews say it works",
        "reviewNotes": "Located at Shapath V commercial entrance for passenger cars. Ground floor bay with easy turning radius.",
    },
]


def get_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    cols = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def create_tables(conn: sqlite3.Connection) -> None:
    """Create stations, reports, and usage_events tables if they do not exist."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS stations (
            id TEXT PRIMARY KEY,
            station_num INTEGER NOT NULL,
            name TEXT NOT NULL,
            operator TEXT NOT NULL,
            area TEXT NOT NULL,
            address TEXT NOT NULL,
            plus_code TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            vehicle_type TEXT NOT NULL,
            charger_type TEXT NOT NULL,
            max_rate REAL NOT NULL,
            points INTEGER NOT NULL,
            connector_types TEXT NOT NULL,
            base_tariff REAL NOT NULL,
            review_signal TEXT NOT NULL,
            review_notes TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
            report_status TEXT NOT NULL CHECK(report_status IN ('Working', 'Busy', 'Broken')),
            source TEXT NOT NULL DEFAULT 'rider' CHECK(source IN ('rider', 'verified_visit')),
            vehicle_type TEXT NOT NULL DEFAULT '',
            comment TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_reports_station_created
            ON reports(station_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            participant_code TEXT NOT NULL DEFAULT '',
            method TEXT NOT NULL DEFAULT 'chargespot' CHECK(method IN ('', 'chargespot', 'google_maps')),
            task TEXT NOT NULL DEFAULT '',
            event_type TEXT NOT NULL,
            target TEXT NOT NULL DEFAULT '',
            station_id TEXT NOT NULL DEFAULT '',
            task_time_ms INTEGER,
            seconds REAL,
            clicks INTEGER NOT NULL DEFAULT 0,
            errors INTEGER NOT NULL DEFAULT 0,
            success INTEGER NOT NULL DEFAULT 1,
            details TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_usage_events_created
            ON usage_events(created_at DESC);
        """
    )

    # Lightweight migrations if an older chargespot.db already exists without --reset
    _ensure_column(conn, "reports", "source", "TEXT NOT NULL DEFAULT 'rider'")
    _ensure_column(conn, "usage_events", "participant_code", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "usage_events", "method", "TEXT NOT NULL DEFAULT 'chargespot'")
    _ensure_column(conn, "usage_events", "task", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "usage_events", "seconds", "REAL")
    _ensure_column(conn, "usage_events", "clicks", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "usage_events", "errors", "INTEGER NOT NULL DEFAULT 0")


def seed_database(db_path: str = DEFAULT_DB_PATH, reset: bool = False) -> None:
    """Create SQLite tables and populate stations only (every station starts as Unreported)."""
    now = datetime.now(timezone.utc)
    conn = get_connection(db_path)
    try:
        if reset:
            conn.executescript(
                """
                DROP TABLE IF EXISTS usage_events;
                DROP TABLE IF EXISTS reports;
                DROP TABLE IF EXISTS stations;
                """
            )
        create_tables(conn)

        station_count = conn.execute("SELECT COUNT(*) FROM stations").fetchone()[0]
        if station_count == 0:
            now_iso = now.isoformat()
            for raw in STATION_DIRECTORY:
                base_tariff = (
                    12.0 + ((raw["id"] * 2) % 3) * 1.0
                    if raw["vehicleType"] == "2W"
                    else 15.5 + ((raw["id"] * 3) % 4) * 1.0
                )
                conn.execute(
                    """
                    INSERT INTO stations (
                        id, station_num, name, operator, area, address, plus_code,
                        lat, lng, vehicle_type, charger_type, max_rate, points,
                        connector_types, base_tariff, review_signal, review_notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"station-{raw['id']}",
                        raw["id"],
                        raw["name"],
                        raw["operator"],
                        raw["area"],
                        raw["address"],
                        raw["plusCode"],
                        raw["location"]["lat"],
                        raw["location"]["lng"],
                        raw["vehicleType"],
                        raw["chargerType"],
                        raw["maxRate"],
                        raw["points"],
                        json.dumps(raw["connectorTypes"]),
                        base_tariff,
                        raw["reviewSignal"],
                        raw["reviewNotes"],
                        now_iso,
                    ),
                )

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize and seed ChargeSpot SQLite database.")
    parser.add_argument("--reset", action="store_true", help="Drop existing tables and re-seed fresh data.")
    args = parser.parse_args()
    seed_database(DEFAULT_DB_PATH, reset=args.reset)
    print(f"Database ready at {DEFAULT_DB_PATH}")
