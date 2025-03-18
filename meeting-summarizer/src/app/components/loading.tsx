'use client';

import { motion, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';

type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

type MotionH2Props = HTMLAttributes<HTMLHeadingElement> & MotionProps;
const MotionH2 = forwardRef<HTMLHeadingElement, MotionH2Props>((props, ref) => (
  <motion.h2 ref={ref} {...props} />
));
MotionH2.displayName = 'MotionH2';

type MotionPProps = HTMLAttributes<HTMLParagraphElement> & MotionProps;
const MotionP = forwardRef<HTMLParagraphElement, MotionPProps>((props, ref) => (
  <motion.p ref={ref} {...props} />
));
MotionP.displayName = 'MotionP';

export default function Loading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="text-center">
        <MotionDiv
          className="flex justify-center mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <MotionDiv 
            className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600"
            animate={{ 
              scale: [1, 1.1, 1],
            }}
            transition={{ 
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut" 
            }}
          >
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 opacity-80"></div>
            </div>
          </MotionDiv>
        </MotionDiv>
        
        <MotionH2
          className="text-xl font-medium text-neutral-800 mb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Super Kees Online laden
        </MotionH2>
        
        <MotionP
          className="text-neutral-500"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Uw AI-assistent wordt voorbereid...
        </MotionP>
      </div>
    </div>
  );
}