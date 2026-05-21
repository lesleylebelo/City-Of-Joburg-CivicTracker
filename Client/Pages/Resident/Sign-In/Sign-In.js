// Resident Sign In Form Validation

document.getElementById("Resident-SignIn-Form").addEventListener("submit", function(e) {
    e.preventDefault();

    const resEmail = document.getElementById("resEmail").value.trim();
    const resPassword = document.getElementById("resPassword").value;
    const errorMsg = document.getElementById("Resident-Login-Error");

    // Validate all fields are filled
    if (resEmail === "" || resPassword === "") {
        errorMsg.textContent = "All fields are required!";
        return;
    }

    // Validate email format
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailPattern.test(resEmail)) {
        errorMsg.textContent = "Please enter a valid email address!";
        return;
    }

    // Validate password minimum length
    if (resPassword.length < 8) {
        errorMsg.textContent = "Password must be at least 8 characters!";
        return;
    }

    // All validations passed
    errorMsg.textContent = "";
    alert("Login Successful!");
});
