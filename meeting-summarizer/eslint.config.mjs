// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals"; // Import globals for environment definition

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import('eslint').Linter.FlatConfig[]} */
const eslintConfig = [
  // Apply Next.js recommended configurations first
  ...compat.extends("next/core-web-vitals"),

  // Your custom rules and overrides
  {
    // Define the files these rules apply to
    files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],

    // Define language options (parser, globals, etc.)
    languageOptions: {
        globals: {
            ...globals.browser, // Add browser globals
            ...globals.node,    // Add Node.js globals
            ...globals.es2021,  // Add ES2021 globals
            React: "readonly", // Define React as a global (if needed, often handled by plugins)
        },
        parserOptions: {
            ecmaFeatures: {
                jsx: true, // Enable JSX parsing
            },
        },
        // If using TypeScript parser (likely needed with Next.js)
        // parser: require('@typescript-eslint/parser'), // Example if needed directly
        // parserOptions: { project: './tsconfig.json' }, // Example if needed directly
    },

    // Define rules
    rules: {
      // Your existing rules adjustments:
      "@typescript-eslint/no-explicit-any": "off", // Keep specific TS rules if needed
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }], // Keep warning for unused vars
      "react-hooks/exhaustive-deps": "warn", // Keep warning for exhaustive deps
      "react/no-unescaped-entities": "off", // Keep disabled if needed

      // General good practices (optional, add/remove as needed)
      "no-console": ["warn", { "allow": ["warn", "error", "info", "log"] }], // Allow console.log for debugging
      // Add other rules as desired
    },
  },

  // **Corrected ignores section**
  {
    ignores: [
        "node_modules/**/*",
        ".next/**/*",
        "out/**/*",
        "build/**/*",
        "public/ffmpeg/*", // Ignore downloaded ffmpeg files
        ".vercel/**/*",
        "*.tsbuildinfo",
        "next-env.d.ts",
    ],
  }
];

export default eslintConfig;