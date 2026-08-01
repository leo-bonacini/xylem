<p align="center">
  <img src="assets/logo-wordmark.svg" alt="Xylem" width="360">
</p>

<p align="center">
  A visual, browser-only editor for building, simulating, and debugging behavior trees.
</p>

---

**Xylem** is named for the tissue that carries water and nutrients from a tree's root to every leaf. A behavior tree does the same job with logic: a *tick* starts at the Root and flows down through Sequences, Decorators, and Actions, and every node's result is carried back up the same channel. The [logo](assets/logo-wordmark.svg) is built from that idea: an asymmetric branch fan using the same colors the editor uses for its own node types.

## Why

Most behavior tree editors need an install, a build step, or a running backend. Xylem is a single `index.html` with no framework, no bundler, and no server: open the file in a browser and it works, including entirely offline via `file://`.

## Features

- **Visual editor**: drag-and-drop nodes onto an infinite pan/zoom canvas, connect them with Bézier curves, edit every property (name, description, parameters, comments) in a side panel.
- **All standard node types**: Root, Sequence, Fallback, Parallel, Inverter, Retry, Repeat, Timeout, Action, Condition, and the fixed Success/Failure/Running leaves, each with its own color, icon, and parameter schema.
- **Tick-based simulator**: Play, Pause, Step, Stop, and Reset a real execution, at 0.25x to 5x speed, with live node/connection animations and a scrollable execution log (filterable, searchable, exportable as TXT/CSV).
- **Debug mode & breakpoints**: click the corner of any node to set a breakpoint; with Debug Mode on, Play pauses the instant that node starts running.
- **Execution statistics**: live success/failure counts, average and max tick duration, and simulator FPS.
- **Import / Export**: round-trip a standard behavior tree XML format (including tolerant import of hand-written trees with unknown/custom tags), plus export to YAML, SVG, and PNG.
- **Undo/Redo, Copy/Cut/Paste**: full history (100 steps) and subtree clipboard operations.
- **Auto Layout & Snap to Grid**: one click to re-flow the tree into layers; optional grid snapping while dragging.
- **Validation**: automatic detection of cycles, multiple roots, disconnected nodes, and cardinality violations, surfaced in a dedicated panel.
- **Minimap, node search, visual comments**: navigate large trees, jump to a node by name, and leave freestanding sticky notes on the canvas.
- **Autosave**: the current tree is saved to `localStorage` as you work; closing and reopening the tab picks up where you left off.

## Getting started

No install, no build, no dependencies.

```bash
git clone <this-repo>
cd bt
# then just open index.html in a browser
```

Or, from a terminal:

```bash
open index.html      # macOS
xdg-open index.html  # Linux
start index.html     # Windows
```

Everything runs client-side. There is no server, no `npm install`, and no network requests: you can verify this yourself in the browser's Network tab.

## Project structure

```
index.html            Markup + script loading order
style.css             Dark theme for a node-based visual editor
assets/               Logo mark, transparent line mark, and wordmark (SVG)
js/
  nodeTypes.js        Node type metadata: color, icon, description, param schema
  Node.js             A single tree node
  Connection.js       A parent-to-child edge (view layer, derived from Node)
  BehaviorTree.js     The tree: add/remove/connect nodes, validate, (de)serialize
  Layout.js           Auto-layout algorithm (layered tree layout)
  Renderer.js         Canvas rendering: pan/zoom, drag, connections, node states
  Palette.js          Left sidebar: searchable, favoritable node palette
  PropertiesPanel.js  Right sidebar: per-node property form
  Minimap.js          Canvas overview with click/drag-to-navigate
  CanvasComments.js   Freestanding visual comments on the canvas
  HistoryManager.js   Snapshot-based undo/redo
  Simulator.js        Tick-based execution engine (generator functions)
  Logger.js           Execution log panel: filter, search, export
  Storage.js          localStorage autosave + file download helpers
  XmlExporter.js      Tree to behavior tree XML
  XmlImporter.js      Behavior tree XML to Tree (tolerant of unknown tags)
  YamlSerializer.js   Tree to YAML (hand-written serializer, no dependency)
  SvgExporter.js      Tree to SVG / PNG
  main.js             Wires every module together, toolbar, shortcuts
```

Scripts are loaded as classic `<script>` tags, in dependency order, rather than ES modules: ES modules are blocked by CORS when a page is opened via `file://`, which would break the "just open index.html" promise.

## Node types

| Type | Category | Children | Notes |
|---|---|---|---|
| Root | n/a | exactly 1 | Entry point of every tree |
| Sequence | Control | 1+ | Runs children in order; fails if any fails |
| Fallback | Control | 1+ | Runs children in order until one succeeds |
| Parallel | Control | 1+ | Runs all children on the same tick; configurable success/failure thresholds |
| Inverter | Decorator | 1 | Flips Success ↔ Failure |
| Retry | Decorator | 1 | Re-runs the child on failure, up to N attempts |
| Repeat | Decorator | 1 | Repeats the child on success, N times |
| Timeout | Decorator | 1 | Fails the child if it runs longer than N ms |
| Action | Leaf | 0 | Simulated result: Success / Failure / Running |
| Condition | Leaf | 0 | Result from a JS expression evaluated against the node |
| Success / Failure / Running | Leaf | 0 | Always return their fixed result |

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + S` | Save to the browser |
| `Ctrl/Cmd + O` | Open a project file |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + C` | Copy selected node (with its subtree) |
| `Ctrl/Cmd + X` | Cut selected node (with its subtree) |
| `Ctrl/Cmd + V` | Paste |
| `Ctrl/Cmd + F` | Focus the node search field |
| `Delete` / `Backspace` | Delete the selected node or connection |
| `Space` | Play / Pause the simulator |

Shortcuts that could conflict with normal text editing are disabled while a text field or textarea has focus.

## Import & export

- **Import**: a standard behavior tree XML format. Recognizes the tags this editor itself exports as well as common real-world aliases (`ReactiveSequence`, `Selector`, `AlwaysSuccess`, …). Unrecognized tags are never silently dropped: they're imported as an Action or Sequence (depending on whether they have children), with the original tag name preserved in the node's comments and a warning shown to you.
- **Export**: XML (round-trips through this editor with layout preserved via `_x`/`_y`/`_desc`/`_comments` attributes that a standard parser simply ignores), YAML, SVG (vector, so already high-resolution), and PNG (rasterized from that SVG at 2x scale).
- **Project files**: Save/Open use a JSON format (`.json`) that round-trips the tree exactly, including layout, comments, and breakpoints.

## Browser support

Built and tested against modern Chromium/Firefox. Uses standard DOM APIs (`DOMParser`, `<canvas>`, `Blob`/`URL.createObjectURL`) with no polyfills. `localStorage` access is wrapped in `try/catch` throughout, since some browsers treat `file://` pages as having an opaque origin: the app degrades gracefully (autosave/favorites just won't persist) rather than failing to load.

## Development notes

There is no build step and no test runner checked into the repo. The shipped app is exactly what you see in `index.html`, `style.css`, and `js/`.

## License

MIT, see [LICENSE](LICENSE).
