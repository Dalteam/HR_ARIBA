// Dashboard gender avatars: the provided silhouettes (public/icons/male.png, female.png) used as masks,
// so the colour follows the ARIBA palette in day and night mode (.ariba-gender-ic CSS).

function Masked({ src, kind, size }: { src: string; kind: "male" | "female"; size: number }) {
  return (
    <span
      className={`ariba-gender-ic ${kind}`}
      aria-hidden
      style={{ display: "inline-block", width: size, height: size, backgroundColor: "currentColor",
        WebkitMask: `url(${src}) center / contain no-repeat`, mask: `url(${src}) center / contain no-repeat` }}
    />
  );
}

export const MaleIcon = ({ size = 46 }: { size?: number }) => <Masked src="/icons/male.png" kind="male" size={size} />;
export const FemaleIcon = ({ size = 46 }: { size?: number }) => <Masked src="/icons/female.png" kind="female" size={size} />;
