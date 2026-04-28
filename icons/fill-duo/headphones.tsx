import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Headphones({
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
          d="M4.43738 8.10057C4.64626 8.19892 4.79821 8.38801 4.84929 8.61317L6.20398 14.5841C6.25445 14.8065 6.20096 15.0398 6.05864 15.218C5.91633 15.3962 5.70065 15.5 5.47257 15.5H4.08558C2.79168 15.5 1.67263 14.598 1.3977 13.3333L1.06261 11.788C0.797303 10.5645 1.39223 9.31467 2.51054 8.75052L3.77984 8.10962C3.98594 8.00555 4.22849 8.00221 4.43738 8.10057Z"
          fill={secondaryfill}
          fillOpacity="0.4"
          fillRule="evenodd"
        />
        <path
          d="M13.5626 8.10057C13.7715 8.00221 14.014 8.00555 14.2201 8.10962L15.4891 8.75035C16.6074 9.31451 17.2027 10.5645 16.9374 11.7879L16.6024 13.3329C16.3274 14.5976 15.2083 15.5 13.9144 15.5H12.5274C12.2993 15.5 12.0836 15.3962 11.9413 15.218C11.799 15.0398 11.7455 14.8065 11.796 14.5841L13.1507 8.61317C13.2018 8.38801 13.3537 8.19892 13.5626 8.10057Z"
          fill={secondaryfill}
          fillOpacity="0.4"
          fillRule="evenodd"
        />
        <path
          d="M3.5 9C2.68504 5.40815 5.3168 2 8.99998 2C12.6831 2 15.4135 5.41918 14.5985 9.01104L13.2588 14.9159C13.1672 15.3199 12.7654 15.5731 12.3615 15.4814C11.9575 15.3898 11.7043 14.988 11.796 14.5841L13.1357 8.67916C13.7377 6.02582 11.7207 3.5 8.99998 3.5C6.27916 3.5 4.26227 6.0258 4.8643 8.67915L6.20399 14.5841C6.29564 14.988 6.04247 15.3898 5.63852 15.4814C5.23457 15.5731 4.83281 15.3199 4.74117 14.9159L3.5 9Z"
          fill={fill}
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}

export default Headphones;
