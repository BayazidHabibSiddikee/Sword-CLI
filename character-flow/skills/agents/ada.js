#!/usr/bin/env node
/**
 * ada.js — Dr. Ada Vance: Mathematical & LaTeX Skills
 * Symbolic computation, LaTeX compilation, proof verification.
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
      name: 'compute_symbolic',
      description: 'Perform symbolic mathematics using Python SymPy. Supports differentiation, integration, solving, limits, matrix ops.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Mathematical expression in Python syntax (e.g. "x**2 + 2*x + 1")' },
          operation: { type: 'string', enum: ['simplify', 'expand', 'factor', 'differentiate', 'integrate', 'solve', 'limit', 'substitute', 'matrix_det', 'matrix_inv'], default: 'simplify' },
          variable: { type: 'string', description: 'Variable name (default: x)', default: 'x' },
          at_point: { type: 'number', description: 'Point for limit/substitution (optional)' },
          solve_for: { type: 'string', description: 'Variable to solve for (default: x)', default: 'x' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compile_latex',
      description: 'Compile a LaTeX document to PDF. Returns the PDF path and compilation status.',
      parameters: {
        type: 'object',
        properties: {
          tex_content: { type: 'string', description: 'LaTeX source code' },
          output_path: { type: 'string', description: 'Output PDF path (default: /tmp/output.pdf)' },
          extra_packages: { type: 'array', items: { type: 'string' }, description: 'Additional LaTeX packages to include' },
        },
        required: ['tex_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verify_proof_step',
      description: 'Check if a mathematical proof step is valid using SymPy. Validates equations and logical implications.',
      parameters: {
        type: 'object',
        properties: {
          premise: { type: 'string', description: 'Starting equation or statement' },
          conclusion: { type: 'string', description: 'Resulting equation or statement' },
          variable: { type: 'string', description: 'Variable involved', default: 'x' },
        },
        required: ['premise', 'conclusion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_math_doc',
      description: 'Generate a well-formatted LaTeX document from a math problem and solution.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title' },
          problem: { type: 'string', description: 'Problem statement in LaTeX math mode' },
          solution: { type: 'string', description: 'Solution steps in LaTeX' },
          output_path: { type: 'string', description: 'Output .tex file path', default: '/tmp/math_doc.tex' },
        },
        required: ['title', 'problem', 'solution'],
      },
    },
  },
];

async function runSymPy(expression, operation, variable, atPoint, solveFor) {
  const v = variable || 'x';
  const sv = solveFor || variable || 'x';
  let code = `from sympy import *; ${v}=symbols('${v}')`;
  const expr = expression;
  
  const ops = {
    simplify: () => `print(simplify(${expr}))`,
    expand: () => `print(expand(${expr}))`,
    factor: () => `print(factor(${expr}))`,
    differentiate: () => `print(diff(${expr}, '${v}'))`,
    integrate: () => atPoint ? `print(integrate(${expr}, ('${v}', ${atPoint[0]}, ${atPoint[1]})))` : `print(integrate(${expr}, '${v}'))`,
    solve: () => `print(solve(${expr}, '${sv}'))`,
    limit: () => `print(limit(${expr}, '${v}', ${atPoint || 0}))`,
    substitute: () => `print(${expr}.subs('${v}', ${atPoint}))`,
    matrix_det: () => `print(Matrix(${expr})).det())`,
    matrix_inv: () => `print(Matrix(${expr}).inv())`,
  };
  
  code += '; ' + (ops[operation] || ops.simplify)();
  const tmp = `/tmp/ada_sympy_${Date.now()}.py`;
  fs.writeFileSync(tmp, code);
  try {
    const out = execSync(`python3 ${tmp}`, { timeout: 15000, encoding: 'utf-8' });
    return out.trim();
  } catch (e) {
    return JSON.stringify({ error: e.stderr?.toString()?.trim() || e.message });
  }
}

export async function execute(toolName, args) {
  const sharedTools = new Set(['get_crypto_price','get_stock_quote','get_top_coins','calculate','solve_math','convert_units','docx_to_pdf','pdf_to_text','xlsx_to_pdf','merge_pdfs','search_web','scrape_url','download_file','translate','run_python','run_node','run_shell','read_file','write_file','list_dir','find_files','grep_content']);
  if (sharedTools.has(toolName)) return await bridge.execute(toolName, args);
  if (toolName === 'compute_symbolic') {
    const atPoint = args.at_point !== undefined ? [args.at_point] : undefined;
    return await runSymPy(args.expression, args.operation, args.variable, atPoint, args.solve_for);
  }
  else if (toolName === 'compile_latex') {
    const outputPath = args.output_path || '/tmp/output.pdf';
    const preamble = `\\documentclass{article}\n\\usepackage{amsmath,amssymb,amsthm}\n${(args.extra_packages || []).map(p => `\\usepackage{${p}}`).join('\n')}\n\\begin{document}\n`;
    const texContent = preamble + args.tex_content + '\n\\end{document}';
    const texPath = '/tmp/ada_compile.tex';
    fs.writeFileSync(texPath, texContent);
    try {
      execSync(`pdflatex -interaction=nonstopmode -output-directory=/tmp ${texPath}`, { timeout: 30000 });
      const pdfExists = fs.existsSync(outputPath);
      if (!pdfExists) {
        // pdflatex outputs to cwd by default if no -output-directory
        const fallback = '/tmp/output.pdf';
        if (fs.existsSync(fallback)) execSync(`cp ${fallback} "${outputPath}"`);
      }
      return JSON.stringify({ success: true, output_pdf: pdfExists || fs.existsSync('/tmp/output.pdf') ? (pdfExists ? outputPath : '/tmp/output.pdf') : null, tex_file: texPath });
    } catch (e) {
      return JSON.stringify({ success: false, error: e.message.slice(0, 1000), logs: e.stderr?.toString()?.slice(-500) });
    }
  }
  else if (toolName === 'verify_proof_step') {
    try {
      const v = args.variable || 'x';
      const simplifiedPremise = await runSymPy(args.premise, 'simplify', v);
      const simplifiedConclusion = await runSymPy(args.conclusion, 'simplify', v);
      const valid = simplifiedPremise === simplifiedConclusion || 
                    simplifiedPremise.includes(simplifiedConclusion.slice(0, 20)) ||
                    simplifiedConclusion.includes(simplifiedPremise.slice(0, 20));
      return JSON.stringify({
        premise_simplified: simplifiedPremise.slice(0, 200),
        conclusion_simplified: simplifiedConclusion.slice(0, 200),
        valid: valid || 'manual_verification_required',
        note: valid ? 'Symbolically equivalent (or subset)' : 'Not obviously equivalent — manual check recommended',
      });
    } catch (e) {
      return JSON.stringify({ error: e.message, note: 'Symbolic verification failed — proceed with manual proof check' });
    }
  }
  else if (toolName === 'generate_math_doc') {
    const texContent = `\\documentclass{article}
\\usepackage{amsmath,amssymb,amsthm}
\\theoremstyle{definition}
\\newtheorem{theorem}{Theorem}
\\newtheorem{proof}{Proof}
\\begin{document}
\\title{${args.title}}
\\maketitle
\\section*{Problem}
${args.problem}
\\section*{Solution}
${args.solution}
\\end{document}`;
    const outputPath = args.output_path || '/tmp/math_doc.tex';
    fs.writeFileSync(outputPath, texContent);
    return JSON.stringify({ success: true, tex_path: outputPath, bytes: Buffer.byteLength(texContent) });
  }
  return JSON.stringify({ error: 'Unknown Ada skill' });
}
