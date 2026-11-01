// Helper dựng DOM an toàn: chỉ dùng textContent / text node cho dữ liệu, không innerHTML với dữ liệu người dùng.

const PROP_KEYS = new Set(['value', 'checked', 'selected', 'disabled']);

/**
 * h('div', { class: 'card', onClick: fn }, 'text', childNode, [..])
 * - on* => addEventListener; value/checked/selected/disabled => property; false/null bị bỏ qua.
 * - Con kiểu string luôn thành text node (không parse HTML).
 */
export function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val == null || val === false) continue;
    if (key === 'class') node.className = val;
    else if (key.length > 2 && key.startsWith('on') && typeof val === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (PROP_KEYS.has(key)) node[key] = val;
    else node.setAttribute(key, val === true ? '' : String(val));
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

// Nội dung bên trong <svg> của icon. CHỈ là hằng số do mình viết, tuyệt đối không nối dữ liệu người dùng vào đây.
const ICONS = {
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  drop: '<path d="M12 2.7s6 6.3 6 10.8a6 6 0 0 1-12 0C6 9 12 2.7 12 2.7z"/>',
};

/** Icon SVG inline (stroke theo currentColor). */
export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Dựng phần tử SVG bằng DOM API. */
export function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
  appendChildren(node, children);
  return node;
}
