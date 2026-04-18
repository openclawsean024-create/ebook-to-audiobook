import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#F59E0B",
        primaryHover: "#D97706",
      },
    },
  },
  plugins: [],
};

export default config;
