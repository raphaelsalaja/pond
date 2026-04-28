import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function CircleWaveformLines({
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
          d="M1 9C1 4.58169 4.58169 1 9 1C13.4183 1 17 4.58169 17 9C17 13.4183 13.4183 17 9 17C4.58169 17 1 13.4183 1 9Z"
          fill={secondaryfill}
          fillOpacity="0.4"
          fillRule="evenodd"
        />
        <path
          d="M10.25 4C10.6642 4 11 4.33579 11 4.75V13.25C11 13.6642 10.6642 14 10.25 14C9.83579 14 9.5 13.6642 9.5 13.25V4.75C9.5 4.33579 9.83579 4 10.25 4Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M7.75 6C8.16421 6 8.5 6.33579 8.5 6.75V11.25C8.5 11.6642 8.16421 12 7.75 12C7.33579 12 7 11.6642 7 11.25V6.75C7 6.33579 7.33579 6 7.75 6Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M12.75 7C13.1642 7 13.5 7.33579 13.5 7.75V10.25C13.5 10.6642 13.1642 11 12.75 11C12.3358 11 12 10.6642 12 10.25V7.75C12 7.33579 12.3358 7 12.75 7Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M5.25 7.5C5.66421 7.5 6 7.83579 6 8.25V9.75C6 10.1642 5.66421 10.5 5.25 10.5C4.83579 10.5 4.5 10.1642 4.5 9.75V8.25C4.5 7.83579 4.83579 7.5 5.25 7.5Z"
          fill={fill}
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}

export default CircleWaveformLines;
