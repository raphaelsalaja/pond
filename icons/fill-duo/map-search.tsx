import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function MapSearch({
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
          d="M14 10.5C12.3428 10.5 11 11.8428 11 13.5C11 15.1572 12.3428 16.5 14 16.5C14.5565 16.5 15.0775 16.3486 15.5241 16.0847L16.7197 17.2803C17.0126 17.5732 17.4874 17.5732 17.7803 17.2803C18.0732 16.9874 18.0732 16.5126 17.7803 16.2197L16.5847 15.0241C16.8486 14.5775 17 14.0565 17 13.5C17 11.8428 15.6572 10.5 14 10.5ZM12.5 13.5C12.5 12.6712 13.1712 12 14 12C14.8288 12 15.5 12.6712 15.5 13.5C15.5 14.3288 14.8288 15 14 15C13.1712 15 12.5 14.3288 12.5 13.5Z"
          fill={fill}
          fillRule="evenodd"
        />
        <path
          d="M11.818 3.9602V9.56329C10.4354 10.3311 9.5 11.8061 9.5 13.5C9.5 14.171 9.64678 14.8076 9.90998 15.3795L6.268 14.055C6.24185 14.0455 6.21494 14.0406 6.18848 14.0399V2.03922C6.38856 2.03983 6.58873 2.07459 6.77998 2.14404L11.732 3.94503C11.7603 3.95529 11.7895 3.96025 11.818 3.9602Z"
          fill={secondaryfill}
          fillOpacity="0.2"
        />
        <path
          d="M6.18848 14.0399V2.03922C6.05932 2.03883 5.93021 2.05266 5.80355 2.08058L2.37062 2.84379C1.56982 3.02102 1 3.73186 1 4.552V13.004C1 14.1237 2.03642 14.9552 3.12983 14.7121L6.1302 14.0456C6.14903 14.0413 6.16863 14.0394 6.18848 14.0399Z"
          fill={secondaryfill}
          fillOpacity="0.4"
        />
        <path
          d="M11.818 3.9602V9.56329C12.4643 9.20439 13.2082 9 14 9C15.1526 9 16.2039 9.43315 17 10.1456V4.996C17 3.87625 15.9636 3.04484 14.8702 3.2879L11.8698 3.95443C11.853 3.95822 11.8356 3.96017 11.818 3.9602Z"
          fill={secondaryfill}
          fillOpacity="0.4"
        />
      </g>
    </svg>
  );
}

export default MapSearch;
