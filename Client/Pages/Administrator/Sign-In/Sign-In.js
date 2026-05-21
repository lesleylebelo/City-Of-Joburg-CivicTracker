document.getElementById("Admin-SignIn-Form").addEventListener("submit", async function(e) {
    e.preventDefault();

    const employeeNumber   = document.getElementById("empNum").value.trim();
    const employeePassword = document.getElementById("empPassword").value;
    const errorMsg         = document.getElementById("Admin-Login-Error");

    if (employeeNumber === "" || employeePassword === "") {
        errorMsg.textContent = "All fields are required!";
        return;
    }

    if (isNaN(employeeNumber) || Number(employeeNumber) <= 0) {
        errorMsg.textContent = "Employee Number must be a positive numeric value!";
        return;
    }

    if (employeePassword.length < 8) {
        errorMsg.textContent = "Password must be at least 8 characters!";
        return;
    }

    errorMsg.style.color = "#F5C518";
    errorMsg.textContent = "Signing in...";

    try {
        const response = await fetch("/api/auth/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee_number: employeeNumber, password: employeePassword })
        });

        const data = await response.json();

        if (!response.ok) {
            errorMsg.style.color = "#FF5252";
            errorMsg.textContent = data.message || "Login failed!";
            return;
        }

        // Save token and admin info
        localStorage.setItem("civictrack_token", data.token);
        localStorage.setItem("civictrack_user",  JSON.stringify(data.admin));

        errorMsg.style.color = "#4CAF50";
        errorMsg.textContent = "Login successful! Redirecting...";

        setTimeout(() => {
            window.location.href = "Admin_Dashboard.html";
        }, 1000);

    } catch (err) {
        errorMsg.style.color = "#FF5252";
        errorMsg.textContent = "Could not connect to server. Please try again.";
    }
});