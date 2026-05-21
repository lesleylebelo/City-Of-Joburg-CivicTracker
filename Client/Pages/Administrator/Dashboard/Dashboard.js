// ── Auth check ──
const token = localStorage.getItem("civictrack_token");
const user  = JSON.parse(localStorage.getItem("civictrack_user") || "{}");

if (!token) window.location.href = "Admin_sign_in.html";

// Set user info
if (user.full_names) {
    document.getElementById("topbar-name").textContent   = user.full_names;
    document.getElementById("topbar-avatar").textContent = user.full_names.charAt(0).toUpperCase();
}

// ── API Helper ──
async function apiFetch(url, method = "GET", body = null) {
    const opts = {
        method,
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        }
    };
    if (body) opts.body = JSON.stringify(body);
    try {
        const res  = await fetch(url, opts);
        const data = await res.json();
        return { ok: res.ok, data };
    } catch (err) {
        return { ok: false, data: { message: "Could not connect to server." } };
    }
}

// ── Sidebar Navigation ──
const navLinks  = document.querySelectorAll(".nav-link[data-section]");
const sections  = document.querySelectorAll(".dash-section");
const pageTitle = document.getElementById("page-title");

const sectionTitles = {
    dashboard: "Dashboard",
    issues:    "Manage Issues",
    projects:  "Development Projects",
    notices:   "Notices",
    polls:     "Polls",
    events:    "Events",
    analytics: "Analytics"
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

        if (target === "issues")    loadIssues();
        if (target === "projects")  loadProjects();
        if (target === "notices")   loadNotices();
        if (target === "polls")     loadPolls();
        if (target === "events")    loadEvents();
        if (target === "analytics") loadAnalytics();
    });
});

// View all links
document.querySelectorAll(".view-all").forEach(link => {
    link.addEventListener("click", function(e) {
        e.preventDefault();
        document.querySelector(`[data-section="${this.dataset.target}"]`).click();
    });
});

// ── Load Dashboard Stats ──
async function loadStats() {
    const { data: issues }    = await apiFetch("/api/issues/stats");
    const { data: projects }  = await apiFetch("/api/projects/stats");
    const { data: residents } = await apiFetch("/api/residents/stats");

    if (issues) {
        document.getElementById("count-issues").textContent  = issues.total  || 0;
        document.getElementById("count-pending").textContent = issues.pending || 0;
    }
    if (projects)  document.getElementById("count-projects").textContent  = projects.active   || 0;
    if (residents) document.getElementById("count-residents").textContent = residents.total   || 0;

    loadRecentIssues();
    loadRecentNotices();
    loadRecentEvents();
}

// ── Recent Issues (dashboard table) ──
async function loadRecentIssues() {
    const tbody = document.getElementById("recent-issues-body");
    const { ok, data } = await apiFetch("/api/issues?limit=5");

    if (!ok || !data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-text">No issues found.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(issue => `
        <tr>
            <td>${issue.title}</td>
            <td>${issue.category}</td>
            <td><span class="priority-badge ${issue.priority.toLowerCase()}">${issue.priority}</span></td>
            <td><span class="status-badge ${issue.status.toLowerCase().replace(" ","-")}">${issue.status}</span></td>
            <td>${new Date(issue.created_at).toLocaleDateString("en-ZA")}</td>
        </tr>
    `).join("");
}

// ── Recent Notices (mini list) ──
async function loadRecentNotices() {
    const container = document.getElementById("admin-notices-list");
    const { ok, data } = await apiFetch("/api/notices?limit=4");

    if (!ok || !data.length) {
        container.innerHTML = '<p class="loading-text">No notices.</p>';
        return;
    }

    container.innerHTML = data.map(n => `
        <div class="mini-item">
            <div class="mini-item-title">${n.title}</div>
            <div class="mini-item-meta">${n.category}</div>
        </div>
    `).join("");
}

// ── Recent Events (mini list) ──
async function loadRecentEvents() {
    const container = document.getElementById("admin-events-list");
    const { ok, data } = await apiFetch("/api/events?limit=4");

    if (!ok || !data.length) {
        container.innerHTML = '<p class="loading-text">No events.</p>';
        return;
    }

    container.innerHTML = data.map(ev => `
        <div class="mini-item">
            <div class="mini-item-title">${ev.title}</div>
            <div class="mini-item-meta">${ev.event_date} | ${ev.start_time}</div>
        </div>
    `).join("");
}

// ── Load All Issues ──
async function loadIssues() {
    const tbody = document.getElementById("issues-body");
    tbody.innerHTML = '<tr><td colspan="8" class="loading-text">Loading...</td></tr>';
    const status   = document.getElementById("filterStatus").value;
    const category = document.getElementById("filterCategory").value;
    let url = "/api/issues?";
    if (status)   url += `status=${status}&`;
    if (category) url += `category=${category}`;

    const { ok, data } = await apiFetch(url);
    if (!ok || !data.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No issues found.</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(issue => `
        <tr>
            <td>#${issue.issue_id}</td>
            <td>${issue.title}</td>
            <td>${issue.category}</td>
            <td><span class="priority-badge ${issue.priority.toLowerCase()}">${issue.priority}</span></td>
            <td>${issue.location_address}</td>
            <td><span class="status-badge ${issue.status.toLowerCase().replace(" ","-")}">${issue.status}</span></td>
            <td>${new Date(issue.created_at).toLocaleDateString("en-ZA")}</td>
            <td><button class="action-btn" onclick="updateIssueStatus(${issue.issue_id})">Update</button></td>
        </tr>
    `).join("");
}

document.getElementById("filterStatus").addEventListener("change",   loadIssues);
document.getElementById("filterCategory").addEventListener("change", loadIssues);

async function updateIssueStatus(id) {
    const status = prompt("Enter new status:\nPending | In Progress | Resolved | Rejected");
    if (!status) return;
    const { ok, data } = await apiFetch(`/api/issues/${id}/status`, "PATCH", { status });
    if (ok) { alert("Status updated!"); loadIssues(); }
    else alert(data.message || "Update failed.");
}

// ── Load Projects ──
async function loadProjects() {
    const container = document.getElementById("projects-list");
    container.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/projects");
    if (!ok || !data.length) { container.innerHTML = '<p class="loading-text">No projects.</p>'; return; }
    container.innerHTML = data.map(p => `
        <div class="data-card">
            <h4>${p.title}</h4>
            <p>${p.description}</p>
            <div class="card-meta">
                <span class="card-tag">${p.category}</span>
                <span class="card-tag">${p.status}</span>
                ${p.start_date ? `<span class="card-tag">${p.start_date}</span>` : ""}
            </div>
        </div>
    `).join("");
}

// Toggle Add Project Form
document.getElementById("Add-Project-Btn").addEventListener("click", function() {
    const form = document.getElementById("add-project-form");
    form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("Submit-Project-Btn").addEventListener("click", async function() {
    const body = {
        title:             document.getElementById("projectTitle").value.trim(),
        category:          document.getElementById("projectCategory").value,
        status:            document.getElementById("projectStatus").value,
        location_address:  document.getElementById("projectLocation").value.trim(),
        start_date:        document.getElementById("projectStartDate").value,
        expected_end_date: document.getElementById("projectEndDate").value,
        description:       document.getElementById("projectDescription").value.trim()
    };

    if (!body.title || !body.location_address || !body.description) {
        document.getElementById("Project-Error").textContent = "Please fill in all required fields!";
        return;
    }

    const { ok, data } = await apiFetch("/api/projects", "POST", body);
    if (ok) {
        document.getElementById("Project-Success").textContent = "Project added successfully!";
        document.getElementById("Project-Error").textContent = "";
        loadProjects();
    } else {
        document.getElementById("Project-Error").textContent = data.message || "Failed to add project.";
    }
});

// ── Load Notices ──
async function loadNotices() {
    const container = document.getElementById("notices-list");
    container.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/notices");
    if (!ok || !data.length) { container.innerHTML = '<p class="loading-text">No notices.</p>'; return; }
    container.innerHTML = data.map(n => `
        <div class="data-card">
            <h4>${n.title}</h4>
            <p>${n.content}</p>
            <div class="card-meta"><span class="card-tag">${n.category}</span></div>
        </div>
    `).join("");
}

document.getElementById("Add-Notice-Btn").addEventListener("click", function() {
    const form = document.getElementById("add-notice-form");
    form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("Submit-Notice-Btn").addEventListener("click", async function() {
    const body = {
        title:    document.getElementById("noticeTitle").value.trim(),
        category: document.getElementById("noticeCategory").value,
        content:  document.getElementById("noticeContent").value.trim()
    };
    if (!body.title || !body.content) {
        document.getElementById("Notice-Error").textContent = "Please fill in all fields!";
        return;
    }
    const { ok, data } = await apiFetch("/api/notices", "POST", body);
    if (ok) { document.getElementById("Notice-Success").textContent = "Notice published!"; loadNotices(); }
    else document.getElementById("Notice-Error").textContent = data.message || "Failed.";
});

// ── Load Polls ──
async function loadPolls() {
    const container = document.getElementById("polls-list");
    container.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/polls");
    if (!ok || !data.length) { container.innerHTML = '<p class="loading-text">No polls.</p>'; return; }
    container.innerHTML = data.map(p => `
        <div class="data-card">
            <h4>${p.question}</h4>
            <p>${p.description || ""}</p>
            <div class="card-meta">
                <span class="card-tag">${p.is_active ? "Active" : "Closed"}</span>
                ${p.end_date ? `<span class="card-tag">Ends: ${new Date(p.end_date).toLocaleDateString("en-ZA")}</span>` : ""}
            </div>
        </div>
    `).join("");
}

document.getElementById("Add-Poll-Btn").addEventListener("click", function() {
    const form = document.getElementById("add-poll-form");
    form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("Submit-Poll-Btn").addEventListener("click", async function() {
    const optionsText = document.getElementById("pollOptions").value.trim();
    const options = optionsText.split("\n").map(o => o.trim()).filter(o => o.length > 0);
    const body = {
        question:    document.getElementById("pollQuestion").value.trim(),
        description: document.getElementById("pollDescription").value.trim(),
        end_date:    document.getElementById("pollEndDate").value,
        options
    };
    if (!body.question || options.length < 2) {
        document.getElementById("Poll-Error").textContent = "Question and at least 2 options are required!";
        return;
    }
    const { ok, data } = await apiFetch("/api/polls", "POST", body);
    if (ok) { document.getElementById("Poll-Success").textContent = "Poll created!"; loadPolls(); }
    else document.getElementById("Poll-Error").textContent = data.message || "Failed.";
});

// ── Load Events ──
async function loadEvents() {
    const container = document.getElementById("events-list");
    container.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/events");
    if (!ok || !data.length) { container.innerHTML = '<p class="loading-text">No events.</p>'; return; }
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

document.getElementById("Add-Event-Btn").addEventListener("click", function() {
    const form = document.getElementById("add-event-form");
    form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("Submit-Event-Btn").addEventListener("click", async function() {
    const body = {
        title:            document.getElementById("eventTitle").value.trim(),
        category:         document.getElementById("eventCategory").value,
        event_date:       document.getElementById("eventDate").value,
        start_time:       document.getElementById("eventStartTime").value,
        end_time:         document.getElementById("eventEndTime").value,
        location_address: document.getElementById("eventLocation").value.trim(),
        description:      document.getElementById("eventDescription").value.trim()
    };
    if (!body.title || !body.event_date || !body.start_time || !body.location_address) {
        document.getElementById("Event-Error").textContent = "Please fill in all required fields!";
        return;
    }
    const { ok, data } = await apiFetch("/api/events", "POST", body);
    if (ok) { document.getElementById("Event-Success").textContent = "Event created!"; loadEvents(); }
    else document.getElementById("Event-Error").textContent = data.message || "Failed.";
});

// ── Analytics ──
async function loadAnalytics() {
    const { ok, data } = await apiFetch("/api/issues/analytics");
    if (!ok || !data) return;

    const categoryChart = document.getElementById("chart-category");
    const statusChart   = document.getElementById("chart-status");

    if (data.byCategory) {
        const max = Math.max(...data.byCategory.map(c => c.count));
        categoryChart.innerHTML = data.byCategory.map(c => `
            <div class="bar-row">
                <span class="bar-label">${c.category}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${(c.count/max)*100}%"></div>
                </div>
                <span class="bar-count">${c.count}</span>
            </div>
        `).join("");
    }

    if (data.byStatus) {
        const max = Math.max(...data.byStatus.map(s => s.count));
        statusChart.innerHTML = data.byStatus.map(s => `
            <div class="bar-row">
                <span class="bar-label">${s.status}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${(s.count/max)*100}%"></div>
                </div>
                <span class="bar-count">${s.count}</span>
            </div>
        `).join("");
    }
}

// ── Logout ──
document.getElementById("nav-logout").addEventListener("click", function(e) {
    e.preventDefault();
    localStorage.removeItem("civictrack_token");
    localStorage.removeItem("civictrack_user");
    window.location.href = "Admin_sign_in.html";
});

// ── Initial load ──
loadStats();