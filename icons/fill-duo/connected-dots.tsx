import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function ConnectedDots({
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
          d="M12.6182 11.6182L9.75001 9.3833V6.75C9.75001 6.3359 9.41411 6 9.00001 6C8.58591 6 8.25001 6.3359 8.25001 6.75V9.3833L5.38181 11.6182C5.05511 11.8731 4.99651 12.3443 5.25091 12.6709C5.39881 12.8608 5.62001 12.96 5.84321 12.96C6.00431 12.96 6.16691 12.9082 6.30361 12.8018L8.99991 10.701L11.6962 12.8018C11.8329 12.9082 11.9955 12.96 12.1566 12.96C12.3797 12.96 12.6009 12.8609 12.7489 12.6709C13.0033 12.3442 12.9449 11.873 12.6182 11.6182Z"
          fill={secondaryfill}
          fillOpacity="0.4"
        />
        <path
          d="M9 7C10.5188 7 11.75 5.76878 11.75 4.25C11.75 2.73122 10.5188 1.5 9 1.5C7.48122 1.5 6.25 2.73122 6.25 4.25C6.25 5.76878 7.48122 7 9 7Z"
          fill={fill}
        />
        <path
          d="M14.25 16.5C15.7688 16.5 17 15.2688 17 13.75C17 12.2312 15.7688 11 14.25 11C12.7312 11 11.5 12.2312 11.5 13.75C11.5 15.2688 12.7312 16.5 14.25 16.5Z"
          fill={fill}
        />
        <path
          d="M3.75 16.5C5.26878 16.5 6.5 15.2688 6.5 13.75C6.5 12.2312 5.26878 11 3.75 11C2.23122 11 1 12.2312 1 13.75C1 15.2688 2.23122 16.5 3.75 16.5Z"
          fill={fill}
        />
      </g>
    </svg>
  );
}

export default ConnectedDots;
