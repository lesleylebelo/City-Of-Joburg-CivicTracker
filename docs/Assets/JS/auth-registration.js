(() => {
    'use strict';
    const form = document.getElementById('registration-form');
    const feedback = document.getElementById('registration-feedback');
    const button = document.getElementById('registration-button');
    const password = document.getElementById('new-password');
    const confirmation = document.getElementById('confirm-password');
    const activation = form.dataset.registration === 'activation';
    const passwordHelp = document.getElementById('password-help');
    password.setAttribute('aria-describedby', passwordHelp.id);
    const validatePasswords = () => {
        password.setCustomValidity(password.value && !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password.value)
            ? 'Use at least 8 characters, including an uppercase letter and a number.' : '');
        confirmation.setCustomValidity(confirmation.value && confirmation.value !== password.value ? 'Passwords do not match.' : '');
    };
    password.addEventListener('input', validatePasswords);
    confirmation.addEventListener('input', validatePasswords);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        validatePasswords();
        if (button.disabled || !form.reportValidity()) return;
        const body = {
            full_names: document.getElementById('full-names').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: password.value
        };
        if (!body.full_names) { feedback.dataset.state = 'error'; feedback.textContent = 'Enter your full name.'; return; }
        if (activation) body.employee_number = document.getElementById('access-id').value.trim();
        else body.phone_number = document.getElementById('phone').value.trim();
        if (!(activation ? body.employee_number : body.phone_number)) {
            feedback.dataset.state = 'error'; feedback.textContent = 'Please complete all fields.'; return;
        }
        button.disabled = true;
        form.setAttribute('aria-busy', 'true');
        feedback.dataset.state = 'pending';
        feedback.textContent = 'Setting up your account…';
        try {
            const response = await fetch(window.CivicConfig.apiUrl(activation ? '/api/auth/admin/register' : '/api/auth/resident/register'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', credentials: 'omit', redirect: 'error'
            });
            if (!response.ok) {
                feedback.dataset.state = 'error';
                feedback.textContent = response.status >= 500 || response.status === 404 || response.status === 405
                    ? 'Account setup is unavailable here. Please use the running CivicTrack application and try again.'
                    : 'Unable to set up this account. Check your details or contact project support.';
                return;
            }
            feedback.dataset.state = 'success';
            feedback.textContent = 'Your account is ready. Please sign in.';
            form.reset();
            window.location.replace(new URL('../Sign-In/Sign-In.html', window.location.href).href);
        } catch {
            feedback.dataset.state = 'error';
            feedback.textContent = 'Could not reach the account service. Please try again.';
        } finally {
            button.disabled = false;
            form.removeAttribute('aria-busy');
        }
    });
})();
