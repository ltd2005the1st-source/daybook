import { useSyncExternalStore } from "react";
import { hashToPath, pathToHash } from "./route";

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => hashToPath(location.hash), () => "/");
}

export function useRouter() {
  return {
    push: (href: string) => {
      location.hash = pathToHash(href);
      window.scrollTo(0, 0);
    },
    replace: (href: string) => {
      location.hash = pathToHash(href);
    },
    back: () => history.back(),
  };
}
