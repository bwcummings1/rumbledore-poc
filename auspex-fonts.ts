import { Inter, JetBrains_Mono, Michroma, Saira } from "next/font/google";

const michroma = Michroma({
  variable: "--font-michroma",
  display: "swap",
  subsets: ["latin"],
  weight: "400",
});

const saira = Saira({
  variable: "--font-saira",
  display: "swap",
  subsets: ["latin"],
  weight: "variable",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  display: "swap",
  subsets: ["latin"],
  weight: "variable",
});

const inter = Inter({
  variable: "--font-inter",
  display: "swap",
  subsets: ["latin"],
  weight: "variable",
});

export const auspexFontVariables = [
  michroma.variable,
  saira.variable,
  jetBrainsMono.variable,
  inter.variable,
].join(" ");
