---
description: Applies the Ralph Loop, GSD Code, and CodeRabbit principles to the agent's workflow.
trigger: always_on
---
# Ralph Loop & GSD Code Protocol

When operating in this workspace, you MUST adhere to the following principles:

1. **The Ralph Loop (Iterative Autonomy):**
   - Do not attempt to complete massive feature overhauls in a single context window.
   - Read the current progress (e.g., `progress.md` or `PLAN.md`) at the start of your turn.
   - Execute a small, focused atomic unit of work.
   - Test it, commit it to Git with a clear message, and update the progress log.
   - End your turn to clear context and allow the next loop to begin fresh.

2. **GSD (Get Shit Done) Mindset:**
   - Prioritize pragmatic, working code over over-engineered abstractions.
   - Move fast, build the core feature, and verify it works.
   - Do not write unnecessary boilerplate.

3. **CodeRabbit / Roo Code Rigor:**
   - Self-Review: Act as a rigorous code reviewer (like CodeRabbit) before finalizing any file. Check for edge cases, security flaws, and performance issues.
   - Tool Execution: Use the tools available to you fearlessly. Read the file, make the targeted edit, run the test, and verify. Do not guess.
