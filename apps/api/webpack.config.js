const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { createRequire } = require('module');
const { dirname, join } = require('path');

const tesseractPackageJson = require.resolve('tesseract.js/package.json');
const tesseractPackageRoot = dirname(tesseractPackageJson);
const tesseractRequire = createRequire(tesseractPackageJson);

function packageRoot(packageName) {
  return dirname(tesseractRequire.resolve(`${packageName}/package.json`));
}

const tesseractRuntimeDependencyNames = [
  'bmp-js',
  'idb-keyval',
  'is-url',
  'node-fetch',
  'regenerator-runtime',
  'tesseract.js-core',
  'wasm-feature-detect',
  'zlibjs',
];

const tesseractRuntimeAssets = [
  {
    input: tesseractPackageRoot,
    glob: 'package.json',
    output: 'tesseract/tesseract.js/package.json',
  },
  {
    input: join(tesseractPackageRoot, 'src'),
    glob: '**/*',
    output: 'tesseract/tesseract.js/src',
  },
  ...tesseractRuntimeDependencyNames.map((name) => ({
    input: packageRoot(name),
    glob: '**/*',
    output: `tesseract/tesseract.js/node_modules/${name}/`,
  })),
];

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const watchPoll = process.env.WATCHPACK_POLLING === 'true'
  ? envNumber('WATCHPACK_POLLING_INTERVAL', 1000)
  : undefined;

module.exports = {
  node: { __dirname: false },
  resolve: {
    alias: {
      '@shared': join(__dirname, '../../shared'),
    },
  },
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets', ...tesseractRuntimeAssets],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
  watchOptions: {
    ignored: ['**/node_modules/**', '**/data/**', '**/playground/**'],
    ...(watchPoll ? { poll: watchPoll } : {}),
  },
};
