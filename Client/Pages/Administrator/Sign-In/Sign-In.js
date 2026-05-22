// =============================================
// CIVICTRACK - ADMINISTRATOR SIGN IN
// =============================================

// ─────────────────────────────────────────────
// FORM ELEMENTS
// ─────────────────────────────────────────────
const form = document.getElementById("Admin-SignIn-Form");

const empNum = document.getElementById("empNum");
const empPassword = document.getElementById("empPassword");
const errorMsg = document.getElementById("Admin-Login-Error");

const submitBtn = form.querySelector("button[type='submit']");

// ─────────────────────────────────────────────
// VALID STATE MANAGEMENT
// ─────────────────────────────────────────────
let validState = {
    empNum: false,
    password: false
};

function setState(input, isValid) {
    input.classList.remove("valid", "invalid");
    input.classList.add(isValid ? "valid" : "invalid");
}

function updateSubmitState() {
    const allValid = validState.empNum && validState.password;
    submitBtn.disabled = !allValid;
    
    if (allValid) {
        submitBtn.classList.remove("disabled");
    } else {
        submitBtn.classList.add("disabled");
    }
}

// ─────────────────────────────────────────────
// GLOBAL FEEDBACK SYSTEM
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
// LIVE VALIDATION LISTENERS
// ─────────────────────────────────────────────

// EMPLOYEE NUMBER
empNum.addEventListener("input", () => {
    const value = Number(empNum.value.trim());
    
    validState.empNum = !isNaN(value) && value > 0 && empNum.value.trim() !== "";
    setState(empNum, validState.empNum);
    updateSubmitState();
});

// PASSWORD
empPassword.addEventListener("input", () => {
    validState.password = empPassword.value.length >= 8;
    setState(empPassword, validState.password);
    updateSubmitState();
});

// ─────────────────────────────────────────────
// FORM SUBMISSION PROCESS
// ─────────────────────────────────────────────
form.addEventListener("submit", async function(e) {
    e.preventDefault();

    const employeeNumber   = empNum.value.trim();
    const employeePassword = empPassword.value;

    if (!employeeNumber || !employeePassword) {
        showFeedback("All fields are required!", "error");
        return;
    }

    if (!validState.empNum || !validState.password) {
        showFeedback("Fix validation errors before continuing", "error");
        return;
    }

    showFeedback("Signing you in...", "info");

    try {
        const response = await fetch("/api/auth/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee_number: employeeNumber, password: employeePassword })
        });

        const data = await response.json();

        if (!response.ok) {
            showFeedback(data.message || "Login failed!", "error");
            return;
        }

        // Save session authentication state
        localStorage.setItem("civictrack_token", data.token);
        localStorage.setItem("civictrack_user",  JSON.stringify(data.admin));

        showFeedback("Login successful! Redirecting...", "success");

        setTimeout(() => {
            // Updated to use consistent path strategy matching your architecture
            window.location.href = "/Pages/Administrator/Dashboard/Dashboard.html";
        }, 1200);

    } catch (err) {
        showFeedback("Could not connect to server. Please try again.", "error");
    }
});

// INITIALIZE INTERFACE STATE
updateSubmitState();
