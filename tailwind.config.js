/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#2563eb", // Royal blue
          hover: "#1d4ed8",
          subtle: "#eff6ff",
          dark: "#1e40af",
        },
        secondary: {
          DEFAULT: "#059669", // Emerald green
          hover: "#047857",
          subtle: "#ecfdf5",
        },
        accent: {
          DEFAULT: "#f59e0b", // Amber warning
          hover: "#d97706",
          subtle: "#fffbeb",
        },
        destructive: {
          DEFAULT: "#ef4444", // Crimson red
          hover: "#dc2626",
          subtle: "#fef2f2",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        border: "var(--border)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        subtle: "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)",
        card: "0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)",
        float: "0 10px 25px -3px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.06)",
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};
