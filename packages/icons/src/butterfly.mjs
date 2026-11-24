/** One wing pair drawn on the right, mirrored about the body, squeezed by `k` as it flaps. */
const wings = (k, lift) => {
  const squeeze = (x) => Math.round((9 + (x - 9) * k) * 8) / 8;
  const side = (f) => {
    const x = (v) => (f > 0 ? squeeze(v) : 18 - squeeze(v));
    return `M 9 7.5 C ${x(10)} ${4.5 - lift} ${x(12.75)} ${2.5 - lift} ${x(14.5)} ${2.75 - lift} C ${x(16.25)} ${3 - lift} ${x(15.75)} 7.25 ${x(12.5)} 8.75 C ${x(15)} 10 ${x(14.625)} 14.5 ${x(12.25)} 14.5 C ${x(10.625)} 14.5 ${x(9.375)} 12.75 9 11.25`;
  };
  return [side(1), side(-1)];
};

export default () => [wings(1, 0), "M 9 5.75 V 13.5"];

export const open = () => [wings(0.68, 0.375), "M 9 5.75 V 13.5"];
