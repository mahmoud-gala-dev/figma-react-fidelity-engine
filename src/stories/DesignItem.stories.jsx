import React from 'react';
import { DesignItem } from '../components/DesignItem.jsx';
import ref from '../data/sample-reference.json';
import { getScenarioById } from '../inspection/storybook/storybook-scenarios.mjs';

const meta = {
  title: 'Figma Fidelity / Buy ice cream',
  component: DesignItem,
  args: { spec: { ...ref } },
  argTypes: {
    reference: { control: 'boolean' },
  },
};

export default meta;

// Required 7 Storybook stories (Section 3 - Tool 4)
export const ExactMatch = {
  args: { spec: getScenarioById('ExactMatch').apply(ref), reference: false },
};

export const IncorrectWidth = {
  args: { spec: getScenarioById('IncorrectWidth').apply(ref) },
};

export const IncorrectHeight = {
  args: { spec: getScenarioById('IncorrectHeight').apply(ref) },
};

export const IncorrectTypography = {
  args: { spec: getScenarioById('IncorrectTypography').apply(ref) },
};

export const IncorrectColors = {
  args: { spec: getScenarioById('IncorrectColors').apply(ref) },
};

export const IncorrectBorderRadius = {
  args: { spec: getScenarioById('IncorrectBorderRadius').apply(ref) },
};

export const MultipleMismatches = {
  args: { spec: getScenarioById('MultipleMismatches').apply(ref) },
};

// Preserved legacy story names for backward compatibility with existing test suite
export const MatchesReference = {
  args: { spec: { ...ref }, reference: true },
};

export const WrongWidth = {
  args: { spec: { ...ref, width: 140 } },
};

export const WrongDimensions = {
  args: { spec: { ...ref, width: 140, height: 135 } },
};

export const WrongColor = {
  args: { spec: { ...ref, backgroundColor: '#EF4444' } },
};

export const WrongTypography = {
  args: {
    spec: {
      ...ref,
      text: 'Mismatched Typography Text',
      fontSize: 22,
      fontFamily: 'Courier New',
    },
  },
};
