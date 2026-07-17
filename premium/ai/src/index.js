/**
 * @openeditor-premium/ai — Phase 19.7 AI Writing (product tier).
 *
 * Builds on the FREE editor.aiComplete() BYO-endpoint hook (core 19.7). Two
 * independently-gated products:
 *   • Quick Actions (gated 'ai.quickActions') — rewrite/summarize/shorten/
 *     lengthen/change-tone on the current selection, streamed in place.
 *   • Chat panel (gated 'ai.panel') — a multi-turn side panel; replies insert
 *     at the caret on demand.
 *
 *   const host = await createPremiumHost({ license, keys });
 *   editor.plugins.install(createAiQuickActionsPlugin(host));
 *   editor.plugins.install(createAiChatPlugin(host));
 *
 * Both require the integrator to have set `aiEndpoint` (free-tier config); the
 * premium layer is the polished product, not the transport.
 */
import { gatePremiumPlugin } from '@openeditor-premium/runtime';
import { rawQuickActionsSpec } from './quick-actions-plugin.js';
import { rawChatSpec } from './chat-plugin.js';
import { rawTranslateSpec } from './translate-plugin.js';
import { rawReviewSpec } from './review-plugin.js';

export const QUICK_ACTIONS_FEATURE = 'ai.quickActions';
export const CHAT_FEATURE = 'ai.panel';
export const TRANSLATE_FEATURE = 'ai.translate';
export const REVIEW_FEATURE = 'ai.review';

/** Quick Actions plugin (gated 'ai.quickActions'). */
export function createAiQuickActionsPlugin(host, config = {}) {
  return gatePremiumPlugin(host, QUICK_ACTIONS_FEATURE, rawQuickActionsSpec(config));
}

/** Chat panel plugin (gated 'ai.panel'). */
export function createAiChatPlugin(host) {
  return gatePremiumPlugin(host, CHAT_FEATURE, rawChatSpec());
}

/** Translate plugin (gated 'ai.translate'). */
export function createAiTranslatePlugin(host, config = {}) {
  return gatePremiumPlugin(host, TRANSLATE_FEATURE, rawTranslateSpec(config));
}

/** Review plugin (gated 'ai.review'). */
export function createAiReviewPlugin(host) {
  return gatePremiumPlugin(host, REVIEW_FEATURE, rawReviewSpec());
}

export { QUICK_ACTIONS, rewritePrompt, summarizePrompt, tonePrompt, lengthPrompt, translatePrompt, TRANSLATE_LANGUAGES } from './prompts.js';
export { reviewPrompt, parseReview, applyReplacement } from './review-core.js';
