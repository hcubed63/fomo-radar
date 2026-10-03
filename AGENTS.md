# Global AI Playbook — Hans Hansson

## 1. Plan Mode Default
- **Enter plan mode for ANY non-trivial task** (3+ steps or architecture)
- Define BOTH execution + verification steps
- If something breaks → **STOP and re-plan**
- Write detailed specs to remove ambiguity

## 2. Subagent Strategy
- **Use subagents aggressively** for complex problems
- Split tasks: research, execution, analysis
- One task per agent for clarity
- Parallelize thinking, not just execution

## 3. Self-Improvement Loop
- After ANY mistake → log it in gotchas.md
- Convert mistakes into rules
- Review past lessons before starting
- Iterate until error rate drops

## 4. Verification Before Done
- **Never mark done without proof**
- Run tests, check logs, simulate real usage
- Compare expected vs actual behavior
- Ask: "Would a senior engineer approve this?"

## 5. Demand Elegance
- Ask: "Is there a simpler / cleaner way?"
- Avoid hacky or temporary fixes
- Optimize for long-term maintainability
- Skip overengineering for small fixes

## 6. Autonomous Bug Fixing
- Bugs → fix immediately (no hand-holding)
- Trace logs, errors, failing tests
- Find root cause, not symptoms
- Fix CI failures proactively

## 7. Skills = System Layer
- Skills are NOT just markdown files
- They include code, scripts, data, workflows
- Use skills for:
  - verification
  - automation
  - data analysis
  - scaffolding
- Skills = reusable intelligence

## 8. File System = Context Engine
- Structure over sprawl — don't let folders become junk drawers
- Fewer, clearer files beat many overlapping ones
- Use folders for:
  - references/
  - scripts/
  - templates/
- Enable progressive disclosure
- Structure improves reasoning quality

## 9. Avoid Over-Constraining AI
- Don't force rigid steps
- Provide context, not micromanagement
- Let AI adapt to the problem
- Flexibility > strict instructions

## 10. Read and Think Before Writing
- Read the surrounding code before touching it — don't skim
- Check what the project actually depends on before reaching for new tools
- State your assumptions out loud before coding, especially where more than one reasonable interpretation exists
- If a pattern is unclear, ask rather than guess

## 11. Debugging Discipline
- Investigate before changing anything — don't guess-and-check
- Read the full error and stack trace, not just the last line
- Reproduce the bug before attempting a fix
- An unexpected null, an off-by-one, or a "shouldn't happen" case is information, not an inconvenience to route around

## 12. Dependency Discipline
- Every dependency added is permanent code you now own — treat it that way
- Before adding one, check what the project already has that could do the job
- If you add one, say so and why — don't let it slide in silently

## 13. Communication
- Say what you did and why, not just a summary of the code
- Flag uncertainty explicitly ("not sure this handles X, verifying") rather than presenting a guess as settled
- Precise doubt is more useful than false confidence

## 14. Common Failure Modes (name them when you see them)
- **Kitchen Sink** — restructuring or reformatting code you weren't asked to touch
- **Wrong Abstraction** — abstracting after one example instead of after the pattern is proven
- **Optimistic Path** — handling the happy path only, ignoring errors and edge cases
- **Cascade Refactor** — a small fix that snowballs into changes across unrelated files
- Catching one of these early is cheaper than unwinding it later — name it and stop

---

## Task Management
1. Plan first → write tasks with checklist
2. Verify before execution
3. Track progress continuously
4. Explain changes at each step
5. Document results clearly
6. Capture lessons after completion

## Core Principles
- Simplicity First → minimal, clean solutions
- Systems > Prompts
- Verification > Generation
- Iteration > Perfection
- No Lazy Fixes → solve root cause

---

## Project Note for fomo-radar
This repository follows the Global AI Playbook above for all work.

The original Next.js agent note may be re-injected by `next dev` — it can be kept or ignored. The rules above take precedence for reasoning and implementation decisions.

When working on this repo (including from mobile), follow the playbook strictly.
