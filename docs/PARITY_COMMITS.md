# Pixel-to-pixel parity commits (AI Chat App Design → apps/chat)

Each commit is one logical change. Applied in order.

1. ✅ **style(login): match design layout – card wrapper and glow order**
   - Single content wrapper `relative z-10 w-full max-w-md px-4` with children: heading, card, glow (glow after card, absolute -z-10).

2. ✅ **style(login): match design form – footer wrapper, loading spinner size**
   - Footer wrapped in `<div className="mt-4 sm:mt-6 text-center">`. Loading spinner: `w-3.5 h-3.5 sm:w-4 sm:h-4`, label `text-xs sm:text-sm`.

3. ✅ **style(chat): match design header – h2**
   - Chat header title: `<h2 className="font-semibold text-sm sm:text-base text-foreground">`.

4. ✅ **style(file-explorer): match design – labels and tree styling**
   - Expand/Collapse: "Expand Level" / "Collapse Level" on sm+. Tree node: `hover:bg-muted/50`, `cursor-pointer`, `transition-all`, `group`.

5. ✅ **style(chat): match design typing indicator**
   - Typing row: `flex gap-4`, avatar `size-8`, bubble `bg-card border border-border px-4 py-3`.

6. ✅ **style(global): align theme tokens with design**
   - `--radius: 0.75rem`, border opacity `0.1` (light) to match design theme.css.

7. ✅ **style(chat): match design layout and chat area**
   - Flex layout (sidebar then main). Header inside main. Auth/Logout text-[10px] sm:text-xs. Paperclip hidden sm:flex. Placeholder "Ask me anything...".

8. ✅ **style(chat): align content left (remove mx-auto)**
   - Messages and input containers: max-w-4xl without mx-auto to match design.

9. ✅ **style(file-explorer): expand/collapse all buttons**
   - h-7 px-2 text-[10px], title "Expand All" / "Collapse All".

10. ✅ **feat(chat): responsive sidebar and expandable search**
   - Viewport < 1024px: floating menu button opens drawer with FileExplorer (design ResponsiveFileExplorer).
   - FileExplorer accepts optional fullWidth for drawer.
   - Search icon toggles expandable search bar; filter messages; "Found N message(s)".

11. ✅ **style: icons, radii, backgrounds**
   - Login: input, submit, error box rounded-md.
   - Chat: all icon buttons and pills rounded-md; assistant avatar relative.
   - File explorer: Folder/FolderOpen/File 24x24 lucide-style; Settings rounded-md.
   - Theme toggle, auth modal close: rounded-md.

12. ✅ **style: typography, layout, model selector**
   - --font-size: 16px, html font-size; chat root size-full min-h-screen, main bg-transparent.
   - Model selector: rounded-md, hidden md:flex; login w-full.

13. ✅ **style(file-explorer): tree container p-2**
   - Match design FileExplorerSidebar tree wrapper padding.
