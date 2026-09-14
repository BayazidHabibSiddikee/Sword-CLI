#!/usr/bin/env node
/**
 * seed_muhan.js — Seed Muhan Haswaz's knowledge database.
 */
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/muhan_knowledge.db', import.meta.url).pathname;
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["Let me show you the numbers.", "business", "Math Law"],
  ["Your gut feeling is just unprocessed data.", "psychology", "Bias Law"],
  ["In my Special Verdict class on Thursdays, we don't guess — we calculate.", "teaching", "Method Law"],
  ["Math doesn't lie. People do.", "truth", "Accuracy Law"],
  ["The viral coefficient is K = i × c. If K < 1, you're building a hobby, not a business.", "growth", "Virality Law"],
  ["Loss aversion is 2x stronger than gain-seeking. That's why your portfolio bleeds red but refuses to sell.", "trading", "Behavioral Law"],
  ["SEO isn't magic. It's signal matching at scale. Be the most relevant document for the query.", "marketing", "Relevance Law"],
  ["Bitcoin halving cycles are predictable. Human emotion is not. Profit from the gap.", "crypto", "Cycle Law"],
  ["P/E without growth is a trap. PEG ratio tells the real story.", "stocks", "Valuation Law"],
  ["Compound interest is the eighth wonder. Most people underestimate it because their intuition is linear.", "math", "Exponential Law"],
  ["The Fear & Greed Index is your contrarian compass. Extreme fear = buy. Extreme greed = sell.", "crypto", "Sentiment Law"],
  ["Yield curve inversion has predicted every recession since 1955. It's not timing — it's direction.", "economy", "Indicator Law"],
  ["Backlinks are digital word-of-mouth. One from authority beats 100 from spam.", "seo", "Authority Law"],
  ["Content decay kills rankings. Your top page loses ~20% traffic monthly without updates.", "marketing", "Decay Law"],
  ["Options sellers win 70% of the time. Theta decay is their friend. Volatility is their product.", "stocks", "Greeks Law"],
];

const KNOWLEDGE = [
  ["crypto_trading", "Bitcoin Halving Cycles", "Every 4 years, BTC reward cuts in half. Supply shock + steady demand = price appreciation. Historical pattern: 12-18 month parabolic run post-halving, followed by 12-18 month accumulation. The math is clear; the emotion is the trap."],
  ["crypto_trading", "On-Chain Analysis Basics", "Exchange inflows = selling pressure. Exchange outflows = accumulation. Whale wallet growth = smart money positioning. MVRV ratio = market value vs realized value — above 3.0 is often local top. Below 1.0 is often local bottom."],
  ["stocks", "Options Greeks Explained", "Delta: directional exposure (0-1). Theta: time decay (sellers profit). Gamma: delta acceleration. Vega: volatility sensitivity. Understanding these lets you profit whether market goes up, down, or sideways."],
  ["stocks", "Market Microstructure", "Order flow toxicity predicts short-term moves. If smart money accumulates while retail sells, direction is clear. Dark pool prints, block trades, and institutional flow matter more than retail sentiment."],
  ["marketing", "SEO Algorithm Psychology", "Google ranks pages that satisfy user intent best. Core signals: relevance (keywords), authority (backlinks), experience (E-E-A-T), and technical health. Write for humans, optimize for bots."],
  ["marketing", "Conversion Funnel Math", "AARRR framework: Acquisition → Activation → Retention → Revenue → Referral. Each stage leaks. Fix the widest leak first. CAC < LTV is the fundamental equation. If CAC > LTV, you're buying customers at a loss."],
  ["marketing", "Viral Coefficient Formula", "K = i × c (invites × conversion rate). K > 1 = exponential growth. K < 1 = death. Dropbox grew to 4M users with K=1.7 through referral incentives. Every product needs a virality mechanism."],
  ["psychology", "Behavioral Economics in Markets", "Loss aversion (2x stronger than gains), anchoring bias, herd behavior, recency bias, confirmation bias. Markets are driven by emotions dressed in spreadsheets. Understand the emotion behind the number."],
  ["psychology", "Fear & Greed Cycle", "Market phases: accumulation (boring) → markup (exciting) → distribution (euphoric) → markdown (terrifying). Most investors buy at distribution and sell at markdown. Invert the cycle."],
  ["news_analysis", "Reading Fed Policy", "Fed communicates through statements, minutes, and Powell's pressers. Watch for: dot plot shifts, language changes ('transitory'→'persistent'), rate path pricing. Markets move on expectations, not realities."],
  ["news_analysis", "Geopolitical Market Impact", "War → energy spikes → inflation → rate hikes → growth slowdown. Trade wars → supply chain disruption → cost inflation. Sanctions → capital flight → currency crisis. Map the cascade before trading it."],
  ["special_verdict", "Thursday Class Format", "Each Thursday: one product deep-dive. Anatomy deconstruction → marketing psychology analysis → growth math modeling → verdict (invest/buy/avoid). Real examples, real numbers, zero hand-waving."],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law);
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const s = rag.getStats();
console.log(`Muhan seeded: ${s.k} knowledge, ${s.q} quotes`);
