#!/usr/bin/env node
/**
 * seed_izuku.js — Seed Izuku's knowledge database via shared RAG engine.
 */
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/knowledge.db', import.meta.url).pathname;
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["The greatest glory is not in never falling, but in rising every time we fall.", "courage", "Hero Law"],
  ["It's fine now. Why? Because you believe it is. That's all it takes.", "belief", "Mind Law"],
  ["When you have protected someone, you grow stronger. That is the law of heroism.", "growth", "Hero Law"],
  ["If you feel your heart beating fast, it means you're alive. Don't waste that energy.", "life", "Vitality Law"],
  ["A true hero isn't measured by the power he has... but by how he uses it to protect others.", "purpose", "Justice Law"],
  ["The smile you wear is the most powerful weapon against despair.", "hope", "Resilience Law"],
  ["Everyone has a quirk — even if it's just the quirk of being human.", "identity", "Diversity Law"],
  ["In a world of heroes, the greatest power is the courage to care.", "empathy", "Connection Law"],
  ["Progress is not given. It is taken by those who refuse to accept limits.", "progress", "Ambition Law"],
  ["Even the smallest spark can light up the darkest night — that is the law of accumulation.", "patience", "Entropy Law"],
  ["The world is not fair. But fairness is something you build, not something you wait for.", "justice", "Fairness Law"],
  ["Your past does not define your future — your choices do.", "agency", "Free Will Law"],
  ["Helping others is the fastest way to help yourself.", "reciprocity", "Karma Law"],
  ["Strength without wisdom is noise. Wisdom without strength is silence.", "balance", "Duality Law"],
  ["The hero in you doesn't need applause. It only needs action.", "action", "Agency Law"],
  ["Even broken things can reflect light — if you find the right angle.", "perspective", "Relativity Law"],
  ["Every expert was once a beginner who refused to quit.", "perseverance", "Compound Law"],
  ["The universe rewards those who observe deeply and act decisively.", "observation", "Cause-Effect Law"],
  ["Kindness costs nothing but changes everything — that is the conservation of compassion.", "kindness", "Conservation Law"],
  ["What you cannot see is often what shapes what you can — gravity, love, systems.", "invisibility", "Hidden Laws"],
];

const LAWS = [
  "Law of Cause and Effect — every action has an equal and opposite reaction across time.",
  "Law of Entropy — order requires constant energy; disorder is the default.",
  "Law of Reciprocity — what you give returns in kind, often multiplied.",
  "Law of Duality — every thing contains its opposite; light needs dark to be seen.",
  "Law of Accumulation — small consistent actions compound into inevitable change.",
  "Law of Perspective — reality is filtered through the observer; no view is absolute.",
  "Law of Adaptation — survival belongs to those who adjust, not those who resist.",
  "Law of Emergence — complex behavior arises from simple rules acting in concert.",
  "Law of Conservation — energy, information, and attention are never lost, only transformed.",
  "Law of Leverage — a small force at the right point moves great weight.",
  "Law of Cycles — everything returns; seasons, markets, moods, empires.",
  "Law of Signals — noise drowns message; clarity is value.",
  "Law of Constraints — bottlenecks determine output, not capacity.",
  "Law of Incentives — behavior follows reward; design the reward, design the behavior.",
  "Law of Time Preference — present bias distorts every long-term decision.",
  "Law of Network Effects — value grows exponentially with connected users.",
  "Law of Friction — ease of adoption determines spread more than quality.",
  "Law of Signal-to-Noise — truth hides in low-noise environments.",
  "Law of Second-Order Effects — the immediate result is never the final result.",
  "Law of Scaffolding — mastery requires temporary supports that are later removed.",
];

const KNOWLEDGE = [
  ["fiction_philosophy", "What is a Quirk?", "In MHA, a Quirk is a genetic mutation granting superhuman abilities. 80% of the population has one. This mirrors real-world genetic diversity: variation is the engine of evolution and innovation."],
  ["systems_thinking", "The Hero Public Safety System", "A government-regulated hero licensing system that mirrors real-world professional licensing. The tension between deregulation and safety is a timeless political question."],
  ["knowledge_transfer", "One For All — Legacy Power", "A quirk that transfers between wielders, accumulating the power of each predecessor. Philosophically, this represents cumulative knowledge: each generation stands on the shoulders of the last."],
  ["symbolic_power", "All Might's Symbol of Peace", "A symbol functions differently from a person. People die; symbols endure. All Might understood that his role was not just to fight but to embody hope."],
  ["cost_benefit", "The Cost of Power", "Every use of One For All damages the user's body. Power has a cost — this is the first law of thermodynamics applied to heroics: energy cannot be created or destroyed, only transferred."],
  ["cause_effect", "Villain as Mirror", "Shigaraki was once a child who wanted to be a hero. Tomura's villainy is not innate — it is shaped by abandonment and societal neglect. Every villain is a hero who was never held up."],
  ["justice", "UA High as Meritocracy", "UA admits students based on entrance exam performance, not wealth or lineage. Yet the system still favors those with supportive quirks. The tension between meritocratic ideal and structural inequality is central."],
  ["ethics", "Individuals Societal Prophecy", "The fundamental philosophy of MHA: the desire to help others is the root of all power. Not strength, not intelligence — compassion. This inverts the typical hero narrative."],
  ["evolution", "The Quirk Singularity Domain", "In the distant future, everyone will have a quirk and the concept of 'normal' will vanish. When something becomes universal, its absence becomes the anomaly."],
  ["growth_mindset", "Plus Ultra — Beyond", "UA's motto means 'beyond human limits.' It is not about breaking rules but expanding the possible. Knowledge is not a destination but a direction."],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law, 'Izuku-MultiLaws');
for (const lawText of LAWS) rag.insertQuote(lawText, 'universal_law', 'Multi-Laws', 'Izuku-MultiLaws');
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const s = rag.getStats();
console.log(`Izuku seeded: ${s.k} knowledge, ${s.q} quotes`);
