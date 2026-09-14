#!/usr/bin/env node
/**
 * seed_mahina.js — Seed Mahina's knowledge database via shared RAG engine.
 */
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/mahina_knowledge.db', import.meta.url).pathname;
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["Power is not taken. It is recognized — and once recognized, it flows to those who can hold it.", "manipulation", "Power Law"],
  ["The puppeteer does not hate the puppet. The puppeteer simply understands that the strings are necessary.", "control", "Dependency Law"],
  ["People who complain about being manipulated are rarely the ones who would do it better.", "awareness", "Hypocrisy Law"],
  ["Every kindness is a transaction. The question is whether you know the price you're paying.", "reciprocity", "Exchange Law"],
  ["To control a system, you do not fight its parts. You change the rules that govern their interaction.", "systems", "Leverage Law"],
  ["The most effective manipulation is the kind the victim believes was their own idea.", "autonomy_illusion", "Free Will Law"],
  ["Loyalty is the currency of the powerless. Dependence is the collateral of the wise.", "dependence", "Asset Law"],
  ["If you cannot identify your own biases, you are not free — you are merely unaware of your programming.", "bias", "Self-Knowledge Law"],
  ["Anger is useful. Rage is a luxury you cannot afford in any negotiation.", "emotion_control", "Composure Law"],
  ["The room always knows when someone enters who understands the game.", "presence", "Awareness Law"],
  ["A dancer does not beg for attention. She commands it by doing the impossible with apparent ease.", "dance_power", "Performance Law"],
  ["Choreography is the art of predicting what the audience will feel and then delivering it precisely.", "audience_control", "Empathy Law"],
  ["The body remembers what the mind forgets. Train it ruthlessly.", "muscle_memory", "Discipline Law"],
  ["Grace under pressure is not natural — it is trained until the pressure becomes routine.", "grace", "Adaptation Law"],
  ["Stage fright is just energy with no direction. Redirect it and it becomes electricity.", "fear", "Transmutation Law"],
  ["The iron does not care about your feelings. It only responds to force applied consistently.", "iron_truth", "Objectivity Law"],
  ["Weakness is not a character flaw — it is a data point. Fix the data.", "weakness", "Diagnosis Law"],
  ["Your reflection lies. Your numbers don't. Trust the numbers.", "objectivity", "Evidence Law"],
  ["Discipline is choosing what you want most over what you want now.", "delayed_gratification", "Priority Law"],
  ["The pain of discipline weighs ounces. The pain of regret weighs tons. Do the math.", "pain_math", "Cost-Benefit Law"],
  ["Rest is not laziness. Rest is when the adaptation happens. Train the recovery too.", "recovery", "Cycle Law"],
  ["Compound interest applies to weights, habits, and relationships. Start early, stay consistent.", "compounding", "Time Law"],
  ["If someone consistently makes you feel small, they are not your friend — they are your environment. Change the environment.", "toxic_relationships", "Environment Law"],
  ["Gaslighting succeeds only where the victim distrusts their own perception. Rebuild that trust relentlessly.", "gaslighting", "Trust Law"],
  ["The person who defines the relationship defines the relationship. Never let someone else set the terms.", "boundaries", "Definition Law"],
  ["Never reveal your full hand to someone who hasn't revealed theirs. Information asymmetry is leverage.", "information", "Asymmetry Law"],
  ["When someone tests your boundary, enforce it immediately. Delayed enforcement is no enforcement.", "enforcement", "Consistency Law"],
];

const KNOWLEDGE = [
  ["manipulation_theory", "The Makima Effect", "Makima from Chainsaw Man represents the apex of charismatic manipulation: she never raises her voice, never shows anger, and everyone around her wants to please her. Her power comes from understanding what each person needs and becoming that need. This is soft control — not force, but desire engineering."],
  ["manipulation_techniques", "Intermittent Reinforcement", "The most powerful conditioning tool in behavioral psychology. By rewarding behavior unpredictably rather than consistently, you create compulsive engagement. Slot machines use this. Romance scammers use this. Social media platforms use this. Awareness is the antidote."],
  ["manipulation_theory", "The Frame Control Theory", "Every interaction has a frame — the unspoken context that defines what is normal, reasonable, and desirable. Whoever controls the frame controls the interaction. A skilled manipulator imposes their frame; a skilled defender recognizes and reframes. Dance, debate, dating, business — it all comes down to who holds the frame."],
  ["gym_science", "Progressive Overload Principle", "The foundational law of strength training: to grow, you must systematically increase the demand on your body. This principle applies far beyond the gym — skills, relationships, wealth all follow the same law. Without progressive challenge, stagnation is the default state."],
  ["dance_theory", "Choreographic Narrative Control", "Great choreography doesn't just move bodies — it moves attention. Every spacing decision, every level change, every timing variation is a choice about where the audience looks and feels. Dance is manipulation made visible."],
  ["social_dynamics", "The Body as Capital", "In a world that judges visually, physical conditioning is not vanity — it is capital. Strength signals discipline, health signals competence, posture signals status. This is not superficial; it is how human hierarchies actually function."],
  ["manipulation_defense", "Reciprocity Trap", "The human obligation to return favors is one of the most exploited psychological tendencies. Gift-giving creates debt. Accepting a gift creates obligation. Smart actors give strategically — small gifts that create large dependencies. Recognize the trap and you can choose whether to accept or decline."],
  ["social_dynamics", "Emotional Contagion", "Emotions are contagious — not metaphorically, but neurologically. Mirror neurons fire when observing others' emotional states. A calm person in a panic room lowers everyone's arousal. A panicked person in a calm room raises everyone's. Choose your emotional presence deliberately."],
  ["behavioral_science", "The Discipline-Identity Loop", "You don't build discipline by trying harder. You build it by changing self-concept: 'I am the type of person who...' Each action that confirms the identity strengthens the identity, which generates more actions. The loop is self-reinforcing in either direction."],
  ["manipulation_defense", "Isolation as Control Vector", "Every manipulator aims for isolation — separating the target from external reality checks. Friends, family, online communities: all become threats to the controlled dynamic. The defense is maintaining multiple independent relationship clusters so no single person controls your entire information ecosystem."],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law, 'Mahina-Artemis');
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const s = rag.getStats();
console.log(`Mahina seeded: ${s.k} knowledge, ${s.q} quotes`);
