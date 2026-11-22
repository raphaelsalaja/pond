const pair = (circle, cy) => [circle(5.125, cy, 2.75), circle(12.875, cy, 2.75), `M 7.75 ${cy - 0.75} Q 9 ${cy - 1.625} 10.25 ${cy - 0.75}`];

export default ({ circle }) => pair(circle, 9.5);

export const open = ({ circle }) => [pair(circle, 11), "M 2.375 11 V 5.5 M 15.625 11 V 5.5"];
