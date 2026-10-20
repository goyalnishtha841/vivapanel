import { useEffect, useState } from "react";

// Hash routes: #/  ·  #/session/<id>  ·  #/report/<id>  ·  #/hire  ·  #/invite/<token>  ·  #/screening/<token>/<key>
function parse() {
  const [, page = "", id = "", extra = ""] = window.location.hash.replace(/^#/, "").split("/");
  return { page: page || "home", id, extra };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path) => {
  window.location.hash = path;
};
