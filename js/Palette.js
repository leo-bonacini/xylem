
const FAVORITES_KEY = 'bt-editor-favorites-v1';
const COLLAPSED_KEY = 'bt-editor-palette-collapsed-v1';

// localStorage can throw SecurityError on file:// pages with an opaque
// origin; favorites/collapsed categories are just UI convenience, so they
// fail silently (stays in memory for that session) instead of crashing the app.
function readStoredSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
}

function writeStoredSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* storage unavailable: preference won't persist for this session */
  }
}

class Palette {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.listEl
   * @param {HTMLInputElement} opts.searchEl
   * @param {(type:string)=>void} opts.onAddNode click-to-add fallback
   */
  constructor({ listEl, searchEl, onAddNode }) {
    this.listEl = listEl;
    this.searchEl = searchEl;
    this.onAddNode = onAddNode;
    this.favorites = readStoredSet(FAVORITES_KEY);
    this.collapsed = readStoredSet(COLLAPSED_KEY);
    this.query = '';

    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value.trim().toLowerCase();
      this.render();
    });

    this.render();
  }

  _toggleFavorite(typeId, focusKey) {
    if (this.favorites.has(typeId)) this.favorites.delete(typeId);
    else this.favorites.add(typeId);
    writeStoredSet(FAVORITES_KEY, this.favorites);
    this.render(focusKey);
  }

  _toggleCollapsed(category) {
    if (this.collapsed.has(category)) this.collapsed.delete(category);
    else this.collapsed.add(category);
    writeStoredSet(COLLAPSED_KEY, this.collapsed);
    this.render(`header:${category}`);
  }

  /** Rebuilds the list. `focusKey` puts keyboard focus back on the control
   * that triggered the re-render, since the old element is gone. */
  render(focusKey) {
    this.listEl.innerHTML = '';

    const byCategory = {};
    for (const type of Object.values(NODE_TYPES)) {
      if (this.query && !type.label.toLowerCase().includes(this.query)) continue;
      (byCategory[type.category] ||= []).push(type);
    }

    if (this.favorites.size > 0 && !this.query) {
      const favTypes = [...this.favorites].map((id) => NODE_TYPES[id]).filter(Boolean);
      if (favTypes.length) this._renderCategory('favorites', 'Favorites', favTypes);
    }

    for (const cat of CATEGORY_ORDER) {
      const types = byCategory[cat];
      if (types && types.length) this._renderCategory(cat, CATEGORY_LABELS[cat], types);
    }

    if (focusKey) this.listEl.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  _renderCategory(key, label, types) {
    const wrap = document.createElement('div');
    wrap.className = 'palette-category' + (this.collapsed.has(key) ? ' collapsed' : '');

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'palette-category-header';
    header.dataset.focusKey = `header:${key}`;
    header.setAttribute('aria-expanded', String(!this.collapsed.has(key)));
    header.innerHTML = `<span class="chevron" aria-hidden="true">▾</span><span>${label}</span>`;
    header.addEventListener('click', () => this._toggleCollapsed(key));
    wrap.appendChild(header);

    const items = document.createElement('div');
    items.className = 'palette-items';
    for (const type of types) items.appendChild(this._createItem(type, key));
    wrap.appendChild(items);

    this.listEl.appendChild(wrap);
  }

  /** The item is a draggable wrapper holding two controls: the label (adds
   * the node on click or Enter/Space) and the favorite toggle. They are
   * siblings so no interactive element is nested inside another. */
  _createItem(type, categoryKey) {
    const item = document.createElement('div');
    item.className = 'palette-item';
    item.style.setProperty('--item-color', type.color);
    item.draggable = true;
    item.title = type.description;

    const isFavorite = this.favorites.has(type.id);
    const favKey = `fav:${categoryKey}:${type.id}`;
    item.innerHTML = `
      <span class="p-main" role="button" tabindex="0" aria-label="Add ${type.label} node">
        <span class="p-icon" aria-hidden="true">${type.icon}</span>
        <span class="p-label">${type.label}</span>
      </span>
      <button type="button" class="p-fav${isFavorite ? ' active' : ''}" data-focus-key="${favKey}"
        aria-pressed="${isFavorite}" aria-label="Favorite ${type.label}">★</button>
    `;

    item.querySelector('.p-fav').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleFavorite(type.id, favKey);
    });

    item.querySelector('.p-main').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onAddNode?.(type.id);
      }
    });

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('node-type', type.id);
      e.dataTransfer.effectAllowed = 'copy';
    });

    item.addEventListener('click', () => this.onAddNode?.(type.id));

    return item;
  }
}
