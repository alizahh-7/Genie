import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { ivory: "#f5efe3", paper: "#fffbf4", navy: "#10142f", sage: "#b3a2d7", sagedeep: "#75629c", sand: "#e7d7bc", gold: "#f4c970", twilight: "#25204a" },
    fontFamily: { serif: ['"Cormorant Garamond"', '"Iowan Old Style"', "Palatino", "Georgia", "serif"] },
  } },
  plugins: [],
} satisfies Config;
