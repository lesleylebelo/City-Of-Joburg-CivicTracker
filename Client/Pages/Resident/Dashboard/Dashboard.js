// ── Load user info from localStorage ──
const token = localStorage.getItem("civictrack_token");
const user  = JSON.parse(localStorage.getItem("civictrack_user") || "{}");

if (!token) {
    window.location.href = "Resident_Sign_In.html";
}

// Set user info in topbar
if (user.full_names) {
    document.getElementById("topbar-name").textContent    = user.full_names;
    document.getElementById("welcome-name").textContent   = user.full_names.split(" ")[0];
    document.getElementById("topbar-avatar").textContent  = user.full_names.charAt(0).toUpperCase();
}

// ── Sidebar Navigation ──
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

        // Update active nav
        navLinks.forEach(l => l.classList.remove("active"));
        this.classList.add("active");

        // Show correct section
        sections.forEach(s => s.classList.remove("active"));
        document.getElementById("section-" + target).classList.add("active");

        // Update page title
        pageTitle.textContent = sectionTitles[target] || "Dashboard";

        // Load data for section
        if (target === "projects") loadProjects();
        if (target === "notices")  loadNotices();
        if (target === "polls")    loadPolls();
        if (target === "events")   loadEvents();
    });
});

// View all links on dashboard home
document.querySelectorAll(".view-all").forEach(link => {
    link.addEventListener("click", function(e) {
        e.preventDefault();
        const target = this.dataset.target;
        document.querySelector(`[data-section="${target}"]`).click();
    });
});

// ── API Helper ──
async function apiFetch(url) {
    try {
        const res = await fetch(url, {
            headers: { "Authorization": "Bearer " + token }
        });
        return await res.json();
    } catch (err) {
        console.error("API error:", err);
        return null;
    }
}

// ── Load Development Projects ──
async function loadProjects() {
    const container = document.getElementById("projects-list");
    container.innerHTML = '<p class="loading-text">Loading projects...</p>';
    const data = await apiFetch("/api/projects");
    if (!data || !data.length) {
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

// ── Load Notices ──
async function loadNotices() {
    const container = document.getElementById("full-notices-list");
    container.innerHTML = '<p class="loading-text">Loading notices...</p>';
    const data = await apiFetch("/api/notices");
    if (!data || !data.length) {
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

// ── Load Polls ──
async function loadPolls() {
    const container = document.getElementById("polls-list");
    container.innerHTML = '<p class="loading-text">Loading polls...</p>';
    const data = await apiFetch("/api/polls");
    if (!data || !data.length) {
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

// ── Load Events ──
async function loadEvents() {
    const container = document.getElementById("full-events-list");
    container.innerHTML = '<p class="loading-text">Loading events...</p>';
    const data = await apiFetch("/api/events");
    if (!data || !data.length) {
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

// ── Report Issue Form ──
document.getElementById("Report-Issue-Form").addEventListener("submit", async function(e) {
    e.preventDefault();

    const title       = document.getElementById("issueTitle").value.trim();
    const category    = document.getElementById("issueCategory").value;
    const priority    = document.getElementById("issuePriority").value;
    const location    = document.getElementById("issueLocation").value.trim();
    const description = document.getElementById("issueDescription").value.trim();
    const errorMsg    = document.getElementById("Report-Issue-Error");
    const successMsg  = document.getElementById("Report-Issue-Success");

    errorMsg.textContent   = "";
    successMsg.textContent = "";

    if (!title || !category || !location || !description) {
        errorMsg.textContent = "Please fill in all required fields!";
        return;
    }

    try {
        const res = await fetch("/api/issues", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ title, category, priority, location_address: location, description })
        });

        const data = await res.json();

        if (!res.ok) {
            errorMsg.textContent = data.message || "Failed to submit report.";
            return;
        }

        successMsg.textContent = "Issue reported successfully!";
        document.getElementById("Report-Issue-Form").reset();

    } catch (err) {
        errorMsg.textContent = "Could not connect to server. Please try again.";
    }
});

// ── Logout ──
document.getElementById("nav-logout").addEventListener("click", function(e) {
    e.preventDefault();
    localStorage.removeItem("civictrack_token");
    localStorage.removeItem("civictrack_user");
    window.location.href = "Resident_Sign_In.html";
});
