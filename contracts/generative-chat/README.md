# Mobile generative chat

fibe-ios sends a display-only response format with each chat message when the
runtime-config `structuredOutput` capability is present. The schema goes
through the existing `responseFormat` admission and provider path unchanged;
the final object is stored as is in `structuredOutput`. No second inference,
new tool, or server action is involved, so a new schema version needs no agent
change.

A complete answer is readable `text` alone with an empty `a2uiMessages` array,
or readable text plus one self-contained A2UI v1.0 surface of literal
components. The client validates values and the component tree before
rendering and shows `text` when it cannot render the layout.

| Files | Catalog | Requested by |
| --- | --- | --- |
| `schema-v2.json`, `example-v2.json`, `text-example-v2.json` | `chat-display/v2` | current app builds |
| `schema.json`, `example.json`, `text-example.json` | `chat-display/v1` | older app builds; saved history |

Version 2 keeps the v1 tabs, sheet and link button and adds styled components:
Column/Row, Grid, Box, Text, Heading, Markdown, Badge, Callout, Symbol,
Divider, Spacer, KeyValue, Table, Stat, Progress, Code, Chart and Timeline.
Colors are semantic tokens (`default`, `muted`, `accent`, `success`,
`warning`, `danger`, `info`), named system colors or `#RRGGBB`; the app adapts
them to light and dark appearance and enforces readable contrast. Every
object lists all of its properties as required (strict provider mode), shared
definitions live in `$defs`, and the minified schema stays under 14 KiB
because it is sent with every model request of a turn. Key order is part of
the contract: providers generate properties in schema order, so `id` and
`component` lead every component and `text` precedes `a2uiMessages`; the app
sends the bundled bytes in that order. The components list asks for one
`root` Column or Box with every other component referenced exactly once; the
app still rebuilds a usable tree from answers that miss those rules. Older app builds treat
a version 2 answer as unsupported and show its `text`.

The examples are synthetic fixture data, not an actual Playground inventory.
`example-v2.json` uses every version 2 component.

Keep the files identical to `fibe-ios/Fibe/GenerativeChat/Resources/`
(`generative-chat-*.json`, version 2 as `generative-chat-v2-*.json`). Check
both selected checkouts with:

```sh
node scripts/check-generative-chat-contract.mjs /path/to/fibe-ios
```

Missing capability information preserves ordinary chat on older agents. No
mobile authorization changes are required. Rollout, refresh, form submission,
RPC, and CLI-backed button execution are outside both versions.
