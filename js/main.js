
// DOM refs

const viewportEl = document.getElementById('viewport');
const worldEl = document.getElementById('world');
const svgEl = document.getElementById('connections-layer');
const nodesLayerEl = document.getElementById('nodes-layer');
const hintEl = document.getElementById('canvas-hint');
const zoomLevelEl = document.getElementById('zoom-level');
const toastContainerEl = document.getElementById('toast-container');
const autosaveIndicatorEl = document.getElementById('autosave-indicator');
const minimapCanvasEl = document.getElementById('minimap');
const commentsLayerEl = document.getElementById('comments-layer');

const nodeSearchInputEl = document.getElementById('node-search-input');
const btnAutoLayoutEl = document.getElementById('btn-auto-layout');
const btnSnapEl = document.getElementById('btn-snap');
const btnAddCommentEl = document.getElementById('btn-add-comment');

const paletteListEl = document.getElementById('palette-list');
const paletteSearchEl = document.getElementById('palette-search-input');
const propertiesContentEl = document.getElementById('properties-content');

const fileInputEl = document.getElementById('file-input');
const xmlFileInputEl = document.getElementById('xml-file-input');
const exportMenuBtn = document.getElementById('btn-export-menu');
const exportMenuEl = document.getElementById('export-menu');

const btnUndoEl = document.getElementById('btn-undo');
const btnRedoEl = document.getElementById('btn-redo');
const validationBtn = document.getElementById('btn-validation');
const validationBadgeEl = document.getElementById('validation-badge');
const validationMenuEl = document.getElementById('validation-menu');

const simPlayBtn = document.getElementById('sim-play');
const simPauseBtn = document.getElementById('sim-pause');
const simStepBtn = document.getElementById('sim-step');
const simStopBtn = document.getElementById('sim-stop');
const simResetBtn = document.getElementById('sim-reset');
const simSpeedEl = document.getElementById('sim-speed');
const simStatusEl = document.getElementById('sim-status');
const simStatsEl = document.getElementById('sim-stats');
const btnDebugModeEl = document.getElementById('btn-debug-mode');

const logPanelEl = document.getElementById('log-panel');
const logToggleBtn = document.getElementById('log-toggle');
const logBodyEl = document.getElementById('log-body');
const logFilterEl = document.getElementById('log-filter');
const logSearchEl = document.getElementById('log-search');
const logClearBtn = document.getElementById('log-clear');
const logExportTxtBtn = document.getElementById('log-export-txt');
const logExportCsvBtn = document.getElementById('log-export-csv');

// toasting

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast${type !== 'info' ? ` ${type}` : ''}`;
  el.textContent = message;
  toastContainerEl.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// state

function buildDefaultTree() {
  const t = new BehaviorTree();
  t.addNode(new Node({ type: 'root', x: 360, y: 40 }));
  return t;
}

const savedState = Storage.loadAutosave();
let tree = savedState ? BehaviorTree.fromJSON(savedState.tree) : buildDefaultTree();

// autosave

let autosaveTimer = null;
function scheduleAutosave() {
  if (!Storage.isAvailable()) {
    autosaveIndicatorEl.textContent = 'No local storage';
    autosaveIndicatorEl.className = 'autosave-indicator dirty';
    return;
  }
  autosaveIndicatorEl.textContent = 'Saving...';
  autosaveIndicatorEl.className = 'autosave-indicator dirty';
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const ok = Storage.saveAutosave(tree, renderer.getViewport());
    autosaveIndicatorEl.textContent = ok ? 'Saved' : 'Save failed';
    autosaveIndicatorEl.className = `autosave-indicator ${ok ? 'saved' : 'dirty'}`;
  }, 500);
}

// validation

function runValidation() {
  const issues = tree.validate();
  validationBadgeEl.hidden = issues.length === 0;
  validationBadgeEl.textContent = String(issues.length);
  renderValidationMenu(issues);
  return issues;
}

function renderValidationMenu(issues) {
  validationMenuEl.innerHTML = '';
  if (issues.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'validation-empty';
    empty.textContent = 'No issues found.';
    validationMenuEl.appendChild(empty);
    return;
  }
  for (const issue of issues) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `validation-row validation-${issue.level}`;
    row.textContent = `${issue.level === 'error' ? '⛔' : '⚠️'} ${issue.message}`;
    if (issue.nodeId) {
      row.addEventListener('click', () => {
        renderer.selectNode(issue.nodeId);
        const bounds = renderer.getNodeBounds(issue.nodeId);
        if (bounds) renderer.panTo(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        validationMenuEl.hidden = true;
      });
    } else {
      row.disabled = true;
    }
    validationMenuEl.appendChild(row);
  }
}

// markDirty

/** Single point called after any mutation to the tree: schedules autosave,
 * revalidates the structure, and redraws the minimap. */
function markDirty() {
  scheduleAutosave();
  runValidation();
  minimap.render();
}

// renderer

const renderer = new Renderer({
  tree,
  viewportEl,
  worldEl,
  svgEl,
  nodesLayerEl,
  hintEl,
  zoomLevelEl,
  onSelectNode: (node) => propertiesPanel.show(node),
  onTreeChange: () => markDirty(),
  onToast: (msg, type) => showToast(msg, type),
});
renderer.onDropNodeType = (type, x, y) => addNode(type, x, y);

// simulator

const logger = new Logger({ bodyEl: logBodyEl, filterEl: logFilterEl, searchEl: logSearchEl });

const SIM_STATUS_LABELS = {
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
  success: 'Success',
  failure: 'Failure',
};

function updateSimStatusUI(state) {
  simStatusEl.textContent = SIM_STATUS_LABELS[state] || state;
  simStatusEl.className = `sim-status sim-status-${state}`;
  simPlayBtn.disabled = state === 'running';
  simPauseBtn.disabled = state !== 'running';
}

function updateSimStats() {
  const { successes, failures, avgDuration, maxDuration, fps } = simulator.getStats();
  simStatsEl.textContent = `✓ ${successes}  ✗ ${failures}  ⌀ ${avgDuration}ms  ⇡ ${maxDuration}ms  ${fps} fps`;
}

const simulator = new Simulator({
  tree,
  onNodeState: (nodeId, state) => renderer.applyNodeState(nodeId, state),
  onLog: (entry) => logger.add(entry),
  onSimStateChange: (state) => updateSimStatusUI(state),
  onStatsChange: () => updateSimStats(),
  onBreakpointHit: (node) => showToast(`Breakpoint hit at "${node.title}".`, 'warning'),
});
updateSimStatusUI('idle');
updateSimStats();

simPlayBtn.addEventListener('click', () => simulator.play());
simPauseBtn.addEventListener('click', () => simulator.pause());
simStepBtn.addEventListener('click', () => simulator.step());
simStopBtn.addEventListener('click', () => simulator.stop());
simResetBtn.addEventListener('click', () => simulator.reset());
simSpeedEl.addEventListener('change', () => simulator.setSpeed(Number(simSpeedEl.value)));
btnDebugModeEl.addEventListener('click', () => {
  simulator.debugMode = !simulator.debugMode;
  btnDebugModeEl.classList.toggle('active', simulator.debugMode);
  showToast(`Debug Mode ${simulator.debugMode ? 'enabled' : 'disabled'}.`, 'info');
});

logToggleBtn.addEventListener('click', () => logPanelEl.classList.toggle('collapsed'));
logClearBtn.addEventListener('click', () => logger.clear());
logExportTxtBtn.addEventListener('click', () => logger.exportTXT());
logExportCsvBtn.addEventListener('click', () => logger.exportCSV());

// prop. panel

const propertiesPanel = new PropertiesPanel({
  contentEl: propertiesContentEl,
  onChange: () => {
    renderer.renderAll();
    markDirty();
  },
  onDelete: (nodeId) => {
    renderer.selectNode(nodeId);
    renderer.deleteSelected();
  },
  onBeforeEdit: () => historyManager.push(),
});

// swap whole tree

/** Shared core for New/Open/Import XML/Undo/Redo: swaps the entire tree and
 * realigns every module holding a reference to it. Does not touch history
 * or logs — the caller decides whether they should be cleared
 * (swapTree() clears them; undo/redo does not). */
function swapTreeInternal(newTree) {
  tree = newTree;
  renderer.tree = tree;
  simulator.tree = tree;
  simulator.reset();
  minimap.tree = tree;
  canvasComments.tree = tree;
  canvasComments.renderAll();
  clearSearchHighlights();
  searchMatches = [];
  searchIndex = -1;
  renderer.renderAll();
  propertiesPanel.show(null);
  markDirty();
}

function swapTree(newTree) {
  historyManager.clear();
  logger.clear();
  swapTreeInternal(newTree);
}

// undo/redo/minimap

const historyManager = new HistoryManager({
  getState: () => tree.toJSON(),
  applyState: (snapshot) => swapTreeInternal(BehaviorTree.fromJSON(snapshot)),
  onChange: () => {
    btnUndoEl.disabled = !historyManager.canUndo();
    btnRedoEl.disabled = !historyManager.canRedo();
  },
});
renderer.onBeforeMutate = () => historyManager.push();
btnUndoEl.addEventListener('click', () => historyManager.undo());
btnRedoEl.addEventListener('click', () => historyManager.redo());

const minimap = new Minimap({ canvasEl: minimapCanvasEl, tree, renderer, viewportEl });
renderer.onViewportChange = () => minimap.render();

const canvasComments = new CanvasComments({
  tree,
  containerEl: commentsLayerEl,
  renderer,
  onBeforeMutate: () => historyManager.push(),
  onChange: () => markDirty(),
});

validationBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  validationMenuEl.hidden = !validationMenuEl.hidden;
});

// layout / snap / search

btnAutoLayoutEl.addEventListener('click', () => {
  historyManager.push();
  computeTreeLayout(tree);
  renderer.renderAll();
  renderer.resetView();
  markDirty();
  showToast('Tree automatically rearranged.', 'success');
});

btnSnapEl.addEventListener('click', () => {
  renderer.snapEnabled = !renderer.snapEnabled;
  btnSnapEl.classList.toggle('active', renderer.snapEnabled);
});

btnAddCommentEl.addEventListener('click', () => {
  const rect = viewportEl.getBoundingClientRect();
  const world = renderer.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  canvasComments.addAt(world.x - 95, world.y - 35);
});

let searchMatches = [];
let searchIndex = -1;

function clearSearchHighlights() {
  nodesLayerEl.querySelectorAll('.search-match').forEach((el) => el.classList.remove('search-match'));
}

function updateSearchMatches() {
  clearSearchHighlights();
  const query = nodeSearchInputEl.value.trim().toLowerCase();
  searchMatches = query
    ? [...tree.nodes.values()].filter(
        (n) => n.title.toLowerCase().includes(query) || (n.description || '').toLowerCase().includes(query)
      )
    : [];
  searchIndex = -1;
  for (const n of searchMatches) {
    const el = nodesLayerEl.querySelector(`.bt-node[data-id="${n.id}"]`);
    if (el) el.classList.add('search-match');
  }
}

function goToNextMatch() {
  if (searchMatches.length === 0) {
    showToast('No matching node found.', 'warning');
    return;
  }
  searchIndex = (searchIndex + 1) % searchMatches.length;
  const target = searchMatches[searchIndex];
  renderer.selectNode(target.id);
  const bounds = renderer.getNodeBounds(target.id);
  if (bounds) renderer.panTo(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

nodeSearchInputEl.addEventListener('input', () => updateSearchMatches());
nodeSearchInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    goToNextMatch();
  }
});

// palette

function addNode(type, x, y) {
  if (type === 'root' && tree.getRoots().length > 0) {
    showToast('There can only be one Root node in the tree.', 'warning');
    return;
  }
  historyManager.push();
  const node = new Node({ type, x, y });
  tree.addNode(node);
  renderer.renderAll();
  renderer.selectNode(node.id);
  markDirty();
}

function addNodeAtViewCenter(type) {
  const rect = viewportEl.getBoundingClientRect();
  const world = renderer.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  addNode(type, world.x - 95, world.y - 20);
}

new Palette({
  listEl: paletteListEl,
  searchEl: paletteSearchEl,
  onAddNode: (type) => addNodeAtViewCenter(type),
});

// copy/cut/paste

let clipboard = null;

function copySelected() {
  const nodeId = renderer.selectedNodeId;
  if (!nodeId) return;
  const node = tree.getNode(nodeId);
  if (!node || node.type === 'root') {
    showToast('The Root node cannot be copied.', 'warning');
    return;
  }
  clipboard = tree.getSubtreeJSON(nodeId);
  showToast('Node copied.', 'success');
}

function cutSelected() {
  const nodeId = renderer.selectedNodeId;
  if (!nodeId) return;
  const node = tree.getNode(nodeId);
  if (!node || node.type === 'root') {
    showToast('The Root node cannot be cut.', 'warning');
    return;
  }
  clipboard = tree.getSubtreeJSON(nodeId);
  historyManager.push();
  tree.removeSubtree(nodeId);
  renderer.renderAll();
  renderer.selectNode(null);
  markDirty();
  showToast('Node cut.', 'success');
}

function pasteClipboard() {
  if (!clipboard) return;
  historyManager.push();
  const rect = viewportEl.getBoundingClientRect();
  const center = renderer.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const dx = center.x - clipboard[0].x - 95;
  const dy = center.y - clipboard[0].y - 35;
  const newRootId = tree.pasteSubtreeJSON(clipboard, dx, dy);
  renderer.renderAll();
  if (newRootId) renderer.selectNode(newRootId);
  markDirty();
  showToast('Node pasted.', 'success');
}

// toolbar

document.getElementById('btn-new').addEventListener('click', () => {
  if (!confirm('This will erase the current tree (not saved to a file). Continue?')) return;
  swapTree(buildDefaultTree());
  renderer.resetView();
});

document.getElementById('btn-open').addEventListener('click', () => fileInputEl.click());

fileInputEl.addEventListener('change', async () => {
  const file = fileInputEl.files[0];
  if (!file) return;
  try {
    const text = await Storage.readFile(file);
    const data = JSON.parse(text);
    swapTree(BehaviorTree.fromJSON(data.tree));
    renderer.setViewport(data.viewport);
    showToast('Project loaded successfully.', 'success');
  } catch (err) {
    showToast(`Failed to open the file: ${err.message}`, 'error');
  } finally {
    fileInputEl.value = '';
  }
});

// import/export XML

document.getElementById('btn-import-xml').addEventListener('click', () => xmlFileInputEl.click());

xmlFileInputEl.addEventListener('change', async () => {
  const file = xmlFileInputEl.files[0];
  if (!file) return;
  try {
    const text = await Storage.readFile(file);
    const { tree: importedTree, warnings } = xmlToTree(text);
    swapTree(importedTree);
    renderer.resetView();
    showToast(`XML imported (${importedTree.nodes.size} nodes).`, 'success');
    if (warnings.length) {
      const preview = warnings.slice(0, 3).join(' | ');
      const suffix = warnings.length > 3 ? ` (+${warnings.length - 3} more warnings)` : '';
      showToast(preview + suffix, 'warning');
    }
  } catch (err) {
    showToast(`Failed to import XML: ${err.message}`, 'error');
  } finally {
    xmlFileInputEl.value = '';
  }
});

function warnAboutOrphans() {
  const orphanCount = tree.validate().filter((i) => i.message.includes('has no parent')).length;
  if (orphanCount > 0) {
    showToast(`${orphanCount} disconnected node(s) will not be included in the export.`, 'warning');
  }
}

exportMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exportMenuEl.hidden = !exportMenuEl.hidden;
});
document.addEventListener('click', () => {
  exportMenuEl.hidden = true;
  validationMenuEl.hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    exportMenuEl.hidden = true;
    validationMenuEl.hidden = true;
  }
});

exportMenuEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-format]');
  if (!btn) return;
  exportMenuEl.hidden = true;
  const format = btn.dataset.format;

  if (format === 'xml') {
    try {
      warnAboutOrphans();
      Storage.downloadText(treeToXML(tree), 'behavior-tree.xml', 'application/xml');
      showToast('XML exported.', 'success');
    } catch (err) {
      showToast(`Failed to export XML: ${err.message}`, 'error');
    }
  } else if (format === 'yaml') {
    try {
      warnAboutOrphans();
      Storage.downloadText(treeToYAML(tree), 'behavior-tree.yaml', 'application/x-yaml');
      showToast('YAML exported.', 'success');
    } catch (err) {
      showToast(`Failed to export YAML: ${err.message}`, 'error');
    }
  } else if (format === 'svg') {
    try {
      Storage.downloadText(buildTreeSVG(tree, renderer), 'behavior-tree.svg', 'image/svg+xml');
      showToast('SVG exported.', 'success');
    } catch (err) {
      showToast(`Failed to export SVG: ${err.message}`, 'error');
    }
  } else if (format === 'png') {
    exportTreeToPNG(tree, renderer, 2)
      .then((blob) => {
        Storage.downloadBlob(blob, 'behavior-tree.png');
        showToast('PNG exported.', 'success');
      })
      .catch((err) => showToast(`Failed to export PNG: ${err.message}`, 'error'));
  }
});

function saveNow() {
  const ok = Storage.saveAutosave(tree, renderer.getViewport());
  autosaveIndicatorEl.textContent = ok ? 'Saved' : 'No local storage';
  autosaveIndicatorEl.className = `autosave-indicator ${ok ? 'saved' : 'dirty'}`;
  if (ok) showToast('Project saved to the browser.', 'success');
  else showToast('Local storage is unavailable on this page. Use "Save As" to export a file.', 'warning');
}

document.getElementById('btn-save').addEventListener('click', saveNow);

document.getElementById('btn-save-as').addEventListener('click', () => {
  Storage.downloadJSON(tree, renderer.getViewport());
});

document.getElementById('btn-zoom-in').addEventListener('click', () => renderer.zoomIn());
document.getElementById('btn-zoom-out').addEventListener('click', () => renderer.zoomOut());
document.getElementById('btn-zoom-reset').addEventListener('click', () => renderer.resetView());

// shortcuts

function isTypingTarget() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if ((e.key === 'Delete' || e.key === 'Backspace') && !isTypingTarget()) {
    if (renderer.selectedNodeId || renderer.selectedConnectionId) {
      e.preventDefault();
      renderer.deleteSelected();
    }
  } else if (ctrlOrCmd && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveNow();
  } else if (ctrlOrCmd && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    fileInputEl.click();
  } else if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTypingTarget()) {
    e.preventDefault();
    historyManager.undo();
  } else if (ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z' && !isTypingTarget()) {
    e.preventDefault();
    historyManager.redo();
  } else if (ctrlOrCmd && e.key.toLowerCase() === 'c' && !isTypingTarget()) {
    e.preventDefault();
    copySelected();
  } else if (ctrlOrCmd && e.key.toLowerCase() === 'x' && !isTypingTarget()) {
    e.preventDefault();
    cutSelected();
  } else if (ctrlOrCmd && e.key.toLowerCase() === 'v' && !isTypingTarget()) {
    e.preventDefault();
    pasteClipboard();
  } else if (ctrlOrCmd && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    nodeSearchInputEl.focus();
    nodeSearchInputEl.select();
  } else if (e.code === 'Space' && !isTypingTarget()) {
    e.preventDefault();
    if (simulator.simState === 'running') simulator.pause();
    else simulator.play();
  }
});

// go

renderer.renderAll();
canvasComments.renderAll();
if (savedState?.viewport) renderer.setViewport(savedState.viewport);
else renderer.resetView();
runValidation();
minimap.render();
