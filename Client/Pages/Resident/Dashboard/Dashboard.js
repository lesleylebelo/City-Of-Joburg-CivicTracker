// =============================================
// CIVICTRACK - RESIDENT DASHBOARD ENGINE
// =============================================

// ─────────────────────────────────────────────
// SESSION GUARD & CONTEXT LOOKUP
// ─────────────────────────────────────────────
const token = localStorage.getItem("civictrack_token");
const user  = JSON.parse(localStorage.getItem("civictrack_user") || "{}");

if (!token) {
    window.location.href = "/Pages/Resident/Sign-In/Sign-In.html";
}

// Populate user context metadata on interface panels
if (user.full_names) {
    document.getElementById("topbar-name").textContent    = user.full_names;
    document.getElementById("welcome-name").textContent   = user.full_names.split(" ")[0];
    document.getElementById("topbar-avatar").textContent  = user.full_names.charAt(0).toUpperCase();
}

// ─────────────────────────────────────────────
// SIDEBAR NAVIGATION STATE ENGINE
// ─────────────────────────────────────────────
const navLinks   = document.querySelectorAll(".nav-link[data-section]");
const sections   = document.querySelectorAll(".dash-section");
const pageTitle  = document.getElementById("page-title");

const sectionTitles = {
    dashboard: "Dashboard",
    report:    "Report Issue",
    projects:  "Development Projects",
    notices:   "Notices",
    polls:     "Polls",
    events:    "Events"
};

navLinks.forEach(link => {
    link.addEventListener("click", function(e) {
        e.preventDefault();
        const target = this.dataset.section;

        navLinks.forEach(l => l.classList.remove("active"));
        this.classList.add("active");

        sections.forEach(s => s.classList.remove("active"));
        document.getElementById("section-" + target).classList.add("active");

        pageTitle.textContent = sectionTitles[target] || "Dashboard";

        if (target === "projects") loadProjects();
        if (target === "notices")  loadNotices();
        if (target === "polls")    loadPolls();
        if (target === "events")   loadEvents();
        
        // Trigger map recalculation layout fix when section becomes visible
        if (target === "report" && map) {
            google.maps.event.trigger(map, "resize");
            map.setCenter(marker.getPosition());
        }
    });
});

document.querySelectorAll(".view-all").forEach(link => {
    link.addEventListener("click", function(e) {
        e.preventDefault();
        const target = this.dataset.target;
        const matchingLink = document.querySelector(`[data-section="${target}"]`);
        if (matchingLink) matchingLink.click();
    });
});

// ─────────────────────────────────────────────
// SECURITY AUTHORIZATION FETCH HELPER
// ─────────────────────────────────────────────
async function apiFetch(url) {
    try {
        const res = await fetch(url, {
            headers: { "Authorization": "Bearer " + token }
        });
        return await res.json();
    } catch (err) {
        console.error("API Fetch execution failure:", err);
        return null;
    }
}

// ─────────────────────────────────────────────
// DATA RECONCILIATION & LOADING ENGINES
// ─────────────────────────────────────────────
async function loadProjects() {
    const container = document.getElementById("projects-list");
    container.innerHTML = '<p class="loading-text">Loading projects...</p>';
    const data = await apiFetch("/api/projects");
    if (!data || !Array.isArray(data) || !data.length) {
        container.innerHTML = '<p class="loading-text">No projects found.</p>';
        return;
    }
    container.innerHTML = data.map(p => `
        <div class="data-card">
            <h4>${p.title}</h4>
            <p>${p.description}</p>
            <div class="card-meta">
                <span class="card-tag">${p.category}</span>
                <span class="card-tag">${p.status}</span>
            </div>
        </div>
    `).join("");
}

async function loadNotices() {
    const container = document.getElementById("full-notices-list");
    container.innerHTML = '<p class="loading-text">Loading notices...</p>';
    const data = await apiFetch("/api/notices");
    if (!data || !Array.isArray(data) || !data.length) {
        container.innerHTML = '<p class="loading-text">No notices found.</p>';
        return;
    }
    container.innerHTML = data.map(n => `
        <div class="data-card">
            <h4>${n.title}</h4>
            <p>${n.content}</p>
            <div class="card-meta">
                <span class="card-tag">${n.category}</span>
            </div>
        </div>
    `).join("");
}

async function loadPolls() {
    const container = document.getElementById("polls-list");
    container.innerHTML = '<p class="loading-text">Loading polls...</p>';
    const data = await apiFetch("/api/polls");
    if (!data || !Array.isArray(data) || !data.length) {
        container.innerHTML = '<p class="loading-text">No active polls.</p>';
        return;
    }
    container.innerHTML = data.map(p => `
        <div class="data-card">
            <h4>${p.question}</h4>
            <p>${p.description || ""}</p>
            <div class="card-meta">
                <span class="card-tag">${p.is_active ? "Active" : "Closed"}</span>
            </div>
        </div>
    `).join("");
}

async function loadEvents() {
    const container = document.getElementById("full-events-list");
    container.innerHTML = '<p class="loading-text">Loading events...</p>';
    const data = await apiFetch("/api/events");
    if (!data || !Array.isArray(data) || !data.length) {
        container.innerHTML = '<p class="loading-text">No upcoming events.</p>';
        return;
    }
    container.innerHTML = data.map(ev => `
        <div class="data-card">
            <h4>${ev.title}</h4>
            <p>${ev.description}</p>
            <div class="card-meta">
                <span class="card-tag">${ev.event_date}</span>
                <span class="card-tag">${ev.start_time}</span>
                <span class="card-tag">${ev.category}</span>
            </div>
        </div>
    `).join("");
}

// ─────────────────────────────────────────────
// GOOGLE MAPS INTEGRATION ENGINE (WITH CITY BOUNDS)
// ─────────────────────────────────────────────
let map, marker, autocomplete, geocoder;

// Johannesburg Center Default point coordinates
const JOBURG_CENTER = { lat: -26.2041, lng: 28.0473 };

// strict bounding box constraints for City of Johannesburg municipal limits
const JOBURG_BOUNDS = {
    north: -25.90,
    south: -26.40,
    west:  27.70,
    east:  28.20
};

function initIssueMap() {
    geocoder = new google.maps.Geocoder();

    // Dark styled map configuration layout matrix
    const darkMapStyle = [
        { elementType: "geometry", stylers: [{ color: "#212121" }] },
        { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
        { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
        { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
        { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
        { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] }
    ];

    map = new google.maps.Map(document.getElementById("issueMap"), {
        center: JOBURG_CENTER,
        zoom: 12,
        styles: darkMapStyle,
        mapTypeControl: false,
        streetViewControl: false
    });

    marker = new google.maps.Marker({
        position: JOBURG_CENTER,
        map: map,
        draggable: true,
        animation: google.maps.Animation.DROP
    });

    // Initialize the search input text autocomplete rules
    const locationInput = document.getElementById("issueLocation");
    autocomplete = new google.maps.places.Autocomplete(locationInput, {
        bounds: JOBURG_BOUNDS,
        strictBounds: true,
        componentRestrictions: { country: "za" },
        fields: ["address_components", "geometry", "formatted_address"]
    });

    // Event link: User selects a search suggestion
    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
            return;
        }

        if (!validateMunicipalJurisdiction(place.address_components)) {
            flagGeographicalViolation();
            return;
        }

        // Reposition pin map viewport frame
        map.setCenter(place.geometry.location);
        map.setZoom(16);
        marker.setPosition(place.geometry.location);
        updateCoordinateBuffers(place.geometry.location.lat(), place.geometry.location.lng());
    });

    // Event link: User clicks on the map canvas
    map.addListener("click", (e) => {
        reverseGeocodePosition(e.latLng);
    });

    // Event link: User drags the map canvas marker pin
    marker.addListener("dragend", () => {
        reverseGeocodePosition(marker.getPosition());
    });

    // Geolocation action hook click execution
    document.getElementById("Map-Locate-Btn").addEventListener("click", () => {
        if (navigator.geolocation) {
            document.getElementById("Report-Issue-Error").textContent = "Locating device position...";
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    reverseGeocodePosition(new google.maps.LatLng(coords.lat, coords.lng));
                },
                () => {
                    document.getElementById("Report-Issue-Error").textContent = "Location access denied by your device browser.";
                }
            );
        }
    });
}

// Convert spatial coords back into textual string configurations
function reverseGeocodePosition(latLng) {
    geocoder.geocode({ location: latLng }, (results, status) => {
        if (status === "OK" && results[0]) {
            if (!validateMunicipalJurisdiction(results[0].address_components)) {
                flagGeographicalViolation();
                return;
            }
            document.getElementById("issueLocation").value = results[0].formatted_address;
            marker.setPosition(latLng);
            map.panTo(latLng);
            updateCoordinateBuffers(latLng.lat(), latLng.lng());
            document.getElementById("Report-Issue-Error").textContent = "";
        } else {
            console.error("Geocoder lookup execution failure:", status);
        }
    });
}

// Ensure the chosen node resolves to the Johannesburg area registry
function validateMunicipalJurisdiction(components) {
    if (!components) return false;
    
    // Scan address metadata array blocks for explicit municipal context markers
    return components.some(c => 
        c.long_name.toLowerCase().includes("johannesburg") || 
        c.short_name.toLowerCase().includes("j_hb") || 
        c.long_name.toLowerCase().includes("joburg")
    );
}

function flagGeographicalViolation() {
    const errorEl = document.getElementById("Report-Issue-Error");
    errorEl.textContent = "Error: CivicTrack only accepts issues within the City of Johannesburg municipal area!";
    
    const inputField = document.getElementById("issueLocation");
    inputField.value = "";
    inputField.classList.add("shake");
    setTimeout(() => inputField.classList.remove("shake"), 400);

    updateCoordinateBuffers("", "");
    marker.setPosition(JOBURG_CENTER);
    map.setCenter(JOBURG_CENTER);
    map.setZoom(12);
}

function updateCoordinateBuffers(lat, lng) {
    document.getElementById("issueLat").value = lat;
    document.getElementById("issueLng").value = lng;
}

// ─────────────────────────────────────────────
// REPORT AN ISSUE FORM SUBMISSION PIPELINE
// ─────────────────────────────────────────────
document.getElementById("Report-Issue-Form").addEventListener("submit", async function(e) {
    e.preventDefault();

    const title       = document.getElementById("issueTitle").value.trim();
    const category    = document.getElementById("issueCategory").value;
    const priority    = document.getElementById("issuePriority").value;
    const location    = document.getElementById("issueLocation").value.trim();
    const description = document.getElementById("issueDescription").value.trim();
    const latitude    = document.getElementById("issueLat").value;
    const longitude   = document.getElementById("issueLng").value;
    
    const errorMsg    = document.getElementById("Report-Issue-Error");
    const successMsg  = document.getElementById("Report-Issue-Success");

    errorMsg.textContent   = "";
    successMsg.textContent = "";

    if (!title || !category || !location || !description) {
        errorMsg.textContent = "Please fill in all required fields!";
        return;
    }

    // Force map selection verification to protect backend query structures
    if (!latitude || !longitude) {
        errorMsg.textContent = "Please verify your location address using a valid map pin selection or suggestion dropdown.";
        return;
    }

    try {
        const res = await fetch("/api/issues", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ 
                title, 
                category, 
                priority, 
                location_address: location, 
                description,
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude)
            })
        });

        const data = await res.json();

        if (!res.ok) {
            errorMsg.textContent = data.message || "Failed to submit report.";
            return;
        }

        successMsg.textContent = "Issue reported successfully!";
        document.getElementById("Report-Issue-Form").reset();
        updateCoordinateBuffers("", "");
        marker.setPosition(JOBURG_CENTER);

    } catch (err) {
        errorMsg.textContent = "Could not connect to server. Please try again.";
    }
});

// ─────────────────────────────────────────────
// TERMINATE CURRENT ACTIVE AUTH SESSION
// ─────────────────────────────────────────────
document.getElementById("nav-logout").addEventListener("click", function(e) {
    e.preventDefault();
    localStorage.removeItem("civictrack_token");
    localStorage.removeItem("civictrack_user");
    window.location.href = "/Pages/Resident/Sign-In/Sign-In.html";
});
