import { useEffect, useState } from "react";

export type Route =
  | { view: "library" }
  | { view: "song"; id: number }
  | { view: "about" };

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "").split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] === "song") {
    const id = Number(parts[1]);
    if (Number.isFinite(id) && id > 0) return { view: "song", id };
    return { view: "library" };
  }
  if (parts[0] === "about") return { view: "about" };
  return { view: "library" };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

export function navigate(path: string): void {
  if (window.location.hash === path) return;
  window.location.hash = path;
}
