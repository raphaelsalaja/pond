import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Speaker({
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
          d="M5.75 1C4.23128 1 3 2.23069 3 3.75V14.25C3 15.7693 4.23128 17 5.75 17H12.25C13.7687 17 15 15.7693 15 14.25V3.75C15 2.23069 13.7687 1 12.25 1H5.75ZM9 13C10.1046 13 11 12.1046 11 11C11 9.89543 10.1046 9 9 9C7.89543 9 7 9.89543 7 11C7 12.1046 7.89543 13 9 13Z"
          fill={secondaryfill}
          fillOpacity="0.4"
          fillRule="evenodd"
        />
        <path
          d="M6 11C6 9.3427 7.34327 8 9 8C10.6567 8 12 9.3427 12 11C12 12.6573 10.6567 14 9 14C7.34327 14 6 12.6573 6 11ZM9 9.5C8.17153 9.5 7.5 10.1713 7.5 11C7.5 11.8287 8.17153 12.5 9 12.5C9.82847 12.5 10.5 11.8287 10.5 11C10.5 10.1713 9.82847 9.5 9 9.5Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M9 6.5C9.82845 6.5 10.5 5.828 10.5 5C10.5 4.172 9.82845 3.5 9 3.5C8.17155 3.5 7.5 4.172 7.5 5C7.5 5.828 8.17155 6.5 9 6.5Z"
          fill={fill}
        />
      </g>
    </svg>
  );
}

export default Speaker;
