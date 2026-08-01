// Imports a standard behavior tree XML format. Recognizes the tags produced
// by our own exporter as well as common real-world aliases
// (ReactiveSequence, Selector, AlwaysSuccess...). Unknown tags are not
// discarded: they become Action (if a leaf) or Sequence (if they have
// children), with the original name preserved in `comments`, so nothing is
// silently lost.

const XML_IMPORT_TAG_TO_TYPE = {
  Sequence: 'sequence', SequenceStar: 'sequence', ReactiveSequence: 'sequence',
  Fallback: 'fallback', FallbackStar: 'fallback', ReactiveFallback: 'fallback', Selector: 'fallback',
  Parallel: 'parallel', ParallelAll: 'parallel',
  Inverter: 'inverter',
  RetryUntilSuccessful: 'retry', Retry: 'retry',
  Repeat: 'repeat',
  Timeout: 'timeout',
  Action: 'action',
  Condition: 'condition',
  Success: 'success', AlwaysSuccess: 'success',
  Failure: 'failure', AlwaysFailure: 'failure',
  Running: 'running',
};

function numAttr(el, name, fallback) {
  if (!el.hasAttribute(name)) return fallback;
  const n = Number(el.getAttribute(name));
  return Number.isNaN(n) ? fallback : n;
}

function firstElementChild(el) {
  for (const child of el.childNodes) {
    if (child.nodeType === 1) return child;
  }
  return null;
}

function xmlToTree(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const parserErrorEl = doc.getElementsByTagName('parsererror')[0];
  if (parserErrorEl) {
    throw new Error('Invalid XML: ' + parserErrorEl.textContent.trim().slice(0, 200));
  }

  const rootEl = doc.documentElement;
  const behaviorTrees = [...rootEl.getElementsByTagName('BehaviorTree')];
  if (behaviorTrees.length === 0) {
    throw new Error('No <BehaviorTree> element found in the XML.');
  }
  const mainId = rootEl.getAttribute('main_tree_to_execute');
  const btEl = (mainId && behaviorTrees.find((b) => b.getAttribute('ID') === mainId)) || behaviorTrees[0];

  const tree = new BehaviorTree();
  const rootNode = new Node({
    type: 'root',
    x: numAttr(btEl, '_x', 40),
    y: numAttr(btEl, '_y', 40),
  });
  tree.addNode(rootNode);

  const warnings = [];
  const firstChildEl = firstElementChild(btEl);
  let hasPositions = false;
  if (firstChildEl) {
    hasPositions = firstChildEl.hasAttribute('_x');
    const childId = convertXmlElement(tree, firstChildEl, warnings);
    if (childId) {
      const res = tree.connect(rootNode.id, childId);
      if (!res.ok) warnings.push(`Could not connect the root to the first node: ${res.reason}`);
    }
  } else {
    warnings.push('The imported <BehaviorTree> is empty.');
  }

  if (!hasPositions) computeTreeLayout(tree);

  return { tree, warnings };
}

function convertXmlElement(tree, el, warnings) {
  const tagName = el.tagName;
  const childEls = [...el.children];
  let type = XML_IMPORT_TAG_TO_TYPE[tagName];
  let isUnknown = false;
  if (!type) {
    isUnknown = true;
    type = childEls.length > 0 ? 'sequence' : 'action';
    warnings.push(`Unknown tag "<${tagName}>" imported as ${type === 'sequence' ? 'Sequence' : 'Action'}.`);
  }

  const idAttr = el.getAttribute('ID');
  const title = idAttr || (isUnknown ? tagName : undefined);
  const x = numAttr(el, '_x', 0);
  const y = numAttr(el, '_y', 0);
  const description = el.getAttribute('_desc') || '';
  let comments = el.getAttribute('_comments') || '';
  if (isUnknown) comments = comments ? `${comments} | Imported from <${tagName}>` : `Imported from <${tagName}>`;

  const params = {};
  if (type === 'parallel') {
    if (el.hasAttribute('success_threshold')) params.success_threshold = numAttr(el, 'success_threshold', -1);
    if (el.hasAttribute('failure_threshold')) params.failure_threshold = numAttr(el, 'failure_threshold', 1);
  } else if (type === 'retry') {
    if (el.hasAttribute('num_attempts')) params.num_attempts = numAttr(el, 'num_attempts', 3);
  } else if (type === 'repeat') {
    if (el.hasAttribute('num_cycles')) params.num_cycles = numAttr(el, 'num_cycles', 3);
  } else if (type === 'timeout') {
    if (el.hasAttribute('msec')) params.msec = numAttr(el, 'msec', 1000);
  } else if (type === 'action') {
    if (el.hasAttribute('result')) params.result = el.getAttribute('result');
  } else if (type === 'condition') {
    if (el.hasAttribute('expression')) params.expression = el.getAttribute('expression');
  }

  const node = new Node({ type, x, y, title, description, comments, params });
  tree.addNode(node);

  for (const childEl of childEls) {
    const childId = convertXmlElement(tree, childEl, warnings);
    if (childId) {
      const res = tree.connect(node.id, childId);
      if (!res.ok) warnings.push(`Could not connect "<${childEl.tagName}>" (${res.reason}).`);
    }
  }
  return node.id;
}
