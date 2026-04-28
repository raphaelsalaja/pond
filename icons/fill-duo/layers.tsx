import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Layers({
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
          d="M15.8604 9.53997L10.0562 5.34027C9.4253 4.88227 8.5762 4.88227 7.9454 5.34027L2.1407 9.53997V9.54101C1.6744 9.87791 1.3956 10.4233 1.3956 10.999C1.3956 11.5747 1.6744 12.1201 2.1407 12.4575L7.9449 16.6557C8.2603 16.8847 8.6304 16.999 9.0006 16.999C9.3708 16.999 9.7403 16.8847 10.0558 16.6557L15.8605 12.456C16.3268 12.1191 16.6056 11.5737 16.6056 10.998C16.6056 10.4223 16.3267 9.87687 15.8604 9.53997Z"
          fill={secondaryfill}
          opacity="0.4"
        />
        <path
          d="M15.8604 5.5415L10.0562 1.34179C9.4253 0.883791 8.5762 0.883791 7.9454 1.34179L2.1407 5.5415C1.6744 5.8784 1.3956 6.42478 1.3956 7.00048C1.3956 7.57618 1.6744 8.12158 2.1407 8.45898L7.9449 12.6572C8.2603 12.8862 8.6304 13.0005 9.0006 13.0005C9.3708 13.0005 9.7403 12.8862 10.0558 12.6572L15.8605 8.45751C16.3268 8.12061 16.6056 7.57521 16.6056 6.99951C16.6056 6.42381 16.3267 5.8784 15.8604 5.5415Z"
          fill={fill}
        />
      </g>
    </svg>
  );
}

export default Layers;
