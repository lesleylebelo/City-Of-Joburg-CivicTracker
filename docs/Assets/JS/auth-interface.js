/* Presentation shared by sign-in, registration and recovery. */
(() => {
    'use strict';
    document.querySelectorAll('[data-password-toggle]').forEach(button => {
        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;
        button.addEventListener('click', () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.textContent = show ? 'Hide' : 'Show';
            button.setAttribute('aria-pressed', String(show));
            button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${input.dataset.passwordLabel || 'password'}`);
        });
    });
    // Returning through history never leaves a password revealed.
    window.addEventListener('pagehide', () => {
        document.querySelectorAll('[data-password-toggle]').forEach(button => {
            const input = document.getElementById(button.dataset.passwordToggle);
            if (!input) return;
            input.type = 'password';
            input.value = '';
            button.textContent = 'Show';
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-label', `Show ${input.dataset.passwordLabel || 'password'}`);
        });
    });
})();
