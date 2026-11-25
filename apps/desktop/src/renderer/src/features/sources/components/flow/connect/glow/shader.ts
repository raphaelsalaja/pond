const VERTEX = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform vec2 u_origin;
uniform float u_time;
uniform vec3 u_start;
uniform vec3 u_middle;
uniform vec3 u_end;
uniform vec3 u_core;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = px / u_res;
  float t = u_time;

  vec2 q = uv * vec2(u_res.x / u_res.y, 1.0) * 1.4;
  float n = fbm(q + vec2(t * 0.05, -t * 0.03) + fbm(q * 1.3 - t * 0.04));
  float drift = (n - 0.5) * 0.6;
  vec3 base = mix(u_start, u_middle, smoothstep(0.1, 0.55, uv.x + drift));
  base = mix(base, u_end, smoothstep(0.55, 1.0, uv.x + drift));

  float settle = smoothstep(0.35, 1.6, t);
  float wash = settle * (1.0 - smoothstep(0.0, 0.65, uv.y + drift * 0.3));

  float r = distance(px, u_origin) / u_res.y;
  float burst = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.4, 1.5, t));
  float ring = exp(-pow((r - t * 0.8) / 0.18, 2.0)) * burst;
  float core = exp(-r * 6.0) * burst;

  vec3 color = mix(base, u_core, clamp(ring * 0.4 + core * 0.6, 0.0, 1.0));
  float alpha = clamp(wash * 0.5 + ring * 0.3 + core * 0.4, 0.0, 1.0);
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export interface GlowColors {
  start: ReadonlyArray<number>;
  middle: ReadonlyArray<number>;
  end: ReadonlyArray<number>;
  core: ReadonlyArray<number>;
}

const RESOLUTION = 0.5;
const SETTLED_TIME = 2;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/** Runs the glow on a canvas until the returned stop function is called. */
export function startGlow(
  canvas: HTMLCanvasElement,
  colors: GlowColors,
  origin: () => { x: number; y: number },
  still: boolean,
): () => void {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true });
  if (!gl) return () => {};
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return () => {};
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return () => {};
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const res = uniform("u_res");
  const originUniform = uniform("u_origin");
  const time = uniform("u_time");
  gl.uniform3fv(uniform("u_start"), colors.start);
  gl.uniform3fv(uniform("u_middle"), colors.middle);
  gl.uniform3fv(uniform("u_end"), colors.end);
  gl.uniform3fv(uniform("u_core"), colors.core);

  const draw = (seconds: number) => {
    const width = Math.max(1, Math.round(canvas.clientWidth * RESOLUTION));
    const height = Math.max(1, Math.round(canvas.clientHeight * RESOLUTION));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    const point = origin();
    gl.uniform2f(res, width, height);
    gl.uniform2f(originUniform, point.x * RESOLUTION, point.y * RESOLUTION);
    gl.uniform1f(time, seconds);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  if (still) {
    draw(SETTLED_TIME);
    return () => {};
  }

  let frame = 0;
  const start = performance.now();
  const tick = (now: number) => {
    draw((now - start) / 1000);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
