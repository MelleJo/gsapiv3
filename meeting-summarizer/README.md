# Meeting Summarizer

Transform your audio recordings into comprehensive meeting notes and actionable summaries with AI.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Project Setup Notes

### Tailwind CSS Configuration

This project uses Tailwind CSS for styling. The configuration includes:

- Basic Tailwind setup with `tailwind.config.js`
- Custom color definitions for primary and secondary colors
- Typography plugin for rich text styling

### Important Configuration Notes

#### Module Format Considerations

The project uses CommonJS format for configuration files like `tailwind.config.js` and `postcss.config.js`. Do not add `"type": "module"` to the package.json as it will cause conflicts with these files.

If you encounter styling issues or errors like:

```
Specified module format (EcmaScript Modules) is not matching the module format of the source code (CommonJs)
```

Check your package.json and remove any `"type": "module"` entry.

#### Troubleshooting Styling Issues

If Tailwind styles are not being applied:

1. Ensure package.json doesn't have `"type": "module"`
2. Check `postcss.config.js` has the correct plugins:
   ```js
   module.exports = {
     plugins: {
       tailwindcss: {},
       autoprefixer: {},
     },
   }
   ```
3. Verify `tailwind.config.js` has the correct content paths:
   ```js
   module.exports = {
     content: [
       "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
       "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
       "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
     ],
     // rest of config...
   }
   ```
4. Make sure `globals.css` has the proper Tailwind directives:
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

If needed, clear your `.next` cache:

```bash
# PowerShell
Remove-Item -Recurse -Force .next

# Unix/Linux/Mac
rm -rf .next
```

## Features

- Record audio directly through the browser
- Upload existing audio files
- High-quality transcription using OpenAI's Whisper models
- Structured summary generation using LLMs
- Cost estimation for API usage
- Clean, responsive UI

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.