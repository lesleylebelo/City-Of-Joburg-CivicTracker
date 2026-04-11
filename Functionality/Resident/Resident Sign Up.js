const tabButtons = document.querySelectorAll(".tab-btn");
const formSections = document.querySelectorAll(".form-section");
const switchLinks = document.querySelectorAll(".link-switch");
const showPasswordButtons = document.querySelectorAll(".show-password");

function openTab(tabName) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  formSections.forEach((section) => {
    section.classList.toggle("active", section.id === `${tabName}Form`);
  });

  clearMessages();
}

function clearMessages() {
  document.querySelectorAll(".error").forEach((el) => (el.textContent = ""));
  document.querySelectorAll(".success-msg").forEach((el) => (el.textContent = ""));
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openTab(button.dataset.tab);
  });
});

switchLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    openTab(link.dataset.go);
  });
});

showPasswordButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.target);
    const icon = button.querySelector("i");

    if (input.type === "password") {
      input.type = "text";
      icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
      input.type = "password";
      icon.classList.replace("fa-eye-slash", "fa-eye");
    }
  });
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// LOGIN
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  clearMessages();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const rememberMe = document.getElementById("rememberMe").checked;

  let valid = true;

  if (email === "") {
    document.getElementById("loginEmailError").textContent = "Email is required.";
    valid = false;
  } else if (!isValidEmail(email)) {
    document.getElementById("loginEmailError").textContent = "Enter a valid email.";
    valid = false;
  }

  if (password === "") {
    document.getElementById("loginPasswordError").textContent = "Password is required.";
    valid = false;
  }

  if (valid) {
    if (rememberMe) {
      localStorage.setItem("rememberedEmail", email);
    } else {
      localStorage.removeItem("rememberedEmail");
    }

    document.getElementById("loginSuccess").textContent =
      "Login successful.";
  }
});

// REGISTER
document.getElementById("registerForm").addEventListener("submit", function (e) {
  e.preventDefault();
  clearMessages();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();

  let valid = true;

  if (firstName === "") {
    document.getElementById("firstNameError").textContent = "First name is required.";
    valid = false;
  }

  if (lastName === "") {
    document.getElementById("lastNameError").textContent = "Last name is required.";
    valid = false;
  }

  if (email === "") {
    document.getElementById("registerEmailError").textContent = "Email is required.";
    valid = false;
  } else if (!isValidEmail(email)) {
    document.getElementById("registerEmailError").textContent = "Enter a valid email.";
    valid = false;
  }

  if (password === "") {
    document.getElementById("registerPasswordError").textContent = "Password is required.";
    valid = false;
  } else if (password.length < 6) {
    document.getElementById("registerPasswordError").textContent =
      "Password must be at least 6 characters.";
    valid = false;
  }

  if (confirmPassword === "") {
    document.getElementById("confirmPasswordError").textContent =
      "Please confirm your password.";
    valid = false;
  } else if (password !== confirmPassword) {
    document.getElementById("confirmPasswordError").textContent =
      "Passwords do not match.";
    valid = false;
  }

  if (valid) {
    document.getElementById("registerSuccess").textContent =
      "Registration successful.";
  }
});

// FORGOT PASSWORD
document.getElementById("forgotForm").addEventListener("submit", function (e) {
  e.preventDefault();
  clearMessages();

  const email = document.getElementById("forgotEmail").value.trim();
  let valid = true;

  if (email === "") {
    document.getElementById("forgotEmailError").textContent = "Email is required.";
    valid = false;
  } else if (!isValidEmail(email)) {
    document.getElementById("forgotEmailError").textContent = "Enter a valid email.";
    valid = false;
  }

  if (valid) {
    document.getElementById("forgotSuccess").textContent =
      "Reset link sent to your email.";
  }
});

// REMEMBER ME LOAD
window.addEventListener("load", () => {
  const savedEmail = localStorage.getItem("rememberedEmail");
  if (savedEmail) {
    document.getElementById("loginEmail").value = savedEmail;
    document.getElementById("rememberMe").checked = true;
  }
});
