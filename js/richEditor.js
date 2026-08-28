// ============================================================
// RICH EDITOR — editor de texto rico leve, estilo Jira/Confluence
// ------------------------------------------------------------
// Baseado em contentEditable + document.execCommand. Não depende
// de nenhuma biblioteca externa. Produz/consome HTML.
// ============================================================

import { escapeHtml } from './ui.js';

const COLORS = [
  { label: 'Padrão', value: '' },
  { label: 'Vermelho', value: '#FF5C5C' },
  { label: 'Laranja', value: '#F5A623' },
  { label: 'Verde', value: '#3DD68C' },
  { label: 'Azul', value: '#5B8DEF' },
  { label: 'Violeta', value: '#7C6FFF' },
];

let idCounter = 0;

/**
 * Cria um editor de texto rico dentro de `container`.
 * @param {HTMLElement} container - elemento onde o editor será montado.
 * @param {{ value?: string, placeholder?: string, minHeight?: string }} opts
 * @returns {{ getHTML: () => string, setHTML: (html: string) => void, focus: () => void }}
 */
export function createRichEditor(container, opts = {}) {
  const uid = 're-' + (++idCounter);
  const placeholder = opts.placeholder || 'Digite aqui...';
  const minHeight = opts.minHeight || '90px';

  container.innerHTML = `
    <div class="rich-editor" id="${uid}">
      <div class="rich-editor-toolbar">
        <button type="button" class="re-btn" data-cmd="bold" title="Negrito (Ctrl+B)"><strong>B</strong></button>
        <button type="button" class="re-btn" data-cmd="italic" title="Itálico (Ctrl+I)"><em>I</em></button>
        <span class="re-sep"></span>
        <button type="button" class="re-btn" data-cmd="insertUnorderedList" title="Lista com marcadores">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>
        </button>
        <button type="button" class="re-btn" data-cmd="insertOrderedList" title="Lista numerada">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="1" y="8" font-size="7" fill="currentColor" stroke="none">1</text><text x="1" y="14" font-size="7" fill="currentColor" stroke="none">2</text><text x="1" y="20" font-size="7" fill="currentColor" stroke="none">3</text></svg>
        </button>
        <span class="re-sep"></span>
        <button type="button" class="re-btn" data-cmd="formatBlock" data-value="blockquote" title="Citação">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 5-2 5-5V9a2 2 0 00-2-2H4v6h3c0 2-1 3-4 3v2z"/><path d="M14 21c3 0 5-2 5-5V9a2 2 0 00-2-2h-2v6h3c0 2-1 3-4 3v2z"/></svg>
        </button>
        <button type="button" class="re-btn" data-cmd="inlineCode" title="Código">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button type="button" class="re-btn" data-cmd="codeBlock" title="Bloco de código">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9l-2 3 2 3M16 9l2 3-2 3"/></svg>
        </button>
        <span class="re-sep"></span>
        <div class="re-color-wrap">
          <button type="button" class="re-btn" data-toggle="colors" title="Cor do texto">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" fill="currentColor" stroke="none" opacity="0"/><circle cx="12" cy="12" r="9"/></svg>
            <span class="re-color-dot" style="background:currentColor;"></span>
          </button>
          <div class="re-color-menu hidden">
            ${COLORS.map((c) => `<button type="button" class="re-color-swatch" data-color="${c.value}" title="${escapeHtml(c.label)}" style="background:${c.value || 'transparent'};"></button>`).join('')}
          </div>
        </div>
        <span class="re-sep"></span>
        <button type="button" class="re-btn" data-cmd="removeFormat" title="Limpar formatação">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4L9.5 20"/></svg>
        </button>
      </div>
      <div class="rich-editor-body" contenteditable="true" data-placeholder="${escapeHtml(placeholder)}" style="min-height:${minHeight};"></div>
    </div>
  `;

  const root = container.querySelector(`#${uid}`);
  const toolbar = root.querySelector('.rich-editor-toolbar');
  const body = root.querySelector('.rich-editor-body');
  const colorMenu = root.querySelector('.re-color-menu');
  const colorToggle = root.querySelector('[data-toggle="colors"]');

  body.innerHTML = opts.value || '';
  updatePlaceholderState();

  function updatePlaceholderState() {
    const empty = !body.textContent.trim() && !body.querySelector('img');
    body.classList.toggle('is-empty', empty);
  }

  function exec(cmd, value) {
    body.focus();
    document.execCommand(cmd, false, value);
    updatePlaceholderState();
  }

  function wrapSelectionInTag(tagName) {
    body.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const el = document.createElement(tagName);
    try {
      range.surroundContents(el);
    } catch (e) {
      // seleção cruza múltiplos elementos: fallback simples
      const content = range.extractContents();
      el.appendChild(content);
      range.insertNode(el);
    }
    sel.removeAllRanges();
    updatePlaceholderState();
  }

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.re-btn');
    if (!btn) return;
    e.preventDefault();

    if (btn.dataset.toggle === 'colors') {
      colorMenu.classList.toggle('hidden');
      return;
    }

    const cmd = btn.dataset.cmd;
    if (cmd === 'inlineCode') {
      wrapSelectionInTag('code');
      return;
    }
    if (cmd === 'codeBlock') {
      exec('formatBlock', 'pre');
      return;
    }
    if (cmd === 'formatBlock') {
      exec('formatBlock', btn.dataset.value);
      return;
    }
    exec(cmd);
  });

  colorMenu.addEventListener('click', (e) => {
    const swatch = e.target.closest('.re-color-swatch');
    if (!swatch) return;
    const color = swatch.dataset.color;
    if (color) {
      exec('foreColor', color);
      colorToggle.style.color = color;
    } else {
      wrapSelectionInTag('span'); // no-op seguro; "Padrão" apenas fecha o menu
    }
    colorMenu.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) colorMenu.classList.add('hidden');
  });

  body.addEventListener('input', updatePlaceholderState);
  body.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); exec('bold'); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); exec('italic'); }
    if (e.key === ' ') handleAutoFormat(e);
  });

  // ------------------------------------------------------------
  // AUTO-FORMATAÇÃO (estilo Jira/Notion): "1. " -> lista numerada,
  // "- " ou "* " -> lista com marcadores, "> " -> citação.
  // ------------------------------------------------------------
  const AUTO_TRIGGERS = {
    '1.': 'orderedList',
    '1)': 'orderedList',
    '-': 'bulletList',
    '*': 'bulletList',
    '>': 'blockquote',
  };

  function getCaretBlockInfo() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;

    let blockEl = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    while (blockEl && blockEl !== body && blockEl.parentElement && blockEl.parentElement !== body) {
      blockEl = blockEl.parentElement;
    }
    if (!blockEl || (blockEl !== body && !body.contains(blockEl))) return null;

    const preRange = document.createRange();
    preRange.selectNodeContents(blockEl);
    preRange.setEnd(range.startContainer, range.startOffset);

    return { blockEl, textBeforeCaret: preRange.toString(), range };
  }

  function handleAutoFormat(e) {
    const info = getCaretBlockInfo();
    if (!info) return;
    const trigger = info.textBeforeCaret;
    const kind = AUTO_TRIGGERS[trigger];
    if (!kind) return;

    e.preventDefault();

    // Remove o texto-gatilho (ex: "1.") antes de aplicar a formatação
    const delRange = document.createRange();
    delRange.selectNodeContents(info.blockEl);
    delRange.setEnd(info.range.startContainer, info.range.startOffset);
    delRange.deleteContents();

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(delRange);

    body.focus();
    if (kind === 'orderedList') document.execCommand('insertOrderedList');
    else if (kind === 'bulletList') document.execCommand('insertUnorderedList');
    else if (kind === 'blockquote') document.execCommand('formatBlock', false, 'blockquote');

    updatePlaceholderState();
  }

  return {
    getHTML: () => (body.classList.contains('is-empty') ? '' : body.innerHTML),
    setHTML: (html) => { body.innerHTML = html || ''; updatePlaceholderState(); },
    focus: () => body.focus(),
  };
}

/**
 * Campo de texto rico que começa "recolhido": mostra o conteúdo (ou
 * "Não preenchido") como texto simples, e só vira um editor de verdade
 * quando o usuário clica nele. Evita poluir a tela com várias toolbars
 * abertas ao mesmo tempo quando os campos ainda estão vazios.
 */
export function createCollapsibleField(container, opts = {}) {
  const emptyLabel = opts.emptyLabel || 'Não preenchido';
  let expanded = false;
  let editor = null;
  let currentValue = opts.value || '';

  function renderView() {
    const trimmed = currentValue.trim();
    container.innerHTML = trimmed
      ? `<div class="readonly-block collapsible-field-view">${trimmed}</div>`
      : `<div class="readonly-block is-empty collapsible-field-view">${escapeHtml(emptyLabel)}</div>`;
    container.querySelector('.collapsible-field-view').addEventListener('click', expand);
  }

  function expand() {
    if (expanded) return;
    expanded = true;
    editor = createRichEditor(container, {
      value: currentValue,
      placeholder: opts.placeholder,
      minHeight: opts.minHeight,
    });
    editor.focus();
  }

  renderView();

  return {
    getHTML: () => (expanded ? editor.getHTML() : currentValue),
  };
}
