/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
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
        },
        // Updated with RGBA for transparency
        'glass-blue': 'rgba(30, 58, 138, 0.8)', // Dark blue with ~80% opacity
        'glass-green': 'rgba(22, 163, 74, 0.8)', // Green with ~80% opacity
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography'),
  ]
};
