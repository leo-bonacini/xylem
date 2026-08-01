// Exports the tree in a standard behavior tree XML format. Besides the
// "official" attributes (ID, num_attempts, msec, etc.), it writes attributes
// prefixed with `_` (position, description, comments) so that re-importing
// the same file in this editor restores the layout — extra attributes are
// ignored by any standard parser, so the file remains valid for them.

const XML_EXPORT_TAG = {
  sequence: 'Sequence',
  fallback: 'Fallback',
  parallel: 'Parallel',
  inverter: 'Inverter',
  retry: 'RetryUntilSuccessful',
  repeat: 'Repeat',
  timeout: 'Timeout',
  action: 'Action',
  condition: 'Condition',
  success: 'Success',
  failure: 'Failure',
  running: 'Running',
};

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function treeToXML(tree) {
  const root = tree.getRoots()[0];
  if (!root) throw new Error('The tree has no Root node.');

  const childId = root.childIds[0];
  const body = childId ? xmlNodeToString(tree, childId, 2) : '';

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<root main_tree_to_execute="MainTree">',
    `  <BehaviorTree ID="MainTree" _x="${Math.round(root.x)}" _y="${Math.round(root.y)}">`,
    body,
    '  </BehaviorTree>',
    '</root>',
  ];
  return lines.filter((l) => l !== '').join('\n');
}

function xmlNodeToString(tree, nodeId, indentLevel) {
  const node = tree.getNode(nodeId);
  if (!node) return '';
  const indent = '  '.repeat(indentLevel);
  const tag = XML_EXPORT_TAG[node.type] || 'Action';

  const attrs = [];
  const leafTypes = ['action', 'condition', 'success', 'failure', 'running'];
  if (leafTypes.includes(node.type)) attrs.push(`ID="${escapeXmlAttr(node.title)}"`);
  for (const [key, value] of Object.entries(node.params || {})) {
    attrs.push(`${key}="${escapeXmlAttr(value)}"`);
  }
  attrs.push(`_x="${Math.round(node.x)}"`, `_y="${Math.round(node.y)}"`);
  if (node.description) attrs.push(`_desc="${escapeXmlAttr(node.description)}"`);
  if (node.comments) attrs.push(`_comments="${escapeXmlAttr(node.comments)}"`);

  const attrsStr = attrs.length ? ` ${attrs.join(' ')}` : '';

  if (node.childIds.length === 0) {
    return `${indent}<${tag}${attrsStr}/>`;
  }
  const childrenXml = node.childIds.map((cid) => xmlNodeToString(tree, cid, indentLevel + 1)).join('\n');
  return `${indent}<${tag}${attrsStr}>\n${childrenXml}\n${indent}</${tag}>`;
}
