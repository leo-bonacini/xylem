const STATE_LABELS = {
  RUNNING: 'Running',
  SUCCESS: 'Success',
  FAILURE: 'Failure',
  SKIPPED: 'Skipped',
  ERROR: 'Error',
};

class Logger {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.bodyEl
   * @param {HTMLSelectElement} opts.filterEl
   * @param {HTMLInputElement} opts.searchEl
   */
  constructor({ bodyEl, filterEl, searchEl }) {
    this.bodyEl = bodyEl;
    this.filterEl = filterEl;
    this.searchEl = searchEl;
    this.entries = [];
    this.filterState = 'all';
    this.searchQuery = '';

    this.filterEl.addEventListener('change', () => {
      this.filterState = this.filterEl.value;
      this._rerender();
    });
    this.searchEl.addEventListener('input', () => {
      this.searchQuery = this.searchEl.value.trim().toLowerCase();
      this._rerender();
    });
  }

  add(entry) {
    this.entries.push(entry);
    if (this._matches(entry)) this._appendLine(entry);
  }

  clear() {
    this.entries = [];
    this.bodyEl.innerHTML = '';
  }

  _matches(entry) {
    if (this.filterState !== 'all' && entry.state.toLowerCase() !== this.filterState) return false;
    if (this.searchQuery && !entry.nodeTitle.toLowerCase().includes(this.searchQuery)) return false;
    return true;
  }

  _rerender() {
    this.bodyEl.innerHTML = '';
    for (const entry of this.entries) {
      if (this._matches(entry)) this._appendLine(entry);
    }
  }

  _formatTime(ts) {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  }

  _appendLine(entry) {
    const line = document.createElement('div');
    line.className = `log-line log-${entry.state.toLowerCase()}`;
    const durationText = entry.durationMs != null ? ` (${entry.durationMs}ms)` : '';
    const noteText = entry.note ? `: ${entry.note}` : '';
    line.textContent = `[${this._formatTime(entry.time)}] ${entry.nodeTitle} -> ${STATE_LABELS[entry.state] || entry.state}${durationText}${noteText}`;
    this.bodyEl.appendChild(line);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  _rowsForExport() {
    return this.entries.filter((e) => this._matches(e));
  }

  exportTXT() {
    const lines = this._rowsForExport().map(
      (e) => `[${this._formatTime(e.time)}] ${e.nodeTitle} -> ${STATE_LABELS[e.state] || e.state}${e.durationMs != null ? ` (${e.durationMs}ms)` : ''}`
    );
    Storage.downloadText(lines.join('\n'), 'bt-logs.txt', 'text/plain');
  }

  exportCSV() {
    const header = 'time,nodeId,nodeTitle,nodeType,state,durationMs';
    const rows = this._rowsForExport().map((e) =>
      [this._formatTime(e.time), e.nodeId ?? '', e.nodeTitle, e.nodeType ?? '', e.state, e.durationMs ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    Storage.downloadText([header, ...rows].join('\n'), 'bt-logs.csv', 'text/csv');
  }
}
