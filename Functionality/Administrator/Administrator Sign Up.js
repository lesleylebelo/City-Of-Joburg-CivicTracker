//Administrator Sign Up form validation

document.getElementById("Admin-SignUp-Form").addEventListener("submit", function(e) {
    e.preventDefault();

    let employeeFullNames = document.getElementById("fnames").value.trim();
    let employeeEmail = document.getElementById("empEmail").value.trim();
    let employeeNumber = document.getElementById("empNumber").value.trim();
    let employeePassword = document.getElementById("empPassword").value;
    let employeeConfirmPassword = document.getElementById("empConfirmPassword").value;
    let employeeError = document.getElementById("Admin-SignUp-Error");

    //Validates all fields boxes to be filled
    if (employeeFullNames === "" || employeeEmail === "" || employeeNumber === "" || employeePassword === "" || employeeConfirmPassword === "") {
        employeeError.textContent = "Fields must be filled!";
        return;
    }

    //Validates Email format
    let emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

    if (!emailPattern.test(employeeEmail)) {
        employeeError.textContent = "Enter a valid email";
        return;
    } 

    //Validates Employee Number
    if (isNaN(employeeNumber) || employeeNumber <= 0) {
        employeeError.textContent = "Enter a positve numeric value!";
        return;
    } 

    //Validates Employee Password
    let passPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

     if(!passPattern.test(employeePassword)) {
        employeeError.textContent = "Password must contain at least one uppercase letter and one number!";
        return;
    }

    //Validates password confirmation
    if (employeeConfirmPassword !== employeePassword) {
        employeeError.textContent = "Passwords do not match!";
        return;
    } 

    //Form is submitted if all validations passed
    employeeError.textContent = "";
    alert("Sign Up Successful!")
})