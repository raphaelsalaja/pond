import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function MusicNote({
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
          d="M15 2.89599C15 1.83588 14.0644 1.01842 13.0137 1.16185L9.51313 1.63894C8.64609 1.7578 8 2.4978 8 3.37299V5.25V5.75568V13.5C8 13.9142 8.33579 14.25 8.75 14.25C9.16421 14.25 9.5 13.9142 9.5 13.5V6.41035L13.4869 5.86672C14.3539 5.74785 15 5.00785 15 4.13267V2.89599Z"
          fill={secondaryfill}
          fillOpacity="0.4"
          fillRule="evenodd"
        />
        <path
          d="M2.5 13.5C2.5 11.567 4.06699 10 6 10C7.93301 10 9.5 11.567 9.5 13.5C9.5 15.433 7.93301 17 6 17C4.06699 17 2.5 15.433 2.5 13.5Z"
          fill={fill}
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}

export default MusicNote;
