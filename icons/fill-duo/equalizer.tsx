import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Equalizer({
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
          d="m5,2.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m10.125,2.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={secondaryfill}
          opacity=".4"
          strokeWidth="0"
        />
        <path
          d="m5,5.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m10.125,5.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={secondaryfill}
          opacity=".4"
          strokeWidth="0"
        />
        <path
          d="m5,8.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m10.125,8.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={secondaryfill}
          opacity=".4"
          strokeWidth="0"
        />
        <path
          d="m5,11.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m5,14.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m15.25,2.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m15.25,5.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m15.25,8.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m15.25,11.5h-2.25c-.4141,0-.75.3359-.75.75s.3359.75.75.75h2.25c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
      </g>
    </svg>
  );
}

export default Equalizer;
