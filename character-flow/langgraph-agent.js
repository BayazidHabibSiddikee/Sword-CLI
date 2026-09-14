/**
 * langgraph-agent.js — LangGraph-powered agentic loop for character-flow.
 *
 * Graph: START → llm → [tool_calls?] → tools → llm → … → END
 * Features: multi-turn memory, checkpointing, streaming, human-in-the-loop
 */
import { ChatOpenAI } from '@langchain/openai';
import {
  MessagesAnnotation,
  StateGraph,
  MemorySaver,
  END,
  START,
} from '@langchain/langgraph';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';

const PROXY_BASE = process.env.PROXY_HOST || 'http://localhost:3001';
const API_KEY = process.env.FREELLMAPI_KEY || 'freellmapi-05c2b4b3bbdfadfb5b2ce3df63a132c6995b97002194718c';

// ── LLM Node ──────────────────────────────────────────────────────────────────
async function llmNode(state, config) {
  const msgs = state.messages || [];
  const sysPrompt = config?.configurable?.system_prompt || '';
  const tools = config?.configurable?.tools || [];
  const modelName = config?.configurable?.model_name || 'agnes-2.5-flash';
  const maxTokens = config?.configurable?.max_tokens || 4096;

  const allMessages = sysPrompt
    ? [new SystemMessage(sysPrompt), ...msgs]
    : [...msgs];

  const llm = new ChatOpenAI({
    modelName,
    configuration: {
      baseURL: PROXY_BASE + '/v1',
      apiKey: API_KEY,
    },
    temperature: 0.7,
    maxTokens,
    parallelToolCalls: false,
  });

  const invokeOpts = {};
  if (tools.length > 0) invokeOpts.tools = tools;

  const response = await llm.invoke(allMessages, invokeOpts);
  return { messages: [response] };
}

// ── Tool Execution Node ───────────────────────────────────────────────────────
async function toolNode(state, config) {
  const msgs = state.messages || [];
  const executor = config?.configurable?.tool_executor;
  const aiMsg = [...msgs].reverse().find(m => m instanceof AIMessage && m.tool_calls?.length);

  if (!aiMsg || !aiMsg.tool_calls?.length) {
    return { messages: [] };
  }

  const toolResults = [];
  for (const tc of aiMsg.tool_calls) {
    try {
      const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
      let output;
      if (executor && typeof executor === 'function') {
        output = await executor(tc.name, args);
      } else {
        output = JSON.stringify({ error: `No executor registered for tool: ${tc.name}` });
      }
      const content = typeof output === 'string' ? output : JSON.stringify(output);
      toolResults.push(new ToolMessage({ content, tool_call_id: tc.id, name: tc.name }));
    } catch (e) {
      toolResults.push(new ToolMessage({
        content: JSON.stringify({ error: e.message }),
        tool_call_id: tc.id,
        name: tc.name,
      }));
    }
  }

  return { messages: toolResults };
}

// ── Routing ───────────────────────────────────────────────────────────────────
function routeAfterLLM(state) {
  const msgs = state.messages || [];
  const last = msgs[msgs.length - 1];
  if (last?.tool_calls && last.tool_calls.length > 0) return 'tools';
  return END;
}

// ── Build graph factory ───────────────────────────────────────────────────────
export function buildAgent(config = {}) {
  const {
    systemPrompt = '',
    tools = [],
    modelName = 'agnes-2.5-flash',
    maxTokens = 4096,
    toolExecutor = null,
  } = config;

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('llm', (state, cfg) => llmNode(state, {
      ...cfg,
      configurable: { ...cfg?.configurable, system_prompt: systemPrompt, tools, model_name: modelName, max_tokens: maxTokens, tool_executor: toolExecutor },
    }))
    .addNode('tools', (state, cfg) => toolNode(state, {
      ...cfg,
      configurable: { ...cfg?.configurable, tool_executor: toolExecutor },
    }))
    .addEdge(START, 'llm')
    .addConditionalEdges('llm', routeAfterLLM, ['tools', END])
    .addEdge('tools', 'llm');

  return graph.compile({ checkpointer: new MemorySaver(), maxIterations: 10 });
}

// ── Agent class ───────────────────────────────────────────────────────────────
export class LangGraphAgent {
  constructor(options = {}) {
    this.compiled = buildAgent({
      systemPrompt: options.systemPrompt || '',
      tools: options.tools || [],
      modelName: options.modelName || 'agnes-2.5-flash',
      maxTokens: options.maxTokens || 4096,
      toolExecutor: options.toolExecutor || null,
    });
    this.characterName = options.characterName || 'agent';
    this.threadId = options.threadId || 'default';
  }

  getConfig() {
    return { configurable: { thread_id: this.threadId } };
  }

  /** Run one turn — blocks until final text response */
  async run(userInput) {
    const result = await this.compiled.invoke(
      { messages: [new HumanMessage(userInput)] },
      this.getConfig()
    );
    const last = result.messages[result.messages.length - 1];
    return {
      response: last?.content || '(no response)',
      turns: result.messages.filter(m => m instanceof AIMessage).length,
      hasToolCalls: result.messages.some(m => m instanceof AIMessage && m.tool_calls?.length),
    };
  }

  /** Stream: yields { node, data } chunks as they arrive */
  async *stream(userInput) {
    // LangGraph v1.x: stream() returns a Promise that resolves to an async iterator
    const streamPromise = this.compiled.stream(
      { messages: [new HumanMessage(userInput)] },
      this.getConfig()
    );
    const streamObj = await streamPromise;
    for await (const chunk of streamObj) {
      yield chunk;
    }
  }

  /** Clear conversation (new thread) */
  clear() {
    this.threadId = `thread_${Date.now()}`;
  }

  /** Get message history */
  getHistory() {
    return this.compiled.getState(this.getConfig())?.messages || [];
  }
}
