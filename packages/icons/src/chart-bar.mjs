const bars = (tops) =>
  tops.map((y, i) => `M ${3.875 + i * 5.125} 15.625 V ${y}`);

export default () => bars([11.125, 7.25, 3.375]);

export const open = () => bars([7.5, 4.375, 2.375]);
