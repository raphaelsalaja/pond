import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function WindowCode2({
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
          d="M15 17.25C14.808 17.25 14.616 17.1801 14.47 17.03C14.177 16.74 14.177 16.26 14.47 15.9699L16.19 14.2499L14.47 12.5299C14.177 12.2399 14.177 11.76 14.47 11.4699C14.763 11.18 15.238 11.18 15.531 11.4699L17.781 13.7199C18.074 14.0099 18.074 14.4898 17.781 14.7799L15.531 17.0299C15.385 17.1799 15.193 17.2499 15.001 17.2499L15 17.25Z"
          fill={secondaryfill}
        />
        <path
          d="M12 17.25C11.808 17.25 11.616 17.1801 11.47 17.03L9.21999 14.78C8.92699 14.49 8.92699 14.01 9.21999 13.7199L11.47 11.4699C11.763 11.18 12.238 11.18 12.531 11.4699C12.824 11.7599 12.824 12.2399 12.531 12.53L10.811 14.25L12.531 15.97C12.824 16.26 12.824 16.7401 12.531 17.0302C12.385 17.1802 12.193 17.2501 12.001 17.2501L12 17.25Z"
          fill={secondaryfill}
        />
        <path
          d="M6.9219 14.5H3.75C3.0596 14.5 2.5 13.9404 2.5 13.25V8H16.25C16.6642 8 17 7.6642 17 7.25V4.75C17 3.2312 15.7688 2 14.25 2H3.75C2.2312 2 1 3.2312 1 4.75V13.25C1 14.7688 2.2312 16 3.75 16H6.9219C7.3359 16 7.6719 15.6602 7.6719 15.25C7.6719 14.8398 7.3359 14.5 6.9219 14.5ZM7 4C7.552 4 8 4.4502 8 5C8 5.5498 7.552 6 7 6C6.448 6 6 5.5498 6 5C6 4.4502 6.448 4 7 4ZM4 4C4.552 4 5 4.4502 5 5C5 5.5498 4.552 6 4 6C3.448 6 3 5.5498 3 5C3 4.4502 3.448 4 4 4Z"
          fill={fill}
        />
      </g>
    </svg>
  );
}

export default WindowCode2;
