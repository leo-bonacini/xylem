// In-app replacement for window.confirm(), built on <dialog> so focus
// handling, Esc and the backdrop come from the browser.

class ConfirmDialog {
  /** @param {HTMLDialogElement} dialogEl */
  constructor(dialogEl) {
    this.dialogEl = dialogEl;
    this.titleEl = dialogEl.querySelector('.dialog-title');
    this.messageEl = dialogEl.querySelector('.dialog-message');
    this.confirmBtn = dialogEl.querySelector('button[value="confirm"]');
    this._resolve = null;

    // Settle on submit/cancel rather than on 'close': those fire right away
    // and tell us which button was used, while 'close' is queued and reads
    // returnValue, which a quick second ask() may already have reset.
    dialogEl.querySelector('form').addEventListener('submit', (e) => {
      this._settle(e.submitter?.value === 'confirm');
    });
    dialogEl.addEventListener('cancel', () => this._settle(false));
  }

  /** Opens the dialog and resolves to true if the user confirms. */
  ask({ title, message, confirmLabel = 'Confirm' }) {
    this._settle(false);
    this.titleEl.textContent = title;
    this.messageEl.textContent = message;
    this.confirmBtn.textContent = confirmLabel;
    this.dialogEl.showModal();
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  _settle(confirmed) {
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.(confirmed);
  }
}
