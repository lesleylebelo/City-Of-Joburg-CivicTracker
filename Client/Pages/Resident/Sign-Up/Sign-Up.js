
// ─────────────────────────────────────────────
// GLOBAL FEEDBACK SYSTEM (TOAST)
// ─────────────────────────────────────────────
function showFeedback(message, type = "info", duration = 2500) {
    let el = document.querySelector(".civic-feedback");

    if (!el) {
        el = document.createElement("div");
        el.className = "civic-feedback";
        document.body.appendChild(el);
    }

    el.textContent = message;
    el.className = `civic-feedback ${type}`;

    requestAnimationFrame(() => el.classList.add("show"));

    setTimeout(() => {
        el.classList.remove("show");
    }, duration);
}

// ─────────────────────────────────────────────
// FORM ELEMENTS
// ─────────────────────────────────────────────
const form = document.getElementById("Resident-SignUp-Form");

const resFullNames = document.getElementById("resFullNames");
const resEmail = document.getElementById("resEmail");
const resPhone = document.getElementById("resPhone");
const resPassword = document.getElementById("resPassword");
const resConfirmPassword = document.getElementById("resConfirmPassword");

const submitBtn = form.querySelector("button[type='submit']");

// ─────────────────────────────────────────────
// PATTERNS
// ─────────────────────────────────────────────
const namePattern = /^[a-zA-Z\s]{2,}$/;
const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
const phonePattern = /^0[6-8][0-9]{8}$/;
const passPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

// ─────────────────────────────────────────────
// ERROR ELEMENTS (INLINE)
// ─────────────────────────────────────────────
function createErrorEl(input) {
    let el = document.createElement("small");
    el.style.color = "#FF5252";
    el.style.display = "block";
    el.style.marginTop = "4px";
    input.parentNode.appendChild(el);
    return el;
}

const nameError = createErrorEl(resFullNames);
const emailError = createErrorEl(resEmail);
const phoneError = createErrorEl(resPhone);
const passError = createErrorEl(resPassword);
const confirmError = createErrorEl(resConfirmPassword);

// ─────────────────────────────────────────────
// PASSWORD STRENGTH
// ─────────────────────────────────────────────
const strengthEl = document.createElement("small");
strengthEl.style.display = "block";
strengthEl.style.marginTop = "4px";
resPassword.parentNode.appendChild(strengthEl);

function getStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*]/.test(password)) score++;
    return score;
}

// ─────────────────────────────────────────────
// VALID STATE
// ─────────────────────────────────────────────
let validState = {
    name: false,
    email: false,
    phone: false,
    password: false,
    confirm: false
};

function setBorder(input, isValid) {
    input.style.border = isValid
        ? "2px solid #4CAF50"
        : "2px solid #FF5252";
}

function updateSubmitState() {
    const allValid = Object.values(validState).every(Boolean);
    submitBtn.disabled = !allValid;
    submitBtn.style.opacity = allValid ? "1" : "0.5";
    submitBtn.style.cursor = allValid ? "pointer" : "not-allowed";
}

// ─────────────────────────────────────────────
// LIVE VALIDATION
// ─────────────────────────────────────────────

// NAME
resFullNames.addEventListener("input", () => {
    const value = resFullNames.value.trim();

    validState.name =
        namePattern.test(value) &&
        value.split(" ").filter(Boolean).length >= 2;

    nameError.textContent = validState.name ? "" : "Enter first and last name";
    setBorder(resFullNames, validState.name);

    updateSubmitState();
});

// EMAIL
resEmail.addEventListener("input", () => {
    validState.email = emailPattern.test(resEmail.value.trim());

    emailError.textContent = validState.email ? "" : "Invalid email format";
    setBorder(resEmail, validState.email);

    updateSubmitState();
});

// PHONE
resPhone.addEventListener("input", () => {
    const value = resPhone.value.replace(/\s/g, "");

    validState.phone = phonePattern.test(value);

    phoneError.textContent = validState.phone
        ? ""
        : "Use SA format e.g. 0821234567";

    setBorder(resPhone, validState.phone);

    updateSubmitState();
});

// PASSWORD
resPassword.addEventListener("input", () => {
    const value = resPassword.value;

    validState.password = passPattern.test(value);

    const strength = getStrength(value);

    const levels = ["Weak", "Weak", "Fair", "Good", "Strong"];
    strengthEl.textContent = `Strength: ${levels[strength]}`;

    passError.textContent = validState.password
        ? ""
        : "Min 8 chars, 1 uppercase, 1 number";

    setBorder(resPassword, validState.password);

    updateSubmitState();
});

// CONFIRM PASSWORD
resConfirmPassword.addEventListener("input", () => {
    validState.confirm = resConfirmPassword.value === resPassword.value;

    confirmError.textContent = validState.confirm
        ? ""
        : "Passwords do not match";

    setBorder(resConfirmPassword, validState.confirm);

    updateSubmitState();
});

// ─────────────────────────────────────────────
// SUBMIT
// ─────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const resFullNamesVal = resFullNames.value.trim();
    const resEmailVal = resEmail.value.trim();
    const resPhoneVal = resPhone.value.trim();
    const resPasswordVal = resPassword.value;

    if (!Object.values(validState).every(Boolean)) {
        showFeedback("Please fix validation errors before submitting.", "error");
        return;
    }

    showFeedback("Creating your account...", "info");

    try {
        const response = await fetch("/api/auth/resident/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_names: resFullNamesVal,
                email: resEmailVal,
                phone_number: resPhoneVal,
                password: resPasswordVal
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showFeedback(data.message || "Registration failed.", "error");
            return;
        }

        showFeedback("Account created successfully!", "success");

        setTimeout(() => {
            window.location.href = "Resident_Sign_In.html";
        }, 1500);

    } catch (err) {
        showFeedback("Could not connect to server.", "error");
    }
});

// INIT
updateSubmitState();