// Bus Monitoring and Attendance System - Frontend Application Logic

document.addEventListener("DOMContentLoaded", () => {
    // Determine which page is currently loaded
    if (document.getElementById("dashboard-page")) {
        initDashboard();
    } else if (document.getElementById("students-page")) {
        initStudents();
    } else if (document.getElementById("attendance-page")) {
        initAttendance();
    } else if (document.getElementById("routes-page")) {
        initRoutesMap();
    } else if (document.getElementById("student-portal-page")) {
        initStudentPortal();
    }
});

// ==========================================
// TOAST NOTIFICATIONS HELPERS
// ==========================================
function showToast(message, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "fa-check-circle";
    if (type === "warning") icon = "fa-exclamation-triangle";
    if (type === "danger") icon = "fa-exclamation-circle";
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Automatically remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = "toast-fade-in 0.3s reverse forwards";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}


// ==========================================
// DASHBOARD MODULE
// ==========================================
function initDashboard() {
    let statsChart = null;

    // Load Metrics Function
    const loadMetrics = () => {
        fetch("/api/dashboard")
            .then(res => res.json())
            .then(data => {
                document.getElementById("total-students").innerText = data.total_students;
                document.getElementById("present-students").innerText = data.present_students;
                document.getElementById("absent-students").innerText = data.absent_students;
                document.getElementById("attendance-pct").innerText = data.attendance_percentage + "%";
                
                // Update Bus Status Card
                document.getElementById("bus-status-text").innerText = data.bus_status;
                document.getElementById("bus-stop-val").innerText = data.current_stop;
                document.getElementById("bus-next-val").innerText = data.next_stop;
                document.getElementById("bus-eta-val").innerText = data.eta > 0 ? `${data.eta} min` : "Arrived";
                
                // Badge color based on status
                const badge = document.getElementById("bus-status-badge");
                badge.innerText = data.bus_status_code;
                badge.className = "route-badge";
                if (data.bus_status_code === "ARRIVED") {
                    badge.classList.add("arrived");
                }
            })
            .catch(err => console.error("Error loading dashboard metrics:", err));
    };

    // Load Chart.js Graph
    const loadStatsChart = () => {
        fetch("/api/reports/stats")
            .then(res => res.json())
            .then(chartData => {
                const ctx = document.getElementById("attendance-trend-chart").getContext("2d");
                
                // Destroy old instance if exists
                if (statsChart) {
                    statsChart.destroy();
                }

                statsChart = new Chart(ctx, {
                    type: "line",
                    data: {
                        labels: chartData.labels,
                        datasets: [{
                            label: "Daily Attendance %",
                            data: chartData.data,
                            borderColor: "#3b82f6",
                            backgroundColor: "rgba(59, 130, 246, 0.08)",
                            borderWidth: 3,
                            fill: true,
                            tension: 0.3,
                            pointBackgroundColor: "#1e40af",
                            pointBorderColor: "#ffffff",
                            pointHoverRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: {
                                min: 0,
                                max: 100,
                                ticks: {
                                    callback: function(value) { return value + "%"; }
                                }
                            }
                        }
                    }
                });
            })
            .catch(err => console.error("Error loading statistics:", err));
    };

    // Initial call & short polling for simulation changes
    loadMetrics();
    loadStatsChart();
    setInterval(loadMetrics, 3000); // Poll every 3 seconds to keep sync with simulation
}


// ==========================================
// STUDENT MANAGEMENT MODULE (CRUD)
// ==========================================
function initStudents() {
    const studentModal = document.getElementById("student-modal");
    const addStudentBtn = document.getElementById("btn-add-student");
    const closeModalBtn = document.getElementById("btn-close-modal");
    const studentForm = document.getElementById("student-form");
    const studentsTableBody = document.getElementById("students-table-body");
    const searchInput = document.getElementById("search-students");
    const modalTitle = document.getElementById("modal-title");

    let isEditMode = false;
    let currentEditId = null;

    // Load Student Table
    const loadStudents = (searchQuery = "") => {
        fetch(`/api/students?search=${encodeURIComponent(searchQuery)}`)
            .then(res => res.json())
            .then(students => {
                studentsTableBody.innerHTML = "";
                if (students.length === 0) {
                    studentsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No students found.</td></tr>`;
                    return;
                }

                students.forEach(s => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${s.id}</strong></td>
                        <td>${s.student_name}</td>
                        <td>${s.department}</td>
                        <td><span class="badge badge-bus">${s.bus_number}</span></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn btn-secondary btn-sm btn-edit" data-id="${s.id}" data-name="${s.student_name}" data-dept="${s.department}" data-bus="${s.bus_number}">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button class="btn btn-danger btn-sm btn-delete" data-id="${s.id}">
                                    <i class="fas fa-trash-alt"></i> Delete
                                </button>
                            </div>
                        </td>
                    `;
                    studentsTableBody.appendChild(tr);
                });

                // Attach Event Listeners to actions
                document.querySelectorAll(".btn-edit").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        const target = e.currentTarget;
                        isEditMode = true;
                        currentEditId = target.dataset.id;
                        modalTitle.innerText = "Edit Student Details";
                        
                        document.getElementById("student-id").value = target.dataset.id;
                        document.getElementById("student-id").disabled = true; // Disable id editing
                        document.getElementById("student-name").value = target.dataset.name;
                        document.getElementById("student-dept").value = target.dataset.dept;
                        document.getElementById("student-bus").value = target.dataset.bus;
                        
                        studentModal.classList.add("active");
                    });
                });

                document.querySelectorAll(".btn-delete").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        const id = e.currentTarget.dataset.id;
                        if (confirm(`Are you sure you want to delete student ${id}? This deletes all their attendance logs.`)) {
                            fetch(`/api/students/${id}`, { method: "DELETE" })
                                .then(res => res.json())
                                .then(data => {
                                    if (data.success) {
                                        showToast("Student deleted successfully", "success");
                                        loadStudents(searchInput.value);
                                    }
                                })
                                .catch(err => console.error("Error deleting student:", err));
                        }
                    });
                });
            })
            .catch(err => console.error("Error loading students:", err));
    };

    // Modal Control
    addStudentBtn.addEventListener("click", () => {
        isEditMode = false;
        currentEditId = null;
        modalTitle.innerText = "Add New Student";
        studentForm.reset();
        document.getElementById("student-id").disabled = false;
        studentModal.classList.add("active");
    });

    closeModalBtn.addEventListener("click", () => {
        studentModal.classList.remove("active");
    });

    // Form Submission
    studentForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const payload = {
            id: document.getElementById("student-id").value,
            student_name: document.getElementById("student-name").value,
            department: document.getElementById("student-dept").value,
            bus_number: document.getElementById("student-bus").value
        };

        const url = isEditMode ? `/api/students/${currentEditId}` : "/api/students";
        const method = isEditMode ? "PUT" : "POST";

        fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    showToast(data.error, "danger");
                } else {
                    showToast(isEditMode ? "Student updated successfully" : "Student added successfully", "success");
                    studentModal.classList.remove("active");
                    loadStudents(searchInput.value);
                }
            })
            .catch(err => console.error("Error saving student:", err));
    });

    // Search Trigger
    searchInput.addEventListener("input", (e) => {
        loadStudents(e.target.value);
    });

    // Initial Load
    loadStudents();
}


// ==========================================
// ATTENDANCE BOARDING MODULE
// ==========================================
function initAttendance() {
    const attendanceTableBody = document.getElementById("attendance-table-body");
    const swipeStudentSelect = document.getElementById("swipe-student");
    const btnSwipePresent = document.getElementById("btn-swipe-present");
    const btnSwipeAbsent = document.getElementById("btn-swipe-absent");

    // Load history
    const loadAttendanceHistory = () => {
        fetch("/api/attendance")
            .then(res => res.json())
            .then(logs => {
                attendanceTableBody.innerHTML = "";
                if (logs.length === 0) {
                    attendanceTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No attendance records found.</td></tr>`;
                    return;
                }

                logs.forEach(l => {
                    const badgeClass = l.status === "Present" ? "badge-present" : "badge-absent";
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${l.attendance_id}</strong></td>
                        <td>${l.student_id}</td>
                        <td>${l.student_name || "Unknown"}</td>
                        <td>${l.department || "N/A"}</td>
                        <td><span class="badge ${badgeClass}">${l.status}</span></td>
                        <td>${l.time}</td>
                    `;
                    attendanceTableBody.appendChild(tr);
                });
            })
            .catch(err => console.error("Error loading attendance history:", err));
    };

    // Load active students for dropdown boarding simulator selector
    const loadStudentDropdown = () => {
        fetch("/api/students")
            .then(res => res.json())
            .then(students => {
                swipeStudentSelect.innerHTML = `<option value="">-- Choose Student to Swipe --</option>`;
                students.forEach(s => {
                    const opt = document.createElement("option");
                    opt.value = s.id;
                    opt.innerText = `${s.id} - ${s.student_name} (${s.bus_number})`;
                    swipeStudentSelect.appendChild(opt);
                });
            });
    };

    // Swipe Event Trigger Handler
    const triggerSimulation = (status) => {
        const studentId = swipeStudentSelect.value;
        if (!studentId) {
            showToast("Please select a student to simulate RFID card swipe", "warning");
            return;
        }

        fetch("/api/attendance/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ student_id: studentId, status: status })
        })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    showToast(data.error, "danger");
                } else {
                    showToast(`Card Swiped: ${data.student_name} marked ${data.status}!`, "success");
                    loadAttendanceHistory();
                }
            })
            .catch(err => console.error("Error submitting boarding swipe simulation:", err));
    };

    btnSwipePresent.addEventListener("click", () => triggerSimulation("Present"));
    btnSwipeAbsent.addEventListener("click", () => triggerSimulation("Absent"));

    // Initial Calls
    loadAttendanceHistory();
    loadStudentDropdown();
}


// ==========================================
// BUS ROUTE MONITORING MODULE (LEAFLET MAP)
// ==========================================
function initRoutesMap() {
    let map = null;
    let busMarker = null;
    let routePolyline = null;
    let stops = [];
    let isTracking = true;
    let hasNotifiedArrival = false;
    let pollInterval = null;

    // Load stops coordinates data from the server API
    fetch("/api/routes")
        .then(res => res.json())
        .then(routeCoords => {
            stops = routeCoords;
            buildMap(stops);
        })
        .catch(err => console.error("Failed to fetch coordinates for map setup:", err));

    const buildMap = (routePoints) => {
        // Initialize Leaflet Map
        // Coimbatore Center View
        map = L.map("route-map").setView([11.0210, 76.9750], 13.5);

        // Add OpenStreetMap Tile Layer
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Add stops and markers
        routePoints.forEach((pt, index) => {
            if (pt.is_stop) {
                // Color code college differently
                const isCollege = pt.stop_name.toLowerCase().includes("college");
                const markerColor = isCollege ? "#10b981" : "#1e40af";
                const markerHtml = `
                    <div style="background-color: ${markerColor}; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: var(--shadow-md); font-weight: bold; font-size: 0.8rem;">
                        ${isCollege ? '<i class="fas fa-graduation-cap"></i>' : index + 1}
                    </div>
                `;

                const stopIcon = L.divIcon({
                    html: markerHtml,
                    className: "custom-stop-marker",
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });

                L.marker([pt.latitude, pt.longitude], { icon: stopIcon })
                    .addTo(map)
                    .bindPopup(`<strong>${pt.stop_name}</strong><br>ETA: ${pt.eta_minutes} mins from start`);
            }
        });

        // Draw Polyline Path
        const pathCoords = routePoints.map(pt => [pt.latitude, pt.longitude]);
        routePolyline = L.polyline(pathCoords, {
            color: "#3b82f6",
            weight: 5,
            opacity: 0.7,
            dashArray: "2, 8"
        }).addTo(map);

        // Custom Bus Marker
        const busIcon = L.divIcon({
            html: '<div class="bus-map-marker" style="background-color: #1e40af; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.3); font-size: 1.1rem;"><i class="fas fa-bus"></i></div>',
            className: "custom-bus-marker",
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        // Set bus at Stop 1 initially
        busMarker = L.marker([routePoints[0].latitude, routePoints[0].longitude], { icon: busIcon }).addTo(map);

        // Start Polling active positions
        updateBusPosition();
        pollInterval = setInterval(updateBusPosition, 3000);
    };

    // Fetch latest simulation coords and update map
    const updateBusPosition = () => {
        fetch("/api/bus/position")
            .then(res => res.json())
            .then(data => {
                if (data.error) return;

                const lat = data.latitude;
                const lng = data.longitude;
                const newLatLng = new L.LatLng(lat, lng);

                // Update marker position
                if (busMarker) {
                    busMarker.setLatLng(newLatLng);
                }

                // Center Map on Bus option
                if (isTracking && map) {
                    map.panTo(newLatLng);
                }

                // Update UI Texts
                document.getElementById("live-lat").innerText = lat.toFixed(5);
                document.getElementById("live-lng").innerText = lng.toFixed(5);
                document.getElementById("live-speed").innerText = data.speed_kmh + " km/h";
                document.getElementById("live-stop").innerText = data.stop_name;
                document.getElementById("live-next").innerText = data.next_stop;
                document.getElementById("live-eta").innerText = data.eta_minutes > 0 ? `${data.eta_minutes} min` : "Arrived";
                document.getElementById("live-status").innerText = data.status;

                // Arrival Notification Check
                if (data.status_code === "ARRIVED") {
                    if (!hasNotifiedArrival) {
                        showToast("🎉 Arrival Alert: Bus Route Completed! Arrived at College Terminal.", "success");
                        hasNotifiedArrival = true;
                    }
                } else {
                    hasNotifiedArrival = false;
                }
            })
            .catch(err => console.error("Error retrieving active bus tracking coordinate:", err));
    };

    // Controller Event Triggers
    document.getElementById("btn-sim-play").addEventListener("click", () => {
        fetch("/api/bus/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "play" })
        })
            .then(() => {
                showToast("Simulation Running", "success");
            });
    });

    document.getElementById("btn-sim-pause").addEventListener("click", () => {
        fetch("/api/bus/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "pause" })
        })
            .then(() => {
                showToast("Simulation Paused", "warning");
            });
    });

    document.getElementById("btn-sim-reset").addEventListener("click", () => {
        fetch("/api/bus/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reset" })
        })
            .then(() => {
                hasNotifiedArrival = false;
                showToast("Simulation reset to Start Stop", "success");
                updateBusPosition();
            });
    });

    // Tracking toggle
    const mapCenterBtn = document.getElementById("btn-map-center");
    mapCenterBtn.addEventListener("click", () => {
        isTracking = !isTracking;
        mapCenterBtn.className = isTracking ? "btn btn-primary" : "btn btn-secondary";
        mapCenterBtn.innerHTML = isTracking ? '<i class="fas fa-crosshairs"></i> Auto-Follow ON' : '<i class="fas fa-crosshairs"></i> Auto-Follow OFF';
    });
}

// ==========================================
// STUDENT SELF CHECK-IN PORTAL MODULE
// ==========================================
function initStudentPortal() {
    const verifySection = document.getElementById("section-verify");
    const dashboardSection = document.getElementById("section-dashboard");
    const verifyForm = document.getElementById("form-student-verify");
    const studentIdInput = document.getElementById("portal-student-id");
    const btnCheckin = document.getElementById("btn-self-checkin");
    const btnExit = document.getElementById("btn-portal-exit");
    
    let activeStudentId = sessionStorage.getItem("active_student_id");
    let telemetryInterval = null;

    // Load student data & render dashboard
    const loadStudentDashboard = (studentId) => {
        fetch(`/api/student/${studentId}`)
            .then(res => {
                if (!res.ok) {
                    throw new Error("Student ID not found");
                }
                return res.json();
            })
            .then(student => {
                activeStudentId = student.id;
                sessionStorage.setItem("active_student_id", student.id);

                // Update Profile Labels
                document.getElementById("welcome-student-name").innerText = `Welcome, ${student.student_name}`;
                document.getElementById("student-avatar").innerText = student.student_name.charAt(0).toUpperCase();
                document.getElementById("lbl-student-id").innerText = student.id;
                document.getElementById("lbl-student-dept").innerText = student.department;
                document.getElementById("lbl-student-bus").innerText = student.bus_number;

                // Toggle Check-in status display
                if (student.checked_in_today) {
                    document.getElementById("checkin-action-trigger").classList.add("hidden");
                    document.getElementById("checkin-success-display").classList.remove("hidden");
                    document.getElementById("lbl-checkin-timestamp").innerText = `Recorded at: ${student.checkin_time}`;
                } else {
                    document.getElementById("checkin-action-trigger").classList.remove("hidden");
                    document.getElementById("checkin-success-display").classList.add("hidden");
                }

                // Show Dashboard, Hide Verify Screen
                verifySection.classList.add("hidden");
                dashboardSection.classList.remove("hidden");

                // Start Live Bus Tracking Updates
                updateBusTelemetry();
                if (telemetryInterval) clearInterval(telemetryInterval);
                telemetryInterval = setInterval(updateBusTelemetry, 3000);
            })
            .catch(err => {
                showToast("Invalid Student ID or network error.", "danger");
                console.error(err);
            });
    };

    // Update Live Bus status display
    const updateBusTelemetry = () => {
        fetch("/api/bus/position")
            .then(res => res.json())
            .then(data => {
                if (data.error) return;
                document.getElementById("lbl-bus-curr").innerText = data.stop_name;
                document.getElementById("lbl-bus-next").innerText = data.next_stop;
                document.getElementById("lbl-bus-eta").innerText = data.eta_minutes > 0 ? `${data.eta_minutes} min` : "Arrived";
                document.getElementById("lbl-bus-status").innerText = data.status;
                
                // Color label based on status
                const statusLbl = document.getElementById("lbl-bus-status");
                if (data.status_code === "ARRIVED") {
                    statusLbl.style.color = "var(--accent)";
                } else {
                    statusLbl.style.color = "var(--primary-light)";
                }
            })
            .catch(err => console.error("Error fetching live telemetry:", err));
    };

    // Submit Student ID verification
    verifyForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const studentId = studentIdInput.value.trim().toUpperCase();
        if (studentId) {
            loadStudentDashboard(studentId);
        }
    });

    // Handle check-in boarding click
    btnCheckin.addEventListener("click", () => {
        if (!activeStudentId) return;

        fetch("/api/student/checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ student_id: activeStudentId })
        })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    showToast(data.error, "danger");
                } else {
                    showToast(`Success! Boarding confirmed for ${data.student_name}`, "success");
                    
                    // Toggle UI
                    document.getElementById("checkin-action-trigger").classList.add("hidden");
                    document.getElementById("checkin-success-display").classList.remove("hidden");
                    document.getElementById("lbl-checkin-timestamp").innerText = `Recorded at: ${data.time}`;
                }
            })
            .catch(err => {
                showToast("Check-in request failed.", "danger");
                console.error(err);
            });
    });

    // Exit student portal
    btnExit.addEventListener("click", () => {
        sessionStorage.removeItem("active_student_id");
        activeStudentId = null;
        if (telemetryInterval) clearInterval(telemetryInterval);
        studentIdInput.value = "";
        
        verifySection.classList.remove("hidden");
        dashboardSection.classList.add("hidden");
        showToast("Exited student portal.", "warning");
    });

    // Check if session already active
    if (activeStudentId) {
        loadStudentDashboard(activeStudentId);
    }
}
