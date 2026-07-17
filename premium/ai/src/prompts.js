/**
 * prompts.js — pure prompt builders for the AI Quick Actions. Kept separate +
 * pure so the exact wording is unit-testable and easy to tune. No editor, no
 * network. Each returns { system, prompt } for editor.aiComplete().
 */

const SYSTEM = 'You are a writing assistant embedded in a rich-text editor. '
  + 'Return ONLY the transformed text with no preamble, quotes, or explanation.';

/** rewrite / improve the selected text. */
export function rewritePrompt(text) {
  return { system: SYSTEM, prompt: `Rewrite the following text to be clearer and more polished, keeping its meaning and language:\n\n${text}` };
}

/** summarize the selected text. */
export function summarizePrompt(text) {
  return { system: SYSTEM, prompt: `Summarize the following text concisely, in the same language:\n\n${text}` };
}

/** change the tone of the selected text. */
export function tonePrompt(text, tone) {
  const t = String(tone || 'professional').trim();
  return { system: SYSTEM, prompt: `Rewrite the following text in a ${t} tone, keeping its meaning and language:\n\n${text}` };
}

/** shorten / lengthen. */
export function lengthPrompt(text, direction) {
  const longer = direction === 'longer';
  return {
    system: SYSTEM,
    prompt: `${longer ? 'Expand' : 'Shorten'} the following text${longer ? ' with more detail' : ' while keeping the key points'}, in the same language:\n\n${text}`,
  };
}

/** translate the selected text into a target language. */
export function translatePrompt(text, language) {
  const lang = String(language || 'English').trim();
  return {
    system: SYSTEM,
    prompt: `Translate the following text into ${lang}. Return only the translation, preserving formatting and meaning:\n\n${text}`,
  };
}

/** Default target languages for the Translate menu. */
export const TRANSLATE_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Chinese (Simplified)', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Russian',
];

/** The built-in Quick Action set (id → label + builder). */
export const QUICK_ACTIONS = [
  { id: 'rewrite', label: 'Improve writing', build: (t) => rewritePrompt(t) },
  { id: 'summarize', label: 'Summarize', build: (t) => summarizePrompt(t) },
  { id: 'shorten', label: 'Make shorter', build: (t) => lengthPrompt(t, 'shorter') },
  { id: 'lengthen', label: 'Make longer', build: (t) => lengthPrompt(t, 'longer') },
  { id: 'professional', label: 'Tone: professional', build: (t) => tonePrompt(t, 'professional') },
  { id: 'casual', label: 'Tone: casual', build: (t) => tonePrompt(t, 'casual') },
  { id: 'confident', label: 'Tone: confident', build: (t) => tonePrompt(t, 'confident') },
];
