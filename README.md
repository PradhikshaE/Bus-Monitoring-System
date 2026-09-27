# Bus Monitoring and Attendance System with Route Visualization

A modern full-stack fleet logistics and student attendance platform. Features simulated real-time GPS path visualization on OpenStreetMap using Leaflet.js, student CRUD, digital RFID card swipe boarding simulator, daily trends graph, CSV exports, and IoT ready endpoints.

---

## Technical Stack
- **Frontend**: HTML5, Vanilla CSS3 (custom responsive design system), JavaScript ES6, Leaflet.js, Chart.js.
- **Backend**: Python Flask.
- **Database**: SQLite (initialized automatically on start).
- **Icons**: FontAwesome 6.4 (loaded via CDN).

---

## Folder Structure
```
bus-monitoring-system/
│
├── app.py                 # Core Flask server and API endpoints
├── database.db            # SQLite Database (generated on first launch)
├── requirements.txt       # Python project dependencies
│
├── static/
│   ├── style.css          # Design system stylesheet
│   └── script.js          # Core JavaScript logic (AJAX, Maps, Charts)
│
├── templates/
│   ├── login.html         # Login page
│   ├── dashboard.html     # Analytics and KPIs overview
│   ├── attendance.html    # RFID boarding scanner simulator and logs
│   ├── students.html      # Student directory (CRUD panel)
│   └── routes.html        # Leaflet live route map tracking
│
├── data/
│   └── routes.json        # Route coordinates, stops, and waypoints
│
└── README.md              # Setup and usage guide
```

---

## Setup & Installation

### 1. Prerequisites
Ensure you have Python 3.8+ installed on your system.

### 2. Install Dependencies
Open a terminal in the project directory (`d:\BusMonitoring`) and install the requirements:
```bash
pip install -r requirements.txt
```

### 3. Running the Server
Run the Flask server:
```bash
python app.py
```
By default, the server runs locally on: **[http://127.0.0.1:5000/](http://127.0.0.1:5000/)**

---

## How to Test the Simulation

### 1. Login Access
Navigate to the root URL. You will be redirected to the login panel.
- **Username**: `admin`
- **Password**: `admin123`

### 2. Student Management
- Navigate to the **Students** tab.
- Add, update, search, or delete student profiles.

### 3. Attendance Simulation (Digital Scan)
- Navigate to the **Attendance** tab.
- Choose a student from the dropdown menu and click **Swipe Present** or **Swipe Absent**.
- An attendance log record will be generated in the database instantly, complete with timestamp, and the dashboard metrics (KPI counters, Charts) will update.
- Download the generated logs by clicking **Export CSV**.

### 4. Live Map tracking
- Navigate to the **Live Tracking** tab.
- Observe the **Bus A1** icon moving along the path lines. It advances to the next waypoint/stop coordinate every 3 seconds.
- Review current coordinates, speed, current stop name, next stop name, and estimated minutes (ETA) dynamically refreshing in the status bars.
- Click **Pause**, **Play**, or **Replay** to control the simulation flow.
- A success toast notification is dispatched when the bus completes the route.

---

## Future IoT Integration (Prepared Architecture)
This codebase is ready for hardware nodes such as **ESP32**, **RFID RC522**, and **NEO-6M GPS** modules:

### 1. RFID Card Scan
To record boarding via an IoT device, configure your ESP32 controller to execute an HTTP POST to:
`POST http://<server-ip>:5000/api/iot/attendance`
**Payload Format:**
```json
{
  "student_id": "S101",
  "status": "Present"
}
```

### 2. GPS Location Stream
To update the bus coordinates live from an onboard GPS module, perform an HTTP POST to:
`POST http://<server-ip>:5000/api/iot/gps`
**Payload Format:**
```json
{
  "latitude": 13.0075,
  "longitude": 77.5712,
  "speed": 35
}
```
*Note: Making a post request to the GPS webhook automatically pauses the server's internal simulation clock and locks the map onto the incoming IoT telemetry coordinates.*
