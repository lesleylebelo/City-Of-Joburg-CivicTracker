/* Navigation presentation only; authentication and API guards remain unchanged. */
(() => {
    'use strict';
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main-wrapper');
    const toggle = document.getElementById('sidebar-toggle');
    const close = document.getElementById('sidebar-close');
    const backdrop = document.getElementById('sidebar-backdrop');
    const label = document.getElementById('sidebar-toggle-label');
    if (!sidebar || !main || !toggle || !close || !backdrop || !label) return;
    const mobile = window.matchMedia('(max-width:760px)');
    let desktopOpen = true;
    let open = !mobile.matches;
    function render() {
        const modal = mobile.matches && open;
        document.body.classList.toggle('sidebar-open', open);
        sidebar.inert = !open;
        sidebar.setAttribute('aria-hidden', String(!open));
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Hide navigation menu' : 'Show navigation menu');
        label.textContent = open ? 'Hide menu' : 'Menu';
        backdrop.hidden = !modal;
        main.inert = modal;
        if (modal) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); }
        else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); }
    }
    function setOpen(value, focus = 'toggle') {
        open = value;
        if (!mobile.matches) desktopOpen = value;
        render();
        if (open && mobile.matches) close.focus();
        else if (!open && focus === 'page') document.getElementById('page-title')?.focus({ preventScroll:true });
        else if (!open) toggle.focus();
    }
    document.body.classList.add('sidebar-ready');
    render();
    toggle.addEventListener('click', () => setOpen(!open));
    close.addEventListener('click', () => setOpen(false));
    backdrop.addEventListener('click', () => setOpen(false));
    sidebar.addEventListener('click', event => {
        if (mobile.matches && event.target.closest('[data-section]')) setOpen(false, 'page');
    });
    document.addEventListener('keydown', event => {
        if (!open) return;
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
        if (!mobile.matches || event.key !== 'Tab') return;
        const controls = [...sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')]
            .filter(element => !element.hidden && !element.closest('[hidden]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    mobile.addEventListener('change', () => {
        const focusWasInSidebar = sidebar.contains(document.activeElement);
        open = mobile.matches ? false : desktopOpen;
        render();
        if (!open && focusWasInSidebar) toggle.focus();
    });
})();
