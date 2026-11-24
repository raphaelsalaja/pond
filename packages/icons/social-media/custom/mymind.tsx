import type { SVGProps } from "react";

export function IconBrandMymind(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="mymind"
      {...props}
    >
      <title>mymind</title>
      <rect width="256" height="256" fill="#FF570E" />
      <ellipse
        cx="128"
        cy="128"
        rx="62.8"
        ry="89.1"
        transform="rotate(-16.5 128 128)"
        stroke="white"
        strokeWidth="12"
      />
      <circle cx="113.5" cy="113.1" r="9.7" fill="white" />
      <path d="M127.5 85L174 153.5L157 161Z" fill="white" />
    </svg>
  );
}
