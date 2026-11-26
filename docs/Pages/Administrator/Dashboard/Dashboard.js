// ── Auth check ──
const user = CivicSession.user;
const escapeHTML = CivicSession.escapeHTML;


// Set user info
if (user.full_names) {
    document.getElementById("topbar-name").textContent   = user.full_names;
    document.getElementById("admin-welcome-name").textContent = user.full_names.split(" ")[0];
    document.getElementById("topbar-avatar").textContent = user.full_names.charAt(0).toUpperCase();
}

// ── API Helper ──
async function apiFetch(url, method = "GET", body = null) {
    const opts = {
        method,
        headers: {
            "Content-Type": "application/json"
        }
    };
    if (body) opts.body = JSON.stringify(body);
    try {
        const res  = await CivicSession.fetch(window.CivicConfig.apiUrl(url), opts);
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
        navLinks.forEach(l => l.removeAttribute("aria-current"));
        this.setAttribute("aria-current", "page");
        sections.forEach(s => s.classList.remove("active"));
        document.getElementById("section-" + target).classList.add("active");
        pageTitle.textContent = sectionTitles[target] || "Dashboard";

        pageTitle.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
        if (target === "dashboard") loadStats();
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
    const results = await Promise.all([apiFetch('/api/issues/stats'), apiFetch('/api/projects/stats'), apiFetch('/api/residents/stats')]);
    const fields = [[0, 'total', 'count-issues'], [0, 'pending', 'count-pending'], [1, 'active', 'count-projects'], [2, 'total', 'count-residents']];
    let failed = false;
    for (const [index, field, id] of fields) {
        const result = results[index];
        const valid = result.ok && result.data && Object.hasOwn(result.data, field) &&
            (result.data[field] === null || Number.isFinite(Number(result.data[field])));
        document.getElementById(id).textContent = valid ? Number(result.data[field] ?? 0) : '--';
        if (!valid) failed = true;
    }
    document.getElementById('stats-feedback').textContent = failed ? 'Some summaries are unavailable. Return to Dashboard to try again.' : '';
    await Promise.all([loadRecentIssues(), loadRecentNotices(), loadRecentEvents()]);
}

// ── Recent Issues (dashboard table) ──
async function loadRecentIssues() {
    const tbody = document.getElementById("recent-issues-body");
    const { ok, data } = await apiFetch("/api/issues?limit=5");

    if (!ok || !Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="5">' + adminEmpty('Reports could not load', 'Please try again.', 'overview') + '</td></tr>'; return; }
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="5">' + adminEmpty('No reports to review yet', 'New resident reports will appear here.') + '</td></tr>'; return; }

    tbody.innerHTML = data.map(issue => `
        <tr>
            <td>${escapeHTML(issue.title)}</td>
            <td>${escapeHTML(issue.category)}</td>
            <td><span class="priority-badge ${issue.priority.toLowerCase()}">${issue.priority}</span></td>
            <td><span class="status-badge ${issue.status.toLowerCase().replace(" ","-")}">${escapeHTML(issue.status)}</span></td>
            <td>${new Date(issue.created_at).toLocaleDateString("en-ZA")}</td>
        </tr>
    `).join("");
}

// ── Recent Notices (mini list) ──
async function loadRecentNotices() {
    const container = document.getElementById("admin-notices-list");
    const { ok, data } = await apiFetch("/api/notices?limit=4");

    if (!ok || !Array.isArray(data)) { container.innerHTML = adminEmpty('Notices could not load', 'Please try again.', 'overview'); return; }
    if (!data.length) { container.innerHTML = adminEmpty('No notices published yet', 'Use Publish a notice to share a community update.'); return; }

    container.innerHTML = data.map(n => `
        <div class="mini-item">
            <div class="mini-item-title">${escapeHTML(n.title)}</div>
            <div class="mini-item-meta">${escapeHTML(n.category)}</div>
        </div>
    `).join("");
}

// ── Recent Events (mini list) ──
async function loadRecentEvents() {
    const container = document.getElementById("admin-events-list");
    const { ok, data } = await apiFetch("/api/events?limit=4");

    if (!ok || !Array.isArray(data)) { container.innerHTML = adminEmpty('Events could not load', 'Please try again.', 'overview'); return; }
    const upcoming = data.filter(ev => new Date(ev.event_date) >= new Date(new Date().setHours(0,0,0,0))).sort((a,b) => new Date(a.event_date) - new Date(b.event_date));
    if (!upcoming.length) { container.innerHTML = adminEmpty('Nothing on the calendar yet', 'Create an event to keep residents connected.'); return; }

    container.innerHTML = upcoming.slice(0, 4).map(ev => `
        <div class="mini-item">
            <div class="mini-item-title">${escapeHTML(ev.title)}</div>
            <div class="mini-item-meta">${new Date(ev.event_date).toLocaleDateString("en-ZA")} | ${escapeHTML(ev.start_time?.substring(0, 5) || "")}</div>
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
    if (!ok || !Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="8">' + adminEmpty('Reports could not load', 'Your filters are retained. Try again.', 'issues') + '</td></tr>'; return; }
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="8">' + adminEmpty('No reports match these filters', 'Choose another category or status to review more reports.') + '</td></tr>'; return; }
    tbody.innerHTML = data.map(issue => `
        <tr>
            <td>#${issue.issue_id}</td>
            <td>${escapeHTML(issue.title)}</td>
            <td>${escapeHTML(issue.category)}</td>
            <td><span class="priority-badge ${issue.priority.toLowerCase()}">${issue.priority}</span></td>
            <td>${escapeHTML(issue.location_address)}</td>
            <td><span class="status-badge ${issue.status.toLowerCase().replace(" ","-")}">${escapeHTML(issue.status)}</span></td>
            <td>${new Date(issue.created_at).toLocaleDateString("en-ZA")}</td>
            <td>
                <button class="action-btn"
                    onclick="updateIssueStatus(${issue.issue_id})">
                    Update
                </button>

                <button class="action-btn delete-btn"
                    onclick="deleteIssue(${issue.issue_id})">
                    Delete
                </button>
             </td>
        </tr>
    `).join("");
}

document.getElementById("filterStatus").addEventListener("change",   loadIssues);
document.getElementById("filterCategory").addEventListener("change", loadIssues);

async function updateIssueStatus(id) {
    const status = prompt("Enter new status:\nPending | In Progress | Resolved | Rejected");
    if (!status) return;
    const { ok, data } = await apiFetch(`/api/issues/${id}/status`, "PATCH", { status });
    if (ok) { alert("Status updated!"); loadIssues(); loadStats(); }
    else alert(data.message || "Update failed.");
}

async function deleteIssue(id) {

    const confirmed = confirm(
        "Are you sure you want to delete this issue?"
    );

    if (!confirmed) return;

    const { ok, data } = await apiFetch(
        `/api/issues/${id}`,
        "DELETE"
    );

    if (ok) {
        alert("Issue deleted successfully.");
        loadIssues();
        loadStats();
    } else {
        alert(data.message || "Delete failed.");
    }
}

//PROJECTS/DEVELOPMENTS

let editingProjectId = null;

// ── Load Projects ──
async function loadProjects() {
    const container = document.getElementById("projects-list");
    container.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/projects");
    if (!ok || !Array.isArray(data)) { container.innerHTML = adminEmpty('Updates could not load', 'Choose this section again to retry.'); return; }
    if (!data.length) { container.innerHTML = adminEmpty('No projects published yet', 'Add a project to share its progress with residents.'); return; }
   container.innerHTML = data.map(p => `
    <div class="data-card">

        <h4>${escapeHTML(p.title)}</h4>

        <p>${escapeHTML(p.description)}</p>

        <div class="card-meta">
            <span class="card-tag">${escapeHTML(p.category)}</span>
            <span class="card-tag">${escapeHTML(p.status)}</span>
            ${p.start_date ? `<span class="card-tag">${p.start_date}</span>` : ""}
        </div>

        <div class="card-actions">
            <button onclick="editProject(${p.project_id})">
                Edit
            </button>

            <button onclick="deleteProject(${p.project_id})">
                Delete
            </button>
        </div>

    </div>
`).join("");
}

async function editProject(id) {

    const { ok, data } = await apiFetch("/api/projects");

    if (!ok) {
        alert("Could not load project.");
        return;
    }

    const project = data.find(
        p => p.project_id === id
    );

    if (!project) {
        alert("Project not found.");
        return;
    }

    editingProjectId = id;

    document.getElementById("project-form-title")
        .textContent = "Edit Development Project";

    document.getElementById("Submit-Project-Btn")
        .textContent = "Update Project";

    document.getElementById("projectTitle")
        .value = project.title || "";

    document.getElementById("projectCategory")
        .value = project.category || "";

    document.getElementById("projectStatus")
        .value = project.status || "";

    document.getElementById("projectLocation")
        .value = project.location_address || "";

    document.getElementById("projectStartDate")
        .value = project.start_date
            ? project.start_date.split("T")[0]
            : "";

    document.getElementById("projectEndDate")
        .value = project.expected_end_date
            ? project.expected_end_date.split("T")[0]
            : "";

    document.getElementById("projectDescription")
        .value = project.description || "";

    document.getElementById("add-project-form")
        .style.display = "block";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

async function deleteProject(id) {

    if (!confirm("Delete this project?"))
        return;

    const { ok, data } = await apiFetch(
        `/api/projects/${id}`,
        "DELETE"
    );

    if (ok) {
        alert("Project deleted.");
        loadProjects();
    } else {
        alert(data.message || "Delete failed.");
    }
}

// Toggle Add Project Form
document.getElementById("Add-Project-Btn").addEventListener("click", function() {
    const form = document.getElementById("add-project-form");
    form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("Submit-Project-Btn")
.addEventListener("click", async function() {

    const body = {
        title: document.getElementById("projectTitle").value.trim(),
        category: document.getElementById("projectCategory").value,
        status: document.getElementById("projectStatus").value,
        location_address: document.getElementById("projectLocation").value.trim(),
        start_date: document.getElementById("projectStartDate").value,
        expected_end_date: document.getElementById("projectEndDate").value,
        description: document.getElementById("projectDescription").value.trim()
    };

    if (!body.title || !body.location_address || !body.description) {
        document.getElementById("Project-Error").textContent =
            "Please fill in all required fields.";
        return;
    }

    let response;

    if (editingProjectId) {

        response = await apiFetch(
            `/api/projects/${editingProjectId}`,
            "PUT",
            body
        );

    } else {

        response = await apiFetch(
            "/api/projects",
            "POST",
            body
        );
    }

    if (response.ok) {

        document.getElementById("Project-Success").textContent =
            editingProjectId
                ? "Project updated successfully!"
                : "Project added successfully!";

        document.getElementById("Project-Error").textContent = "";

        editingProjectId = null;

        document.getElementById("project-form-title")
            .textContent = "New Development Project";

        document.getElementById("Submit-Project-Btn")
            .textContent = "Save Project";

        document.getElementById("projectTitle").value = "";
        document.getElementById("projectLocation").value = "";
        document.getElementById("projectDescription").value = "";
        document.getElementById("projectStartDate").value = "";
        document.getElementById("projectEndDate").value = "";

        loadProjects();

    } else {

        document.getElementById("Project-Error").textContent =
            response.data.message || "Operation failed.";
    }
});

// ── Load Notices ──
async function loadNotices() {
    const container = document.getElementById("notices-list");
    container.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/notices");
    if (!ok || !Array.isArray(data)) { container.innerHTML = adminEmpty('Updates could not load', 'Choose this section again to retry.'); return; }
    if (!data.length) { container.innerHTML = adminEmpty('No notices published yet', 'Publish a notice to share a community update.'); return; }
    container.innerHTML = data.map(n => `
        <div class="data-card">
            <h4>${escapeHTML(n.title)}</h4>
            <p>${escapeHTML(n.content)}</p>
            <div class="card-meta"><span class="card-tag">${escapeHTML(n.category)}</span></div>
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
    if (!ok || !Array.isArray(data)) { container.innerHTML = adminEmpty('Updates could not load', 'Choose this section again to retry.'); return; }
    if (!data.length) { container.innerHTML = adminEmpty('No community polls yet', 'Create a poll to invite residents to have their say.'); return; }
    container.innerHTML = data.map(p => `
        <div class="data-card">
            <h4>${escapeHTML(p.question)}</h4>
            <p>${escapeHTML(p.description || "")}</p>
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
    if (!ok || !Array.isArray(data)) { container.innerHTML = adminEmpty('Updates could not load', 'Choose this section again to retry.'); return; }
    if (!data.length) { container.innerHTML = adminEmpty('No events published yet', 'Create an event to keep residents connected.'); return; }
    container.innerHTML = data.map(ev => `
        <div class="data-card">
            <h4>${escapeHTML(ev.title)}</h4>
            <p>${escapeHTML(ev.description)}</p>
            <div class="card-meta">
                <span class="card-tag">${ev.event_date}</span>
                <span class="card-tag">${ev.start_time}</span>
                <span class="card-tag">${escapeHTML(ev.category)}</span>
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
    const categoryChart = document.getElementById("chart-category");
    const statusChart   = document.getElementById("chart-status");

    if (!ok || !data) { categoryChart.innerHTML = statusChart.innerHTML = adminEmpty('Analytics could not load', 'Choose Analytics again to retry.'); return; }
    if (Array.isArray(data.byCategory) && !data.byCategory.length) categoryChart.innerHTML = adminEmpty('No category data yet', 'Category totals appear when residents submit reports.');
    if (Array.isArray(data.byStatus) && !data.byStatus.length) statusChart.innerHTML = adminEmpty('No status data yet', 'Report status totals will appear here.');
    if (data.byCategory?.length) {
        const max = Math.max(...data.byCategory.map(c => c.count));
        categoryChart.innerHTML = data.byCategory.map(c => `
            <div class="bar-row">
                <span class="bar-label">${escapeHTML(c.category)}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${(c.count/max)*100}%"></div>
                </div>
                <span class="bar-count">${c.count}</span>
            </div>
        `).join("");
    }

    if (data.byStatus?.length) {
        const max = Math.max(...data.byStatus.map(s => s.count));
        statusChart.innerHTML = data.byStatus.map(s => `
            <div class="bar-row">
                <span class="bar-label">${escapeHTML(s.status)}</span>
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
    CivicSession.signOut();
});

loadStats();

function adminEmpty(title, description, retry = '') {
    return '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 21V3c5-3 9 3 14 0v11c-5 3-9-3-14 0"/></svg><h4>' + escapeHTML(title) + '</h4><p>' + escapeHTML(description) + '</p>' + (retry ? '<button type="button" data-admin-retry="' + retry + '">Try again</button>' : '') + '</div>';
}
document.querySelectorAll('[data-review-status]').forEach(button => button.addEventListener('click', () => {
    document.getElementById('filterStatus').value = button.dataset.reviewStatus;
    document.getElementById('filterCategory').value = '';
    document.querySelector('[data-section="issues"]').click();
}));
document.querySelectorAll('[data-admin-create]').forEach(button => button.addEventListener('click', () => {
    const forms = { notices: ['add-notice-form', 'noticeTitle'], events: ['add-event-form', 'eventTitle'], polls: ['add-poll-form', 'pollQuestion'] };
    const section = button.dataset.adminCreate;
    document.querySelector('[data-section="' + section + '"]').click();
    const [form, input] = forms[section];
    document.getElementById(form).style.display = 'block';
    document.getElementById(input).focus();
}));
document.getElementById('dashboard-content').addEventListener('click', event => {
    const button = event.target.closest('[data-admin-retry]');
    if (!button) return;
    if (button.dataset.adminRetry === 'overview') loadStats();
    if (button.dataset.adminRetry === 'issues') loadIssues();
});
document.querySelector('[data-section="dashboard"]').setAttribute('aria-current', 'page');
