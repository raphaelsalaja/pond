import type { SVGProps } from "react";

function Cosmos(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="28"
      height="32"
      viewBox="0 0 28 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>Cosmos</title>
      <g clipPath="url(#cosmos-clip)" fill="currentColor">
        <path d="M14.006 8.985a4.493 4.493 0 1 0 0-8.984 4.493 4.493 0 0 0 0 8.984Z" />
        <path d="M14.006 30.946a4.493 4.493 0 1 0 0-8.984 4.493 4.493 0 0 0 0 8.984Z" />
        <path d="M4.494 14.47a4.493 4.493 0 1 0 0-8.984 4.493 4.493 0 0 0 0 8.985Z" />
        <path d="M23.522 25.453a4.493 4.493 0 1 0 0-8.984 4.493 4.493 0 0 0 0 8.984Z" />
        <path d="M23.522 14.47a4.493 4.493 0 1 0 0-8.984 4.493 4.493 0 0 0 0 8.985Z" />
        <path d="M4.494 25.453a4.493 4.493 0 1 0 0-8.984 4.493 4.493 0 0 0 0 8.984Z" />
      </g>
      <defs>
        <clipPath id="cosmos-clip">
          <rect width="28" height="30.945" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export default Cosmos;
