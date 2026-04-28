import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Code({
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
          d="M7.03033 3.71967C7.32322 4.01256 7.32322 4.48744 7.03033 4.78033L2.81066 9L7.03033 13.2197C7.32322 13.5126 7.32322 13.9874 7.03033 14.2803C6.73744 14.5732 6.26256 14.5732 5.96967 14.2803L1.21967 9.53033C0.926777 9.23744 0.926777 8.76256 1.21967 8.46967L5.96967 3.71967C6.26256 3.42678 6.73744 3.42678 7.03033 3.71967Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M10.9697 3.71967C11.2626 3.42678 11.7374 3.42678 12.0303 3.71967L16.7803 8.46967C17.0732 8.76256 17.0732 9.23744 16.7803 9.53033L12.0303 14.2803C11.7374 14.5732 11.2626 14.5732 10.9697 14.2803C10.6768 13.9874 10.6768 13.5126 10.9697 13.2197L15.1893 9L10.9697 4.78033C10.6768 4.48744 10.6768 4.01256 10.9697 3.71967Z"
          fill={secondaryfill}
          fillOpacity="0.4"
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}

export default Code;
