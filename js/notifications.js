/* ============================================================
   NOTIFICATIONS.JS — toast notifications
   ============================================================ */

const Notify = (() => {
  let container;

  function ensureContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-stack';
      document.body.appendChild(container);
    }
    return container;
  }

  const ICONS = {
    success: '✓',
    info: '●',
    warning: '!',
    error: '✕',
    milestone: '★'
  };

  function show(message, type = 'success', duration = 3200) {
    const stack = ensureContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${ICONS[type] || ICONS.info}</span><span class="toast-msg">${message}</span>`;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-in'));
    setTimeout(() => {
      toast.classList.remove('toast-in');
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  return {
    success: (msg, d) => show(msg, 'success', d),
    info: (msg, d) => show(msg, 'info', d),
    warning: (msg, d) => show(msg, 'warning', d),
    error: (msg, d) => show(msg, 'error', d),
    milestone: (msg, d) => show(msg, 'milestone', d || 4500),
  };
})();
