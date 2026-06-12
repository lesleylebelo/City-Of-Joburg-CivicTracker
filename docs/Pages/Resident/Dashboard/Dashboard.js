const token = localStorage.getItem("civictrack_token");
const user  = JSON.parse(localStorage.getItem("civictrack_user") || "{}");

if (!token) window.location.href = "Resident_Sign_In.html";

if (user.full_names) {
    document.getElementById("topbar-name").textContent   = user.full_names;
    document.getElementById("welcome-name").textContent  = user.full_names.split(" ")[0];
    document.getElementById("topbar-avatar").textContent = user.full_names.charAt(0).toUpperCase();
}

// Sidebar Navigation 
const navLinks  = document.querySelectorAll(".nav-link[data-section]");
const sections  = document.querySelectorAll(".dash-section");
const pageTitle = document.getElementById("page-title");

const sectionTitles = {
    dashboard: "Dashboard", report: "Report Issue",
    projects: "Development Projects", notices: "Notices",
    polls: "Polls", events: "Events", history: "My Issue History"
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
        if (target === "history")  loadMyHistory();
    });
});

document.querySelectorAll(".view-all").forEach(link => {
    link.addEventListener("click", function(e) {
        e.preventDefault();
        document.querySelector(`[data-section="${this.dataset.target}"]`).click();
    });
});

// Helpers 
async function apiFetch(url, method = "GET", body = null) {
    const opts = { method, headers: { "Authorization": "Bearer " + token } };
    if (body && !(body instanceof FormData)) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
        opts.body = body;
    }
    try {
        const res  = await fetch(url, opts);
        const data = await res.json();
        return { ok: res.ok, data };
    } catch (err) {
        return { ok: false, data: { message: "Could not connect to server." } };
    }
}

function formatDate(d) {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(t) {
    if (!t) return "";
    if (t.includes("T")) return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
    return t.substring(0, 5);
}

function statusBadge(status) {
    const cls = status.toLowerCase().replace(" ", "-");
    return `<span class="history-status ${cls}">${status}</span>`;
}

// Load Projects 
async function loadProjects() {
    const c = document.getElementById("projects-list");
    c.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/projects");
    if (!ok || !data.length) { c.innerHTML = '<p class="loading-text">No projects found.</p>'; return; }
    c.innerHTML = data.map(p => `
        <div class="data-card">
            <h4>${p.title}</h4><p>${p.description}</p>
            <div class="card-meta">
                <span class="card-tag">${p.category}</span>
                <span class="card-tag">${p.status}</span>
                ${p.start_date ? `<span class="card-tag">${formatDate(p.start_date)}</span>` : ""}
            </div>
        </div>`).join("");
}

// Load Notices 
async function loadNotices() {
    const c = document.getElementById("full-notices-list");
    c.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/notices");
    if (!ok || !data.length) { c.innerHTML = '<p class="loading-text">No notices.</p>'; return; }
    c.innerHTML = data.map(n => `
        <div class="data-card">
            <h4>${n.title}</h4><p>${n.content}</p>
            <div class="card-meta"><span class="card-tag">${n.category}</span></div>
        </div>`).join("");
}

// Load Polls 
async function loadPolls() {
    const c = document.getElementById("polls-list");
    c.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/polls");
    if (!ok || !data.length) { c.innerHTML = '<p class="loading-text">No active polls.</p>'; return; }
    c.innerHTML = data.map(poll => `
        <div class="poll-card" id="poll-${poll.poll_id}">
            <div class="poll-header">
                <h4>${poll.question}</h4>
                ${poll.description ? `<p class="poll-desc">${poll.description}</p>` : ""}
                <span class="poll-status ${poll.is_active ? 'active' : 'closed'}">${poll.is_active ? 'Active' : 'Closed'}</span>
            </div>
            <div class="poll-options">
                ${poll.options && poll.options.length > 0
                    ? poll.options.map(opt => `
                        <button class="poll-option-btn" onclick="castVote(${poll.poll_id}, ${opt.option_id}, this)">
                            <span class="option-text">${opt.option_text}</span>
                            <span class="option-votes">${opt.votes} vote${opt.votes !== 1 ? "s" : ""}</span>
                        </button>`).join("")
                    : '<p class="no-options">No options available.</p>'}
            </div>
            <p class="poll-feedback" id="poll-msg-${poll.poll_id}"></p>
        </div>`).join("");
}

async function castVote(pollId, optionId, btn) {
    const msgEl = document.getElementById(`poll-msg-${pollId}`);
    msgEl.style.color = "#F5C518"; msgEl.textContent = "Submitting...";
    const { ok, data } = await apiFetch(`/api/polls/${pollId}/vote`, "POST", { option_id: optionId });
    if (ok) {
        msgEl.style.color = "#4CAF50"; msgEl.textContent = "✓ Vote submitted!";
        document.querySelectorAll(`#poll-${pollId} .poll-option-btn`).forEach(b => {
            b.disabled = true; b.style.opacity = "0.6"; b.style.cursor = "default";
        });
        btn.style.borderColor = "#F5C518"; btn.style.background = "rgba(245,197,24,0.1)"; btn.style.opacity = "1";
    } else {
        msgEl.style.color = "#FF5252"; msgEl.textContent = data.message || "Failed.";
    }
}

// Load Events
async function loadEvents() {
    const c = document.getElementById("full-events-list");
    c.innerHTML = '<p class="loading-text">Loading...</p>';
    const { ok, data } = await apiFetch("/api/events");
    if (!ok || !data.length) { c.innerHTML = '<p class="loading-text">No upcoming events.</p>'; return; }
    c.innerHTML = data.map(ev => {
        const d = new Date(ev.event_date);
        const day = d.toLocaleDateString("en-ZA", { day: "2-digit" });
        const mon = d.toLocaleDateString("en-ZA", { month: "short" }).toUpperCase();
        const full = d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        const st = formatTime(ev.start_time);
        const et = ev.end_time ? " – " + formatTime(ev.end_time) : "";
        return `<div class="data-card event-full-card">
            <div class="event-full-header">
                <div class="event-date-badge"><span class="event-day">${day}</span><span class="event-month">${mon}</span></div>
                <div class="event-full-info">
                    <h4>${ev.title}</h4>
                    <p class="event-full-date">${full}</p>
                    <p class="event-full-time">🕐 ${st}${et}</p>
                    <p class="event-full-location">📍 ${ev.location_address}</p>
                </div>
            </div>
            <p class="event-full-desc">${ev.description}</p>
            <div class="card-meta"><span class="card-tag">${ev.category}</span></div>
        </div>`;
    }).join("");
}

// Load My History 
async function loadMyHistory() {
    const c = document.getElementById("history-list");
    c.innerHTML = '<p class="loading-text">Loading your history...</p>';
    const { ok, data } = await apiFetch("/api/issues/my-history");
    if (!ok || !data.length) { c.innerHTML = '<p class="loading-text">You have not submitted any issues yet.</p>'; return; }
    c.innerHTML = data.map(issue => `
        <div class="history-card">
            <div class="history-header">
                <div class="history-title-block">
                    <h4>${issue.title}</h4>
                    <span class="history-category">${issue.category}</span>
                </div>
                <div class="history-meta-right">
                    ${statusBadge(issue.status)}
                    <span class="history-date">${formatDate(issue.created_at)}</span>
                </div>
            </div>
            <p class="history-location">📍 ${issue.location_address}</p>
            <p class="history-desc">${issue.description}</p>
            ${issue.image_url ? `
                <div class="history-image-wrap">
                    <img src="${issue.image_url}" alt="Issue photo" class="history-image" onclick="openImageModal('${issue.image_url}')">
                </div>` : ""}
            ${issue.admin_notes ? `<div class="history-admin-note"><span>Admin Note:</span> ${issue.admin_notes}</div>` : ""}
            ${issue.resolved_at ? `<p class="history-resolved">✓ Resolved on ${formatDate(issue.resolved_at)}</p>` : ""}

            <div class="history-actions">
                ${issue.status === "Pending" ? `
                    <button class="crud-btn edit-btn"
                        onclick="editIssue(${issue.issue_id})">
                        Edit
                    </button>

                    <button class="crud-btn delete-btn"
                        onclick="deleteIssue(${issue.issue_id})">
                        Delete
                    </button>
                ` : ""}
             </div>
        </div>`).join("");
}

async function deleteIssue(issueId) {

    const confirmed = confirm(
        "Are you sure you want to delete this issue?"
    );

    if (!confirmed) return;

    const { ok, data } = await apiFetch(
        `/api/issues/${issueId}`,
        "DELETE"
    );

    if (ok) {
        alert("Issue deleted successfully.");
        loadMyHistory();
    } else {
        alert(data.message || "Failed to delete issue.");
    }
}

async function editIssue(issueId) {

    const { ok, data } = await apiFetch(
        `/api/issues/${issueId}`
    );

    if (!ok) {
        alert("Unable to load issue.");
        return;
    }

    const title = prompt(
        "Edit Title",
        data.title
    );

    if (!title) return;

    const description = prompt(
        "Edit Description",
        data.description
    );

    if (!description) return;

    const update = await apiFetch(
        `/api/issues/${issueId}`,
        "PUT",
        {
            title,
            category: data.category,
            priority: data.priority,
            location_address: data.location_address,
            description
        }
    );

    if (update.ok) {
        alert("Issue updated successfully.");
        loadMyHistory();
    } else {
        alert(update.data.message || "Update failed.");
    }
}

// Image lightbox 
function openImageModal(src) {
    const overlay = document.getElementById("image-modal-overlay");
    document.getElementById("image-modal-img").src = src;
    overlay.classList.add("open");
}

document.getElementById("image-modal-overlay").addEventListener("click", function() {
    this.classList.remove("open");
});

// Report Issue Form (with image upload) 
document.getElementById("Report-Issue-Form").addEventListener("submit", async function(e) {
    e.preventDefault();

    const title       = document.getElementById("issueTitle").value.trim();
    const category    = document.getElementById("issueCategory").value;
    const priority    = document.getElementById("issuePriority").value;
    const location    = document.getElementById("issueLocation").value.trim();
    const description = document.getElementById("issueDescription").value.trim();

    const latitude    = document.getElementById("issueLat").value;
    const longitude   = document.getElementById("issueLng").value;

    const imageFile   = document.getElementById("issueImage").files[0];
    const errorMsg    = document.getElementById("Report-Issue-Error");
    const successMsg  = document.getElementById("Report-Issue-Success");
        errorMsg.textContent = successMsg.textContent = "";

    if (!title || !category || !location || !description) {
         errorMsg.textContent = "Please fill in all required fields!";
        return;
    }

    if (!latitude || !longitude) {
        errorMsg.textContent =
            "Please select a valid location within the City of Joburg.";
        return;
    }

    // Use FormData to support file upload
    const formData = new FormData();
    formData.append("title",            title);
    formData.append("category",         category);
    formData.append("priority",         priority);
    formData.append("location_address", location);
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("description", description);
    if (imageFile) formData.append("issueImage", imageFile);

    const { ok, data } = await apiFetch("/api/issues", "POST", formData);

    if (ok) {
        successMsg.textContent = "Issue reported successfully!";
        document.getElementById("Report-Issue-Form").reset();
        document.getElementById("image-preview-wrap").style.display = "none";
    } else {
        errorMsg.textContent = data.message || "Failed to submit.";
    }
});

// Image preview before upload
document.getElementById("issueImage").addEventListener("change", function() {
    const file = this.files[0];
    const wrap = document.getElementById("image-preview-wrap");
    const img  = document.getElementById("image-preview");
    if (file) {
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; wrap.style.display = "block"; };
        reader.readAsDataURL(file);
    } else {
        wrap.style.display = "none";
    }
});

// Logout 
document.getElementById("nav-logout").addEventListener("click", function(e) {
    e.preventDefault();
    localStorage.removeItem("civictrack_token");
    localStorage.removeItem("civictrack_user");
    window.location.href = "/Pages/Resident/Sign-In/Sign-In.html";
});



// Nominatim (OpenStreetMap) Address Autocomplete 
document.querySelector('[data-section="report"]').addEventListener("click", function() {
    setTimeout(setupAddressAutocomplete, 300);
});

function setupAddressAutocomplete() {
    const input = document.getElementById("issueLocation");
    if (!input || input.dataset.init) return;
    input.dataset.init = "true";

    const dropdown = document.createElement("div");
    dropdown.id = "address-dropdown";
    dropdown.style.cssText = "position:absolute;z-index:9999;width:100%;background:#2A2A2A;border:1px solid rgba(245,197,24,0.3);border-radius:4px;max-height:220px;overflow-y:auto;display:none;";
    input.parentNode.style.position = "relative";
    input.parentNode.appendChild(dropdown);

    let debounceTimer;

    input.addEventListener("input", function() {
        clearTimeout(debounceTimer);
        const query = this.value.trim();
        if (query.length < 3) { dropdown.style.display = "none"; return; }

        debounceTimer = setTimeout(function() {
            fetch("https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(query) + "&countrycodes=za&limit=5&addressdetails=1", {
                headers: { "Accept-Language": "en" }
            })
            .then(function(res) { return res.json(); })
            .then(function(results) {
                dropdown.innerHTML = "";
                if (!results.length) { dropdown.style.display = "none"; return; }
                results.forEach(function(result) {

    const address = result.display_name.toLowerCase();

    // Johannesburg-only filter (soft geofence)
    const isJoburg =
        address.includes("johannesburg") ||
        address.includes("sandton") ||
        address.includes("soweto") ||
        address.includes("randburg") ||
        address.includes("roodepoort") ||
        address.includes("midrand") ||
        address.includes("alexandra") ||
        address.includes("lenasia");

    if (!isJoburg) return; // skip non-Joburg results

    const item = document.createElement("div");

    item.textContent = result.display_name;

    item.style.cssText =
        "padding:10px 14px;color:#C8C8C8;font-size:13px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);";

    item.addEventListener("mouseenter", function() {
        this.style.background = "rgba(245,197,24,0.1)";
        this.style.color = "#F5C518";
    });

    item.addEventListener("mouseleave", function() {
        this.style.background = "";
        this.style.color = "#C8C8C8";
    });

    item.addEventListener("click", function() {

        // set address
        input.value = result.display_name;

        // store coordinates (IMPORTANT for backend validation)
        document.getElementById("issueLat").value = result.lat;
        document.getElementById("issueLng").value = result.lon;

        dropdown.style.display = "none";
    });

    dropdown.appendChild(item);
});

dropdown.style.display = "block";
})
.catch(function() {
    dropdown.style.display = "none";
});
}, 400);
});

// close dropdown when clicking outside
document.addEventListener("click", function(e) {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
    }
});
}

// initialize
window.addEventListener("load", function() {
    setupAddressAutocomplete();
});
