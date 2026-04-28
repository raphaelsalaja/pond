import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

function Playlist4({
  fill = "currentColor",
  secondaryfill,
  title = "badge 13",
  ...props
}: IconProps) {
  secondaryfill = secondaryfill || fill;

  return (
    <svg
      height="18"
      id="playlist-4"
      width="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>{title}</title>
      <g fill={fill}>
        <path
          d="m7.75,10.5H2.75c-.4141,0-.75.3359-.75.75s.3359.75.75.75h5c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m2.75,8h12.4551c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75H2.75c-.4141,0-.75.3359-.75.75s.3359.75.75.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m2.75,4h12.5c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75H2.75c-.4141,0-.75.3359-.75.75s.3359.75.75.75Z"
          fill={fill}
          strokeWidth="0"
        />
        <path
          d="m16.124,12.1548l-4.2041-2.4775c-.3945-.2324-.8828-.2344-1.2783-.0088-.3955.2261-.6416.6489-.6416,1.104v4.9551c0,.4551.2461.8779.6416,1.104.1953.1118.4131.1675.6318.1675.2236,0,.4473-.0591.6465-.1763l4.2041-2.4775c.3926-.231.626-.6406.626-1.0952s-.2334-.8643-.626-1.0952Z"
          fill={secondaryfill}
          strokeWidth="0"
        />
      </g>
    </svg>
  );
}

export default Playlist4;
