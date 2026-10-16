# AGENTS.md

## Read first, every session
1. DESIGN.md — the vision. It overrides your defaults.
2. STATE.md — what exists and what's next.

## Game feel rules
- Before any gameplay change, state in 2 lines what the player should feel.
- Every player action gets immediate feedback (visual + sound hook).
- All tunable numbers live in the tuning file. Never hardcode them.
- Gameplay emits events; the juice layer reacts. Keep them separate.
- Prefer one satisfying mechanic over three shallow ones.
- If a request conflicts with a pillar or anti-goal in DESIGN.md, flag it.
- Each task ends in a playable state.

## End of every session
Update STATE.md: what changed, assumptions made, known issues, next steps.

## Project-specific rules
- Target device is iPad (Safari, installed to Home Screen). Test every touch interaction with touch, not just mouse.
- The app must work fully offline. Never add a runtime network request, CDN or external font.
- Users are 9 and 11: touch targets ≥ 56 px, no reading-heavy UI, no scores or timers.
