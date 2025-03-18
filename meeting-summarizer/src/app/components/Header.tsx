'use client';

import React, { forwardRef, HTMLAttributes } from 'react';
import { motion, MotionProps } from 'framer-motion';

// Create properly typed motion components
type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

export default function Header() {
  return (
    <header className="relative w-full overflow-hidden">
      {/* Gradient background with blur effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 backdrop-blur-xl z-0" />
      
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <MotionDiv 
          className="absolute w-64 h-64 rounded-full bg-blue-500/10"
          initial={{ x: -100, y: -100 }}
          animate={{ 
            x: ["-10%", "5%", "-5%"],
            y: ["-10%", "5%", "-5%"],
          }}
          transition={{ 
            duration: 15, 
            repeat: Infinity, 
            repeatType: "reverse" 
          }}
        />
        <MotionDiv 
          className="absolute right-0 top-1/3 w-96 h-96 rounded-full bg-purple-500/10"
          initial={{ x: 100, y: 50 }}
          animate={{ 
            x: ["10%", "-5%", "8%"],
            y: ["5%", "-8%", "3%"],
          }}
          transition={{ 
            duration: 18, 
            repeat: Infinity, 
            repeatType: "reverse" 
          }}
        />
      </div>
      
      {/* Content */}
      <div className="relative z-10 w-full py-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <MotionDiv
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold mb-3 text-gradient">
              Vergadering Samenvatting
            </h1>
          </MotionDiv>
          
          <MotionDiv
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <p className="text-lg text-neutral-700 max-w-2xl mx-auto">
              Transformeer uw audio-opnames in uitgebreide vergadernotities 
              en bruikbare samenvattingen met AI
            </p>
          </MotionDiv>
        </div>
      </div>
    </header>
  );
}