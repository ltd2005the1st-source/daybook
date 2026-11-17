import type { AnchorHTMLAttributes } from "react";
import { pathToHash } from "./route";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export default function Link({ href, onClick, ...rest }: Props) {
  return (
    <a
      {...rest}
      href={`#${pathToHash(href)}`}
      onClick={(e) => {
        onClick?.(e);
        window.scrollTo(0, 0);
      }}
    />
  );
}
