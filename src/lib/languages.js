import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

// Supported languages: id -> [display name, highlight.js grammar, download file extension].
// Only these grammars are registered, which keeps the server bundle small.
// The same ids are listed in client/src/languages.js.
const LANGUAGES = {
  plaintext: ['Plain text', null, 'txt'],
  bash: ['Bash / Shell', bash, 'sh'],
  c: ['C', c, 'c'],
  cpp: ['C++', cpp, 'cpp'],
  csharp: ['C#', csharp, 'cs'],
  css: ['CSS', css, 'css'],
  dockerfile: ['Dockerfile', dockerfile, 'dockerfile'],
  go: ['Go', go, 'go'],
  html: ['HTML', xml, 'html'],
  java: ['Java', java, 'java'],
  javascript: ['JavaScript', javascript, 'js'],
  json: ['JSON', json, 'json'],
  kotlin: ['Kotlin', kotlin, 'kt'],
  markdown: ['Markdown', markdown, 'md'],
  php: ['PHP', php, 'php'],
  python: ['Python', python, 'py'],
  ruby: ['Ruby', ruby, 'rb'],
  rust: ['Rust', rust, 'rs'],
  scss: ['SCSS', scss, 'scss'],
  sql: ['SQL', sql, 'sql'],
  swift: ['Swift', swift, 'swift'],
  typescript: ['TypeScript', typescript, 'ts'],
  xml: ['XML', xml, 'xml'],
  yaml: ['YAML', yaml, 'yaml'],
};

for (const [id, [, grammar]] of Object.entries(LANGUAGES)) {
  if (grammar) hljs.registerLanguage(id, grammar);
}

export const isLanguage = (id) => typeof id === 'string' && Object.hasOwn(LANGUAGES, id);
export const languageName = (id) => LANGUAGES[id]?.[0] ?? 'Plain text';
export const languageExtension = (id) => LANGUAGES[id]?.[2] ?? 'txt';

/** Highlighted HTML (highlight.js escapes the text), or null when it should be shown as plain text. */
export function highlight(content, language) {
  if (!isLanguage(language) || language === 'plaintext') return null;
  return hljs.highlight(content, { language, ignoreIllegals: true }).value;
}
