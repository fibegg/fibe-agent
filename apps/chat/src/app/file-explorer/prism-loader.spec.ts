import { describe, it, expect, vi, afterEach } from 'vitest';

// Prism needs to be mocked because it loads CSS and many language files
vi.mock('prismjs', () => ({
  default: {
    highlightElement: vi.fn(),
  },
}));
vi.mock('./prism-theme.css', () => ({}));
vi.mock('prismjs/plugins/line-numbers/prism-line-numbers', () => ({}));
vi.mock('prismjs/plugins/line-numbers/prism-line-numbers.css', () => ({}));
vi.mock('prismjs/components/prism-markup', () => ({}));
vi.mock('prismjs/components/prism-markup-templating', () => ({}));
vi.mock('prismjs/components/prism-css', () => ({}));
vi.mock('prismjs/components/prism-clike', () => ({}));
vi.mock('prismjs/components/prism-javascript', () => ({}));
vi.mock('prismjs/components/prism-typescript', () => ({}));
vi.mock('prismjs/components/prism-jsx', () => ({}));
vi.mock('prismjs/components/prism-tsx', () => ({}));
vi.mock('prismjs/components/prism-json', () => ({}));
vi.mock('prismjs/components/prism-json5', () => ({}));
vi.mock('prismjs/components/prism-bash', () => ({}));
vi.mock('prismjs/components/prism-python', () => ({}));
vi.mock('prismjs/components/prism-yaml', () => ({}));
vi.mock('prismjs/components/prism-sql', () => ({}));
vi.mock('prismjs/components/prism-scss', () => ({}));
vi.mock('prismjs/components/prism-ruby', () => ({}));
vi.mock('prismjs/components/prism-go', () => ({}));
vi.mock('prismjs/components/prism-go-module', () => ({}));
vi.mock('prismjs/components/prism-rust', () => ({}));
vi.mock('prismjs/components/prism-java', () => ({}));
vi.mock('prismjs/components/prism-kotlin', () => ({}));
vi.mock('prismjs/components/prism-swift', () => ({}));
vi.mock('prismjs/components/prism-php', () => ({}));
vi.mock('prismjs/components/prism-csharp', () => ({}));
vi.mock('prismjs/components/prism-c', () => ({}));
vi.mock('prismjs/components/prism-cpp', () => ({}));
vi.mock('prismjs/components/prism-markdown', () => ({}));
vi.mock('prismjs/components/prism-zig', () => ({}));
vi.mock('prismjs/components/prism-lua', () => ({}));
vi.mock('prismjs/components/prism-dart', () => ({}));
vi.mock('prismjs/components/prism-haskell', () => ({}));
vi.mock('prismjs/components/prism-scala', () => ({}));
vi.mock('prismjs/components/prism-nim', () => ({}));
vi.mock('prismjs/components/prism-elixir', () => ({}));
vi.mock('prismjs/components/prism-erlang', () => ({}));
vi.mock('prismjs/components/prism-clojure', () => ({}));
vi.mock('prismjs/components/prism-groovy', () => ({}));
vi.mock('prismjs/components/prism-perl', () => ({}));
vi.mock('prismjs/components/prism-powershell', () => ({}));
vi.mock('prismjs/components/prism-fsharp', () => ({}));
vi.mock('prismjs/components/prism-ocaml', () => ({}));
vi.mock('prismjs/components/prism-solidity', () => ({}));
vi.mock('prismjs/components/prism-toml', () => ({}));
vi.mock('prismjs/components/prism-docker', () => ({}));
vi.mock('prismjs/components/prism-makefile', () => ({}));
vi.mock('prismjs/components/prism-cmake', () => ({}));
vi.mock('prismjs/components/prism-gradle', () => ({}));
vi.mock('prismjs/components/prism-ini', () => ({}));
vi.mock('prismjs/components/prism-graphql', () => ({}));
vi.mock('prismjs/components/prism-pug', () => ({}));
vi.mock('prismjs/components/prism-less', () => ({}));
vi.mock('prismjs/components/prism-stylus', () => ({}));
vi.mock('prismjs/components/prism-coffeescript', () => ({}));
vi.mock('prismjs/components/prism-julia', () => ({}));
vi.mock('prismjs/components/prism-r', () => ({}));
vi.mock('prismjs/components/prism-basic', () => ({}));
vi.mock('prismjs/components/prism-vbnet', () => ({}));
vi.mock('prismjs/components/prism-protobuf', () => ({}));
vi.mock('prismjs/components/prism-nginx', () => ({}));
vi.mock('prismjs/components/prism-diff', () => ({}));
vi.mock('prismjs/components/prism-csv', () => ({}));
vi.mock('prismjs/components/prism-rest', () => ({}));
vi.mock('prismjs/components/prism-latex', () => ({}));
vi.mock('prismjs/components/prism-objectivec', () => ({}));
vi.mock('prismjs/components/prism-gdscript', () => ({}));
vi.mock('prismjs/components/prism-glsl', () => ({}));
vi.mock('prismjs/components/prism-verilog', () => ({}));
vi.mock('prismjs/components/prism-vhdl', () => ({}));
vi.mock('prismjs/components/prism-wasm', () => ({}));
vi.mock('prismjs/components/prism-d', () => ({}));
vi.mock('prismjs/components/prism-crystal', () => ({}));
vi.mock('prismjs/components/prism-fortran', () => ({}));
vi.mock('prismjs/components/prism-nix', () => ({}));
vi.mock('prismjs/components/prism-hcl', () => ({}));
vi.mock('prismjs/components/prism-properties', () => ({}));
vi.mock('prismjs/components/prism-editorconfig', () => ({}));
vi.mock('prismjs/components/prism-dot', () => ({}));
vi.mock('prismjs/components/prism-mermaid', () => ({}));

describe('highlightCodeElement', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls Prism.highlightElement with the provided element', async () => {
    const { highlightCodeElement } = await import('./prism-loader');
    const Prism = (await import('prismjs')).default;
    const el = document.createElement('code');
    highlightCodeElement(el);
    expect(Prism.highlightElement).toHaveBeenCalledWith(el);
  });

  it('can be called multiple times', async () => {
    const { highlightCodeElement } = await import('./prism-loader');
    const Prism = (await import('prismjs')).default;
    const el1 = document.createElement('code');
    const el2 = document.createElement('pre');
    highlightCodeElement(el1);
    highlightCodeElement(el2);
    expect(Prism.highlightElement).toHaveBeenCalledTimes(2);
  });
});
