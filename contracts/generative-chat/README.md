# Mobile generative chat

`schema.json` is the version 1 display-only response format used by fibe-ios. It
contains the generation instructions and a compact draft-07 subset of the
pinned A2UI v1.0 catalog: literal content, freely nested component references,
and local interactions. A complete answer is either readable `text` alone with
an empty `a2uiMessages` array, or readable text plus one self-contained surface.
No second inference, new tool, or server action is involved.

The schema goes through the existing `responseFormat` admission/provider path.
The final object is stored unchanged in `structuredOutput`. The client validates
the surface graph and native catalog before rendering; it uses `text` if it
cannot render the layout. Generic text-stream behavior remains unchanged.

`example.json` is synthetic fixture data, not an actual Playground inventory.
It demonstrates a table composed from native rows, tabs, scope details, and an
explicit link. `text-example.json` covers ordinary answers.

Keep the schema and examples identical to the files bundled in
`fibe-ios/Fibe/GenerativeChat/Resources/`. Check both selected checkouts with:

```sh
node scripts/check-generative-chat-contract.mjs /path/to/fibe-ios
```

The app enables structured sends using the runtime-config `structuredOutput`
capability. Missing capability information preserves ordinary chat on older
agents. No mobile authorization changes are required. Rollout, refresh, form
submission, RPC, and CLI-backed button execution are outside version 1.
