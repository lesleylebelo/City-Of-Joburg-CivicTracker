/* Shared browser session. Authorization and role checks always happen on Express. */
(() => {
    'use strict';
    const script = document.currentScript;
    const siteRoot = new URL('../../', script.src);
    const signInUrl = new URL('Pages/Public/Sign-In/Sign-In.html', siteRoot).href;
    const dashboardUrl = role => new URL(`Pages/${role === 'admin' ? 'Administrator' : 'Resident'}/Dashboard/Dashboard.html`, siteRoot).href;
    const photoUrls = new Set();
    let expiryTimer;
    const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

    function clear() {
        localStorage.removeItem('civictrack_token');
        localStorage.removeItem('civictrack_user');
        clearTimeout(expiryTimer);
        photoUrls.forEach(url => URL.revokeObjectURL(url));
        photoUrls.clear();
    }

    function signOut() {
        clear();
        window.location.replace(signInUrl);
    }

    async function authenticatedFetch(url, options = {}) {
        const target = window.CivicConfig.apiUrl(url);
        const headers = new Headers(options.headers);
        const token = localStorage.getItem('civictrack_token');
        if (token) headers.set('Authorization', `Bearer ${token}`);
        const response = await fetch(target, { ...options, headers, cache: 'no-store', credentials: 'omit', redirect: 'error' });
        if (response.status === 401) signOut();
        return response;
    }

    async function requireRole(role) {
        if (!localStorage.getItem('civictrack_token')) { signOut(); return null; }
        const response = await authenticatedFetch('/api/auth/session');
        if (response.status === 401) return null;
        if (!response.ok) throw new Error('Session verification unavailable');
        const session = await response.json();
        if (!session.user || !['resident', 'admin'].includes(session.user.role) ||
            !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= Date.now()) {
            signOut();
            return null;
        }
        // Use the server response, never a role or name read from localStorage.
        if (session.user.role !== role) {
            window.location.replace(dashboardUrl(session.user.role));
            return null;
        }
        localStorage.setItem('civictrack_user', JSON.stringify(session.user));
        expiryTimer = setTimeout(signOut, Math.min(session.expires_at * 1000 - Date.now(), 2147483647));
        return session.user;
    }

    async function loadReportImages(container) {
        photoUrls.forEach(url => URL.revokeObjectURL(url));
        photoUrls.clear();
        await Promise.all([...container.querySelectorAll('[data-report-image]')].map(async image => {
            try {
                const target = window.CivicConfig.apiUrl(image.dataset.reportImage);
                if (!target.pathname.startsWith('/uploads/')) return;
                const response = await authenticatedFetch(target.href);
                if (!response.ok) throw new Error('Photo unavailable');
                const blob = await response.blob();
                if (!blob.type.startsWith('image/')) throw new Error('Invalid photo');
                const url = URL.createObjectURL(blob);
                photoUrls.add(url);
                image.src = url;
            } catch {
                image.alt = 'Issue photo unavailable';
            }
        }));
    }

    window.CivicSession = { clear, signOut, fetch: authenticatedFetch, requireRole, dashboardUrl, signInUrl, loadReportImages, escapeHTML };
    window.addEventListener('storage', event => {
        if (event.key === 'civictrack_token' || event.key === null) window.location.reload();
    });
    window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });

    if (script.dataset.role) {
        requireRole(script.dataset.role).then(user => {
            if (!user) return;
            window.CivicSession.user = user;
            const dashboard = document.createElement('script');
            dashboard.src = new URL(script.dataset.dashboard, window.location.href).href;
            dashboard.onload = () => document.documentElement.classList.remove('session-pending');
            dashboard.onerror = showUnavailable;
            document.body.append(dashboard);
        }).catch(showUnavailable);
    }

    function showUnavailable() {
        document.documentElement.classList.remove('session-pending');
        const message = document.createElement('p');
        message.textContent = 'We could not verify your session. Please try again when the service is available.';
        const retry = document.createElement('button');
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => window.location.reload());
        const signIn = document.createElement('a');
        signIn.href = signInUrl;
        signIn.textContent = 'Return to sign in';
        document.body.replaceChildren(message, retry, signIn);
    }
})();
