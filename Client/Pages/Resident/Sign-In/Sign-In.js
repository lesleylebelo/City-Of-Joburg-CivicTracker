// ─────────────────────────────────────────────
// FORM ELEMENTS
// ─────────────────────────────────────────────
const form = document.getElementById("Resident-SignIn-Form");

const resEmail = document.getElementById("resEmail");
const resPassword = document.getElementById("resPassword");
const errorMsg = document.getElementById("Resident-Login-Error");

const submitBtn = form.querySelector("button[type='submit']");

// ─────────────────────────────────────────────
// PATTERN
// ─────────────────────────────────────────────
const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

// ─────────────────────────────────────────────
// VALID STATE
// ─────────────────────────────────────────────
let validState = {
    email: false,
    password: false
};

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function setState(input, isValid) {
    input.classList.remove("valid", "invalid");
    input.classList.add(isValid ? "valid" : "invalid");
}

function updateSubmitState() {
    const allValid = validState.email && validState.password;
    submitBtn.disabled = !allValid;
    
    if (allValid) {
        submitBtn.classList.remove("disabled");
    } else {
        submitBtn.classList.add("disabled");
    }
}

// ─────────────────────────────────────────────
// GLOBAL FEEDBACK (CENTER SCREEN)
// ─────────────────────────────────────────────
function showFeedback(message, type = "info") {
    let el = document.querySelector(".civic-feedback");

    if (!el) {
        el = document.createElement("div");
        el.className = "civic-feedback";
        document.body.appendChild(el);
    }

    el.textContent = message;
    el.className = `civic-feedback ${type} show`;

    setTimeout(() => {
        el.classList.remove("show");
    }, 2200);
}

// ─────────────────────────────────────────────
// LIVE EMAIL VALIDATION
// ─────────────────────────────────────────────
resEmail.addEventListener("input", () => {
    validState.email = emailPattern.test(resEmail.value.trim());
    setState(resEmail, validState.email);
    updateSubmitState();
});

// ─────────────────────────────────────────────
// LIVE PASSWORD VALIDATION
// ─────────────────────────────────────────────
resPassword.addEventListener("input", () => {
    validState.password = resPassword.value.length >= 8;
    setState(resPassword, validState.password);
    updateSubmitState();
});

// ─────────────────────────────────────────────
// SUBMIT
// ─────────────────────────────────────────────
form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = resEmail.value.trim();
    const password = resPassword.value;

    if (!email || !password) {
        showFeedback("All fields are required", "error");
        return;
    }

    if (!validState.email || !validState.password) {
        showFeedback("Fix validation errors before continuing", "error");
        return;
    }

    showFeedback("Signing you in...", "info");

    try {
        const response = await fetch("/api/auth/resident/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showFeedback(data.message || "Login failed", "error");
            return;
        }

        // Save auth data locally
        localStorage.setItem("civictrack_token", data.token);
        localStorage.setItem("civictrack_user", JSON.stringify(data.resident));

        showFeedback("Welcome back. Login successful.", "success");

        setTimeout(() => {
            // Update this path to match your exact Resident Dashboard layout folder if needed
            window.location.href = "/Pages/Resident/Dashboard/Dashboard.html";
        }, 1200);

    } catch (err) {
        showFeedback("Server not reachable. Try again later.", "error");
    }
});

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
updateSubmitState();
