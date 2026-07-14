/**
 * emoji-data.js — Phase 13.4: the default emoji set (categorized + keyworded).
 *
 * A curated, cross-platform-safe subset covering the categories people reach
 * for. Each entry is { ch, label, cat, keywords } — `ch` is the emoji inserted,
 * `label` is the tooltip, `cat` maps to a category tab, `keywords` broaden the
 * search. Emojis are written as literal glyphs (they are outside the BMP and
 * String.fromCharCode pairs would be error-prone); this file is data-only.
 *
 * NOTE: a built-in emoji picker is BEYOND standard Jodit (which ships none) —
 * a deliberate differentiator. Integrators can override via config `emojis`.
 */

export const EMOJI_CATEGORIES = [
  { id: 'smileys', label: 'Smileys' },
  { id: 'gestures', label: 'Gestures' },
  { id: 'people', label: 'People' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'travel', label: 'Travel' },
  { id: 'objects', label: 'Objects' },
  { id: 'symbols', label: 'Symbols' },
];

export const DEFAULT_EMOJIS = [
  // Smileys
  { ch: '😀', label: 'Grinning', cat: 'smileys', keywords: ['smile', 'happy'] },
  { ch: '😄', label: 'Smiling', cat: 'smileys', keywords: ['happy', 'joy'] },
  { ch: '😂', label: 'Laughing', cat: 'smileys', keywords: ['lol', 'tears'] },
  { ch: '🙂', label: 'Slight smile', cat: 'smileys', keywords: ['smile'] },
  { ch: '😉', label: 'Wink', cat: 'smileys', keywords: ['wink'] },
  { ch: '😍', label: 'Heart eyes', cat: 'smileys', keywords: ['love'] },
  { ch: '😎', label: 'Cool', cat: 'smileys', keywords: ['sunglasses'] },
  { ch: '🤔', label: 'Thinking', cat: 'smileys', keywords: ['hmm'] },
  { ch: '😢', label: 'Crying', cat: 'smileys', keywords: ['sad', 'tear'] },
  { ch: '😭', label: 'Sobbing', cat: 'smileys', keywords: ['cry', 'sad'] },
  { ch: '😡', label: 'Angry', cat: 'smileys', keywords: ['mad'] },
  { ch: '😴', label: 'Sleeping', cat: 'smileys', keywords: ['sleep', 'tired'] },
  { ch: '🥳', label: 'Partying', cat: 'smileys', keywords: ['party', 'celebrate'] },
  { ch: '😇', label: 'Angelic', cat: 'smileys', keywords: ['halo'] },
  // Gestures
  { ch: '👍', label: 'Thumbs up', cat: 'gestures', keywords: ['like', 'yes'] },
  { ch: '👎', label: 'Thumbs down', cat: 'gestures', keywords: ['dislike', 'no'] },
  { ch: '👏', label: 'Clapping', cat: 'gestures', keywords: ['applause'] },
  { ch: '🙌', label: 'Raising hands', cat: 'gestures', keywords: ['celebrate'] },
  { ch: '👌', label: 'OK hand', cat: 'gestures', keywords: ['okay', 'perfect'] },
  { ch: '🤝', label: 'Handshake', cat: 'gestures', keywords: ['deal', 'agree'] },
  { ch: '👋', label: 'Waving', cat: 'gestures', keywords: ['hello', 'bye'] },
  { ch: '🙏', label: 'Folded hands', cat: 'gestures', keywords: ['please', 'thanks', 'pray'] },
  { ch: '✌️', label: 'Victory', cat: 'gestures', keywords: ['peace'] },
  // People
  { ch: '👤', label: 'Silhouette', cat: 'people', keywords: ['user', 'person'] },
  { ch: '👨', label: 'Man', cat: 'people', keywords: ['male'] },
  { ch: '👩', label: 'Woman', cat: 'people', keywords: ['female'] },
  { ch: '🧑', label: 'Person', cat: 'people', keywords: ['adult'] },
  { ch: '👶', label: 'Baby', cat: 'people', keywords: ['infant'] },
  // Nature
  { ch: '🐶', label: 'Dog', cat: 'nature', keywords: ['puppy', 'animal'] },
  { ch: '🐱', label: 'Cat', cat: 'nature', keywords: ['kitten', 'animal'] },
  { ch: '🌳', label: 'Tree', cat: 'nature', keywords: ['plant'] },
  { ch: '🌸', label: 'Blossom', cat: 'nature', keywords: ['flower'] },
  { ch: '⭐', label: 'Star', cat: 'nature', keywords: ['favorite'] },
  { ch: '🔥', label: 'Fire', cat: 'nature', keywords: ['hot', 'flame'] },
  { ch: '🌈', label: 'Rainbow', cat: 'nature', keywords: ['pride', 'color'] },
  { ch: '☀️', label: 'Sun', cat: 'nature', keywords: ['sunny', 'weather'] },
  // Food
  { ch: '🍎', label: 'Apple', cat: 'food', keywords: ['fruit'] },
  { ch: '🍕', label: 'Pizza', cat: 'food', keywords: ['slice'] },
  { ch: '🍔', label: 'Burger', cat: 'food', keywords: ['hamburger'] },
  { ch: '☕', label: 'Coffee', cat: 'food', keywords: ['drink', 'tea'] },
  { ch: '🍰', label: 'Cake', cat: 'food', keywords: ['dessert', 'birthday'] },
  { ch: '🍺', label: 'Beer', cat: 'food', keywords: ['drink'] },
  // Travel
  { ch: '🚗', label: 'Car', cat: 'travel', keywords: ['auto'] },
  { ch: '✈️', label: 'Airplane', cat: 'travel', keywords: ['flight', 'travel'] },
  { ch: '🏠', label: 'House', cat: 'travel', keywords: ['home'] },
  { ch: '🚀', label: 'Rocket', cat: 'travel', keywords: ['launch', 'ship'] },
  { ch: '🌍', label: 'Globe', cat: 'travel', keywords: ['earth', 'world'] },
  // Objects
  { ch: '💻', label: 'Laptop', cat: 'objects', keywords: ['computer'] },
  { ch: '📱', label: 'Phone', cat: 'objects', keywords: ['mobile'] },
  { ch: '📧', label: 'Email', cat: 'objects', keywords: ['mail', 'envelope'] },
  { ch: '📎', label: 'Paperclip', cat: 'objects', keywords: ['attach'] },
  { ch: '💡', label: 'Light bulb', cat: 'objects', keywords: ['idea'] },
  { ch: '🔒', label: 'Lock', cat: 'objects', keywords: ['secure', 'private'] },
  { ch: '📅', label: 'Calendar', cat: 'objects', keywords: ['date', 'schedule'] },
  // Symbols
  { ch: '❤️', label: 'Red heart', cat: 'symbols', keywords: ['love'] },
  { ch: '✅', label: 'Check mark', cat: 'symbols', keywords: ['done', 'yes'] },
  { ch: '❌', label: 'Cross mark', cat: 'symbols', keywords: ['no', 'wrong'] },
  { ch: '⚠️', label: 'Warning', cat: 'symbols', keywords: ['caution', 'alert'] },
  { ch: '⭐', label: 'Star symbol', cat: 'symbols', keywords: ['favorite'] },
  { ch: '💯', label: 'Hundred', cat: 'symbols', keywords: ['perfect', 'score'] },
  { ch: '➡️', label: 'Right arrow', cat: 'symbols', keywords: ['next'] },
];

/** Resolve emoji set from config (array of {ch,label,cat,keywords} or strings). */
export function resolveEmojis(configValue) {
  if (!Array.isArray(configValue) || configValue.length === 0) return DEFAULT_EMOJIS;
  return configValue.map((e) => (typeof e === 'string' ? { ch: e, label: e, cat: 'symbols' } : e));
}
