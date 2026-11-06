import { useEffect } from "react"
import { useLocation } from "react-router"

export function NProgress() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    const style = document.createElement("style")
    style.id = "nprogress-style"
    style.textContent = `
      #nprogress {
        pointer-events: none;
        position: fixed;
        top: 0;
        left: 0;
        z-index: 9999;
        width: 100%;
        height: 2px;
      }
      #nprogress .bar {
        background: var(--signal);
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        transform-origin: left;
        animation: nprogress-grow 3s ease-out forwards;
      }
      @keyframes nprogress-grow {
        0% { transform: scaleX(0); opacity: 1; }
        20% { transform: scaleX(0.4); opacity: 1; }
        50% { transform: scaleX(0.7); opacity: 1; }
        80% { transform: scaleX(0.9); opacity: 0.5; }
        100% { transform: scaleX(1); opacity: 0; }
      }
    `
    if (!document.getElementById("nprogress-style")) {
      document.head.appendChild(style)
    }

    const el = document.createElement("div")
    el.id = "nprogress"
    el.innerHTML = '<div class="bar"></div>'

    const existing = document.getElementById("nprogress")
    if (existing) existing.remove()
    document.body.appendChild(el)

    const timer = setTimeout(() => {
      const bar = document.getElementById("nprogress")
      if (bar) bar.remove()
    }, 3500)

    return () => clearTimeout(timer)
  }, [pathname, search])

  return null
}
