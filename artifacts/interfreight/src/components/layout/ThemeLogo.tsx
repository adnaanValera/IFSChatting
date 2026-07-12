import lightLogoUrl from "@assets/Inter_freight_logo_nobg.png";

type ThemeLogoProps = {
  alt?: string;
  className?: string;
};

export function ThemeLogo({ alt = "InterFreight Solutions", className }: ThemeLogoProps) {
  return <img src={lightLogoUrl} alt={alt} className={className} />;
}
