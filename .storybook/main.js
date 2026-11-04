/** Storybook is a local component workbench, not a remote service. */
export default {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [],
  framework: { name: '@storybook/react-vite', options: {} },
};
