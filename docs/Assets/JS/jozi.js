/* Local interaction preview only: no API calls, accounts, persistence or generated answers. */
(() => {
    'use strict';
    const launcher = document.getElementById('jozi-launcher');
    const widget = document.querySelector('.jozi-widget');
    const dialog = document.getElementById('jozi-chat');
    const close = document.getElementById('jozi-close');
    const form = document.getElementById('jozi-form');
    const input = document.getElementById('jozi-message');
    const conversation = document.getElementById('jozi-conversation');
    const body = dialog.querySelector('.jozi-chat-body');
    const suggestions = dialog.querySelector('.jozi-suggestions');
    let previousOverflow;

    launcher.addEventListener('click', () => {
        if (dialog.open) return;
        dialog.showModal();
        previousOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        launcher.setAttribute('aria-expanded', 'true');
        widget.hidden = true;
        input.focus({ preventScroll: true });
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('button:not([disabled]), textarea:not([disabled]), a[href]')]
            .filter(control => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    dialog.addEventListener('click', event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
        document.documentElement.style.overflow = previousOverflow ?? '';
        launcher.setAttribute('aria-expanded', 'false');
        widget.hidden = false;
        conversation.querySelectorAll('[data-preview-message]').forEach(message => message.remove());
        form.reset();
        suggestions.hidden = false;
        body.scrollTop = 0;
        launcher.focus({ preventScroll: true });
    });
    suggestions.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
        input.value = button.textContent.trim();
        input.focus({ preventScroll: true });
    }));

    function message(author, text, isUser = false) {
        const bubble = document.createElement('div');
        bubble.className = 'jozi-message' + (isUser ? ' jozi-message-user' : '');
        bubble.dataset.previewMessage = 'true';
        const label = document.createElement('strong');
        label.textContent = author;
        const content = document.createElement('p');
        content.textContent = text;
        bubble.append(label, content);
        conversation.append(bubble);
        return bubble;
    }
    form.addEventListener('submit', event => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) { input.focus(); return; }
        message('You', text.slice(0, 500), true);
        const preview = message('Jozi · preview', 'Jozi isn’t connected yet. This preview doesn’t send or save messages. You can explore how CivicTrack works below.');
        const help = document.createElement('a');
        help.href = './Pages/Public/Information/Information.html#reporting';
        help.textContent = 'How reporting works';
        preview.append(help);
        // Bound this temporary DOM transcript. Closing the panel clears it entirely.
        while (conversation.querySelectorAll('[data-preview-message]').length > 16) conversation.querySelector('[data-preview-message]').remove();
        input.value = '';
        suggestions.hidden = true;
        body.scrollTop = body.scrollHeight;
        input.focus({ preventScroll: true });
    });
})();
