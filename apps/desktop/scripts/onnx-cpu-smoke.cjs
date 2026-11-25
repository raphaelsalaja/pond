/** Runs one CPU inference on a packaged onnxruntime-node, proving the GPU libraries pruned beside it are not needed. */
const ort = require(process.argv[2]);

function varint(value) {
  const out = [];
  let rest = value;
  while (rest > 127) {
    out.push((rest & 127) | 128);
    rest >>>= 7;
  }
  out.push(rest);
  return out;
}

const int = (field, value) => [...varint(field << 3), ...varint(value)];
const bytes = (field, payload) => [
  ...varint((field << 3) | 2),
  ...varint(payload.length),
  ...payload,
];
const text = (field, value) => bytes(field, [...Buffer.from(value)]);

/** ValueInfoProto for a float tensor of shape [2]. */
const floatPair = (name) => [
  ...text(1, name),
  ...bytes(2, bytes(1, [...int(1, 1), ...bytes(2, bytes(1, int(1, 2)))])),
];

/** ModelProto with a single Identity node, opset 13. */
const model = Uint8Array.from([
  ...int(1, 8),
  ...bytes(8, int(2, 13)),
  ...bytes(7, [
    ...bytes(1, [...text(1, "x"), ...text(2, "y"), ...text(4, "Identity")]),
    ...text(2, "smoke"),
    ...bytes(11, floatPair("x")),
    ...bytes(12, floatPair("y")),
  ]),
]);

async function main() {
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ["cpu"],
  });
  const x = new ort.Tensor("float32", Float32Array.from([1, 2]), [2]);
  const { y } = await session.run({ x });
  if (y.data[0] !== 1 || y.data[1] !== 2) {
    throw new Error(`unexpected output ${Array.from(y.data).join(", ")}`);
  }
}

function fail(error) {
  console.error(error);
  process.exit(1);
}

main().catch(fail);
