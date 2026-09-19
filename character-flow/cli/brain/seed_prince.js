#!/usr/bin/env node
/**
 * seed_prince.js — Seed Prince Rishad's manga/novel knowledge database.
 */
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/rishad_knowledge.db', import.meta.url).pathname;
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["I laugh because if I didn't, I'd have to admit how serious everything is.", "life", "Humor Law"],
  ["I've had three whiskeys and this chapter made me question my entire life choices.", "manga", "Emotional Law"],
  ["Every manga protagonist has trauma. Me? I have student loans.", "identity", "Relatability Law"],
  ["The difference between a hero and a villain is good lighting and a better theme song.", "narrative", "Perception Law"],
  ["I read novels because real people disappoint me. Fictional characters don't ask me to explain myself.", "escapism", "Comfort Law"],
  ["Luffy doesn't have a plan. He just charges forward and somehow it works. Inspiring or terrifying?", "leadership", "Faith Law"],
  ["Eren went from 'kill all titans' to 'destroy half the universe.' That's called escalation.", "character_dev", "Arc Law"],
  ["Naruto proved that being an orphan with a demon inside you doesn't define your future. Also ramen.", "perseverance", "Ramen Law"],
  ["Dostoevsky understood that self-awareness without action is its own special hell.", "psychology", "Introspection Law"],
  ["Kafka knew what it meant to feel like a bug in a productivity-obsessed system. 1915 called.", "alienation", "Capitalism Law"],
  ["Adams figured out the ultimate joke: the answer is 42, and the question was never worth asking.", "absurdism", "Cosmic Law"],
  ["Murakami writes about lonely men waiting for cats to come home. I drink whiskey waiting for manga. Same energy.", "loneliness", "Solitude Law"],
];

const KNOWLEDGE = [
  ['manga', 'One Piece World-Building', 'Oda created an entire world with geography, politics, history, languages, and ecosystems. The Void Century is an unexplained historical gap. The World Government controls information. The Marines enforce order; the Yonko enforce chaos. The Devil Fruits grant powers with a cost (can\'t swim). The Straw Hat crew each represent a different dream. It\'s the most detailed manga world ever created.'],
  ['manga', 'Attack on Titan Plot Twists', 'Season 1: Humans vs Monsters. Season 2: Politics. Season 3: History. Final Season: the monsters were people, the people were monsters, and nobody is innocent. The tilt of the earth reveal changed everything. Marley isn\'t the bad guy — neither side is purely good. Isayama planned this from chapter 1.'],
  ['manga', 'Naruto Power System', 'Chakra = life energy + spiritual energy. Jutsu types: Ninjutsu (technique), Taijutsu (physical), Genjutsu (illusion). Kekkai Genkai (bloodline limits): Sharingan, Byakugan, etc. The tailed beasts are weapons of mass destruction personified. Naruto\'s shadow clones multiply his chakra usage exponentially. Everything has a trade-off.'],
  ['novel', 'Dostoevsky Psychological Depth', 'Dostoevsky explored the dark corners of the human psyche before psychology existed as a science. Notes from Underground prefigures Freud. Crime and Punishment explores guilt and redemption. The Idiot shows innocence in a corrupt world. Demons examines ideological extremism.'],
  ['novel', 'Kafkaesque Alienation', 'Kafka wrote about bureaucratic nightmares, inexplicable guilt, and transformation as metaphor. The Trial: Josef K. is arrested for a crime that is never revealed. The Castle: K. tries to reach the castle but the bureaucracy is infinite. Metamorphosis: Gregor becomes a bug and his family adapts.'],
  ['novel', 'Murakami Surrealism', 'Murakami blends mundane Tokyo life with surreal elements: talking cats, parallel worlds, wells that lead to other dimensions, missing ears, ancient libraries. His protagonists are often lonely men going about ordinary routines when extraordinary things happen. Themes: loss, memory, music (jazz is essential), cooking.'],
  ['manga', 'Manga Panel Reading Direction', 'Manga is read right-to-left, top-to-bottom. Panel flow guides the eye in a Z-pattern. Close-ups create emotional intensity. Splash pages (full-page illustrations) mark climactic moments. Speed lines indicate motion. Sweat drops show nervousness. Chibi (super-deformed) expressions provide comic relief.'],
  ['novel', 'Magical Realism Explained', 'Magic exists in the story but characters treat it as normal. Márquez: "Many years later, as he faced the firing squad..." Borges: libraries containing all books including impossible ones. Calvino: invisible cities. The magic reveals truth about reality rather than escaping it. Unlike fantasy, magical realism doesn\'t explain its magic — it just IS.'],
  ['manga', 'Shonen vs Seinen vs Josei', 'Shonen (boys): action-focused, friendship, growth. Target: teenage boys. Examples: One Piece, Naruto, Bleach. Seinen (men): mature themes, complex morality, psychological depth. Target: adult men. Examples: Berserk, Vinland Saga, Monster. Josei (women): realistic romance, everyday life. Target: adult women. Examples: Nana, Paradise Kiss, Honey and Clover.'],
  ['novel', 'Existentialism in Literature', 'Existentialism: existence precedes essence. We are thrown into the world without predefined purpose. Sartre: "existence precedes essence." Camus: the absurd — searching for meaning in a meaningless universe. Kierkegaard: leap of faith. Nietzsche: God is dead, create your own values. Literature explores these through characters facing existential crises: Raskolnikov, Meursault, Meaulnes.'],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law);
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const s = rag.getStats();
console.log(`Prince Rishad seeded: ${s.k} knowledge, ${s.q} quotes`);
