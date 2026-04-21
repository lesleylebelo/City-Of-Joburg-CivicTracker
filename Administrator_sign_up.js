// =============================================
// CIVICTRACK - ADMINISTRATOR SIGN UP
// Validates employee number against database
// before allowing registration
// =============================================

document.getElementById("Admin-SignUp-Form").addEventListener("submit", async function(e) {
    e.preventDefault();

    const employeeFullNames     = document.getElementById("fnames").value.trim();
    const employeeEmail         = document.getElementById("empEmail").value.trim();
    const employeeNumber        = document.getElementById("empNumber").value.trim();
    const employeePassword      = document.getElementById("empPassword").value;
    const employeeConfirmPwd    = document.getElementById("empConfirmPassword").value;
    const errorMsg              = document.getElementById("Admin-SignUp-Error");

    // ── Step 1: All fields filled ──
    if (!employeeFullNames || !employeeEmail || !employeeNumber || !employeePassword || !employeeConfirmPwd) {
        errorMsg.textContent = "All fields must be filled!";
        return;
    }

    // ── Step 2: Valid email format ──
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailPattern.test(employeeEmail)) {
        errorMsg.textContent = "Please enter a valid email address!";
        return;
    }

    // ── Step 3: Employee number is numeric and positive ──
    if (isNaN(employeeNumber) || Number(employeeNumber) <= 0) {
        errorMsg.textContent = "Employee Number must be a positive numeric value!";
        return;
    }

    // ── Step 4: Password strength ──
    const passPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passPattern.test(employeePassword)) {
        errorMsg.textContent = "Password must be at least 8 characters with one uppercase letter and one number!";
        return;
    }

    // ── Step 5: Passwords match ──
    if (employeePassword !== employeeConfirmPwd) {
        errorMsg.textContent = "Passwords do not match!";
        return;
    }

    // ── Step 6: Check employee number against database ──
    errorMsg.style.color = "#F5C518";
    errorMsg.textContent = "Verifying employee number...";

    try {
        const response = await fetch("/api/auth/verify-employee", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee_number: employeeNumber })
        });

        const data = await response.json();

        if (!response.ok) {
            errorMsg.style.color = "#FF5252";
            errorMsg.textContent = data.message || "Employee number not recognised!";
            return;
        }

        if (data.is_registered) {
            errorMsg.style.color = "#FF5252";
            errorMsg.textContent = "This employee number already has a registered account!";
            return;
        }

        // ── Step 7: Submit registration ──
        errorMsg.textContent = "Registering your account...";

        const registerResponse = await fetch("/api/auth/admin/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_names:      employeeFullNames,
                email:           employeeEmail,
                employee_number: employeeNumber,
                password:        employeePassword
            })
        });

        const registerData = await registerResponse.json();

        if (!registerResponse.ok) {
            errorMsg.style.color = "#FF5252";
            errorMsg.textContent = registerData.message || "Registration failed. Please try again.";
            return;
        }

        // ── Success ──
        errorMsg.style.color = "#4CAF50";
        errorMsg.textContent = "Account created successfully! Redirecting to sign in...";

        setTimeout(function () {
            window.location.href = "Administrator Sign In.html";
        }, 2000);

    } catch (error) {
        errorMsg.style.color = "#FF5252";
        errorMsg.textContent = "Could not connect to server. Please try again.";
    }
});
