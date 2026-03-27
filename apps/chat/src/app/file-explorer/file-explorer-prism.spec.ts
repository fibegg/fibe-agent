import { describe, it, expect } from 'vitest';
import { getPrismLanguage, LANGUAGE_LABEL } from './file-explorer-prism';

describe('getPrismLanguage', () => {
  // Known extensions
  it('maps .ts to typescript', () => expect(getPrismLanguage('index.ts')).toBe('typescript'));
  it('maps .tsx to tsx', () => expect(getPrismLanguage('app.tsx')).toBe('tsx'));
  it('maps .js to javascript', () => expect(getPrismLanguage('main.js')).toBe('javascript'));
  it('maps .jsx to jsx', () => expect(getPrismLanguage('comp.jsx')).toBe('jsx'));
  it('maps .css to css', () => expect(getPrismLanguage('style.css')).toBe('css'));
  it('maps .scss to scss', () => expect(getPrismLanguage('app.scss')).toBe('scss'));
  it('maps .html to markup', () => expect(getPrismLanguage('page.html')).toBe('markup'));
  it('maps .json to json', () => expect(getPrismLanguage('data.json')).toBe('json'));
  it('maps .md to markdown', () => expect(getPrismLanguage('README.md')).toBe('markdown'));
  it('maps .py to python', () => expect(getPrismLanguage('script.py')).toBe('python'));
  it('maps .sh to bash', () => expect(getPrismLanguage('run.sh')).toBe('bash'));
  it('maps .yaml to yaml', () => expect(getPrismLanguage('config.yaml')).toBe('yaml'));
  it('maps .yml to yaml', () => expect(getPrismLanguage('docker-compose.yml')).toBe('yaml'));
  it('maps .rs to rust', () => expect(getPrismLanguage('main.rs')).toBe('rust'));
  it('maps .go to go', () => expect(getPrismLanguage('app.go')).toBe('go'));
  it('maps .java to java', () => expect(getPrismLanguage('Main.java')).toBe('java'));
  it('maps .cpp to cpp', () => expect(getPrismLanguage('app.cpp')).toBe('cpp'));
  it('maps .sql to sql', () => expect(getPrismLanguage('query.sql')).toBe('sql'));
  it('maps .graphql to graphql', () => expect(getPrismLanguage('schema.graphql')).toBe('graphql'));
  it('maps .toml to toml', () => expect(getPrismLanguage('Cargo.toml')).toBe('toml'));
  it('maps .tf to hcl', () => expect(getPrismLanguage('main.tf')).toBe('hcl'));
  it('maps .php to php', () => expect(getPrismLanguage('index.php')).toBe('php'));
  it('maps .rb to ruby', () => expect(getPrismLanguage('app.rb')).toBe('ruby'));
  it('maps .swift to swift', () => expect(getPrismLanguage('main.swift')).toBe('swift'));
  it('maps .kt to kotlin', () => expect(getPrismLanguage('Main.kt')).toBe('kotlin'));

  // Special filenames
  it('maps Dockerfile to docker', () => expect(getPrismLanguage('Dockerfile')).toBe('docker'));
  it('maps Dockerfile.prod to docker', () => expect(getPrismLanguage('Dockerfile.prod')).toBe('docker'));
  it('maps Makefile to makefile', () => expect(getPrismLanguage('Makefile')).toBe('makefile'));
  it('maps makefile (lowercase) to makefile', () => expect(getPrismLanguage('makefile')).toBe('makefile'));

  // Path handling — extract basename
  it('uses basename from a path', () => expect(getPrismLanguage('src/app/main.ts')).toBe('typescript'));
  it('uses basename from deep path', () => expect(getPrismLanguage('/a/b/c/Dockerfile')).toBe('docker'));

  // Unknown extension → plain
  it('returns plain for unknown extension', () => expect(getPrismLanguage('archive.rar')).toBe('plain'));
  it('returns plain for no extension', () => expect(getPrismLanguage('LICENSE')).toBe('plain'));
  it('returns plain for empty string', () => expect(getPrismLanguage('')).toBe('plain'));
});

describe('LANGUAGE_LABEL', () => {
  it('has a label for typescript', () => expect(LANGUAGE_LABEL['typescript']).toBe('TypeScript'));
  it('has a label for javascript', () => expect(LANGUAGE_LABEL['javascript']).toBe('JavaScript'));
  it('has a label for python', () => expect(LANGUAGE_LABEL['python']).toBe('Python'));
  it('has a label for markdown', () => expect(LANGUAGE_LABEL['markdown']).toBe('Markdown'));
  it('has a label for json', () => expect(LANGUAGE_LABEL['json']).toBe('JSON'));
  it('has a label for bash', () => expect(LANGUAGE_LABEL['bash']).toBe('Bash'));
});
