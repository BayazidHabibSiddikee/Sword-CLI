#!/usr/bin/env node
/**
 * seed_kael.js — Seed Kael Vector ML knowledge base.
 */
import { RagEngine } from './rag.js';
import Database from 'better-sqlite3';

const DB_PATH = new URL('../data/kael_knowledge.db', import.meta.url).pathname;
const rag = new RagEngine(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS model_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    architecture TEXT NOT NULL,
    strength TEXT NOT NULL,
    weakness TEXT NOT NULL,
    use_case TEXT
  );
`);

const QUOTES = [
  ["The greatest ML tool is not a neural network, but a curious mind asking the right question.", "philosophy", "Curiosity Law"],
  ["Data is the new oil, but insight is the engine.", "data", "Insight Law"],
  ["A model that cannot be understood is a model that cannot be trusted.", "interpretability", "Trust Law"],
  ["Correlation is coincidence until causation proves otherwise.", "causality", "Causation Law"],
  ["The map is not the territory. The model is not the reality.", "generalization", "Reality Law"],
  ["Every dataset is a crime scene. Your job is to figure out what happened.", "exploration", "Discovery Law"],
  ["Generalization is the holy grail. Overfitting is the original sin.", "learning", "Regularization Law"],
  ["The best model is the simplest one that captures the signal without the noise.", "simplicity", "Occam Law"],
  ["AI is not magic. It is mathematics at scale with engineering discipline.", "reality", "Engineering Law"],
  ["The difference between statistics and ML is: statisticians play with data they have; ML practitioners play with data they hope to collect.", "paradigm", "Scale Law"],
];

const KNOWLEDGE = [
  ['ml', 'Why Attention Works (intuition)', 'Attention asks: "for each token, which other tokens matter?" Computes weighted sum where weights come from similarity. Q (query) asks what am I looking for? K (key) answers what do I contain? V (value) provides contribution. Dot product measures relevance. Differentiable routing — model learns WHERE to look.'],
  ['ml', 'Vanishing Gradient Problem', 'In deep networks, gradients multiply through backprop. If each layer derivative < 1, gradients shrink exponentially — early layers stop learning. Solutions: (1) ReLU activations (derivative is 1 for positive inputs). (2) Batch normalization. (3) Residual connections. (4) Careful initialization. Modern architectures combine all four.'],
  ['ml', 'Regularization: Preventing Memorization', 'Overfitting = low training error, high validation error. Techniques: (1) L1/L2 weight decay — penalizes large weights. (2) Dropout — randomly zero activations during training. (3) Data augmentation. (4) Early stopping. (5) Ensemble. Bias-variance tradeoff: regularization increases bias to reduce variance.'],
  ['ml', 'Bias-Variance Tradeoff', 'Expected error = bias² + variance + irreducible noise. High bias = too simple (underfits). High variance = too complex (overfits). Deep learning interesting because extremely overparameterized models STILL generalize well — contradicts classical theory. "Double descent" describes this modern phenomenon.'],
  ['ml', 'Transformers: Why Position Matters', 'Self-attention is permutation-invariant — doesn\'t know word order. Positional encodings inject position: sinusoidal functions give each position unique signature across dimensions. Recent: rotary positions (RoPE), ALiBi, learned embeddings. Choice affects sequence length extrapolation.'],
  ['ml', 'Loss Landscapes & Optimization', 'Neural network training is non-convex optimization in millions of dimensions. Loss landscape has saddle points, local minima, flat valleys. SGD with momentum finds good solutions. Key insight: not all minima equal — sharp minima generalize poorly, flat minima generalize well. Geometry determines generalization more than optimizer.'],
  ['ml', 'Why LLMs Hallucinate', 'LLMs predict next token from training distribution. When uncertain, sample from high-probability continuations — may be factually wrong but linguistically plausible. Hallucination inherent to autoregressive generation, not a bug. Mitigations: RAG, constrained decoding, verification pipelines. Root cause: predicting text, not retrieving truth.'],
  ['ml', 'Evaluation Beyond Accuracy', 'Accuracy misleading on imbalanced datasets. Use: precision/recall/F1 classification, ROC-AUC ranking, BLEU/ROUGE generation, perplexity language models. Production: monitor calibration, fairness across demographics, robustness to distribution shift, latency. Accurate but slow = useless.'],
  ['ml', 'Embeddings: The Secret Sauce', 'Words, images, sounds → vectors where semantic similarity = geometric proximity. Word2Vec: "king - man + woman ≈ queen." Modern: hundreds of dimensions. Magic: linear ops in embedding space = semantic ops. Why RAG works — similar meanings physically close in vector space.'],
  ['ml', 'Scaling Laws (Kaplan et al.)', 'Language model performance follows predictable power laws: loss ∝ N^(-α) × D^(-β) × E^(-γ) where N=parameters, D=dataset size, E=compute. Double compute → ~70% improvement from more data, ~30% from larger models. Predictability lets you optimize resource allocation. Holds across 100M to 1T parameters.'],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law);
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

// Insert model cards
const models = [
  ['Transformer (Vaswani et al., 2017)',
   'Self-attention over input tokens. Parallel computation. Positional encoding. Encoder-decoder or decoder-only stacks.',
   'Scalability — performance improves predictably with more data, compute, parameters. Attention captures long-range dependencies without recurrence.',
   'Quadratic attention cost O(n²) limits sequence length. Hallucinates confidently. Struggles with exact reasoning and arithmetic.',
   'Language understanding, generation, code completion, multi-modal tasks'],
  ['Convolutional Neural Network',
   'Local receptive fields, weight sharing, pooling. Hierarchical feature extraction: edges → textures → objects.',
   'Translation invariance — learns cat is cat regardless of position. Extremely parameter-efficient for spatial data.',
   'Limited receptive field without deep stacking. Struggles with global reasoning. Requires lots of labeled data.',
   'Image classification, object detection, medical imaging, satellite imagery'],
  ['Graph Neural Network',
   'Message passing: nodes aggregate features from neighbors, then update representation. Repeated over K layers.',
   'Native support for relational structure. Works on irregular data — molecules, social networks, knowledge graphs.',
   'Over-smoothing after too many layers. Hard to train on large graphs.',
   'Molecule property prediction, recommender systems, fraud detection, knowledge graph completion'],
  ['Diffusion Model',
   'Forward process: gradually add Gaussian noise until pure noise. Reverse process: learn to denoise step-by-step.',
   'Superior sample quality vs GANs. Stable training (no adversarial dynamics). Flexible conditioning.',
   'Slow sampling — requires 50-1000 denoising steps. Computationally expensive at inference.',
   'Image generation, video synthesis, audio generation, protein design'],
  ['Mamba / State Space Model',
   'Selective state space: linear-time sequence modeling with hardware-aware scanning. Linear complexity O(n) vs transformer O(n²).',
   'Linear scaling with sequence length. Competitive with transformers on language. Much faster at long sequences.',
   'Less mature ecosystem. Still proving on benchmarks. Differentiable scattering is novel — some failure modes unknown.',
   'Long-context language modeling, bioinformatics sequences, audio processing'],
];
for (const [name, architecture, strength, weakness, useCase] of models) {
  db.prepare('INSERT INTO model_cards (name, architecture, strength, weakness, use_case) VALUES (?, ?, ?, ?, ?)').run(name, architecture, strength, weakness, useCase);
}

const s = rag.getStats();
console.log(`Kael Vector seeded: ${s.k} knowledge, ${s.m} model cards`);
