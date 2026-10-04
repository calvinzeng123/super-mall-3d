// 各楼层室内配色（墙、柱、点缀），按楼层主题 key 取用；以及通用颜色。
export const THEME = {
  'park-green': { wall: '#c7ccd1', column: '#d3d7db', band: '#2e9c6a', trim: '#8a939b', ceiling: '#b9bec4' },
  'park-blue': { wall: '#c7ccd1', column: '#d3d7db', band: '#2f6fd6', trim: '#8a939b', ceiling: '#b9bec4' },
  'park-amber': { wall: '#c9c6c0', column: '#d6d2ca', band: '#d9a21b', trim: '#8a939b', ceiling: '#bdbab4' },
  food: { wall: '#e6d6bf', column: '#e2cfb5', band: '#dd6b20', trim: '#8b5e3c', ceiling: '#e9e1d6' },
  lux: { wall: '#e8e1d5', column: '#e9dfcd', band: '#b08d4f', trim: '#b08d4f', ceiling: '#f4f2ee' },
  fashion: { wall: '#dfe5e9', column: '#d5dde2', band: '#2f86b0', trim: '#7c8a94', ceiling: '#f1f3f4' },
  family: { wall: '#efe0cd', column: '#e8d3b8', band: '#e0567a', trim: '#b9875a', ceiling: '#f6f0e8' },
  roof: { wall: '#e8e4dc', column: '#d9d4ca', band: '#4a9a50', trim: '#7d7a72', ceiling: '#f0eee9' },
  guochao: { wall: '#ead9cf', column: '#e3cfc2', band: '#c2402f', trim: '#8f3b2a', ceiling: '#f4ece6' },
  sport: { wall: '#dde6df', column: '#d2ddd5', band: '#1f9d6b', trim: '#5f7a6c', ceiling: '#eef2ef' },
  edu: { wall: '#e9e4f2', column: '#ddd6ea', band: '#6d5bd0', trim: '#7a6fa6', ceiling: '#f3f1f8' },
  dining: { wall: '#eadfd2', column: '#e1d2c1', band: '#b5651d', trim: '#7a5232', ceiling: '#f5efe8' },
  track: { wall: '#e5e2dc', column: '#d8d4cc', band: '#d9482b', trim: '#7d7a72', ceiling: '#efede8' },
  street: { wall: '#e9dfd0', column: '#dccfbc', band: '#9a5b34', trim: '#6b4a32', ceiling: '#f2ece3' },
  loft: { wall: '#e4ded6', column: '#d6cec4', band: '#3d6f8f', trim: '#5c544b', ceiling: '#efebe5' },
  terrace: { wall: '#e7e2d8', column: '#d8d1c4', band: '#5a8f4e', trim: '#776f62', ceiling: '#efece6' },
};
const DEFAULT = THEME.lux;
export const themeOf = (lv) => THEME[lv.theme.key] || DEFAULT;

export const COLORS = {
  stone: '#d9d2c5',
  stoneDark: '#b9b1a3',
  spandrel: '#4b5157',
  steel: '#b8bfc6',
  darkSteel: '#4a5056',
  black: '#1d2023',
  white: '#f7f7f5',
  concrete: '#a7acb1',
  glassFrame: '#3f454b',
  led: '#a5ecff',
  wood: '#a77649',
  darkWood: '#5a3a22',
  grass: '#6d9b48',
  leaf: '#4f8a3a',
  red: '#c8352b',
};
