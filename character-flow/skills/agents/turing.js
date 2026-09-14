#!/usr/bin/env node
/**
 * turing.js — Turing Voss: Competitive Programming & Algorithm Skills
 * Code judge, algo visualizer, math solver, complexity analyzer.
 */
import { execSync } from 'child_process';

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'judge_solution',
      description: 'Run a user\'s code solution against test cases. Returns pass/fail with execution time.',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['python3', 'node', 'bash'], description: 'Programming language' },
          code: { type: 'string', description: 'Source code to execute' },
          input: { type: 'string', description: 'Input data (stdin)' },
          expected_output: { type: 'string', description: 'Expected output for verification' },
          timeout_ms: { type: 'integer', description: 'Timeout in ms', default: 5000 },
        },
        required: ['language', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'benchmark_algorithm',
      description: 'Generate and benchmark a sorting/searching algorithm implementation across input sizes.',
      parameters: {
        type: 'object',
        properties: {
          algorithm: { type: 'string', description: 'Algorithm name: quicksort, mergesort, heapsort, binary_search' },
          language: { type: 'string', enum: ['python3', 'node'], default: 'python3' },
          sizes: { type: 'array', items: { type: 'integer' }, description: 'Input sizes to test', default: [100, 1000, 10000] },
        },
        required: ['algorithm'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solve_math',
      description: 'Solve mathematical expressions using Python sympy. Supports calculus, algebra, linear algebra.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Mathematical expression (e.g. "x**2 + 2*x + 1")' },
          operation: { type: 'string', enum: ['solve', 'derivative', 'integral', 'limit', 'simplify', 'factor'], description: 'Operation to perform', default: 'simplify' },
          variable: { type: 'string', description: 'Variable to solve for (default: x)', default: 'x' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_problem',
      description: 'Generate a competitive programming problem with statement, examples, and solution.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic: dp, graph, greedy, two_pointers, binary_search, math' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], default: 'medium' },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_complexity',
      description: 'Analyze time and space complexity of a given algorithm/pseudocode. Returns Big-O notation.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Description of the algorithm in natural language or pseudocode' },
        },
        required: ['description'],
      },
    },
  },
];

const BASE = '/home/sword/Documents/Characters/character-flow';

async function runPython(code, timeout = 5000) {
  const tmp = `/tmp/turing_py_${Date.now()}.py`;
  require('fs').writeFileSync(tmp, code);
  try {
    const out = execSync(`python3 ${tmp}`, { timeout, encoding: 'utf-8' });
    return out.trim();
  } catch (e) {
    return JSON.stringify({ error: e.stderr?.toString()?.trim() || e.message });
  }
}

export async function execute(toolName, args) {
  if (toolName === 'judge_solution') {
    const { language, code, input, expected_output, timeout_ms } = args;
    const timeout = timeout_ms || 5000;
    const startTime = Date.now();
    let result = '';
    try {
      if (language === 'python3') {
        result = await runPython(code, timeout);
      } else if (language === 'node') {
        const tmp = `/tmp/turing_node_${Date.now()}.js`;
        require('fs').writeFileSync(tmp, code);
        result = execSync(`node ${tmp}`, { timeout, encoding: 'utf-8' }).trim();
      }
    } catch (e) {
      return JSON.stringify({ success: false, error: e.message, elapsed_ms: Date.now() - startTime });
    }
    const elapsed = Date.now() - startTime;
    const passed = !expected_output || result.includes(expected_output.slice(0, 50));
    return JSON.stringify({ success: true, output: result.slice(0, 2000), passed, elapsed_ms: elapsed });
  }
  else if (toolName === 'benchmark_algorithm') {
    const algorithms = {
      quicksort: `def quicksort(arr):
    if len(arr) <= 1: return arr
    pivot = arr[len(arr)//2]
    left = [x for x in arr if x < pivot]
    mid = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + mid + quicksort(right)`,
      mergesort: `def mergesort(arr):
    if len(arr) <= 1: return arr
    mid = len(arr)//2
    left = mergesort(arr[:mid])
    right = mergesort(arr[mid:])
    return sorted(left+right)`,
      heapsort: `def heapsort(arr):
    import heapq
    h = []
    for x in arr: heapq.heappush(h, x)
    return [heapq.heappop(h) for _ in h]`,
      binary_search: `def binary_search(arr, target):
    lo, hi = 0, len(arr)-1
    while lo <= hi:
        mid = (lo+hi)//2
        if arr[mid] == target: return mid
        elif arr[mid] < target: lo = mid+1
        else: hi = mid-1
    return -1`,
    };
    const impl = algorithms[args.algorithm] || algorithms.quicksort;
    const sizes = args.sizes || [100, 1000, 10000];
    const results = [];
    for (const n of sizes) {
      const arr = Array.from({ length: n }, () => Math.floor(Math.random() * n));
      const target = arr[Math.floor(n / 2)];
      // Time sort
      const t0 = performance?.now?.() ?? Date.now();
      execSync(`python3 -c "${impl.replace(/"/g, '\\"')}\nimport time\ndata=${JSON.stringify(arr)}\ntime.sleep(0)\nprint(len(quicksort(data) if 'quicksort' in '${args.algorithm}' else mergesort(data) if 'merge' in '${args.algorithm}' else heapsort(data)))"`, { timeout: 30000 });
      const elapsed = Date.now() - t0;
      results.push({ n, elapsed_ms: elapsed, ops_per_sec: Math.round(n / (elapsed / 1000)) });
    }
    return JSON.stringify({ algorithm: args.algorithm, benchmarks: results });
  }
  else if (toolName === 'solve_math') {
    const ops = {
      solve: (v, expr) => `from sympy import symbols, solve; x=symbols('${v}'); print(solve(${expr}, x))`,
      derivative: (v, expr) => `from sympy import symbols, diff; x=symbols('${v}'); print(diff(${expr}, x))`,
      integral: (v, expr) => `from sympy import symbols, integrate; x=symbols('${v}'); print(integrate(${expr}, x))`,
      limit: (v, expr) => `from sympy import symbols, limit; x=symbols('${v}'); print(limit(${expr}, x, 0))`,
      simplify: (v, expr) => `from sympy import symbols, simplify; x=symbols('${v}'); print(simplify(${expr}))`,
      factor: (v, expr) => `from sympy import symbols, factor; x=symbols('${v}'); print(factor(${expr}))`,
    };
    const opFn = ops[args.operation] || ops.simplify;
    const code = opFn(args.variable || 'x', args.expression);
    return await runPython(code);
  }
  else if (toolName === 'generate_problem') {
    const problems = {
      dp: {
        title: 'Maximum Subarray Sum',
        statement: 'Given an integer array nums, find the contiguous subarray with the largest sum and return that sum.',
        example_in: '[-2,1,-3,4,-1,2,1,-5,4]',
        example_out: '6',
        hint: 'Think about what happens at each position — do you extend the previous subarray or start fresh?',
        solution: 'Use Kadane\'s algorithm: maintain running_sum and max_sum. At each element, running_sum = max(element, running_sum + element). Track max_sum.',
      },
      graph: {
        title: 'Number of Islands',
        statement: 'Given a 2D grid of \'1\'s (land) and \'0\'s (water), count the number of islands. An island is surrounded by water and formed by connecting adjacent lands horizontally or vertically.',
        example_in: '11000\\n11000\\n00100\\n00011',
        example_out: '3',
        hint: 'Use BFS or DFS to mark connected components. Each time you encounter an unvisited \'1\', increment count and flood-fill it.',
        solution: 'Iterate through each cell. When you find a \'1\', run BFS/DFS to visit all connected \'1\'s and mark them as visited. Count = number of floods.',
      },
      greedy: {
        title: 'Coin Change (Greedy)',
        statement: 'Given coins of different denominations and a total amount, compute the fewest number of coins needed. If impossible, return -1.',
        example_in: 'coins=[1,2,5], amount=11',
        example_out: '3 (5+5+1)',
        hint: 'Sort coins descending and always take the largest denomination that fits. Note: greedy doesn\'t always work for coin change!',
        solution: 'Sort coins descending. Greedily pick the largest coin that fits into remaining amount. This works for canonical coin systems but NOT all — edge case: coins=[1,3,4], amount=6 → greedy gives 4+1+1=3 but optimal is 3+3=2.',
      },
      math: {
        title: 'Power of Two Check',
        statement: 'Given an integer n, return True if it is a power of two. Otherwise return False.',
        example_in: 'n=16',
        example_out: 'True',
        hint: 'A power of two has exactly one bit set. Use bitwise AND: n & (n-1) should equal 0 for powers of two.',
        solution: 'return n > 0 and (n & (n-1)) == 0. This is O(1) — single bitwise operation.',
      },
    };
    const problem = problems[args.topic] || problems.dp;
    return JSON.stringify(problem);
  }
  else if (toolName === 'analyze_complexity') {
    const desc = args.description.toLowerCase();
    let time = 'O(n)', space = 'O(1)';
    const patterns = [
      [/loop.*all.*element|iterate.*whole/i, 'O(n)'],
      [/nested.*loop|two.*loops|pair/i, 'O(n²)'],
      [/divide.*conquer|split.*half/i, 'O(n log n)'],
      [/binary.search|halve|logarithm/i, 'O(log n)'],
      [/recurs.*twice|fibonacci|tree/i, 'O(2^n)'],
      [/hash|map|dictionary|set/i, 'O(1) average'],
      [/sorted|sort|order/i, 'O(n log n)'],
      [/memoiz|cache|dp|tabulate/i, 'O(n) space for table'],
    ];
    for (const [re, c] of patterns) {
      if (re.test(desc)) { time = c; break; }
    }
    if (/space|memory|array.*size|table/.test(desc)) space = 'O(n)';
    return JSON.stringify({ description: args.description, time_complexity: time, space_complexity: space, notes: 'Analysis based on keyword matching. Verify with actual code for accuracy.' });
  }
  return JSON.stringify({ error: 'Unknown Turing skill' });
}
