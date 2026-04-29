const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

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
      assets: ['./src/assets'],
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
