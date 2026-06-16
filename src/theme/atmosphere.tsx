const ATMOSPHERE_LAYERS = [
  "starfield",
  "scanline",
  "grain",
  "vignette",
] as const;

export function AuspexAtmosphere() {
  return (
    <div
      aria-hidden="true"
      className="auspex-atmosphere"
      data-slot="auspex-atmosphere"
    >
      {ATMOSPHERE_LAYERS.map((layer) => (
        <span
          className={`auspex-atmosphere__layer auspex-atmosphere__${layer}`}
          data-slot={`auspex-atmosphere-${layer}`}
          key={layer}
        />
      ))}
    </div>
  );
}
