// ── static/dialogs.js ── Themed Confirm & Alert Modals ──

(function () {
  function getOrCreateBackdrop() {
    let backdrop = document.getElementById('app-dialog-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'app-dialog-backdrop';
      backdrop.className = 'app-dialog-backdrop';
      backdrop.innerHTML = `
        <div class="app-dialog-card" id="app-dialog-card">
          <div class="app-dialog-header">
            <div class="app-dialog-title-wrap">
              <span class="app-dialog-icon" id="app-dialog-icon">⚠️</span>
              <span class="app-dialog-title" id="app-dialog-title">Confirm Action</span>
            </div>
            <button class="app-dialog-close" id="app-dialog-close" title="Close (Escape)">✕</button>
          </div>
          <div class="app-dialog-body" id="app-dialog-body">
            Are you sure you want to proceed?
          </div>
          <div class="app-dialog-footer" id="app-dialog-footer">
            <button class="app-dialog-btn app-dialog-btn-cancel" id="app-dialog-cancel-btn">Cancel</button>
            <button class="app-dialog-btn app-dialog-btn-confirm" id="app-dialog-confirm-btn">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
    }
    return backdrop;
  }

  window.showConfirmDialog = function (options = {}) {
    const opts = typeof options === 'string' ? { message: options } : options;
    const isDanger = Boolean(opts.isDanger || opts.danger);
    const {
      title = 'Confirm Action',
      message = 'Are you sure you want to proceed?',
      confirmText = isDanger ? 'Delete' : 'Confirm',
      cancelText = 'Cancel',
      icon = isDanger ? '🗑️' : '⚠️',
    } = opts;

    return new Promise((resolve) => {
      const backdrop = getOrCreateBackdrop();
      const titleEl = document.getElementById('app-dialog-title');
      const iconEl = document.getElementById('app-dialog-icon');
      const bodyEl = document.getElementById('app-dialog-body');
      const cancelBtn = document.getElementById('app-dialog-cancel-btn');
      const confirmBtn = document.getElementById('app-dialog-confirm-btn');
      const closeBtn = document.getElementById('app-dialog-close');

      titleEl.textContent = title;
      iconEl.textContent = icon;
      bodyEl.textContent = message;

      cancelBtn.style.display = 'inline-block';
      cancelBtn.textContent = cancelText;

      confirmBtn.textContent = confirmText;
      confirmBtn.className = 'app-dialog-btn ' + (isDanger ? 'app-dialog-btn-danger' : 'app-dialog-btn-confirm');

      function cleanup(result) {
        backdrop.classList.remove('visible');
        document.removeEventListener('keydown', onKeyDown);
        cancelBtn.onclick = null;
        confirmBtn.onclick = null;
        closeBtn.onclick = null;
        backdrop.onclick = null;
        resolve(result);
      }

      function onKeyDown(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          cleanup(true);
        }
      }

      cancelBtn.onclick = () => cleanup(false);
      closeBtn.onclick = () => cleanup(false);
      confirmBtn.onclick = () => cleanup(true);
      backdrop.onclick = (e) => {
        if (e.target === backdrop) cleanup(false);
      };

      document.addEventListener('keydown', onKeyDown);
      backdrop.classList.add('visible');
      confirmBtn.focus();
    });
  };

  window.showAlertDialog = function (options = {}) {
    const opts = typeof options === 'string' ? { message: options } : options;
    const {
      title = 'Notice',
      message = '',
      buttonText = 'OK',
      icon = 'ℹ️',
    } = opts;

    return new Promise((resolve) => {
      const backdrop = getOrCreateBackdrop();
      const titleEl = document.getElementById('app-dialog-title');
      const iconEl = document.getElementById('app-dialog-icon');
      const bodyEl = document.getElementById('app-dialog-body');
      const cancelBtn = document.getElementById('app-dialog-cancel-btn');
      const confirmBtn = document.getElementById('app-dialog-confirm-btn');
      const closeBtn = document.getElementById('app-dialog-close');

      titleEl.textContent = title;
      iconEl.textContent = icon;
      bodyEl.textContent = message;

      cancelBtn.style.display = 'none';
      confirmBtn.textContent = buttonText;
      confirmBtn.className = 'app-dialog-btn app-dialog-btn-confirm';

      function cleanup() {
        backdrop.classList.remove('visible');
        document.removeEventListener('keydown', onKeyDown);
        confirmBtn.onclick = null;
        closeBtn.onclick = null;
        backdrop.onclick = null;
        resolve();
      }

      function onKeyDown(e) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          cleanup();
        }
      }

      confirmBtn.onclick = cleanup;
      closeBtn.onclick = cleanup;
      backdrop.onclick = (e) => {
        if (e.target === backdrop) cleanup();
      };

      document.addEventListener('keydown', onKeyDown);
      backdrop.classList.add('visible');
      confirmBtn.focus();
    });
  };

  // Expose PmDialogs namespace for unified modal calls
  window.PmDialogs = {
    confirm: function (options) {
      return window.showConfirmDialog(options);
    },
    alert: function (options) {
      return window.showAlertDialog(options);
    }
  };
})();
