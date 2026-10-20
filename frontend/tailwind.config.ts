import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { ivory: "#faf6ee", paper: "#fffdf8", navy: "#2c3a56", sage: "#7f9a82", sagedeep: "#566f5b", sand: "#ebe4d2" },
    fontFamily: { serif: ['"Cormorant Garamond"', '"Iowan Old Style"', "Palatino", "Georgia", "serif"] },
  } },
  plugins: [],
} satisfies Config;
