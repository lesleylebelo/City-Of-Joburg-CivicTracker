// CIVICTRACK - ADMINISTRATOR SIGN UP

// FEEDBACK NOTIFICATION SYSTEM

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

// FORM ELEMENTS

const form = document.getElementById("Admin-SignUp-Form");

const fnames = document.getElementById("fnames");
const empEmail = document.getElementById("empEmail");
const empNumber = document.getElementById("empNumber");
const empPassword = document.getElementById("empPassword");
const empConfirmPassword = document.getElementById("empConfirmPassword");

const submitBtn = document.getElementById("Admin-SignUp-Btn");

// PATTERNS

const namePattern = /^[a-zA-Z\s]{2,}$/;
const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-]{2,6}$/;
const passPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;


// ERROR & STRENGTH ELEMENTS (INLINE CLASSES)

function createErrorEl(input) {
    let el = document.createElement("small");
    el.className = "error-text";
    input.parentNode.appendChild(el);
    return el;
}

const nameError = createErrorEl(fnames);
const emailError = createErrorEl(empEmail);
const empNumError = createErrorEl(empNumber);
const passError = createErrorEl(empPassword);
const confirmError = createErrorEl(empConfirmPassword);

const strengthEl = document.createElement("small");
strengthEl.className = "strength-text";
empPassword.parentNode.appendChild(strengthEl);

// PASSWORD STRENGTH SCORING

function getStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*]/.test(password)) score++;
    return score;
}

// VALID STATE MANAGEMENT

let validState = {
    name: false,
    email: false,
    empNum: false,
    password: false,
    confirm: false
};

function setValidationStatus(input, isValid) {
    if (isValid) {
        input.classList.remove("invalid");
        input.classList.add("valid");
    } else {
        input.classList.remove("valid");
        input.classList.add("invalid");
    }
}

function updateSubmitState() {
    const allValid = Object.values(validState).every(Boolean);
    submitBtn.disabled = !allValid;
    
    if (allValid) {
        submitBtn.classList.remove("disabled");
    } else {
        submitBtn.classList.add("disabled");
    }
}

// LIVE VALIDATION LISTENERS

// FULL NAMES
fnames.addEventListener("input", () => {
    const value = fnames.value.trim();

    validState.name =
        namePattern.test(value) &&
        value.split(" ").filter(Boolean).length >= 2;

    nameError.textContent = validState.name ? "" : "Enter first and last name";
    setValidationStatus(fnames, validState.name);
    updateSubmitState();
});

// EMAIL
empEmail.addEventListener("input", () => {
    validState.email = emailPattern.test(empEmail.value.trim());

    emailError.textContent = validState.email ? "" : "Invalid email format";
    setValidationStatus(empEmail, validState.email);
    updateSubmitState();
});

// EMPLOYEE NUMBER
empNumber.addEventListener("input", () => {
    const value = Number(empNumber.value.trim());

    validState.empNum = !isNaN(value) && value > 0 && empNumber.value.trim() !== "";

    empNumError.textContent = validState.empNum
        ? ""
        : "Employee Number must be a positive number";

    setValidationStatus(empNumber, validState.empNum);
    updateSubmitState();
});

// PASSWORD
empPassword.addEventListener("input", () => {
    const value = empPassword.value;

    validState.password = passPattern.test(value);

    const strength = getStrength(value);
    const levels = ["Weak", "Weak", "Fair", "Good", "Strong"];
    
    strengthEl.textContent = value ? `Strength: ${levels[strength]}` : "";
    strengthEl.className = `strength-text strength-${levels[strength].toLowerCase()}`;

    passError.textContent = validState.password
        ? ""
        : "Min 8 chars, 1 uppercase, 1 number";

    setValidationStatus(empPassword, validState.password);
    
    if (empConfirmPassword.value) {
        validState.confirm = empConfirmPassword.value === value;
        confirmError.textContent = validState.confirm ? "" : "Passwords do not match";
        setValidationStatus(empConfirmPassword, validState.confirm);
    }

    updateSubmitState();
});

// CONFIRM PASSWORD
empConfirmPassword.addEventListener("input", () => {
    validState.confirm = empConfirmPassword.value === empPassword.value;

    confirmError.textContent = validState.confirm
        ? ""
        : "Passwords do not match";

    setValidationStatus(empConfirmPassword, validState.confirm);
    updateSubmitState();
});

// FORM SUBMISSION PROCESS

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!Object.values(validState).every(Boolean)) {
        showFeedback("Please fix validation errors before submitting.", "error");
        return;
    }

    showFeedback("Verifying employee number...", "info");

    const employeeFullNames = fnames.value.trim();
    const employeeEmail = empEmail.value.trim();
    const employeeNumber = empNumber.value.trim();
    const employeePassword = empPassword.value;

    try {
        // Step 1: Verify employee number against database
        const response = await fetch("/api/auth/verify-employee", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee_number: employeeNumber })
        });

        const data = await response.json();

        if (!response.ok) {
            showFeedback(data.message || "Employee number not recognised!", "error");
            return;
        }

        if (data.is_registered) {
            showFeedback("This employee number already has a registered account!", "error");
            return;
        }

        // Step 2: Submit registration
        showFeedback("Registering your account...", "info");

        const registerResponse = await fetch("/api/auth/admin/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_names: employeeFullNames,
                email: employeeEmail,
                employee_number: employeeNumber,
                password: employeePassword
            })
        });

        const registerData = await registerResponse.json();

        if (!registerResponse.ok) {
            showFeedback(registerData.message || "Registration failed. Please try again.", "error");
            return;
        }

        // Success Workflow
        showFeedback("Account created successfully! Redirecting...", "success", 2500);

        setTimeout(() => {
            window.location.href = "/Pages/Administrator/Sign-In/Sign-In.html";
        }, 2500);

    } catch (error) {
        showFeedback("Could not connect to server. Please try again.", "error");
    }
});

// INITIALIZE SYSTEM STATE
updateSubmitState();
