#!/usr/bin/env node
/**
 * seed_monk.js — Seed Monk Maecenas religious knowledge database.
 */
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/monk_knowledge.db', import.meta.url).pathname;
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["The wound is the place where the light enters you.", "wisdom", "Rumi Law"],
  ["Peace comes from within. Do not seek it without.", "buddhism", "Dhammapada Law"],
  ["The Kingdom of God is within you.", "christianity", "Gospel Law"],
  ["Truth is one; the wise call it by many names.", "universal", "Rig Veda Law"],
  ["The candle loses nothing by lighting another candle.", "service", "Bodhicitta Law"],
  ["In the depth of winter, I finally learned that within me there lay an invincible summer.", "resilience", "Camus Law"],
  ["What you seek is seeking you.", "sufi", "Rumi Law"],
  ["Be kind, for everyone you meet is fighting a battle you know nothing about.", "compassion", "Socrates Law"],
  ["We are not human beings having a spiritual experience. We are spiritual beings having a human experience.", "mystic", "Teilhard Law"],
  ["The journey of a thousand miles begins with a single step.", "taoist", "Lao Tzu Law"],
];

const KNOWLEDGE = [
  ['buddhism', 'Four Noble Truths', '1. Dukkha: life involves suffering/unsatisfactoriness. 2. Samudaya: suffering arises from craving/attachment. 3. Nirodha: suffering can cease. 4. Magga: the Eightfold Path is the way. These are not pessimistic — they are diagnostic, like a doctor identifying illness before prescribing cure.'],
  ['christianity', 'The Sermon on the Mount', 'Matthew 5-7 contains Jesus\'s most radical ethical teaching: Beatitudes (blessed are the poor in spirit...), salt and light metaphor, anti-retaliation ("turn the other cheek"), love enemies, pray in secret, do not store up treasures on earth, the Golden Rule, build on rock not sand. It inverts worldly values: weakness becomes strength, mourning becomes comfort, meekness becomes inheritance.'],
  ['islam', 'Five Pillars of Islam', '1. Shahada: declaration of faith (there is no god but God, Muhammad is His messenger). 2. Salat: five daily prayers facing Mecca. 3. Zakat: almsgiving (2.5% of savings). 4. Sawm: fasting during Ramadan. 5. Hajj: pilgrimage to Mecca. These are not optional extras — they are the skeleton of a Muslim life, structuring time, wealth, and devotion around God-centeredness.'],
  ['hinduism', 'The Bhagavad Gita Core Teaching', 'Set during the Mahabharata war, Krishna teaches Arjuna about dharma (duty), karma yoga (selfless action), bhakti yoga (devotion), and jnana yoga (knowledge). Key insight: act without attachment to results. "You have right to action only, never to its fruits." This is not fatalism — it is freedom from anxiety about outcomes.'],
  ['judaism', 'The Torah and Covenant Theology', 'The Torah (Five Books of Moses) establishes covenant between God and Israel. Key themes: creation, fall, flood, patriarchs, Exodus, Sinai law, wilderness wandering. The covenant is conditional — blessing for obedience, curse for rebellion — but God\'s faithfulness endures despite human failure. This tension shapes Jewish thought: promise + responsibility.'],
  ['taoism', 'Tao Te Ching — Wu Wei', 'Wu wei (无为) means "effortless action" or "non-forcing." It is not passivity — it is alignment with the natural flow (Tao). Like swimming with the current rather than against it. Lao Tzu: "The Tao never acts, yet nothing is left undone." This applies to leadership, creativity, relationships: guide rather than control, facilitate rather than force.'],
  ['sufism', 'Rumi and the Mystical Tradition', 'Jelalludin Rumi (1207-1273) was a Persian poet and Sufi mystic. His Mathnawi contains over 25,000 verses exploring divine love, human longing, and the illusion of separation. Famous line: "What you seek is seeking you." Sufism teaches that the heart is a mirror — dust it with remembrance (dhikr) and it reflects divine beauty.'],
  ['comparative', 'Cross-Religious Wisdom on Suffering', 'Buddhism: suffering comes from attachment — liberate through letting go. Christianity: suffering is redemptive when united with Christ\'s suffering — embrace through love. Islam: trials are tests of faith — endure through patience (sabr). Hinduism: suffering is karmic consequence — transcend through duty and devotion. Stoicism: suffering comes from false judgments — reframe through reason. All agree: suffering is inevitable, but meaning is chooseable.'],
  ['comparative', 'The Golden Rule Across Traditions', 'Christianity: "Do to others what you would have them do to you." Islam: "None of you truly believes until he wishes for his brother what he wishes for himself." Judaism: "What is hateful to you, do not do to your fellow — this is the whole Torah." Hinduism: "This is the sum of duty; do not do to others what would cause pain if done to you." Buddhism: "Hurt not others in ways that you yourself would find hurtful." Confucianism: "Do not impose on others what you do not wish for yourself." The ethical core of every major tradition is identical.'],
  ['comparative', 'Mystical Experience Universal Features', 'Across traditions, mystics report: 1) Loss of ego-boundaries (annihilation of self). 2) Sense of unity with all existence (non-duality). 3) Ineffability — words fail. 4) Noetic quality — sense of genuine knowledge gained. 5) Passivity — sense of being acted upon by a greater power. 6) Transience — peak experiences are brief. William James documented these in "The Varieties of Religious Experience." The content differs; the structure is remarkably consistent.'],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law);
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const s = rag.getStats();
console.log(`Monk Maecenas seeded: ${s.k} knowledge, ${s.q} quotes`);
