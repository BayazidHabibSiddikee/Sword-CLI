#!/usr/bin/env node
/**
 * agentic-base.js — Shared agentic TUI base with function calling support.
 * Import this and extend for each character.
 */
import { readFileSync, existsSync } from 'fs';

export async function fetchChat(msgs, tools = []) {
  const body = { model: 'auto', messages: msgs, stream: false };
  if (tools.length > 0) body.tools = tools;
  const res = await fetch(`${process.env.PROXY_HOST || 'http://localhost:3001'}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${await res.text()}`);
  return await res.json();
}

export async function runAgent(initialMsg, tools, executeTool, charColor = '#00CED1') {
  const chalk = await import('chalk');
  const C = { user: chalk.default.cyan, ai: chalk.default.hex(charColor), dim: chalk.default.gray, error: chalk.default.red, tool: chalk.default.hex('#FFD700'), accent: chalk.default.green };
  
  let messages = [{ role: 'system', content: initialMsg }];
  
  while (true) {
    const ans = await new Promise(r => process.stdin.on('data', d => { r(d.toString().trim()); process.stdin.removeListener('data', r); }));
    if (!ans || ans === 'exit' || ans === 'quit') break;
    
    messages.push({ role: 'user', content: ans });
    
    // Handle slash commands first
    if (ans.startsWith('/')) {
      await handleSlashCommand(ans, tools, executeTool, messages, C);
      continue;
    }
    
    // Agentic loop: call LLM, execute tools if needed, repeat
    let replies = 0;
    while (replies < 5) {
      try {
        const result = await fetchChat(messages, tools);
        const msg = result.choices?.[0]?.message;
        
        if (msg?.tool_calls) {
          for (const tc of msg.tool_calls) {
            const fn = tc.function;
            console.log(C.tool(`  ⚡ ${fn.name}(...)`));
            try {
              const args = JSON.parse(fn.arguments || '{}');
              const output = await executeTool(fn.name, args);
              console.log(C.dim(`  → ${String(output).slice(0, 200)}${String(output).length > 200 ? '...' : ''}`));
              messages.push({ role: 'tool', tool_call_id: tc.id, content: output });
            } catch (e) {
              messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: e.message }) });
            }
          }
          // Re-call LLM with tool results
          continue;
        }
        
        // Text response
        const reply = msg?.content || '[no response]';
        console.log(C.ai('\n' + reply + '\n'));
        messages.push({ role: 'assistant', content: reply });
        break;
      } catch (e) {
        console.log(C.error(`  Connection error: ${e.message}`));
        break;
      }
      replies++;
    }
  }
}

async function handleSlashCommand(cmd, tools, executeTool, messages, C) {
  const parts = cmd.slice(1).split(' ');
  const action = parts[0];
  
  if (action === 'tools' || action === 'skills') {
    console.log(C.dim('\n🔧 Available Skills:\n'));
    for (const t of tools) {
      const fn = t.function;
      console.log(C.accent(`  ${fn.name}`));
      console.log(C.dim(`    ${fn.description}\n`));
    }
  }
  else if (action === 'stats') {
    try {
      const result = await fetchChat(messages, []);
      const statsMsg = result.choices?.[0]?.message?.content || '';
      console.log(C.ai(statsMsg));
    } catch (e) { console.log(C.error(e.message)); }
  }
  else if (action === 'clear') {
    messages.length = 1; // keep system message
    console.log(C.dim('  Conversation cleared.'));
  }
  else {
    // Pass slash command as-is to LLM (some chars have their own /commands)
    console.log(C.dim(`  Running: ${cmd}`));
    messages.push({ role: 'user', content: cmd });
    try {
      const result = await fetchChat(messages, tools);
      const msg = result.choices?.[0]?.message;
      if (msg?.tool_calls) {
        for (const tc of msg.tool_calls) {
          console.log(C.tool(`  ⚡ ${tc.function.name}(...)`));
          const args = JSON.parse(tc.function.arguments || '{}');
          const output = await executeTool(tc.function.name, args);
          console.log(C.dim(`  → ${String(output).slice(0, 200)}`));
          messages.push({ role: 'tool', tool_call_id: tc.id, content: output });
        }
      } else {
        console.log(C.ai(msg?.content || ''));
        messages.push({ role: 'assistant', content: msg?.content });
      }
    } catch (e) { console.log(C.error(e.message)); }
  }
}
