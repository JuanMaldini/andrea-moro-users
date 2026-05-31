import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
    // Misma paleta que andrea-moro principal
    colors: {
      vanilla:       "#fdf6e9",
      grisoscuro:    "#e7e3e0",
      rojo:          "#ff0000",
      grisclaro:     "#f7f5f4",
      marron:        "#a7856a",
      marroncalido:  "#9c8784",
      grisclarito:   "#9f9f9f",
      blanco:        "#ffffff",
      negro:         "#000000",
      gris200:       "#ebe7e5",
    },
  },
  plugins: [],
};

export default config;
