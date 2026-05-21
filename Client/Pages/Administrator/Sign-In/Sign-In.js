document.getElementById("Admin-SignIn-Form").addEventListener("submit", function(e) {
    e.preventDefault();

    const employeeNumber = document.getElementById("empNum").value.trim();
    const employeePassword = document.getElementById("empPassword").value;
    const errorMsg = document.getElementById("Admin-Login-Error");

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

    errorMsg.textContent = "";
    alert("Login Successful!");
});