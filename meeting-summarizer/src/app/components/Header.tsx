// Removed framer-motion imports and MotionDiv definition
import React from 'react';

export default function Header() {
  return (
    // Refined header: Solid dark bg matching body, subtle bottom border
    <header className="relative w-full overflow-hidden bg-slate-800 text-white border-b border-slate-700"> {/* Dark solid bg, subtle border */}
      {/* Content */}
      <div className="relative z-10 w-full py-8 md:py-12"> {/* Adjusted padding */}
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white"> {/* Updated text and style */}
              Super Kees Online
            </h1>
          </div>

          {/* Removed original description paragraph */}
          {/* <div>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              Transformeer uw audio-opnames...
            </p>
          </div> */}
        </div>
      </div>
    </header>
  );
}
