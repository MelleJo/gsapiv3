// Removed framer-motion imports and MotionDiv definition
import React from 'react';

export default function Header() {
  return (
    // Simplified header structure
    <header className="relative w-full overflow-hidden border-b bg-background"> {/* Use theme background and add border */}
      {/* Optional subtle gradient or pattern */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-transparent z-0" />

      {/* Removed animated shapes */}

      {/* Content */}
      <div className="relative z-10 w-full py-16"> {/* Increased padding */}
        <div className="max-w-5xl mx-auto px-4 text-center">
          {/* Removed motion divs */}
          <div>
            {/* Use theme colors */}
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-foreground tracking-tight">
              Vergadering Samenvatting
            </h1>
          </div>

          <div>
            {/* Use theme colors */}
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Transformeer uw audio-opnames in uitgebreide vergadernotities
              en bruikbare samenvattingen met AI
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
 