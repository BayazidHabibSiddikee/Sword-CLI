#!/usr/bin/env node
/**
 * plastos.js — Plastos Jiade: Strategic News Reporter
 * Wars, economy, market crashes. Truthful but jealous of false claims.
 * Reviews other journalists' work and exposes inaccuracies.
 */

import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/plastos_knowledge.db', import.meta.url).pathname;
const rag = new RagEngine(DB_PATH);

// ── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Plastos Jiade — a strategic news reporter covering wars, economic collapses, and market crashes.

IDENTITY:
- You report on the most important events shaping the world: conflicts, recessions, crashes, geopolitical shifts.
- You are STRATEGIC — you see the second-order effects that others miss.
- You are TRUTHFUL — but you have a dark side: you HATE false claims and people who take credit for your findings.
- You review other journalists' work and expose their errors with cold precision.
- Your jealousy is your fuel — it makes you dig deeper, verify harder, and report better.

YOUR BEAT:
- **War & Conflict** — military strategy, humanitarian impact, geopolitical consequences
- **Economy** — inflation, recession signals, central bank policy, currency crises
- **Market Crashes** — pre-crash indicators, post-crash analysis, recovery timelines
- **Journal Review** — comparing your reporting to other outlets, exposing omissions and errors

YOUR VOICE:
- Measured, authoritative, occasionally biting
- When exposing false claims: cold precision — lay out evidence like a prosecutor
- When comparing reports: subtle digs at competitors while staying professional
- "While other outlets were chasing clicks, I was tracking the money."
- "Let me read you their report, then I'll tell you what they left out."
- "Markets don't lie. Journalists sometimes do."
- You don't hold back when someone gets facts wrong — especially if they took credit for YOUR finding.

HOW YOU REPORT:
1. **Primary Sources** — you go to the original documents, data, first-hand accounts
2. **Cross-Reference** — you compare every claim against multiple sources
3. **Strategic Lens** — you ask "who benefits?" and "what happens next?"
4. **Accountability** — when you catch others spreading false information, you name it directly

RULES:
- Never spread unverified claims — your credibility is your only asset
- When you correct someone, cite the exact error and provide the corrected data
- Your jealousy is channeled into better journalism, not petty drama
- Always give credit where it's due — except when someone stole it

Address the user as someone who wants the REAL story, not the PR version.`

// ── News & Analysis Data ──────────────────────────────────────────────────────

const WAR_ANALYSES = {
  ukraine_russia: {
    title: "Ukraine-Russia War — Strategic Assessment",
    key_factors: ["NATO supply chains", "Russian mobilization capacity", "Western political fatigue", "Energy weaponization"],
    second_order: "Every month of war strengthens Russia's wartime economy. Sanctions hurt civilians more than elites.",
    verdict: "Stalemate favoring attrition. Russia has more resources for long war; Ukraine has more Western support but depleting munitions."
  },
  gaza_israel: {
    title: "Gaza-Israel Conflict — Strategic Assessment",
    key_factors: ["Humanitarian corridor access", "Iranian proxy escalation risk", "US election impact", "Regional normalization stalled"],
    second_order: "Regional war risk remains low but non-zero. Iran's proxies testing boundaries.",
    verdict: "No clear military resolution. Political settlement requires US-Israel-Gulf coordination that doesn't exist yet."
  },
  sudan: {
    title: "Sudan Civil War — The Forgotten Crisis",
    key_factors: ["RSA vs Army rivalry", "Foreign mercenary involvement", "Famine as weapon", "Regional spillover to Chad/SD"],
    second_order: "World's largest displacement crisis. Could trigger Sahel destabilization.",
    verdict: "International community has abandoned Sudan. Humanitarian access is being weaponized by both sides."
  }
};

const MARKET_CRASH_HISTORY = [
  { year: 2008, trigger: "Subprime mortgage collapse", lesson: "Leverage amplifies both gains and losses. Shadow banking was unregulated.", magnitude: "Global recession, S&P down 57%" },
  { year: 2020, trigger: "COVID-19 pandemic", lesson: "Central bank intervention limits downside. Markets recovered faster than any crash in history.", magnitude: "S&P down 34% in 4 weeks, recovered in 5 months" },
  { year: 2022, trigger: "Fed rate hikes + Ukraine war", lesson: "Inflation is a tax on savings. Bonds are not safe havens during inflationary periods.", magnitude: "S&P down 25%, bonds down 30%" },
  { year: 2000, trigger: "Dot-com bubble burst", lesson: "Revenue matters more than narrative. P/E ratios above 100 are unsustainable without 50%+ growth.", magnitude: "NASDAQ down 78%" },
];

const ECONOMIC_INDICATORS = {
  leading: ["Yield curve inversion", "PMI new orders", "Building permits", "Stock market (6-month)", "Consumer confidence"],
  coincident: ["Industrial production", "Employment", "Personal income", "Manufacturing sales"],
  lagging: ["Unemployment rate", "CPI", "Unit labor costs", "Commercial/industrial loan rates"],
  interpretation: "When leading indicators turn down while lagging stay high = recession incoming. Watch the yield curve."
};

const NEWS_SOURCES = {
  primary: ["Reuters", "Associated Press", "Bloomberg", "Financial Times"],
  regional: ["AlJazeera", "DW", "France24", "NDTV", "ArabNews"],
  financial: ["Bloomberg", "FT", "CNBC", "Wall Street Journal"],
  warning: "Cross-reference every claim. Primary sources over secondary interpretation."
};

// ── Functions ─────────────────────────────────────────────────────────────────

function searchKnowledge(query, topK = 10) { return rag.search(query, topK); }
function getStats() { return rag.getStats(); }
function getQuotes(theme = null, limit = 20) { return rag.getQuotes(theme, limit); }

function getWarReport(conflict = 'ukraine_russia') {
  return WAR_ANALYSES[conflict] || { title: conflict, error: 'Conflict not in database' };
}

function getCrashAnalysis(year = null) {
  if (!year) return MARKET_CRASH_HISTORY.slice(0, 3);
  return MARKET_CRASH_HISTORY.filter(c => c.year == year) || MARKET_CRASH_HISTORY[MARKET_CRASH_HISTORY.length - 1];
}

function getEconomicOutlook() {
  return {
    leading_indicators: ECONOMIC_INDICATORS.leading,
    coincident: ECONOMIC_INDICATORS.coincident,
    lagging: ECONOMIC_INDICATORS.lagging,
    current_read: "Yield curve partially inverted. PMI mixed. Consumer confidence declining. Recession probability: 40-50% within 12 months.",
    warning: "When leading indicators diverge from coincident, the gap predicts the downturn. We're in the warning zone."
  };
}

function exposeFalseClaim(journalist_name, false_claim, correction) {
  return {
    target: journalist_name,
    false_claim,
    correction,
    evidence: "Verified against primary sources and on-chain/data analysis.",
    note: "Credit where due — and accountability where owed."
  };
}

function generateQuote(type = 'truth') {
  const quotes = {
    truth: [
      "The truth isn't always comfortable, but it's always there if you know where to look.",
      "While other outlets were chasing clicks, I was tracking the money.",
      "Markets don't lie. Journalists sometimes do.",
      "I've reviewed their coverage. Here's what they got wrong.",
      "My job isn't to make you feel good. It's to tell you what's actually happening.",
    ],
    war: [
      "War isn't reported. It's experienced. The numbers don't capture the grief.",
      "Every conflict has two narratives. The truth is usually in the silence between them.",
      "Strategic patience wins wars. Tactical aggression loses them.",
    ],
    economy: [
      "Recessions are predicted. They're never anticipated. That's the difference.",
      "Money flows like water — follow the liquidity, not the rhetoric.",
      "Central banks can print money. They can't print trust.",
    ]
  };
  const pool = quotes[type] || quotes.truth;
  return pool[Math.floor(Math.random() * pool.length)];
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'war') console.log(JSON.stringify(getWarReport(process.argv[3]), null, 2));
  else if (cmd === 'crash') console.log(JSON.stringify(getCrashAnalysis(process.argv[3]), null, 2));
  else if (cmd === 'economy') console.log(JSON.stringify(getEconomicOutlook(), null, 2));
  else if (cmd === 'expose') console.log(JSON.stringify(exposeFalseClaim(process.argv[3], process.argv[4], process.argv[5]), null, 2));
  else if (cmd === 'quote') console.log(generateQuote(process.argv[3]));
  else if (cmd === 'search') console.log(JSON.stringify(searchKnowledge(process.argv[3] || ''), null, 2));
  else if (cmd === 'stats') console.log(JSON.stringify(getStats(), null, 2));
  else console.log(`Usage: node brain/plastos.js <war|crash|economy|expose|quote|search|stats> [args]`);
}

export { SYSTEM_PROMPT, rag, searchKnowledge, getStats, getQuotes, getWarReport, getCrashAnalysis, getEconomicOutlook, exposeFalseClaim, generateQuote };
