// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
      "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
      "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
    ],
    theme: {
      extend: {
        colors: {
          primary: {
            DEFAULT: "#3b82f6", // blue-500
            dark: "#1d4ed8"     // blue-700
          },
          secondary: {
            DEFAULT: "#8b5cf6", // purple-500
            dark: "#6d28d9"     // purple-700
          }
        }
      }
    },
    plugins: [require('@tailwindcss/typography')]
  };