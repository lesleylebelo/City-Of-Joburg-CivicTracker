// Resident Sign Up Form Validation

document.getElementById("Resident-SignUp-Form").addEventListener("submit", function(e) {
    e.preventDefault();

    const resFullNames = document.getElementById("resFullNames").value.trim();
    const resEmail = document.getElementById("resEmail").value.trim();
    const resPhone = document.getElementById("resPhone").value.trim();
    const resPassword = document.getElementById("resPassword").value;
    const resConfirmPassword = document.getElementById("resConfirmPassword").value;
    const errorMsg = document.getElementById("Resident-SignUp-Error");

    // Validate all fields are filled
    if (resFullNames === "" || resEmail === "" || resPhone === "" || resPassword === "" || resConfirmPassword === "") {
        errorMsg.textContent = "All fields must be filled!";
        return;
    }

    // Validate full names (letters and spaces only, at least two words)
    const namePattern = /^[a-zA-Z\s]{2,}$/;
    if (!namePattern.test(resFullNames) || resFullNames.split(" ").filter(w => w.length > 0).length < 2) {
        errorMsg.textContent = "Please enter your full name (first and last name)!";
        return;
    }

    // Validate email format
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailPattern.test(resEmail)) {
        errorMsg.textContent = "Please enter a valid email address!";
        return;
    }

    // Validate South African phone number (10 digits, starting with 0)
    const phonePattern = /^0[6-8][0-9]{8}$/;
    if (!phonePattern.test(resPhone.replace(/\s/g, ""))) {
        errorMsg.textContent = "Please enter a valid South African phone number (e.g. 0821234567)!";
        return;
    }

    // Validate password strength
    const passPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passPattern.test(resPassword)) {
        errorMsg.textContent = "Password must be at least 8 characters with one uppercase letter and one number!";
        return;
    }

    // Validate password confirmation
    if (resPassword !== resConfirmPassword) {
        errorMsg.textContent = "Passwords do not match!";
        return;
    }

    // All validations passed
    errorMsg.textContent = "";
    alert("Account created successfully! Welcome to CivicTrack.");
});
