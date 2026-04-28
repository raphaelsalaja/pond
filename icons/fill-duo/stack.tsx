import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Stack({
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
          d="M15.75 14.5C15.3359 14.5 15 14.1641 15 13.75V4.25C15 3.8359 15.3359 3.5 15.75 3.5C16.1641 3.5 16.5 3.8359 16.5 4.25V13.75C16.5 14.1641 16.1641 14.5 15.75 14.5Z"
          fill={fill}
        />
        <path
          d="M11.75 16.5H3.75C2.7852 16.5 2 15.7148 2 14.75V3.25C2 2.2852 2.7852 1.5 3.75 1.5H11.75C12.7148 1.5 13.5 2.2852 13.5 3.25V14.75C13.5 15.7148 12.7148 16.5 11.75 16.5Z"
          fill={secondaryfill}
          opacity="0.4"
        />
      </g>
    </svg>
  );
}

export default Stack;
