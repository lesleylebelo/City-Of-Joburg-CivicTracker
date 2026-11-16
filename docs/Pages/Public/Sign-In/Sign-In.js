(() => {
    'use strict';
    const form = document.getElementById('sign-in-form');
    const identifier = document.getElementById('identifier');
    const password = document.getElementById('password');
    const feedback = document.getElementById('sign-in-feedback');
    const button = document.getElementById('sign-in-button');
    identifier.setAttribute('aria-describedby', 'identifier-help');
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled || !form.reportValidity()) return;
        button.disabled = true;
        form.setAttribute('aria-busy', 'true');
        feedback.dataset.state = 'pending';
        feedback.textContent = 'Signing in…';
        try {
            CivicSession.clear();
            const response = await fetch('/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: identifier.value.trim(), password: password.value }),
                cache: 'no-store'
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                feedback.dataset.state = 'error';
                feedback.textContent = response.status >= 500 || response.status === 404 || response.status === 405
                    ? 'Sign-in is unavailable here. Please use the running CivicTrack application and try again.'
                    : 'Unable to sign in. Check your details and try again.';
                return;
            }
            if (!data.token || !data.user || !['resident', 'admin'].includes(data.user.role)) throw new Error('Invalid session response');
            localStorage.setItem('civictrack_token', data.token);
            localStorage.setItem('civictrack_user', JSON.stringify(data.user));
            feedback.textContent = 'Signed in. Taking you to your account…';
            window.location.replace(CivicSession.dashboardUrl(data.user.role));
        } catch {
            CivicSession.clear();
            feedback.dataset.state = 'error';
            feedback.textContent = 'Could not reach the sign-in service. Please try again.';
        } finally {
            password.value = '';
            password.type = 'password';
            const reveal = document.querySelector('[data-password-toggle="password"]');
            reveal.textContent = 'Show';
            reveal.setAttribute('aria-pressed', 'false');
            reveal.setAttribute('aria-label', 'Show password');
            button.disabled = false;
            form.removeAttribute('aria-busy');
        }
    });
})();
