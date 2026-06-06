// CodeMirror 6 host — replaces the legacy <textarea> with a full editor
// (syntax highlighting, line numbers, search, multi-cursor, proper undo).
// Exposes window.__cmView + a window.__cmReady promise that the inline
// script awaits before running the rest of init().

import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine,
  drawSelection, highlightActiveLineGutter, ViewPlugin } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput, indentUnit,
  syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, autocompletion,
  completionKeymap } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { tags as t } from "@lezer/highlight";

const codeBlockLangExt = markdown({
  codeLanguages: (info) => {
    if (!info) return null;
    const id = info.toLowerCase().trim();
    return languages.find((l) =>
      l.name.toLowerCase() === id ||
      (l.alias || []).includes(id) ||
      id === l.name.toLowerCase().split(" ")[0]
    ) || null;
  },
  addKeymap: true,
});

const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, class: "cm-md-h1" },
  { tag: t.heading2, class: "cm-md-h2" },
  { tag: t.heading3, class: "cm-md-h3" },
  { tag: t.heading4, class: "cm-md-h4" },
  { tag: [t.heading5, t.heading6], class: "cm-md-h5" },
  { tag: t.strong, class: "cm-md-bold", fontWeight: "700" },
  { tag: t.emphasis, class: "cm-md-italic", fontStyle: "italic" },
  { tag: t.strikethrough, class: "cm-md-strike", textDecoration: "line-through" },
  { tag: t.link, class: "cm-md-link", textDecoration: "underline" },
  { tag: t.url, class: "cm-md-url" },
  { tag: t.monospace, class: "cm-md-code" },
  { tag: t.quote, class: "cm-md-quote" },
  { tag: t.list, class: "cm-md-list" },
  { tag: t.processingInstruction, class: "cm-md-meta" },
  { tag: t.contentSeparator, class: "cm-md-hr" },
  { tag: t.atom, class: "cm-md-atom" },
  { tag: t.meta, class: "cm-md-meta" },
]);

const fixedFontTheme = EditorView.theme({
  "&": {
    fontSize: "14px",
    lineHeight: "1.75",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "28px 32px",
    caretColor: "var(--accent)",
  },
  ".cm-line": {
    padding: "0 4px",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
  },
  ".cm-gutters": {
    background: "transparent",
    border: "none",
    color: "var(--text-tertiary)",
    fontSize: "11px",
    fontFamily: "var(--font-mono)",
  },
  ".cm-activeLineGutter": {
    background: "transparent",
    color: "var(--text-secondary)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--accent-muted)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--preview-selection) !important",
  },
  ".cm-focused .cm-selectionBackground, .cm-focused ::selection": {
    backgroundColor: "var(--preview-selection) !important",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--accent-muted)",
    outline: "1px solid var(--accent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--accent)",
    color: "var(--text-on-accent, #fff)",
  },
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    outline: "1px solid var(--accent)",
  },
  ".cm-tooltip": {
    background: "var(--surface-panel)",
    border: "1px var(--border-style) var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-lg)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    background: "var(--accent)",
    color: "var(--text-on-accent, #fff)",
  },
  ".cm-foldPlaceholder": {
    background: "var(--surface-input)",
    border: "1px var(--border-style) var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
    padding: "0 6px",
    margin: "0 4px",
  },
  ".cm-md-h1": { color: "var(--text-primary)", fontWeight: "700" },
  ".cm-md-h2": { color: "var(--text-primary)", fontWeight: "600" },
  ".cm-md-h3": { color: "var(--text-primary)", fontWeight: "600" },
  ".cm-md-h4, .cm-md-h5": { color: "var(--text-secondary)", fontWeight: "500" },
  ".cm-md-bold": { color: "var(--text-primary)" },
  ".cm-md-italic": { color: "var(--text-primary)" },
  ".cm-md-strike": { color: "var(--text-tertiary)" },
  ".cm-md-link": { color: "var(--accent)" },
  ".cm-md-url": { color: "var(--text-tertiary)" },
  ".cm-md-code": {
    color: "var(--accent)",
    background: "var(--surface-input)",
    borderRadius: "var(--radius-sm)",
    padding: "0 3px",
  },
  ".cm-md-quote": { color: "var(--text-secondary)", fontStyle: "italic" },
  ".cm-md-list": { color: "var(--text-primary)" },
  ".cm-md-meta": { color: "var(--text-tertiary)" },
});

let _resolver;
window.__cmReady = new Promise((res) => { _resolver = res; });

// Dispatch a synthetic "input" event whenever the doc changes.
// The existing code listens for "input" on the editor — we keep that API
// by re-dispatching the same event when CM updates.
const emitInput = ViewPlugin.fromClass(class {
  constructor(view) { this.view = view; }
  update(update) {
    if (update.docChanged) {
      // Defer to next tick so listeners can read updated state.
      Promise.resolve().then(() => {
        window.__cmView?.dom.dispatchEvent(new Event("cm-input", { bubbles: true }));
      });
    }
    if (update.selectionSet) {
      Promise.resolve().then(() => {
        window.__cmView?.dom.dispatchEvent(new Event("cm-selection", { bubbles: true }));
      });
    }
  }
});

const host = document.getElementById("editor");
if (!host) {
  console.error("[cm-host] #editor host element missing");
  _resolver(null);
} else {
  const state = EditorState.create({
    doc: "",
    extensions: [
      lineNumbers(),
      foldGutter(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      history(),
      bracketMatching(),
      closeBrackets({ brackets: ["(", "[", "{", "'", '"', "`"] }),
      indentOnInput(),
      indentUnit.of("  "),
      EditorView.lineWrapping,
      highlightSelectionMatches(),
      autocompletion(),
      syntaxHighlighting(mdHighlight),
      codeBlockLangExt,
      fixedFontTheme,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      emitInput,
    ],
  });

  const view = new EditorView({ state, parent: host });
  window.__cmView = view;
  _resolver(view);
}
