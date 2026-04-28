import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Queue({
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
          d="M15.2501 11H2.75006C2.33596 11 2.00006 11.3359 2.00006 11.75C2.00006 12.1641 2.33596 12.5 2.75006 12.5H15.2501C15.6642 12.5 16.0001 12.1641 16.0001 11.75C16.0001 11.3359 15.6642 11 15.2501 11Z"
          fill={fill}
        />
        <path
          d="M15.2501 14.5H2.75006C2.33596 14.5 2.00006 14.8359 2.00006 15.25C2.00006 15.6641 2.33596 16 2.75006 16H15.2501C15.6642 16 16.0001 15.6641 16.0001 15.25C16.0001 14.8359 15.6642 14.5 15.2501 14.5Z"
          fill={fill}
        />
        <path
          d="M14.2501 2H3.75006C2.78356 2 2.00006 2.7835 2.00006 3.75V7.25C2.00006 8.2165 2.78356 9 3.75006 9H14.2501C15.2166 9 16.0001 8.2165 16.0001 7.25V3.75C16.0001 2.7835 15.2166 2 14.2501 2Z"
          fill={secondaryfill}
          fillOpacity="0.4"
        />
      </g>
    </svg>
  );
}

export default Queue;
