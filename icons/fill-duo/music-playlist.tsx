import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function MusicPlaylist({
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
          d="M12 16.25C12 15.8358 12.3358 15.5 12.75 15.5H17.25C17.6642 15.5 18 15.8358 18 16.25C18 16.6642 17.6642 17 17.25 17H12.75C12.3358 17 12 16.6642 12 16.25Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M12 13.25C12 12.8358 12.3358 12.5 12.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H12.75C12.3358 14 12 13.6642 12 13.25Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M1 9C1 4.58169 4.58169 1 9 1C13.4183 1 17 4.58169 17 9C17 9.69061 16.9125 10.3608 16.748 11H12.75C11.5074 11 10.5 12.0074 10.5 13.25C10.5 13.8263 10.7166 14.3519 11.0729 14.75C10.7166 15.1481 10.5 15.6737 10.5 16.25C10.5 16.4557 10.5276 16.6549 10.5793 16.8442C10.0687 16.9464 9.54063 17 9 17C4.58169 17 1 13.4183 1 9Z"
          fill={secondaryfill}
          fillOpacity="0.4"
        />
        <path
          d="M9.92639 4.72469C9.71302 4.50727 9.38933 4.44052 9.10735 4.55578C8.82537 4.67103 8.64111 4.9454 8.64111 5.25002V8.62813C8.40651 8.54516 8.15406 8.5 7.89111 8.5C6.6489 8.5 5.64111 9.50779 5.64111 10.75C5.64111 11.9922 6.6489 13 7.89111 13C9.13251 13 10.1398 11.9911 10.1411 10.75V6.8632C10.1666 6.88097 10.1923 6.89872 10.2182 6.91644C10.7086 7.251 11.1765 7.49976 11.5817 7.68324C11.9591 7.85411 12.4035 7.68673 12.5743 7.3094C12.7452 6.93207 12.5778 6.48767 12.2005 6.31681C11.8637 6.16431 11.4733 5.95684 11.0638 5.67747C10.591 5.35471 10.2153 5.01901 9.92639 4.72469Z"
          fill={fill}
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}

export default MusicPlaylist;
