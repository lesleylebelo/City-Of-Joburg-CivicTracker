/* The only public API-origin setting. Empty means the frontend's own origin.
 * For a separate API host, replace '' with its exact https://hostname[:port].
 * This is public configuration: never put credentials here. No path or wildcard.
 */
(() => {
    'use strict';
    const API_BASE_URL = '';
    const base = new URL(API_BASE_URL || window.location.origin);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
        base.pathname !== '/' || base.search || base.hash) throw new Error('Invalid API origin');

    function apiUrl(value) {
        const target = new URL(value, base.origin);
        if (target.origin !== base.origin || target.username || target.password ||
            !/^\/(api(?:\/|$)|uploads\/)/.test(target.pathname)) throw new Error('Invalid API origin');
        return target;
    }
    window.CivicConfig = Object.freeze({ apiBaseUrl: base.origin, apiUrl });
})();
