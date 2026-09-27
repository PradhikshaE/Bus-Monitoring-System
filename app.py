import os
import json
import sqlite3
import time
import io
import csv
from datetime import datetime, timedelta
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, make_response

app = Flask(__name__)
app.secret_key = "bus_monitoring_secret_key_123"
DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")
ROUTES_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "routes.json")

# In-memory Simulation State
simulation_state = {
    "is_running": True,
    "start_time": time.time(),
    "paused_index": None,
    "last_updated": time.time(),
    "route_coords": [],
    "manual_gps": None,  # For IoT overrides
    "speed_kmh": 40
}

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    # Make sure we load the routes data from json
    routes_data = []
    if os.path.exists(ROUTES_JSON):
        try:
            with open(ROUTES_JSON, "r") as f:
                data = json.load(f)
                routes_data = data.get("stops", [])
                simulation_state["route_coords"] = routes_data
        except Exception as e:
            print("Error loading routes.json:", e)

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        student_name TEXT NOT NULL,
        department TEXT NOT NULL,
        bus_number TEXT NOT NULL
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        attendance_id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        time TEXT NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS routes (
        route_id TEXT NOT NULL,
        stop_name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        PRIMARY KEY (route_id, stop_name)
    )
    """)
    
    conn.commit()

    # Seed students if empty
    cursor.execute("SELECT COUNT(*) FROM students")
    if cursor.fetchone()[0] == 0:
        sample_students = [
            ("S101", "Aravind Kumar", "Computer Science", "Bus A1"),
            ("S102", "Divya Shree", "Information Science", "Bus A1"),
            ("S103", "Rahul Sharma", "Electronics & Comm", "Bus A1"),
            ("S104", "Meghana Rao", "Mechanical Eng", "Bus A2"),
            ("S105", "Vikram Singh", "Electrical Eng", "Bus A1"),
            ("S106", "Sneha Patel", "Civil Eng", "Bus A2")
        ]
        cursor.executemany("INSERT INTO students (id, student_name, department, bus_number) VALUES (?, ?, ?, ?)", sample_students)
        conn.commit()

    # Seed routes table from routes_data
    cursor.execute("SELECT COUNT(*) FROM routes")
    if cursor.fetchone()[0] == 0 and routes_data:
        for stop in routes_data:
            cursor.execute(
                "INSERT OR IGNORE INTO routes (route_id, stop_name, latitude, longitude) VALUES (?, ?, ?, ?)",
                ("Route_A1", stop["stop_name"], stop["latitude"], stop["longitude"])
            )
        conn.commit()

    # Seed historical attendance records for the past 7 days to generate high-fidelity statistics charts
    cursor.execute("SELECT COUNT(*) FROM attendance")
    if cursor.fetchone()[0] == 0:
        # Generate some attendance data for the last 7 days
        today = datetime.now()
        for i in range(7, 0, -1):
            date_str = (today - timedelta(days=i)).strftime("%Y-%m-%d")
            # Seed S101, S102, S103 with varying attendance
            # Let's say: S101 present most days, S102 sometimes, S103 present
            records = [
                ("S101", f"{date_str} 08:12:10", "Present"),
                ("S102", f"{date_str} 08:15:30", "Present" if i % 2 == 0 else "Absent"),
                ("S103", f"{date_str} 08:08:45", "Present" if i % 3 != 0 else "Absent"),
                ("S104", f"{date_str} 08:22:15", "Present"),
                ("S105", f"{date_str} 08:18:00", "Present" if i != 2 else "Absent"),
                ("S106", f"{date_str} 08:25:12", "Absent")
            ]
            cursor.executemany("INSERT INTO attendance (student_id, time, status) VALUES (?, ?, ?)", records)
        conn.commit()

    conn.close()

# Initialize DB on import/start
init_db()


# --- Authentication Middlewares & Context ---
def is_logged_in():
    return session.get("logged_in") == True

@app.before_request
def check_auth():
    # Paths that do not require login
    open_paths = ["login", "static", "api/iot", "student", "api/student"]
    # Allow local requests
    for path in open_paths:
        if path in request.path:
            return None
    if not is_logged_in() and request.path not in [url_for("login"), "/"]:
        return redirect(url_for("login"))
    if not is_logged_in() and request.path == "/":
        return redirect(url_for("login"))

# --- Page Routes ---
@app.route("/")
def index():
    if is_logged_in():
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        # Simple authentication
        if username == "admin" and password == "admin123":
            session["logged_in"] = True
            session["username"] = "Administrator"
            return redirect(url_for("dashboard"))
        else:
            error = "Invalid username or password"
    return render_template("login.html", error=error)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/students")
def students_page():
    return render_template("students.html")

@app.route("/attendance")
def attendance_page():
    return render_template("attendance.html")

@app.route("/routes")
def routes_page():
    return render_template("routes.html")

@app.route("/student")
def student_portal_page():
    return render_template("student.html")


# --- API: Bus Location & Simulation ---
def get_current_simulation_index():
    coords = simulation_state["route_coords"]
    if not coords:
        return 0
    N = len(coords)
    if not simulation_state["is_running"]:
        return simulation_state["paused_index"] if simulation_state["paused_index"] is not None else 0
    
    elapsed = time.time() - simulation_state["start_time"]
    index = int(elapsed / 3)  # Move to next point every 3 seconds
    
    # Loop the simulation so it restarts after staying at the terminal for 2 ticks (6 seconds)
    total_ticks = N + 2
    tick = index % total_ticks
    if tick >= N:
        return N - 1  # Stay at terminal
    return tick

@app.route("/api/bus/position", methods=["GET"])
def get_bus_position():
    coords = simulation_state["route_coords"]
    if not coords:
        return jsonify({"error": "No route data loaded"}), 500

    # IoT GPS Override check
    if simulation_state["manual_gps"] is not None:
        return jsonify(simulation_state["manual_gps"])

    index = get_current_simulation_index()
    curr_point = coords[index]
    
    # Calculate ETA and next stop
    next_stop_name = "N/A"
    next_stop_eta = 0
    arrived = (index == len(coords) - 1)
    
    for i in range(index + 1, len(coords)):
        if coords[i].get("is_stop"):
            next_stop_name = coords[i]["stop_name"]
            # Estimate remaining minutes based on stops' eta difference
            next_stop_eta = max(0, coords[i]["eta_minutes"] - curr_point["eta_minutes"])
            break
            
    status = "Arrived at destination" if arrived else f"En route to {next_stop_name}"
    if arrived:
        status_code = "ARRIVED"
    else:
        status_code = "MOVING"

    # Current Coordinates Update
    return jsonify({
        "route_id": "Route_A1",
        "latitude": curr_point["latitude"],
        "longitude": curr_point["longitude"],
        "stop_name": curr_point["stop_name"],
        "is_stop": curr_point["is_stop"],
        "index": index,
        "total_points": len(coords),
        "status": status,
        "status_code": status_code,
        "speed_kmh": simulation_state["speed_kmh"],
        "next_stop": next_stop_name,
        "eta_minutes": next_stop_eta,
        "is_iot": False
    })

@app.route("/api/routes", methods=["GET"])
def get_routes_list():
    return jsonify(simulation_state["route_coords"])

@app.route("/api/bus/control", methods=["POST"])
def control_bus_simulation():
    action = request.json.get("action")
    coords = simulation_state["route_coords"]
    
    if action == "play":
        if not simulation_state["is_running"]:
            # Recalculate start time based on where we paused
            paused_at = simulation_state["paused_index"] or 0
            if paused_at >= len(coords) - 1:
                # If was at the end, restart completely
                simulation_state["start_time"] = time.time()
            else:
                simulation_state["start_time"] = time.time() - (paused_at * 3)
            simulation_state["is_running"] = True
            simulation_state["paused_index"] = None
            simulation_state["manual_gps"] = None  # Clear IoT manual coordinates if returning to simulation
            
    elif action == "pause":
        if simulation_state["is_running"]:
            simulation_state["paused_index"] = get_current_simulation_index()
            simulation_state["is_running"] = False
            
    elif action == "reset":
        simulation_state["start_time"] = time.time()
        simulation_state["paused_index"] = 0
        simulation_state["is_running"] = True
        simulation_state["manual_gps"] = None

    return jsonify({"success": True, "is_running": simulation_state["is_running"], "index": get_current_simulation_index()})


# --- API: Dashboard Metrics ---
@app.route("/api/dashboard", methods=["GET"])
def get_dashboard_metrics():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Total students
    cursor.execute("SELECT COUNT(*) FROM students")
    total_students = cursor.fetchone()[0]
    
    # Today's date in YYYY-MM-DD
    today_str = datetime.now().strftime("%Y-%m-%d")
    
    # Present students today
    cursor.execute("SELECT COUNT(DISTINCT student_id) FROM attendance WHERE time LIKE ? AND status = 'Present'", (f"{today_str}%",))
    present_students = cursor.fetchone()[0]
    
    # Absent students today (assigned to bus, but not marked present today)
    absent_students = max(0, total_students - present_students)
    
    # Attendance percentage
    attendance_pct = round((present_students / total_students * 100), 1) if total_students > 0 else 0.0
    
    conn.close()

    # Get bus location status info
    bus_pos = json.loads(get_bus_position().get_data())

    return jsonify({
        "total_students": total_students,
        "present_students": present_students,
        "absent_students": absent_students,
        "attendance_percentage": attendance_pct,
        "bus_status": bus_pos["status"],
        "bus_status_code": bus_pos["status_code"],
        "current_stop": bus_pos["stop_name"],
        "next_stop": bus_pos["next_stop"],
        "eta": bus_pos["eta_minutes"]
    })


# --- API: Student Management CRUD ---
@app.route("/api/students", methods=["GET"])
def get_students():
    search = request.args.get("search", "").strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if search:
        cursor.execute(
            "SELECT * FROM students WHERE id LIKE ? OR student_name LIKE ? OR department LIKE ? OR bus_number LIKE ?",
            (f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%")
        )
    else:
        cursor.execute("SELECT * FROM students")
        
    students = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(students)

@app.route("/api/students", methods=["POST"])
def add_student():
    data = request.json
    s_id = data.get("id", "").strip()
    name = data.get("student_name", "").strip()
    dept = data.get("department", "").strip()
    bus = data.get("bus_number", "").strip()
    
    if not s_id or not name or not dept or not bus:
        return jsonify({"error": "All fields are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO students (id, student_name, department, bus_number) VALUES (?, ?, ?, ?)",
            (s_id, name, dept, bus)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": f"Student ID '{s_id}' already exists."}), 400
        
    conn.close()
    return jsonify({"success": True})

@app.route("/api/students/<student_id>", methods=["PUT"])
def edit_student(student_id):
    data = request.json
    name = data.get("student_name", "").strip()
    dept = data.get("department", "").strip()
    bus = data.get("bus_number", "").strip()
    
    if not name or not dept or not bus:
        return jsonify({"error": "All fields are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE students SET student_name = ?, department = ?, bus_number = ? WHERE id = ?",
        (name, dept, bus, student_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/students/<student_id>", methods=["DELETE"])
def delete_student(student_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
    cursor.execute("DELETE FROM attendance WHERE student_id = ?", (student_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# --- API: Attendance Module ---
@app.route("/api/attendance", methods=["GET"])
def get_attendance_history():
    conn = get_db_connection()
    cursor = conn.cursor()
    # Fetch log with student names
    cursor.execute("""
        SELECT a.attendance_id, a.student_id, s.student_name, s.department, s.bus_number, a.time, a.status 
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.id
        ORDER BY a.time DESC
    """)
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(logs)

@app.route("/api/attendance/simulate", methods=["POST"])
def simulate_attendance():
    # Frontend simulation trigger
    data = request.json
    student_id = data.get("student_id")
    status = data.get("status", "Present")
    
    if not student_id:
        return jsonify({"error": "Student ID is required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify student exists
    cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
    student = cursor.fetchone()
    if not student:
        conn.close()
        return jsonify({"error": "Student not found"}), 404
        
    # Mark attendance for today
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO attendance (student_id, time, status) VALUES (?, ?, ?)",
        (student_id, now_str, status)
    )
    conn.commit()
    conn.close()
    
    return jsonify({"success": True, "student_name": student["student_name"], "time": now_str, "status": status})


# --- API: IoT Integration Entry Points ---
@app.route("/api/iot/attendance", methods=["POST"])
def iot_attendance_webhook():
    """
    Receives scan logs from ESP32 with RFID RC522.
    Format: {"student_id": "S101", "status": "Present"}
    """
    data = request.json
    if not data:
        return jsonify({"error": "Invalid request payload"}), 400
        
    student_id = data.get("student_id")
    status = data.get("status", "Present")
    
    if not student_id:
        return jsonify({"error": "Missing student_id"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
    student = cursor.fetchone()
    if not student:
        conn.close()
        return jsonify({"error": "Student ID does not match any registered database entry"}), 404
        
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO attendance (student_id, time, status) VALUES (?, ?, ?)",
        (student_id, now_str, status)
    )
    conn.commit()
    conn.close()
    
    return jsonify({
        "success": True, 
        "message": f"IoT attendance logged for {student['student_name']}",
        "timestamp": now_str
    }), 201

@app.route("/api/iot/gps", methods=["POST"])
def iot_gps_webhook():
    """
    Receives live coordinates from ESP32 + GPS NEO-6M module.
    Format: {"latitude": 13.0035, "longitude": 77.5702, "speed": 35}
    """
    data = request.json
    if not data:
        return jsonify({"error": "Invalid payload"}), 400
        
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    speed = data.get("speed", 0)
    
    if latitude is None or longitude is None:
        return jsonify({"error": "Missing latitude/longitude coordinates"}), 400
        
    # Update manual override GPS
    simulation_state["manual_gps"] = {
        "route_id": "Route_A1_IoT",
        "latitude": float(latitude),
        "longitude": float(longitude),
        "stop_name": "IoT Live Stream Location",
        "is_stop": False,
        "index": -1,
        "total_points": len(simulation_state["route_coords"]),
        "status": f"IoT Active Tracking. Speed: {speed} km/h",
        "status_code": "MOVING",
        "speed_kmh": float(speed),
        "next_stop": "College Terminal",
        "eta_minutes": 5,
        "is_iot": True
    }
    simulation_state["is_running"] = False  # Pause regular simulated updates
    
    return jsonify({"success": True, "message": "IoT GPS coordinates cached successfully"}), 200


# --- API: Reports & Downloads ---
@app.route("/api/reports/stats", methods=["GET"])
def get_reports_stats():
    """
    Computes aggregate metrics for Chart.js daily attendance trends.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Calculate attendance percentage for the last 7 days
    today = datetime.now()
    dates = []
    percentages = []
    
    cursor.execute("SELECT COUNT(*) FROM students")
    total_students = cursor.fetchone()[0]
    
    if total_students == 0:
        total_students = 1  # Avoid division by zero
        
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        display_str = day.strftime("%b %d")
        dates.append(display_str)
        
        cursor.execute("SELECT COUNT(DISTINCT student_id) FROM attendance WHERE time LIKE ? AND status = 'Present'", (f"{day_str}%",))
        present_count = cursor.fetchone()[0]
        pct = round((present_count / total_students) * 100, 1)
        percentages.append(pct)
        
    conn.close()
    return jsonify({
        "labels": dates,
        "data": percentages
    })

@app.route("/api/reports/download-csv", methods=["GET"])
def download_attendance_csv():
    """
    Generates a download of the complete attendance log as a CSV.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.attendance_id, a.student_id, s.student_name, s.department, s.bus_number, a.time, a.status 
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.id
        ORDER BY a.time DESC
    """)
    records = cursor.fetchall()
    conn.close()

    csv_data = io.StringIO()
    writer = csv.writer(csv_data)
    
    # Header
    writer.writerow(["Attendance ID", "Student ID", "Student Name", "Department", "Bus Number", "Date/Time", "Status"])
    
    # Rows
    for row in records:
        writer.writerow([
            row["attendance_id"],
            row["student_id"],
            row["student_name"] or "Unknown Student",
            row["department"] or "N/A",
            row["bus_number"] or "N/A",
            row["time"],
            row["status"]
        ])
        
    response = make_response(csv_data.getvalue())
    response.headers["Content-Disposition"] = f"attachment; filename=attendance_report_{datetime.now().strftime('%Y%m%d')}.csv"
    response.headers["Content-type"] = "text/csv"
    return response

# --- API: Student Portal ---
@app.route("/api/student/<student_id>", methods=["GET"])
def get_student_status(student_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch student info
    cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
    student = cursor.fetchone()
    
    if not student:
        conn.close()
        return jsonify({"error": "Student ID not found"}), 404
        
    student_dict = dict(student)
    
    # Check if student already checked in today (marked Present)
    today_str = datetime.now().strftime("%Y-%m-%d")
    cursor.execute(
        "SELECT * FROM attendance WHERE student_id = ? AND time LIKE ? AND status = 'Present' ORDER BY time DESC LIMIT 1",
        (student_id, f"{today_str}%")
    )
    today_log = cursor.fetchone()
    
    student_dict["checked_in_today"] = (today_log is not None)
    student_dict["checkin_time"] = today_log["time"] if today_log else None
    
    conn.close()
    return jsonify(student_dict)

@app.route("/api/student/checkin", methods=["POST"])
def student_self_checkin():
    data = request.json
    student_id = data.get("student_id")
    
    if not student_id:
        return jsonify({"error": "Student ID is required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
    student = cursor.fetchone()
    if not student:
        conn.close()
        return jsonify({"error": "Student not found"}), 404
        
    # Check if already checked in today
    today_str = datetime.now().strftime("%Y-%m-%d")
    cursor.execute(
        "SELECT COUNT(*) FROM attendance WHERE student_id = ? AND time LIKE ? AND status = 'Present'",
        (student_id, f"{today_str}%")
    )
    if cursor.fetchone()[0] > 0:
        conn.close()
        return jsonify({"error": "You have already checked in today!"}), 400
        
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO attendance (student_id, time, status) VALUES (?, ?, 'Present')",
        (student_id, now_str)
    )
    conn.commit()
    conn.close()
    
    return jsonify({"success": True, "student_name": student["student_name"], "time": now_str})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
