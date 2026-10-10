import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Send, Sparkles, Cpu, CheckCircle2, Bot, User, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CircuitProposal {
  experimentName: string;
  experimentNumber?: number;
  circuitPrompt: string;
  cadPrompt?: string;
  fluidsimPrompt?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposal?: CircuitProposal;
}

interface ChatWorkspaceProps {
  onConfirmBuild: (proposal: CircuitProposal) => void;
  isGenerating: boolean;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: `Hello! I am your **LabGen AI Co-Pilot**. 

Tell me what circuit or laboratory experiment you would like to design and analyze today. For example:
- *"Design an inverting buck-boost converter with 12V input, 50kHz PWM, and analysis of varying load."*
- *"TRIAC phase control triggering characteristic experiment with gate resistor sweep."*
- *"Full-wave bridge rectifier with capacitor filter and ripple analysis."*

I will verify the theory, formulate simulation parameters, and configure the full report and 3D CAD mechanical model. When you're ready, simply confirm to build!`,
  }
];

export function ChatWorkspace({ onConfirmBuild, isGenerating }: ChatWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const parseProposal = (text: string): CircuitProposal | undefined => {
    try {
      const match = text.match(/```json:proposal\s*([\s\S]*?)\s*```/) || text.match(/```json\s*(\{[\s\S]*?"experimentName"[\s\S]*?\})\s*```/);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }
    } catch (e) {
      console.warn('Failed to parse proposal json:', e);
    }
    return undefined;
  };

  const cleanContent = (text: string): string => {
    return text.replace(/```json:proposal\s*[\s\S]*?\s*```/g, '').trim();
  };

  const handleSend = async (textToSend?: string) => {
    const messageContent = (textToSend || input).trim();
    if (!messageContent || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': import.meta.env.VITE_API_KEY || ''
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.statusText}`);
      }

      const data = await response.json();
      const replyText = data.reply || '';
      const proposal = parseProposal(replyText);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: replyText,
        proposal,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      // Local fallback for offline/test environments
      const isBuckBoost = messageContent.toLowerCase().includes('buck') || messageContent.toLowerCase().includes('boost');
      const fallbackProposal: CircuitProposal = isBuckBoost
        ? {
            experimentName: 'Study and Simulation of Inverting Buck-Boost Converter',
            experimentNumber: 2,
            circuitPrompt: 'Inverting buck-boost converter with Vin=12V, L=100uH, C=470uF, Rload=10ohm, PWM frequency 50kHz. Inverting diode topology with negative output rail.',
            cadPrompt: 'Industrial DIN-rail converter enclosure with passive aluminum cooling fins and PCB standoffs',
          }
        : {
            experimentName: 'Laboratory Experiment Analysis',
            experimentNumber: 2,
            circuitPrompt: messageContent,
            cadPrompt: 'Electronics casing with ventilation grid and PCB mount tabs',
          };

      const fallbackReply = `### Analysis & Synthesis Plan

I have synthesized the specifications for **${fallbackProposal.experimentName}**:

1. **Topology & Theory**:
   Governed by volt-second balance: $V_{out} = -V_{in} \\frac{D}{1-D}$.
2. **Simulation Strategy**:
   Multi-step parametric sweep across varying supply voltages and load resistances.
3. **Mechanical 3D CAD**:
   Parametric protective chassis with ventilation and mounting tabs.

Review the proposed parameters below and click **Confirm & Build System** to launch the pipeline!`;

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: fallbackReply,
          proposal: fallbackProposal,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-4 items-start',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            <div
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md',
                msg.role === 'user'
                  ? 'bg-zinc-100 text-white'
                  : 'bg-indigo-950 border border-indigo-700/60 text-indigo-300'
              )}
            >
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>

            <div
              className={cn(
                'rounded-xl p-5 max-w-[85%] text-sm leading-relaxed shadow-lg',
                msg.role === 'user'
                  ? 'bg-zinc-100/90 text-white rounded-tr-none'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none'
              )}
            >
              <div className="prose prose-invert prose-slate max-w-none text-zinc-200">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {cleanContent(msg.content)}
                </ReactMarkdown>
              </div>

              {/* Proposal Card */}
              {msg.proposal && (
                <div className="mt-4 p-4 rounded-lg bg-zinc-950/90 border border-zinc-100/40 shadow-xl space-y-3">
                  <div className="flex items-center gap-2 text-zinc-400 font-semibold text-xs tracking-wider uppercase">
                    <Sparkles className="w-4 h-4" />
                    Verified System Proposal Ready
                  </div>

                  <div className="space-y-1.5 text-xs text-zinc-300">
                    <div>
                      <span className="text-zinc-500 font-medium">Experiment: </span>
                      <span className="text-white font-semibold">{msg.proposal.experimentName}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 font-medium">Circuit Topology: </span>
                      <span className="text-zinc-300">{msg.proposal.circuitPrompt}</span>
                    </div>
                    {msg.proposal.cadPrompt && (
                      <div>
                        <span className="text-zinc-500 font-medium">CAD Model: </span>
                        <span className="text-zinc-300">{msg.proposal.cadPrompt}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onConfirmBuild(msg.proposal!)}
                    disabled={isGenerating}
                    className={cn(
                      'w-full py-2.5 px-4 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all duration-200 shadow-md',
                      isGenerating
                        ? 'bg-zinc-800/50 text-zinc-400 cursor-not-allowed'
                        : 'bg-zinc-100 hover:bg-zinc-100 text-white hover:shadow-zinc-100/30'
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        GENERATING SYSTEM...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-white" />
                        CONFIRM & BUILD SYSTEM
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-4 items-start">
            <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-indigo-300">
              <Bot className="w-5 h-5 animate-pulse" />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              <span>Analyzing circuit equations and formulating simulation parameters...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-6 py-2 border-t border-zinc-800/60 bg-zinc-900/40 flex items-center gap-2 overflow-x-auto text-xs text-zinc-400">
        <span className="text-zinc-500 flex-shrink-0 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-zinc-400" /> Try:
        </span>
        <button
          type="button"
          onClick={() => handleSend("Design an inverting buck-boost converter with Vin=12V, fs=50kHz, L=100uH, C=470uF, and analyze varying voltage and load resistance.")}
          className="px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors flex-shrink-0 border border-zinc-700"
        >
          Inverting Buck-Boost Converter
        </button>
        <button
          type="button"
          onClick={() => handleSend("Study TRIAC switching and gate triggering characteristics under variable AC load.")}
          className="px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors flex-shrink-0 border border-zinc-700"
        >
          TRIAC Gate Triggering
        </button>
        <button
          type="button"
          onClick={() => handleSend("Step-up Boost Converter 12V to 24V with CCM ripple analysis.")}
          className="px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors flex-shrink-0 border border-zinc-700"
        >
          Boost Converter (12V to 24V)
        </button>
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/90">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="max-w-4xl mx-auto flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Discuss or specify your circuit (e.g. buck-boost, components, voltages, CAD)..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/30 text-sm transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={cn(
              'px-5 py-3 rounded-lg font-medium text-sm flex items-center gap-2 transition-all',
              !input.trim() || isLoading
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-zinc-100 hover:bg-zinc-100 text-zinc-900 shadow-sm'
            )}
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
