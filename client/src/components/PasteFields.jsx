// Form pieces shared by the create and edit pages.
import { LANGUAGES } from '../languages.js';
import { GlobeIcon, LinkIcon, LockIcon } from '../icons.jsx';

export const MAX_CONTENT_BYTES = 512 * 1024;
export const byteLength = (s) => new TextEncoder().encode(s).length;

export const VISIBILITY = [
  { id: 'unlisted', label: 'Unlisted', icon: LinkIcon, help: 'Only people with the link can see it.' },
  { id: 'public', label: 'Public', icon: GlobeIcon, help: 'Listed in the public archive and on your profile.' },
  { id: 'private', label: 'Private', icon: LockIcon, help: 'Only you can see it while logged in.' },
];

export function TitleLanguageRow({ title, language, onChange }) {
  return (
    <div className="row-2">
      <div className="field">
        <label className="legend" htmlFor="title">Title <span className="optional">optional</span></label>
        <input id="title" value={title} maxLength={100} placeholder="Untitled" onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className="field">
        <label className="legend" htmlFor="language">Syntax highlighting</label>
        <select id="language" value={language} onChange={(e) => onChange({ language: e.target.value })}>
          {LANGUAGES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Code editor textarea: Tab inserts a tab character, Ctrl/⌘+Enter submits. */
export function ContentEditor({ value, onChange, onSubmit, autoFocus = false }) {
  return (
    <div className="editor">
      <div className="editor-bar">
        <label htmlFor="content">Content</label>
        <span>{value.length.toLocaleString()} characters · {value ? value.split('\n').length : 0} lines</span>
      </div>
      <textarea
        id="content"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSubmit(e);
          if (e.key === 'Tab' && !e.shiftKey) {
            // Insert a tab instead of leaving the editor (Shift+Tab still moves focus).
            e.preventDefault();
            const el = e.target;
            const { selectionStart: s, selectionEnd: end } = el;
            onChange(`${value.slice(0, s)}\t${value.slice(end)}`);
            requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1));
          }
        }}
        placeholder="Paste or type your text here…"
        spellCheck={false}
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function VisibilityField({ value, onChange }) {
  const current = VISIBILITY.find((v) => v.id === value) ?? VISIBILITY[0];
  return (
    <fieldset className="setting">
      <legend>Visibility</legend>
      <div className="segmented" role="radiogroup">
        {VISIBILITY.map((v) => (
          <button
            key={v.id} type="button" role="radio" aria-checked={value === v.id}
            className={value === v.id ? 'active' : ''} onClick={() => onChange(v.id)} title={v.help}
          >
            <v.icon /> {v.label}
          </button>
        ))}
      </div>
      <p className="help">{current.help}</p>
    </fieldset>
  );
}
