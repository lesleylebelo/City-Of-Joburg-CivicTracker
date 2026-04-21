// =============================================
// CIVICTRACK - RESIDENT FORGOT PASSWORD
// 3-Step Flow: Email → OTP → New Password
// =============================================

// ── Element references ──
const stepEmail  = document.getElementById("step-email");
const stepOtp    = document.getElementById("step-otp");
const stepReset  = document.getElementById("step-reset");

const sendCodeBtn    = document.getElementById("Send-Code-Btn");
const verifyCodeBtn  = document.getElementById("Verify-Code-Btn");
const resendLink     = document.getElementById("Resend-Code-Link");
const forgotForm     = document.getElementById("Forgot-Password-Form");

const errorMsg   = document.getElementById("Forgot-Password-Error");
const successMsg = document.getElementById("Forgot-Password-Success");

// Simulated OTP (in a real app this comes from the backend)
let generatedOtp = "";
let submittedEmail = "";

// ── Helper: show/hide steps ──
function showStep(stepToShow) {
    stepEmail.style.display  = "none";
    stepOtp.style.display    = "none";
    stepReset.style.display  = "none";
    stepToShow.style.display = "block";
}

// ── Helper: clear messages ──
function clearMessages() {
    errorMsg.textContent   = "";
    successMsg.textContent = "";
}

// ── Helper: generate a 6-digit OTP ──
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── STEP 1: Send Reset Code ──
sendCodeBtn.addEventListener("click", function () {
    clearMessages();

    const email = document.getElementById("forgotEmail").value.trim();
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

    if (email === "") {
        errorMsg.textContent = "Please enter your email address!";
        return;
    }

    if (!emailPattern.test(email)) {
        errorMsg.textContent = "Please enter a valid email address!";
        return;
    }

    // Simulate sending OTP
    submittedEmail = email;
    generatedOtp = generateOtp();

    // In a real application, the OTP would be sent via backend/email service.
    // For development/demo purposes, we display it in the console.
    console.log("DEBUG - OTP for " + email + ": " + generatedOtp);

    successMsg.textContent = "A reset code has been sent to " + email;
    showStep(stepOtp);
});

// ── STEP 2: Verify OTP ──
verifyCodeBtn.addEventListener("click", function () {
    clearMessages();

    const enteredOtp = document.getElementById("otpCode").value.trim();

    if (enteredOtp === "") {
        errorMsg.textContent = "Please enter the verification code!";
        return;
    }

    if (enteredOtp.length !== 6 || isNaN(enteredOtp)) {
        errorMsg.textContent = "Code must be a 6-digit number!";
        return;
    }

    if (enteredOtp !== generatedOtp) {
        errorMsg.textContent = "Incorrect code. Please try again!";
        return;
    }

    successMsg.textContent = "Code verified. Set your new password below.";
    showStep(stepReset);
});

// ── Resend OTP ──
resendLink.addEventListener("click", function (e) {
    e.preventDefault();
    clearMessages();

    generatedOtp = generateOtp();
    console.log("DEBUG - Resent OTP for " + submittedEmail + ": " + generatedOtp);

    successMsg.textContent = "A new code has been sent to " + submittedEmail;
});

// ── STEP 3: Reset Password ──
forgotForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearMessages();

    const newPassword     = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;

    if (newPassword === "" || confirmPassword === "") {
        errorMsg.textContent = "Both password fields are required!";
        return;
    }

    const passPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passPattern.test(newPassword)) {
        errorMsg.textContent = "Password must be at least 8 characters with one uppercase letter and one number!";
        return;
    }

    if (newPassword !== confirmPassword) {
        errorMsg.textContent = "Passwords do not match!";
        return;
    }

    // Password reset successful
    successMsg.textContent = "Password reset successful! Redirecting to sign in...";

    setTimeout(function () {
        window.location.href = "Resident Sign In.html";
    }, 2000);
});
