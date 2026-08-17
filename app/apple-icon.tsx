import { ImageResponse } from "next/og";

/**
 * iOS ignores the manifest's icons and will screenshot the page instead unless
 * it finds an apple-touch-icon, which has to be a raster image. Generating it
 * here keeps it in step with public/icons/card-stack.svg, which Android uses.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Full bleed: iOS rounds the corners itself and mattes transparency black.
          background: "#10211a",
        }}
      >
        <div style={{ display: "flex", position: "relative", width: 132, height: 92 }}>
          {/* The runner-up, fanned behind. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 12,
              background: "#136540",
              transform: "rotate(-11deg)",
            }}
          />
          {/* The recommended card, lifted forward, with its magnetic stripe. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              borderRadius: 12,
              background: "#1a8a53",
              transform: "rotate(6deg) translateY(-8px)",
            }}
          >
            <div style={{ width: "100%", height: 18, background: "#10211a" }} />
          </div>
        </div>
      </div>
    ),
    size,
  );
}
