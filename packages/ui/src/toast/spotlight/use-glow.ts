import { type RefObject, useEffect } from "react";

const VERTEX = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 size;
uniform float dpr;
uniform float phase;
uniform float age;
uniform vec2 pointer;
uniform float hover;
uniform float excite;

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

void main() {
  vec2 p = gl_FragCoord.xy / dpr;
  vec2 uv = p / size;

  vec2 origin = vec2(size.x + 24.0, size.y + 40.0);
  vec2 d = p - origin;
  float dist = length(d);
  float angle = atan(d.y, d.x);

  float grow = smoothstep(0.0, 1.0, age / 1.1) * 460.0;
  float reveal = 1.0 - smoothstep(grow - 140.0, grow, dist);

  float beams = noise(vec2(angle * 9.0 + phase * 0.35, phase * 0.12));
  beams = mix(beams, 0.5 + 0.5 * sin(angle * 23.0 - phase * 0.6), 0.4);
  beams = smoothstep(0.35, 0.95, beams);
  float reach = mix(200.0, 300.0, excite);
  float rays = beams * exp(-dist / reach);
  float halo = exp(-dist * dist / 30000.0);

  vec2 cell = floor(p / 28.0);
  float h = hash(cell);
  vec2 jitter = (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 10.0;
  vec2 q = mod(p, 28.0) - 14.0 - jitter;
  float twinkle = pow(0.5 + 0.5 * sin(phase * 2.4 + h * 40.0), 6.0);
  float arm = 0.35 + 0.65 * twinkle;
  float star =
    exp(-abs(q.x) * 0.55 / arm) * exp(-q.y * q.y / 0.9) +
    exp(-abs(q.y) * 0.55 / arm) * exp(-q.x * q.x / 0.9);
  star += exp(-dot(q, q) / 3.0) * 0.6;
  star *= step(0.8, h) * twinkle * exp(-dist / 300.0);

  float sweep = fract(phase / 7.0) * 2.6 - 0.8;
  float sheen = exp(-pow((uv.x * 0.8 + uv.y * 0.45 - sweep) * 8.0, 2.0));
  sheen *= smoothstep(0.2, 0.8, uv.x);

  vec2 toPointer = p - pointer;
  float glow = exp(-dot(toPointer, toPointer) / 7000.0) * hover;

  float alpha = rays * 0.5 + halo * 0.32 + star * 0.9 + sheen * 0.1;
  alpha *= reveal * (1.0 + excite * 0.7 + glow * 1.2);
  alpha += glow * 0.06;
  alpha *= 0.9;
  alpha += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  alpha = clamp(alpha, 0.0, 1.0);
  gl_FragColor = vec4(vec3(alpha), alpha);
}
`;

const EXCITER = '[data-variant="primary"]';

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function exciting(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EXCITER) !== null;
}

export function useGlow(canvas: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const element = canvas.current;
    const surface = element?.parentElement;
    if (!element || !surface) return;
    const gl = element.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
    });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL call, not a hook
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const location = {
      size: gl.getUniformLocation(program, "size"),
      dpr: gl.getUniformLocation(program, "dpr"),
      phase: gl.getUniformLocation(program, "phase"),
      age: gl.getUniformLocation(program, "age"),
      pointer: gl.getUniformLocation(program, "pointer"),
      hover: gl.getUniformLocation(program, "hover"),
      excite: gl.getUniformLocation(program, "excite"),
    };

    const pointer = { x: -1e4, y: -1e4, inside: false };
    let hovering = false;
    let focused = false;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const born = performance.now();
    let phase = 3;
    let hover = 0;
    let excite = 0;
    let last = born;
    let frame = 0;

    const paint = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const still = reduced.matches;
      const ease = 1 - Math.exp(-dt * 8);
      hover += ((pointer.inside ? 1 : 0) - hover) * ease;
      excite += ((hovering || focused ? 1 : 0) - excite) * ease;
      if (!still) phase += dt * (1 + excite * 1.5);

      gl.uniform1f(location.phase, phase);
      gl.uniform1f(location.age, still ? 10 : (now - born) / 1000);
      gl.uniform2f(location.pointer, pointer.x, pointer.y);
      gl.uniform1f(location.hover, hover);
      gl.uniform1f(location.excite, still ? 0 : excite);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      paint(now);
      frame = reduced.matches ? 0 : requestAnimationFrame(loop);
    };

    const start = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };

    const resize = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = element.clientWidth;
      const height = element.clientHeight;
      element.width = Math.max(1, Math.round(width * dpr));
      element.height = Math.max(1, Math.round(height * dpr));
      gl.viewport(0, 0, element.width, element.height);
      gl.uniform2f(location.size, width, height);
      gl.uniform1f(location.dpr, element.width / Math.max(width, 1));
      paint(performance.now());
    });
    resize.observe(element);

    const refresh = () => {
      paint(performance.now());
      if (!reduced.matches) start();
    };

    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = rect.bottom - event.clientY;
      pointer.inside = true;
      hovering = exciting(event.target);
    };
    const leave = () => {
      pointer.inside = false;
      hovering = false;
    };
    const focusIn = (event: FocusEvent) => {
      focused = exciting(event.target);
    };
    const focusOut = () => {
      focused = false;
    };

    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerleave", leave);
    surface.addEventListener("focusin", focusIn);
    surface.addEventListener("focusout", focusOut);
    reduced.addEventListener("change", refresh);
    refresh();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", leave);
      surface.removeEventListener("focusin", focusIn);
      surface.removeEventListener("focusout", focusOut);
      reduced.removeEventListener("change", refresh);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [canvas]);
}
