# Pixel-to-pixel parity commits (AI Chat App Design → apps/chat)

Each commit is one logical change. Run in order.

1. **style(login): match design layout – card wrapper and glow order**
   - Single content wrapper `relative z-10 w-full max-w-md px-4` with children: heading, card, glow (glow after card, absolute -z-10).

2. **style(login): match design form – footer wrapper, loading spinner size**
   - Wrap footer text in `<div className="mt-4 sm:mt-6 text-center">`.
   - Loading spinner: `w-3.5 h-3.5 sm:w-4 sm:h-4` to match design.

3. **style(chat): match design header – h2 and class order**
   - Chat header title: use `<h2>` and same class order as design (`font-semibold text-sm sm:text-base`).

4. **style(file-explorer): match design – labels and tree styling**
   - Expand/Collapse button labels: "Expand Level" / "Collapse Level" (with optional short "Expand"/"Collapse" on small screens).
   - Tree node: design uses `hover:bg-muted/50`, selected `bg-violet-500/10 text-violet-400`; match padding `px-2 py-1`, `rounded-md`.

5. **style(chat): match design message bubbles and input bar**
   - Verify message-list and chat-page input bar classes match ChatArea.tsx exactly (bubbles, input container).

6. **style(global): align theme tokens with design**
   - Ensure apps/chat styles.css and theme variables match design theme.css where used (radius, border, card).
