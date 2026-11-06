import qrcode from "qrcode-generator"
import { useMemo } from "react"

/**
 * QR code drawn locally as inline SVG. The otpauth URI carries the TOTP secret, so
 * it must never go to a third-party image service.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M")
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ""
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`
      }
    }
    return { size: n, path: d }
  }, [value])

  // Fixed white background and black modules: scanners need the contrast, in any theme.
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`-4 -4 ${size + 8} ${size + 8}`}
      shapeRendering="crispEdges"
      className="h-44 w-44 rounded-md border border-line"
    >
      <rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
