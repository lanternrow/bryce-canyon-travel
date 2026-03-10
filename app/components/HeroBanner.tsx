interface HeroBannerProps {
  title: string;
  subtitle: string;
  imageUrl?: string;
  imageFocalX?: number;
  imageFocalY?: number;
  height?: number;
  titleColor?: string;
  subtitleColor?: string;
  titleSizeMobile?: number;
  titleSizeDesktop?: number;
  gradientFrom?: string;
  gradientVia?: string;
  gradientTo?: string;
  gradientDirection?: string;
  gradientOpacity?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getGradientBackground({
  gradientFrom,
  gradientVia,
  gradientTo,
  gradientDirection,
}: {
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  gradientDirection: string;
}) {
  const directionCss: Record<string, string> = {
    "to-br": "to bottom right",
    "to-b": "to bottom",
    "to-r": "to right",
    "to-t": "to top",
    "to-bl": "to bottom left",
  };

  if (gradientDirection === "radial") {
    return `radial-gradient(circle, ${gradientFrom}, ${gradientVia}, ${gradientTo})`;
  }
  return `linear-gradient(${directionCss[gradientDirection] || "to bottom right"}, ${gradientFrom}, ${gradientVia}, ${gradientTo})`;
}

export default function HeroBanner({
  title,
  subtitle,
  imageUrl,
  imageFocalX = 50,
  imageFocalY = 50,
  height = 300,
  titleColor = "#ffffff",
  subtitleColor = "#f3f4f6",
  titleSizeMobile = 48,
  titleSizeDesktop = 64,
  gradientFrom = "#111827",
  gradientVia = "#1f2937",
  gradientTo = "#92400e",
  gradientDirection = "to-br",
  gradientOpacity = 85,
}: HeroBannerProps) {
  const clampedHeight = clamp(Math.round(height), 220, 520);
  const clampedMobile = clamp(Math.round(titleSizeMobile), 24, 72);
  const clampedDesktop = clamp(Math.round(titleSizeDesktop), 32, 96);
  const clampedOpacity = clamp(Math.round(gradientOpacity), 0, 100) / 100;

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ height: `${clampedHeight}px` }}
    >
      {/* Background image or gradient placeholder */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition: `${clamp(Math.round(imageFocalX), 0, 100)}% ${clamp(
              Math.round(imageFocalY),
              0,
              100
            )}%`,
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-dark" aria-hidden="true" />
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: getGradientBackground({
            gradientFrom,
            gradientVia,
            gradientTo,
            gradientDirection,
          }),
          opacity: clampedOpacity,
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8">
        <h1
          className="font-bold tracking-tight drop-shadow-lg leading-[0.95]"
          style={{
            color: titleColor,
            fontSize: `clamp(${clampedMobile}px, 6vw, ${clampedDesktop}px)`,
          }}
        >
          {title}
        </h1>
        <p
          className="mt-3 text-base sm:text-lg md:text-xl max-w-2xl drop-shadow"
          style={{ color: subtitleColor }}
        >
          {subtitle}
        </p>
      </div>
    </section>
  );
}
