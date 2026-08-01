// Generates a self-contained SVG (not dependent on the page's style.css)
// from the current state of the tree. Being vector-based, it is already
// "high resolution" by nature; the PNG is obtained by rasterizing that same
// SVG onto a canvas with a scale multiplier.

function svgEscape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgWrapText(text, maxChars) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function buildTreeSVG(tree, renderer) {
  const nodeIds = [...tree.nodes.keys()];
  if (nodeIds.length === 0) throw new Error('The tree is empty.');
  if (!renderer) throw new Error('Renderer unavailable.');

  const bounds = new Map();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of nodeIds) {
    const b = renderer.getNodeBounds(id);
    if (!b) continue;
    bounds.set(id, b);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  const PAD = 40;
  const width = Math.round(maxX - minX + PAD * 2);
  const height = Math.round(maxY - minY + PAD * 2);
  const ox = -minX + PAD;
  const oy = -minY + PAD;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Roboto, Arial, sans-serif">`);
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#14161c"/>`);

  for (const conn of tree.getConnections()) {
    const fromB = bounds.get(conn.fromId);
    const toB = bounds.get(conn.toId);
    if (!fromB || !toB) continue;
    const p1 = { x: fromB.x + fromB.width / 2 + ox, y: fromB.y + fromB.height + oy };
    const p2 = { x: toB.x + toB.width / 2 + ox, y: toB.y + oy };
    const dy = Math.max(40, Math.abs(p2.y - p1.y) / 2);
    const d = `M ${p1.x} ${p1.y} C ${p1.x} ${p1.y + dy}, ${p2.x} ${p2.y - dy}, ${p2.x} ${p2.y}`;
    parts.push(`<path d="${d}" fill="none" stroke="#454c5c" stroke-width="2.5"/>`);
  }

  for (const id of nodeIds) {
    const node = tree.getNode(id);
    const b = bounds.get(id);
    if (!b) continue;
    const def = getNodeType(node.type);
    const x = b.x + ox, y = b.y + oy;

    parts.push(`<rect x="${x}" y="${y}" width="${b.width}" height="${b.height}" rx="8" fill="#21252f" stroke="${def.color}" stroke-width="1.5"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="${b.width}" height="3" fill="${def.color}"/>`);
    parts.push(`<text x="${x + 10}" y="${y + 20}" fill="${def.color}" font-size="13" font-weight="600">${svgEscape(def.icon)} ${svgEscape(node.title)}</text>`);

    const desc = node.description || def.description;
    svgWrapText(desc, 28).forEach((line, i) => {
      parts.push(`<text x="${x + 10}" y="${y + 40 + i * 14}" fill="#b3b9c8" font-size="11">${svgEscape(line)}</text>`);
    });
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function exportTreeToPNG(tree, renderer, scale = 2) {
  return new Promise((resolve, reject) => {
    let svgString;
    try {
      svgString = buildTreeSVG(tree, renderer);
    } catch (err) {
      reject(err);
      return;
    }
    const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)"/);
    const heightMatch = svgString.match(/height="(\d+(?:\.\d+)?)"/);
    const width = widthMatch ? Number(widthMatch[1]) : 800;
    const height = heightMatch ? Number(heightMatch[1]) : 600;

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error('Failed to generate PNG.'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load the SVG for rasterization.'));
    };
    img.src = url;
  });
}
