const body = (rect, s) => rect(3.375, 6.125, 11.25, 9.5, s.box);

export default ({ rect }, s) => [body(rect, s), "M 6.5 8.5 V 5 A 2.5 2.5 0 0 1 11.5 5 V 8.5"];

export const open = ({ rect }, s) => [body(rect, s), "M 6.5 6.125 V 6.875 A 2.5 2.5 0 0 0 11.5 6.875 V 6.125"];
