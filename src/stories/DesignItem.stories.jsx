import React from 'react';
import {DesignItem} from '../components/DesignItem.jsx';
import ref from '../data/sample-reference.json';
const meta = {
  title: 'Figma Fidelity / Buy ice cream',
  component: DesignItem,
  args: { spec: {...ref} },
  argTypes: {
    reference: { control: 'boolean' },
  },
};
export default meta;
export const MatchesReference = { args: {spec: {...ref}, reference:true} };
export const WrongWidth = { args: {spec: {...ref, width: 140}} };
export const WrongColor = { args: {spec: {...ref, backgroundColor:'#EF4444'}} };
