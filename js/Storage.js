const AUTOSAVE_KEY = 'bt-editor-autosave-v1';

class Storage {
  // On pages opened via file:// some browsers treat the origin as opaque,
  // and localStorage can throw SecurityError just from being referenced.
  // Each method degrades gracefully (no autosave) instead of crashing the app.
  static isAvailable() {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch {
      return false;
    }
  }

  static saveAutosave(tree, viewport) {
    try {
      const payload = { tree: tree.toJSON(), viewport, savedAt: Date.now() };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  static loadAutosave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static clearAutosave() {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* localStorage unavailable: nothing to clear */
    }
  }

  static downloadJSON(tree, viewport, filename = 'behavior-tree.btree.json') {
    const payload = { tree: tree.toJSON(), viewport, exportedAt: Date.now() };
    Storage.downloadText(JSON.stringify(payload, null, 2), filename, 'application/json');
  }

  static downloadText(content, filename, mime = 'text/plain') {
    Storage.downloadBlob(new Blob([content], { type: mime }), filename);
  }

  static downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  static readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
}
