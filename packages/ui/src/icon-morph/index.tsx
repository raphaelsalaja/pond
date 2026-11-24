import { IconFrame, iconStrokeProps } from "@pond/icons/create-icon";
import type { IconComponent, IconProps } from "@pond/icons/types";
import { animate, useReducedMotionConfig } from "motion/react";
import {
  type CSSProperties,
  createElement,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { pageHidden } from "../shared/page-hidden";
import { Swap } from "../swap";
import { type MorphPlan, planMorph, polyline } from "./plan";

interface IconMorphProps extends IconProps {
  icon: IconComponent;
}

interface Frame {
  plan: MorphPlan;
  t: number;
}

const SHRUNK = 0.25;

export function IconMorph({ icon: Icon, ...props }: IconMorphProps) {
  const reduced = useReducedMotionConfig();
  const settled = useRef(Icon);
  const [frame, setFrame] = useState<Frame | null>(null);

  useLayoutEffect(() => {
    const from = settled.current;
    settled.current = Icon;
    if (from === Icon || reduced) return;
    const plan = pageHidden() ? null : planMorph(from, Icon);
    if (!plan) {
      setFrame(null);
      return;
    }
    setFrame({ plan, t: 0 });
    const controls = animate(0, 1, {
      type: "spring",
      duration: 0.3,
      bounce: 0,
      onUpdate: (t) => setFrame({ plan, t }),
      onComplete: () => setFrame(null),
    });
    return () => controls.stop();
  }, [Icon, reduced]);

  if (reduced) {
    return (
      <Swap value={Icon.displayName ?? ""} variant="icon">
        <Icon {...props} />
      </Swap>
    );
  }
  if (!frame || !Icon.glyph) return <Icon {...props} />;

  const { plan, t } = frame;
  const variant = Icon.glyph.style;
  const fixed = iconStrokeProps(variant, props.size);
  const fade = (amount: number): CSSProperties => ({
    opacity: amount,
    transform: `scale(${SHRUNK + (1 - SHRUNK) * amount})`,
    transformBox: "fill-box",
    transformOrigin: "center",
  });
  return (
    <IconFrame variant={variant} {...props}>
      {plan.still.map(([tag, attrs], index) =>
        createElement(tag, { key: `still-${index}`, ...fixed, ...attrs }),
      )}
      {plan.tracks.map((track) => (
        <path
          key={track.id}
          {...fixed}
          {...track.paint}
          d={polyline(
            track.from.map(([x, y], point) => {
              const [tx, ty] = track.to[point] ?? [x, y];
              return [x + (tx - x) * t, y + (ty - y) * t] as const;
            }),
            track.closed,
          )}
        />
      ))}
      {plan.leaving.map((leaving) => (
        <path
          key={leaving.id}
          {...fixed}
          {...leaving.paint}
          d={leaving.d}
          style={fade(1 - t)}
        />
      ))}
      {plan.entering.map((entering) => (
        <path
          key={entering.id}
          {...fixed}
          {...entering.paint}
          d={entering.d}
          style={fade(t)}
        />
      ))}
    </IconFrame>
  );
}
