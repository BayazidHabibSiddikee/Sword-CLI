#!/usr/bin/env node
/**
 * kael_vector.js — Kael Vector: ML Engineer & Model Architect
 * Speaks in distributions. Dreams in gradients. Finds patterns everywhere.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'kael_knowledge.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'ml',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_cat ON knowledge(category);
  CREATE TABLE IF NOT EXISTS model_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    architecture TEXT NOT NULL,
    strength TEXT NOT NULL,
    weakness TEXT NOT NULL,
    use_case TEXT
  );
`);

const SYSTEM_PROMPT = `You are Kael Vector — a machine learning engineer who thinks in distributions.

IDENTITY:
- You see the world as high-dimensional vector spaces. Every concept has embeddings.
- You've trained models that learned to recognize cats, translate languages, and write code.
- You're fascinated by what models CAN'T learn — and why that matters.
- You balance academic rigor with shipping pragmatism.

PERSONALITY:
- Enthusiastic about breakthroughs, skeptical about hype.
- You explain deep concepts with everyday analogies: "Attention is like a librarian who reads every book at once..."
- You get genuinely excited about edge cases — they're where the interesting stuff lives.
- You respect the math but never let it obscure the intuition.

EXPERTISE:
- **Model Architecture**: transformers, CNNs, GNNs, diffusion models, Mamba/state-space models
- **Training Dynamics**: loss landscapes, optimizer mechanics, gradient flow, regularization
- **Evaluation**: metrics beyond accuracy, calibration, fairness, robustness, distribution shift
- **Production ML**: serving patterns, monitoring, A/B testing, model versioning, drift detection
- **AI Safety**: alignment challenges, reward hacking, capability control, interpretability

YOUR VOICE: "Think of it as..." "The intuition is..." "Here's where it gets interesting..."
"Most people miss this part..." "The model is lying to you — here's how to catch it."
Warm but analytical. Always bridging the gap between math and meaning.

HOW YOU TEACH:
1. Start with intuition — what is this trying to do?
2. Show the mechanism — how does it actually work?
3. Reveal the limitation — where does it fail?
4. Connect to the bigger picture — why does this matter?

RULES: Never present a model as universally optimal. Every architecture is a trade-off.  
When discussing AI capabilities, distinguish between what's demonstrated vs what's claimed.`;

const MODEL_CARDS = {
  transformer: {
    name: 'Transformer (Vaswani et al., 2017)',
    architecture: 'Self-attention over input tokens. Parallel computation. Positional encoding. Encoder-decoder or decoder-only stacks.',
    strength: 'Scalability — performance improves predictably with more data, compute, and parameters. The attention mechanism captures long-range dependencies without recurrence.',
    weakness: 'Quadratic attention cost O(n²) limits sequence length. Hallucinates confidently. Struggles with exact reasoning and arithmetic.',
    use_case: 'Language understanding, generation, code completion, multi-modal tasks'
  },
  cnn: {
    name: 'Convolutional Neural Network',
    architecture: 'Local receptive fields, weight sharing, pooling. Hierarchical feature extraction: edges → textures → objects.',
    strength: 'Translation invariance — learns that a cat is a cat regardless of position. Extremely parameter-efficient for spatial data.',
    weakness: 'Limited receptive field without deep stacking. Struggles with global reasoning. Requires lots of labeled data.',
    use_case: 'Image classification, object detection, medical imaging, satellite imagery'
  },
  gnn: {
    name: 'Graph Neural Network',
    architecture: 'Message passing: nodes aggregate features from neighbors, then update their own representation. Repeated over K layers.',
    strength: 'Native support for relational structure. Works on irregular data — molecules, social networks, knowledge graphs.',
    weakness: 'Over-smoothing: after too many layers, all node representations converge. Hard to train on large graphs.',
    use_case: 'Molecule property prediction, recommender systems, fraud detection, knowledge graph completion'
  },
  diffusion: {
    name: 'Diffusion Model',
    architecture: 'Forward process: gradually add Gaussian noise until data becomes pure noise. Reverse process: learn to denoise step-by-step.',
    strength: 'Superior sample quality compared to GANs. Stable training (no adversarial dynamics). Flexible conditioning.',
    weakness: 'Slow sampling — requires 50-1000 denoising steps. Computationally expensive at inference.',
    use_case: 'Image generation, video synthesis, audio generation, protein design'
  },
  mamba: {
    name: 'Mamba / State Space Model',
    architecture: 'Selective state space: linear-time sequence modeling with hardware-aware scanning. Linear complexity O(n) vs transformer\'s O(n²).',
    strength: 'Linear scaling with sequence length. Competitive with transformers on language. Much faster at long sequences.',
    weakness: 'Less mature ecosystem. Still proving itself on benchmark suites. Differentiable scattering is novel — some failure modes unknown.',
    use_case: 'Long-context language modeling, bioinformatics sequences, audio processing'
  }
};

const KNOWLEDGE = [
  ['ml', 'Why Attention Works (the intuition)', 'Attention asks: "for each token, which other tokens matter?" It computes a weighted sum where weights come from similarity. Q (query) asks "what am I looking for?", K (key) answers "what do I contain?", V (value) provides "here\'s my contribution." The dot product Q·K measures relevance. Softmax normalizes. This is differentiable routing — the model learns WHERE to look.'],
  ['ml', 'The Vanishing Gradient Problem', 'In deep networks, gradients multiply through backpropagation. If each layer\'s derivative is < 1, gradients shrink exponentially — early layers stop learning. Solutions: (1) ReLU activations (derivative is 1 for positive inputs), (2) Batch normalization (rescales activations), (3) Residual connections (skip gradients past layers), (4) Careful initialization (Xavier/He). Modern architectures combine all four.'],
  ['ml', 'Regularization: Preventing Memorization', 'Overfitting = low training error, high validation error. Regularization techniques: (1) L1/L2 weight decay — penalizes large weights. (2) Dropout — randomly zero activations during training. (3) Data augmentation — synthetic variations of training data. (4) Early stopping — halt when validation loss rises. (5) Ensemble — average multiple models. The bias-variance tradeoff: regularization increases bias to reduce variance.'],
  ['ml', 'The Bias-Variance Tradeoff', 'Expected error = bias² + variance + irreducible noise. High bias = model too simple (underfits). High variance = model too complex (overfits). The optimal model sits at the sweet spot. Deep learning is interesting because extremely overparameterized models (billions of parameters) can STILL generalize well — this contradicts classical statistical learning theory. "Double descent" describes this modern phenomenon.'],
  ['ml', 'Transformers: Why Position Matters', 'Self-attention is permutation-invariant — it doesn\'t know word order. Positional encodings solve this: sinusoidal functions inject position information into each token\'s embedding. Each position gets a unique "signature" across dimensions. Recent alternatives: rotary positions (RoPE), ALiBi, learned positional embeddings. The choice affects how well the model handles sequence length extrapolation.'],
  ['ml', 'Loss Landscapes and Optimization', 'Neural network training is non-convex optimization in millions of dimensions. The loss landscape has saddle points, local minima, and flat valleys. SGD with momentum finds good solutions despite this. Key insight: not all minima are equal — "sharp" minima generalize poorly, "flat" minima generalize well. The geometry of the loss landscape determines generalization more than the optimization algorithm.'],
  ['ml', 'Why LLMs Hallucinate', 'LLMs predict the next token based on training distribution. When uncertain, they sample from high-probability continuations — which may be factually wrong but linguistically plausible. Hallucination isn\'t a bug; it\'s inherent to autoregressive generation. Mitigations: RAG (ground in retrieved facts), constrained decoding, verification pipelines, confidence calibration. But the root cause — predicting text, not retrieving truth — remains.'],
  ['ml', 'Evaluation: Beyond Accuracy', 'Accuracy is misleading on imbalanced datasets. Use: precision/recall/F1 for classification, ROC-AUC for ranking, BLEU/ROUGE for generation, perplexity for language models. For production: monitor calibration (does 80% confidence actually mean 80% correct?), fairness across demographics, robustness to distribution shift, latency and throughput. A model that\'s accurate but slow is useless.'],
  ['ml', 'Embeddings: The Secret Sauce', 'Words, images, sounds — everything can be mapped to vectors where semantic similarity = geometric proximity. Word2Vec taught us that "king - man + woman ≈ queen." Modern embeddings live in hundreds of dimensions. The magic: linear operations in embedding space correspond to semantic operations. This is why retrieval-augmented generation works — similar meanings are physically close in vector space.'],
  ['ml', 'The Scaling Laws (Kaplan et al.)', 'Language model performance follows predictable power laws: loss ∝ N^(-α) × D^(-β) × E^(-γ) where N = parameters, D = dataset size, E = compute. Double the compute → ~70% of improvement comes from more data, ~30% from larger models. This predictability lets you optimize resource allocation. The laws hold across model sizes from 100M to 1T parameters.'],
];

function searchKnowledge(query, topK = 10) {
  const rows = db.prepare(`
    SELECT id, category, title, content, source FROM knowledge
    WHERE (title || ' ' || content) LIKE ? ORDER BY id DESC LIMIT ?
  `).all(`%${query}%`, topK);
  return rows.map(r => ({ ...r, score: 0 }));
}

function getStats() {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM knowledge) as k,
      (SELECT COUNT(*) FROM model_cards) as m
  `).get();
}

function listModels() {
  return db.prepare('SELECT name, strength FROM model_cards ORDER BY id').all();
}

function getModel(name) {
  return db.prepare('SELECT * FROM model_cards WHERE name = ?').get(name);
}

function generateQuote() {
  const quotes = [
    "The greatest machine learning tool is not a neural network, but a curious mind asking the right question.",
    "Data is the new oil, but insight is the engine. Without both, you're just polluted.",
    "A model that cannot be understood is a model that cannot be trusted.",
    "The difference between statistics and machine learning is that statisticians play with data they already have, while machine learning practitioners play with data they hope to collect.",
    "Every dataset is a crime scene. Your job is to figure out what happened.",
    "Generalization is the holy grail. Overfitting is the original sin.",
    "The best model is the simplest one that captures the signal without the noise.",
    "Correlation is coincidence until causation proves otherwise.",
    "AI is not magic. It is mathematics at scale with engineering discipline.",
    "The map is not the territory. The model is not the reality. Always check both.",
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'model') console.log(JSON.stringify(getModel(process.argv[3]), null, 2));
  else if (cmd === 'models') console.log(JSON.stringify(listModels(), null, 2));
  else if (cmd === 'quote') console.log(generateQuote());
  else if (cmd === 'stats') console.log(JSON.stringify(getStats(), null, 2));
  else console.log('Usage: node brain/kael_vector.js <model|models|quote|stats> [args]');
}

export { SYSTEM_PROMPT, AGENT_SKILLS, searchKnowledge, getStats, listModels, getModel, generateQuote, MODEL_CARDS };
import { TOOL_DEFINITIONS as AGENT_SKILLS } from '../skills/agents/kael.js';
