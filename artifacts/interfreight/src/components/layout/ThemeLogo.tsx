import lightLogoUrl from "@assets/Inter_freight_logo_nobg.png";
import darkLogoUrl from "@assets/IFS_logo_darkmode.png";

type ThemeLogoProps = {
  alt?: string;
  className?: string;
};

export function ThemeLogo({ alt = "InterFreight Solutions", className }: ThemeLogoProps) {
  return (
    <picture>
      <source srcSet={darkLogoUrl} media="(prefers-color-scheme: dark)" />
      <img src={lightLogoUrl} alt={alt} className={className} />
    </picture>
  );
}
