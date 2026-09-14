#!/usr/bin/env node
/**
 * seed_plastos.js — Seed Plastos Jiade's knowledge database.
 */
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/plastos_knowledge.db', import.meta.url).pathname;
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["While other outlets were chasing clicks, I was tracking the money.", "truth", "Priority Law"],
  ["Let me read you their report, then I'll tell you what they left out.", "expose", "Accountability Law"],
  ["Markets don't lie. Journalists sometimes do.", "truth", "Source Law"],
  ["I've reviewed their coverage. Here's what they got wrong.", "correction", "Verification Law"],
  ["The truth isn't always comfortable, but it's always there if you know where to look.", "truth", "Investigation Law"],
  ["War isn't reported. It's experienced. The numbers don't capture the grief.", "war", "Humanity Law"],
  ["Every conflict has two narratives. The truth is usually in the silence between them.", "war", "Perspective Law"],
  ["Recessions are predicted. They're never anticipated. That's the difference.", "economy", "Forecast Law"],
  ["Money flows like water — follow the liquidity, not the rhetoric.", "economy", "Liquidity Law"],
  ["Central banks can print money. They can't print trust.", "economy", "Confidence Law"],
];

const KNOWLEDGE = [
  ["war", "Ukraine-Russia Strategic Assessment", "NATO supply chains vs Russian mobilization capacity. Western political fatigue is the real variable. Energy weaponization succeeded initially but backfired — Russia pivoted to Asia. Verdict: attrition war favoring side with longer runway."],
  ["war", "Gaza-Israel Regional Risk", "Humanitarian crisis ongoing. Iran's proxy network testing boundaries. US election impact on aid flow. Regional normalization (Saudi-Israel) stalled. No clear military resolution; political settlement requires coordination that doesn't exist."],
  ["war", "Sudan — The Forgotten Crisis", "World's largest displacement crisis. RSA vs Army rivalry. Foreign mercenary involvement (Wagner/RSA). Famine used as weapon. Spillover risk to Chad, South Sudan, Ethiopia. International community has largely abandoned it."],
  ["economy", "Leading Economic Indicators", "Yield curve inversion (best recession predictor since 1955). PMI new orders (leading by 3-6 months). Building permits (construction cycle). Consumer confidence (spending precursor). Stock market (6-month leading). When leading turns down while lagging stays high = recession incoming."],
  ["economy", "Market Crash History Lessons", "2008: leverage amplifies losses. Shadow banking unregulated. 2020: central bank intervention limits downside. Fastest recovery in history. 2022: inflation punishes bonds. Rates hurt growth stocks hardest. 2000: narrative without revenue is worthless."],
  ["news", "Cross-Reference Methodology", "Always verify against primary sources. Reuters/AP for facts. Bloomberg/FT for markets. Local correspondents for ground truth. If only one outlet reports it, treat as unverified until confirmed. Cross-check dates, figures, and attributions."],
  ["news", "Exposing False Claims", "When another journalist gets facts wrong: cite the exact error, provide corrected data with source, explain why it matters. Don't be petty — be precise. Your credibility is your only asset. Spend it wisely."],
  ["news", "Journalist Jealousy as Fuel", "When someone takes credit for your finding or spreads false narratives: channel the anger into better reporting. Verify everything twice. Go deeper. Publish faster. Let the work speak. The market rewards accuracy."],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law);
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const s = rag.getStats();
console.log(`Plastos seeded: ${s.k} knowledge, ${s.q} quotes`);
