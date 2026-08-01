// Hand-written YAML serializer (no external library). Covers only what our
// own data needs: objects, arrays, strings, numbers, booleans, and null —
// enough to export the tree in a readable form, without aiming to be a
// generic, complete YAML serializer.

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const str = String(value);
  if (str === '') return "''";
  const looksSpecial =
    /^[\s]|[\s]$/.test(str) ||
    /[:#\-?\[\]{}&*!|>'"%@`]/.test(str) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(str) ||
    !Number.isNaN(Number(str)) ||
    str.includes('\n');
  if (!looksSpecial) return str;
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toYamlLines(value, indent) {
  const pad = '  '.repeat(indent);
  const lines = [];

  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${pad}[]`);
      return lines;
    }
    for (const item of value) {
      if (isPlainObject(item) || Array.isArray(item)) {
        const childLines = toYamlLines(item, indent + 1);
        lines.push(`${pad}- ${childLines[0].trimStart()}`);
        lines.push(...childLines.slice(1));
      } else {
        lines.push(`${pad}- ${yamlScalar(item)}`);
      }
    }
    return lines;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      lines.push(`${pad}{}`);
      return lines;
    }
    for (const key of keys) {
      const v = value[key];
      const isEmptyContainer = (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0);
      if ((isPlainObject(v) || Array.isArray(v)) && !isEmptyContainer) {
        lines.push(`${pad}${key}:`);
        lines.push(...toYamlLines(v, indent + 1));
      } else if (isEmptyContainer) {
        lines.push(`${pad}${key}: ${Array.isArray(v) ? '[]' : '{}'}`);
      } else {
        lines.push(`${pad}${key}: ${yamlScalar(v)}`);
      }
    }
    return lines;
  }

  lines.push(`${pad}${yamlScalar(value)}`);
  return lines;
}

function toYAML(value) {
  return toYamlLines(value, 0).join('\n') + '\n';
}

// tree-specific shape

function yamlNodeObject(tree, nodeId) {
  const node = tree.getNode(nodeId);
  const def = getNodeType(node.type);
  const obj = { type: XML_EXPORT_TAG[node.type] || node.type, title: node.title };
  if (node.description) obj.description = node.description;
  if (def.params.length > 0) obj.params = node.params;
  if (node.comments) obj.comments = node.comments;
  if (node.childIds.length > 0) obj.children = node.childIds.map((cid) => yamlNodeObject(tree, cid));
  return obj;
}

function treeToYamlObject(tree) {
  const root = tree.getRoots()[0];
  if (!root) throw new Error('The tree has no Root node.');
  const childId = root.childIds[0];
  return {
    behavior_tree: {
      id: 'MainTree',
      root: childId ? yamlNodeObject(tree, childId) : null,
    },
  };
}

function treeToYAML(tree) {
  const header = `# Behavior Tree exported from Xylem\n# ${new Date().toISOString()}\n`;
  return header + toYAML(treeToYamlObject(tree));
}
