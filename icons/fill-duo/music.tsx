import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Music({
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
          d="M15.5 3.18C15.5 2.09925 14.5305 1.27587 13.4627 1.45421L6.463 2.62115C5.61785 2.76135 5 3.49163 5 4.347V6.25V6.74931V13.75C5 14.1642 5.33579 14.5 5.75 14.5C6.16421 14.5 6.5 14.1642 6.5 13.75V7.38466L14 6.13466V12.25C14 12.6642 14.3358 13 14.75 13C15.1642 13 15.5 12.6642 15.5 12.25V5.24931V4.75V3.18Z"
          fill={secondaryfill}
          fillOpacity="0.4"
          fillRule="evenodd"
        />
        <path
          d="M1 13.75C1 12.2313 2.23069 11 3.75 11C5.26931 11 6.5 12.2313 6.5 13.75C6.5 15.2687 5.26931 16.5 3.75 16.5C2.23069 16.5 1 15.2687 1 13.75Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M10 12.25C10 10.7313 11.2307 9.5 12.75 9.5C14.2693 9.5 15.5 10.7313 15.5 12.25C15.5 13.7687 14.2693 15 12.75 15C11.2307 15 10 13.7687 10 12.25Z"
          fill={fill}
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}

export default Music;
