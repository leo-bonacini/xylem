// Snapshot-based Undo/Redo (not per-command). Each entry is the
// `tree.toJSON()` from BEFORE a mutation. This is simpler and more robust
// than reimplementing the inverse operation for every action type (move,
// connect, delete, edit a parameter...), at the cost of more memory —
// acceptable for the tree sizes this editor handles (tens/hundreds of nodes).

class HistoryManager {
  /**
   * @param {object} opts
   * @param {number} [opts.maxSize]
   * @param {() => object} opts.getState snapshot of the current state (e.g. tree.toJSON())
   * @param {(state: object) => void} opts.applyState restores a snapshot
   * @param {() => void} [opts.onChange] called after push/undo/redo/clear
   */
  constructor({ maxSize = 100, getState, applyState, onChange }) {
    this.maxSize = maxSize;
    this.getState = getState;
    this.applyState = applyState;
    this.onChange = onChange;
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Call BEFORE a mutation, to save the state as it was. */
  push() {
    this.undoStack.push(this.getState());
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
    this.onChange?.();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const current = this.getState();
    const previous = this.undoStack.pop();
    this.redoStack.push(current);
    this.applyState(previous);
    this.onChange?.();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const current = this.getState();
    const next = this.redoStack.pop();
    this.undoStack.push(current);
    this.applyState(next);
    this.onChange?.();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange?.();
  }
}
