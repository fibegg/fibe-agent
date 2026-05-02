const { join } = require('path');

const browserTargets = [
  'Chrome >= 86',
  'Edge >= 86',
  'Firefox >= 90',
  'Opera >= 72',
  'Safari >= 15.6',
  'iOS >= 15.6',
];

// Note: If you use library-specific PostCSS/Tailwind configuration then you should remove the `postcssConfig` build
// option from your application's configuration (i.e. project.json).
//
// See: https://nx.dev/guides/using-tailwind-css-in-react#step-4:-applying-configuration-to-libraries

module.exports = {
  plugins: {
    tailwindcss: {
      config: join(__dirname, 'tailwind.config.js'),
    },
    autoprefixer: {
      overrideBrowserslist: browserTargets,
    },
  },
};
