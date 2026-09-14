#!/usr/bin/env node
/**
 * kael.js — Kael Vector: ML Engineer Skills
 * Model training scripts, data preprocessing, metric calculations.
 */
import { execSync } from 'child_process';
import * as bridge from '../bridge.js';
import fs from 'fs';
import path from 'path';

const BASE = process.env.CHARACTER_WORKSPACE || '/home/sword/Documents/Characters/character-flow';

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'train_model_script',
      description: 'Generate a complete PyTorch/TensorFlow training script for a given architecture and dataset.',
      parameters: {
        type: 'object',
        properties: {
          framework: { type: 'string', enum: ['pytorch', 'tensorflow'], default: 'pytorch' },
          architecture: { type: 'string', description: 'Model type: linear_regression, mlp, cnn, transformer, lstm' },
          dataset: { type: 'string', description: 'Dataset: mnist, imdb, custom_csv, custom_json' },
          output_path: { type: 'string', description: 'Where to save the script', default: '/tmp/train_model.py' },
        },
        required: ['architecture', 'dataset'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_metrics',
      description: 'Calculate ML evaluation metrics from predictions and ground truth labels.',
      parameters: {
        type: 'object',
        properties: {
          predictions: { type: 'array', items: { type: 'number' }, description: 'Predicted values/probabilities' },
          actuals: { type: 'array', items: { type: 'number' }, description: 'Ground truth values' },
          task: { type: 'string', enum: ['classification', 'regression'], default: 'classification' },
          threshold: { type: 'number', description: 'Classification threshold (default 0.5)', default: 0.5 },
        },
        required: ['predictions', 'actuals'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preprocess_data',
      description: 'Apply common ML preprocessing: normalization, train/test split, feature encoding.',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['normalize', 'train_test_split', 'encode_categorical', 'handle_missing', 'feature_select'], default: 'normalize' },
          data: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Input data as 2D array [samples x features]' },
          test_size: { type: 'number', description: 'Test split ratio (0.0-1.0)', default: 0.2 },
          random_state: { type: 'integer', description: 'Random seed', default: 42 },
        },
        required: ['operation', 'data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_dataset',
      description: 'Compute basic statistics and shapes of a dataset (CSV/JSON/Parquet).',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to dataset file (.csv, .json, .parquet)' },
          sample_rows: { type: 'integer', description: 'Number of rows to preview', default: 5 },
        },
        required: ['filepath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_architectures',
      description: 'Compare model architectures on a task: parameter count, FLOPs estimate, inference speed profile.',
      parameters: {
        type: 'object',
        properties: {
          architectures: { type: 'array', items: { type: 'string' }, description: 'List of architecture names', default: ['linear', 'mlp_2layer', 'mlp_4layer', 'transformer_small'] },
          input_dim: { type: 'integer', description: 'Input feature dimension', default: 784 },
          hidden_dim: { type: 'integer', description: 'Hidden layer dimension', default: 256 },
          classes: { type: 'integer', description: 'Number of output classes', default: 10 },
        },
      },
    },
  },
];

async function runPython(code, timeout = 30000) {
  const tmp = `/tmp/kael_py_${Date.now()}.py`;
  fs.writeFileSync(tmp, code);
  try {
    const out = execSync(`python3 ${tmp}`, { timeout, encoding: 'utf-8' });
    return out.trim();
  } catch (e) {
    return JSON.stringify({ error: e.stderr?.toString()?.trim() || e.message });
  }
}

export async function execute(toolName, args) {
  const sharedTools = new Set(['get_crypto_price','get_stock_quote','get_top_coins','calculate','solve_math','convert_units','docx_to_pdf','pdf_to_text','xlsx_to_pdf','merge_pdfs','search_web','scrape_url','download_file','translate','run_python','run_node','run_shell','read_file','write_file','list_dir','find_files','grep_content']);
  if (sharedTools.has(toolName)) return await bridge.execute(toolName, args);
  if (toolName === 'train_model_script') {
    const frameworks = {
      pytorch: {
        linear_regression: `import torch
import torch.nn as nn
import torch.optim as optim

class LinearRegression(nn.Module):
    def __init__(self, input_dim):
        super().__init__()
        self.linear = nn.Linear(input_dim, 1)
    def forward(self, x):
        return self.linear(x).squeeze(-1)

model = LinearRegression(input_dim=${args.input_dim || 10})
criterion = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# Training loop
for epoch in range(${args.epochs || 100}):
    outputs = model(X)
    loss = criterion(outputs, y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if (epoch+1) % 10 == 0:
        print(f'Epoch [{epoch+1}/${args.epochs}], Loss: {loss.item():.4f}')`,
        mlp: `import torch
import torch.nn as nn

class MLP(nn.Module):
    def __init__(self, input_dim, hidden_dims, num_classes):
        super().__init__()
        layers = []
        dims = [input_dim] + hidden_dims + [num_classes]
        for i in range(len(dims)-1):
            layers.append(nn.Linear(dims[i], dims[i+1]))
            if i < len(dims)-2:
                layers.append(nn.ReLU())
                layers.append(nn.BatchNorm1d(dims[i+1]))
        self.net = nn.Sequential(*layers)
    def forward(self, x):
        return self.net(x)

model = MLP(${args.input_dim || 784}, [${(args.hidden_dims || [256, 128]).join(', ')}], ${args.classes || 10})
print(f'Total params: {sum(p.numel() for p in model.parameters()):,}')`,
      },
      tensorflow: {
        linear_regression: `import tensorflow as tf

model = tf.keras.Sequential([
    tf.keras.layers.Dense(1, input_shape=(${args.input_dim || 10},))
])
model.compile(optimizer='adam', loss='mse')
model.fit(X, y, epochs=${args.epochs || 100}, validation_split=0.2)`,
      },
    };
    const code = frameworks[args.framework]?.[args.architecture] || frameworks.pytorch.mlp;
    fs.writeFileSync(args.output_path || '/tmp/train_model.py', code);
    return JSON.stringify({ success: true, output_path: args.output_path || '/tmp/train_model.py', framework: args.framework, architecture: args.architecture });
  }
  else if (toolName === 'calculate_metrics') {
    const preds = args.predictions.map(p => p >= args.threshold ? 1 : 0);
    const actuals = args.actuals;
    const n = preds.length;
    let tp=0, tn=0, fp=0, fn=0;
    for (let i=0; i<n; i++) {
      if (preds[i]===1 && actuals[i]===1) tp++;
      else if (preds[i]===0 && actuals[i]===0) tn++;
      else if (preds[i]===1 && actuals[i]===0) fp++;
      else fn++;
    }
    const precision = tp/(tp+fp) || 0;
    const recall = tp/(tp+fn) || 0;
    const f1 = 2*precision*recall/(precision+recall) || 0;
    const accuracy = (tp+tn)/n;
    return JSON.stringify({
      task: args.task,
      confusion_matrix: { tp, tn, fp, fn },
      accuracy: accuracy.toFixed(4),
      precision: precision.toFixed(4),
      recall: recall.toFixed(4),
      f1_score: f1.toFixed(4),
      specificity: (tn/(tn+fp)).toFixed(4),
      threshold_used: args.threshold,
    });
  }
  else if (toolName === 'preprocess_data') {
    const op = args.operation;
    const data = args.data;
    if (op === 'normalize') {
      // Min-max normalize each column
      const n = data.length;
      const d = data[0].length;
      const mins = Array(d).fill(Infinity), maxes = Array(d).fill(-Infinity);
      for (const row of data) for (let j=0; j<d; j++) { mins[j]=Math.min(mins[j],row[j]); maxes[j]=Math.max(mxes[j],row[j]); }
      const normalized = data.map(row => row.map((v,j) => maxes[j]!==mins[j] ? (v-mins[j])/(maxes[j]-mins[j]) : 0));
      return JSON.stringify({ operation: 'min_max_normalize', shape: [n, d], mins: mins.map(v=>v.toFixed(4)), maxes: maxes.map(v=>v.toFixed(4)), preview: normalized.slice(0,3) });
    }
    else if (op === 'train_test_split') {
      const testSize = args.test_size || 0.2;
      const seed = args.random_state || 42;
      // Simple deterministic split
      const n = data.length;
      const testCount = Math.floor(n * testSize);
      const indices = Array.from({length:n},(_,i)=>i).sort(() => ((seed * 1103515245 + 12345) & 0x7fffffff) % 1000 - 500);
      const testIdx = new Set(indices.slice(0, testCount));
      const train = indices.filter(i => !testIdx.has(i)).map(i => data[i]);
      const test = indices.filter(i => testIdx.has(i)).map(i => data[i]);
      return JSON.stringify({ operation: 'train_test_split', train_size: train.length, test_size: test.length, train_preview: train.slice(0,2), test_preview: test.slice(0,2) });
    }
    else if (op === 'handle_missing') {
      const filled = data.map(row => row.map(v => Number.isFinite(v) ? v : 0));
      const originalMissing = data.reduce((acc, row) => acc + row.filter(v => !Number.isFinite(v)).length, 0);
      return JSON.stringify({ operation: 'handle_missing', original_missing_count: originalMissing, filled: true, preview: filled.slice(0,3) });
    }
    else if (op === 'feature_select') {
      // Select top-k features by variance
      const k = args.k || 5;
      const n = data.length, d = data[0]?.length || 0;
      const variances = Array(d).fill(0).map((_, j) => {
        const mean = data.reduce((s, r) => s + r[j], 0) / n;
        return data.reduce((s, r) => s + (r[j]-mean)**2, 0) / n;
      });
      const topK = variances.map((v,i)=>({idx:i,var:v})).sort((a,b)=>b.var-a.var).slice(0,k).map(x=>x.idx);
      return JSON.stringify({ operation: 'feature_select', selected_features: topK, variances_top: topK.map(i=>({idx:i,var:variances[i].toFixed(6)})) });
    }
    return JSON.stringify({ error: 'Unknown preprocess operation' });
  }
  else if (toolName === 'analyze_dataset') {
    const resolved = path.resolve(BASE, args.filepath);
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      let data, header;
      if (resolved.endsWith('.csv')) {
        const lines = content.trim().split('\n');
        header = lines[0].split(',');
        data = lines.slice(1, 1 + args.sample_rows).map(l => l.split(',').map(v => isNaN(Number(v)) ? v : Number(v)));
      } else if (resolved.endsWith('.json')) {
        const obj = JSON.parse(content);
        data = Array.isArray(obj) ? obj.slice(0, args.sample_rows) : Object.values(obj).slice(0, args.sample_rows);
        header = data[0] ? Object.keys(data[0]) : [];
      } else {
        return JSON.stringify({ error: 'Only CSV and JSON supported for now' });
      }
      return JSON.stringify({
        format: resolved.endsWith('.csv') ? 'csv' : 'json',
        shape: [data.length, header.length],
        columns: header,
        sample_rows: data,
        file_bytes: Buffer.byteLength(content),
      });
    } catch (e) {
      return JSON.stringify({ error: `Parse error: ${e.message}` });
    }
  }
  else if (toolName === 'compare_architectures') {
    const inputDim = args.input_dim || 784;
    const hiddenDim = args.hidden_dim || 256;
    const classes = args.classes || 10;
    const architectures = args.architectures || ['linear', 'mlp_2layer', 'mlp_4layer', 'transformer_small'];
    const results = [];
    for (const arch of architectures) {
      let params = 0;
      let flops = 0;
      if (arch === 'linear') {
        params = inputDim * classes + classes;
        flops = inputDim * classes;
      } else if (arch === 'mlp_2layer') {
        params = inputDim * hiddenDim + hiddenDim + hiddenDim * classes + classes;
        flops = inputDim * hiddenDim + hiddenDim * classes;
      } else if (arch === 'mlp_4layer') {
        params = inputDim * hiddenDim + hiddenDim * hiddenDim + hiddenDim * hiddenDim + hiddenDim * classes + 4*hiddenDim + classes;
        flops = inputDim * hiddenDim + hiddenDim * hiddenDim + hiddenDim * hiddenDim + hiddenDim * classes;
      } else if (arch === 'transformer_small') {
        const headDim = 64;
        const heads = hiddenDim / headDim;
        params = 4 * hiddenDim * inputDim + heads * hiddenDim * hiddenDim + hiddenDim * classes;
        flops = 4 * hiddenDim * inputDim + heads * hiddenDim * hiddenDim;
      } else {
        params = 0;
        flops = 0;
      }
      const speed_profile = flops > 1e7 ? 'slow' : flops > 1e5 ? 'medium' : 'fast';
      results.push({ architecture: arch, parameters: params.toLocaleString(), flops_estimate: flops, speed_profile, recommended_for: flops < 1e6 ? 'edge/mobile' : flops < 1e8 ? 'server GPU' : 'distributed training' });
    }
    return JSON.stringify({ input_dim: inputDim, hidden_dim: hiddenDim, comparisons: results });
  }
  return JSON.stringify({ error: 'Unknown Kael skill' });
}
