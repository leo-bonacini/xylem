// Metadata for each node type: category, color, icon, description, child
// cardinality, and parameter schema. This is the single source of truth
// used by the palette, the renderer, and the properties panel.

const NODE_TYPES = {
  root: {
    id: 'root', label: 'Root', category: 'root', color: '#94a3b8', icon: '⬤',
    description: 'Root node of the tree. Entry point of execution.',
    minChildren: 1, maxChildren: 1, params: [],
  },

  sequence: {
    id: 'sequence', label: 'Sequence', category: 'control', color: '#4f8cff', icon: '→',
    description: 'Runs children in order; fails if any of them fails.',
    minChildren: 1, maxChildren: Infinity, params: [],
  },
  fallback: {
    id: 'fallback', label: 'Fallback', category: 'control', color: '#38bdf8', icon: '?',
    description: 'Runs children in order until one succeeds.',
    minChildren: 1, maxChildren: Infinity, params: [],
  },
  parallel: {
    id: 'parallel', label: 'Parallel', category: 'control', color: '#818cf8', icon: '⇉',
    description: 'Runs all children on the same tick.',
    minChildren: 1, maxChildren: Infinity, params: [
      { key: 'success_threshold', label: 'Success threshold', type: 'number', default: -1,
        hint: '-1 = every child must succeed' },
      { key: 'failure_threshold', label: 'Failure threshold', type: 'number', default: 1,
        hint: 'number of failures required for Parallel to fail' },
    ],
  },

  inverter: {
    id: 'inverter', label: 'Inverter', category: 'decorator', color: '#c084fc', icon: '↺',
    description: "Inverts the child's result (Success ↔ Failure).",
    minChildren: 1, maxChildren: 1, params: [],
  },
  retry: {
    id: 'retry', label: 'Retry', category: 'decorator', color: '#c084fc', icon: '↻',
    description: 'Re-runs the child on failure, up to N attempts.',
    minChildren: 1, maxChildren: 1, params: [
      { key: 'num_attempts', label: 'Number of attempts', type: 'number', default: 3 },
    ],
  },
  repeat: {
    id: 'repeat', label: 'Repeat', category: 'decorator', color: '#c084fc', icon: '⟲',
    description: 'Repeats the child on success, N times.',
    minChildren: 1, maxChildren: 1, params: [
      { key: 'num_cycles', label: 'Number of repetitions', type: 'number', default: 3 },
    ],
  },
  timeout: {
    id: 'timeout', label: 'Timeout', category: 'decorator', color: '#c084fc', icon: '⏱',
    description: 'Fails the child if it exceeds the configured time.',
    minChildren: 1, maxChildren: 1, params: [
      { key: 'msec', label: 'Timeout (ms)', type: 'number', default: 1000 },
    ],
  },

  action: {
    id: 'action', label: 'Action', category: 'action', color: '#34c77b', icon: '▶',
    description: 'Runs an action and returns Success, Failure, or Running.',
    minChildren: 0, maxChildren: 0, params: [
      { key: 'result', label: 'Simulated result', type: 'select', default: 'Success',
        options: ['Success', 'Failure', 'Running'] },
    ],
  },
  condition: {
    id: 'condition', label: 'Condition', category: 'condition', color: '#e8b93f', icon: '？',
    description: 'Evaluates a condition and returns True (Success) or False (Failure).',
    minChildren: 0, maxChildren: 0, params: [
      { key: 'expression', label: 'Expression', type: 'text', default: '' },
    ],
  },

  success: {
    id: 'success', label: 'Success', category: 'leaf', color: '#34c77b', icon: '✔',
    description: 'Always returns Success.', minChildren: 0, maxChildren: 0, params: [],
  },
  failure: {
    id: 'failure', label: 'Failure', category: 'leaf', color: '#f0556b', icon: '✖',
    description: 'Always returns Failure.', minChildren: 0, maxChildren: 0, params: [],
  },
  running: {
    id: 'running', label: 'Running', category: 'leaf', color: '#4f8cff', icon: '●',
    description: 'Always returns Running.', minChildren: 0, maxChildren: 0, params: [],
  },
};

const CATEGORY_LABELS = {
  root: 'Root',
  control: 'Control Nodes',
  decorator: 'Decorator Nodes',
  action: 'Action Nodes',
  condition: 'Condition Nodes',
  leaf: 'Leaf',
};

const CATEGORY_ORDER = ['root', 'control', 'decorator', 'action', 'condition', 'leaf'];

function getNodeType(typeId) {
  const def = NODE_TYPES[typeId];
  if (!def) throw new Error(`Unknown node type: ${typeId}`);
  return def;
}
