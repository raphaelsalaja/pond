import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Moon({
  fill = "currentColor",
  secondaryfill,
  title = "badge 13",
  ...props
}: IconProps) {
  secondaryfill = secondaryfill || fill;

  return (
    <svg
      height="18"
      id="moon"
      width="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>{title}</title>
      <g fill={fill}>
        <path
          d="M16.705,10.223c-.246-.183-.579-.197-.838-.037-.868,.532-1.859,.813-2.867,.813-3.033,0-5.5-2.467-5.5-5.5,0-1.146,.354-2.247,1.023-3.186,.177-.249,.186-.581,.021-.839-.164-.258-.467-.386-.77-.334C3.994,1.847,1.25,5.152,1.25,9c0,4.411,3.589,8,8,8,3.638,0,6.819-2.461,7.735-5.986,.077-.296-.034-.609-.28-.791Z"
          fill={fill}
        />
      </g>
    </svg>
  );
}

export default Moon;
