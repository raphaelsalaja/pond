import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Slider({
  fill = "currentColor",
  secondaryfill,
  strokewidth = 1,
  width = "1em",
  height = "1em",
  title = "badge 13",
  ...props
}: IconProps) {
  secondaryfill = secondaryfill || fill;

  return (
    <svg
      height={height}
      width={width}
      {...props}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <g fill={fill}>
        <path
          d="m15.25,13h-7.5c-.4141,0-.75-.3359-.75-.75s.3359-.75.75-.75h7.5c.4141,0,.75.3359.75.75s-.3359.75-.75.75Z"
          fill={secondaryfill}
          opacity=".4"
          strokeWidth="0"
        />
        <path
          d="m10.25,6.5H2.75c-.4141,0-.75-.3359-.75-.75s.3359-.75.75-.75h7.5c.4141,0,.75.3359.75.75s-.3359.75-.75.75Z"
          fill={secondaryfill}
          opacity=".4"
          strokeWidth="0"
        />
        <path
          d="m5,15.25c-1.6541,0-3-1.3459-3-3s1.3459-3,3-3,3,1.3459,3,3-1.3459,3-3,3Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m13,8.75c-1.6541,0-3-1.3459-3-3s1.3459-3,3-3,3,1.3459,3,3-1.3459,3-3,3Z"
          fill={fill}
          strokeWidth="0"
        />
      </g>
    </svg>
  );
}

export default Slider;
