#!/usr/bin/env node
import readline from 'readline';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';

import ffaivideo from 'ffaivideo';
import { LangGraphAgent } from './langgraph-agent.js';
import { G4F } from 'g4f';

// Import skills
import * as bridge from './skills/bridge.js';
import * as gitSkill from './skills/git.js';
import * as fileEditSkill from './skills/file_edit.js';
import * as tasksSkill from './skills/tasks.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const g4f = new G4F();
let currentCharacter = "izuku";
let currentModel = "auto";
let currentTeamMode = false;
let externalApi = "";
let webServerProcess = null;

const CUSTOM_TOOLS = [
  {
    type: "function",
    function: {
      name: "run_bash",
      description: "Run a bash command in the terminal",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_video",
      description: "Generate a video based on a prompt via ffaivideo",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_pdf",
      description: "Read text from a PDF file",
      parameters: {
        type: "object",
        properties: { filepath: { type: "string" } },
        required: ["filepath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_to_rag",
      description: "Save important knowledge or context to the RAG system",
      parameters: {
        type: "object",
        properties: { 
          category: { type: "string" },
          title: { type: "string" },
          content: { type: "string" }
        },
        required: ["category", "title", "content"]
      }
    }
  }
];

let agentInstance = null;
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { RagEngine } from './brain/rag.js';
const ragDb = new RagEngine(join(__dirname, 'brain', 'rag.db'));

async function executeTool(name, args) {
  try {
    if (name === "run_bash") {
      const { stdout, stderr } = await execAsync(args.command);
      return stdout + (stderr ? "\nSTDERR:\n" + stderr : "");
    }
    if (name === "generate_video") {
      const videoOpts = { prompt: args.prompt, type: "video" };
      const res = await ffaivideo.generateVideo(videoOpts);
      return "Video generated successfully for: " + args.prompt + " Response: " + JSON.stringify(res); 
    }
    if (name === "read_pdf") {
      const dataBuffer = fs.readFileSync(args.filepath);
      const data = await pdfParse(dataBuffer);
      return data.text.substring(0, 10000); // return up to 10k chars to prevent overflow
    }
    if (name === "save_to_rag") {
      ragDb.insertKnowledge(args.category, args.title, args.content, "agent_tool");
      return "Successfully saved to RAG memory.";
    }
    if (name.startsWith('git_')) return await gitSkill.execute(name, args);
    if (['search_replace','insert_after','insert_before','append_file','replace_block','create_dir','delete_file','grep_search','count_lines'].includes(name)) {
      return await fileEditSkill.execute(name, args);
    }
    if (['add_task','list_tasks','update_task','delete_task','stats_tasks'].includes(name)) {
      return await tasksSkill.execute(name, args);
    }
    return await bridge.execute(name, args);
  } catch (err) {
    return "Error: " + err.message;
  }
}

async function loadAgent(character) {
  console.log(chalk.green(`[System] Loading agent: ${character} (Model: ${currentModel})`));
  let systemPrompt = "You are a highly capable agent acting as swordcli. Use tools for full system access and development.";
  
  try {
    const brainModule = await import(join(__dirname, 'brain', `${character}.js`));
    systemPrompt = brainModule.SYSTEM_PROMPT || systemPrompt;
  } catch (err) {
    console.log(chalk.yellow(`[Notice] Using default brain for ${character}.`));
  }
  
  if (currentTeamMode) {
    systemPrompt += "\n[TEAM MODE ACTIVE] You are collaborating with a team of 10 agents to solve complex tasks. Delegate sub-tasks if needed.";
  }
  systemPrompt += `\n[Context] Your current working directory is ${process.cwd()}. Always use this context when running bash commands or reading files.`;

  const allTools = [
    ...bridge.TOOL_DEFINITIONS || [], 
    ...gitSkill.TOOL_DEFINITIONS || [], 
    ...fileEditSkill.TOOL_DEFINITIONS || [], 
    ...tasksSkill.TOOL_DEFINITIONS || [],
    ...CUSTOM_TOOLS
  ];

  agentInstance = new LangGraphAgent({
    systemPrompt: systemPrompt,
    tools: allTools,
    modelName: currentModel,
    toolExecutor: executeTool
  });
  currentCharacter = character;
}

const printHelp = () => {
  console.log(chalk.blue(`
── swordcli Hints & Commands ──
/                 : Show this help message
/character <name> : Switch character (izuku, mahina, muhan, etc.)
/model <name>     : Switch model (auto, gpt-4, claude, etc.)
/team             : Toggle team mode (all 10 agents work together)
/connect <url>    : Connect to an external API endpoint
/web              : Start the web application UI and API sync
/exit             : Quit the application
───────────────────────────────
`));
};

async function handleSlashCommand(input) {
  const parts = input.trim().split(' ');
  const cmd = parts[0].toLowerCase();
  
  if (cmd === '/' || cmd === '/help') {
    printHelp();
  } else if (cmd === '/character') {
    const char = parts[1];
    if (char) await loadAgent(char);
    else console.log(chalk.red("Usage: /character <name>"));
  } else if (cmd === '/model') {
    const mdl = parts[1];
    if (mdl) {
      currentModel = mdl;
      await loadAgent(currentCharacter);
    } else console.log(chalk.red("Usage: /model <name>"));
  } else if (cmd === '/team') {
    currentTeamMode = !currentTeamMode;
    console.log(chalk.cyan(`[System] Team mode is now ${currentTeamMode ? 'ON' : 'OFF'}`));
    await loadAgent(currentCharacter);
  } else if (cmd === '/connect') {
    externalApi = parts[1] || "";
    console.log(chalk.cyan(`[System] Connected to external API: ${externalApi || 'None'}`));
  } else if (cmd === '/web') {
    startWebServer();
  } else if (cmd === '/exit') {
    process.exit(0);
  } else {
    console.log(chalk.red("Unknown command. Type / for hints."));
  }
}

// Minimal HTTP Server to sync Web UI with Terminal
function startWebServer() {
  if (webServerProcess) {
    console.log(chalk.yellow("[System] Web server is already running."));
    return;
  }
  console.log(chalk.cyan("[System] Starting swordcli Web UI & API Sync..."));
  
  const server = createServer(async (req, res) => {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, 'http://localhost:3002');
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { message, character, apiKey } = JSON.parse(body);
          if (apiKey) process.env.OPENAI_API_KEY = apiKey;
          if (character && character !== currentCharacter) await loadAgent(character);
          
          console.log(chalk.magenta(`\n[Web User] > ${message}`));
          console.log(chalk.dim("Agent is thinking..."));
          
          const result = await agentInstance.run(message);
          
          console.log(chalk.green(`[Web Agent] > `) + result.response);
          process.stdout.write(chalk.cyan("sword> ")); // Reprint prompt
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response: result.response }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    // Fallback to proxying or just dummy responses for other APIs
    res.writeHead(404);
    res.end();
  });

  server.listen(3002, () => {
    console.log(chalk.green(`[System] API Server listening on port 3002`));
    const webPath = join(__dirname, 'web');
    webServerProcess = spawn('npm', ['run', 'dev', '--prefix', webPath], { stdio: 'inherit', shell: true });
  });
}

async function main() {
  const inputArg = process.argv.slice(2).join(' ').trim();
  
  if (!inputArg) {
    console.log(chalk.bold.cyan("Welcome to swordcli Agent Mode!"));
    printHelp();
  }
  
  await loadAgent("izuku");

  if (inputArg) {
    if (inputArg.startsWith('/')) {
      await handleSlashCommand(inputArg);
      process.exit(0);
    }
    console.log(chalk.magenta(`\nUser > ${inputArg}`));
    console.log(chalk.dim("Agent is thinking..."));
    try {
      const result = await agentInstance.run(inputArg);
      console.log(chalk.green(`${currentCharacter}> `) + result.response);
    } catch (err) {
      console.log(chalk.yellow("[Fallback] Proxy failed, using g4f for anonymous response..."));
      try {
        const res = await g4f.chatCompletion([{ role: "user", content: inputArg }]);
        console.log(chalk.green(`${currentCharacter} (g4f)> `) + res);
      } catch (g4fErr) {
        console.log(chalk.red("Error: " + err.message));
      }
    }
    process.exit(0);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  rl.on('SIGINT', () => {
    console.log(chalk.yellow("\nExiting swordcli..."));
    process.exit(0);
  });
  
  const ask = () => {
    rl.question(chalk.cyan("sword> "), async (input) => {
      if (!input.trim()) return ask();
      
      if (input.startsWith('/')) {
        await handleSlashCommand(input);
        return ask();
      }
      
      try {
        console.log(chalk.dim("Agent is thinking..."));
        const result = await agentInstance.run(input);
        console.log(chalk.green(`${currentCharacter}> `) + result.response);
      } catch (err) {
        console.log(chalk.yellow("[Fallback] Proxy failed, using g4f for anonymous response..."));
        try {
          const res = await g4f.chatCompletion([{ role: "user", content: input }]);
          console.log(chalk.green(`${currentCharacter} (g4f)> `) + res);
        } catch (g4fErr) {
          console.log(chalk.red("Error: " + err.message));
        }
      }
      ask();
    });
  };
  
  ask();
}

main().catch(err => {
  console.error(chalk.red(err));
  process.exit(1);
});
