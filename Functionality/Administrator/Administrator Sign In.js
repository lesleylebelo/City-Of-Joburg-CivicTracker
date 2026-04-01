//Administrator Sign In Form Validation

document.getElementById("Admin-SignIn-Form").addEventListener("submit", function(e) {
    e.preventDefault();

    let employeeNumber = document.getElementById("empNum").value;
    let employeePassword = document.getElementById("empPassword").value;
    let employeeError = document.getElementById("Admin-Login-Error");

    if (employeeNumber.trim() === "" || employeePassword.trim() === "") {
        employeeError.textContent = "All fields are required!";
    }else  if (isNaN(employeeNumber)) {
        employeeError.textContent = "Employee Number must be numeric!"
    } else {
        employeeError.textContent = "";
        alert("Login Successful!");
    }
});