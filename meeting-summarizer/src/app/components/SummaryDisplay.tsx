// src/app/components/SummaryDisplay.tsx
'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef, ReactNode } from 'react'; // Import ReactNode
import Markdown from 'markdown-to-jsx'; // Import markdown-to-jsx

// Define MotionDiv and MotionButton components
type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

type MotionButtonProps = HTMLAttributes<HTMLButtonElement> & MotionProps & {
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
};
const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>((props, ref) => (
  <motion.button ref={ref} {...props} />
));
MotionButton.displayName = 'MotionButton';

// --- Custom Components for Markdown Overrides ---
// Add ReactNode type for children
const MyTable = ({ children, ...props }: { children?: ReactNode }) => <table className="min-w-full border-collapse border border-gray-300 my-6 text-sm rounded-lg overflow-hidden" {...props}>{children}</table>; // Added my-6, rounded-lg, overflow-hidden
const MyThead = ({ children, ...props }: { children?: ReactNode }) => <thead className="bg-gray-200" {...props}>{children}</thead>; // Changed bg-gray-100 to bg-gray-200
const MyTbody = ({ children, ...props }: { children?: ReactNode }) => <tbody {...props}>{children}</tbody>;
const MyTr = ({ children, ...props }: { children?: ReactNode }) => <tr className="border-b border-gray-200 hover:bg-gray-50" {...props}>{children}</tr>;
const MyTh = ({ children, ...props }: { children?: ReactNode }) => <th className="border border-gray-300 px-4 py-3 text-left font-medium text-gray-800 bg-gray-100" {...props}>{children}</th>; // Adjusted padding, font, color, bg
const MyTd = ({ children, ...props }: { children?: ReactNode }) => <td className="border border-gray-300 px-4 py-3 text-gray-700 align-middle" {...props}>{children}</td>; // Adjusted padding, color, alignment
const MyP = ({ children, ...props }: { children?: ReactNode }) => <p className="mb-5" {...props}>{children}</p>; // Changed mb-4 to mb-5
const MyUl = ({ children, ...props }: { children?: ReactNode }) => <ul className="list-disc pl-6 mb-5" {...props}>{children}</ul>; // Changed mb-4 to mb-5
const MyOl = ({ children, ...props }: { children?: ReactNode }) => <ol className="list-decimal pl-6 mb-5" {...props}>{children}</ol>; // Changed mb-4 to mb-5
const MyLi = ({ children, ...props }: { children?: ReactNode }) => <li className="mb-2" {...props}>{children}</li>; // Changed mb-1 to mb-2
const MyH2 = ({ children, ...props }: { children?: ReactNode }) => <h2 className="text-2xl font-semibold mt-8 mb-4 border-b-2 border-blue-200 pb-2 text-gray-800" {...props}>{children}</h2>; // Enhanced styling
const MyH3 = ({ children, ...props }: { children?: ReactNode }) => <h3 className="text-xl font-medium mt-6 mb-3 text-gray-700" {...props}>{children}</h3>; // Enhanced styling
const MyStrong = ({ children, ...props }: { children?: ReactNode }) => <strong className="font-semibold text-gray-900" {...props}>{children}</strong>; // Added text color
const MyHr = ({ ...props }) => <hr className="my-8 border-t border-gray-200" {...props} />; // Adjusted margin and border
// --- End Custom Components ---


interface SummaryDisplayProps {
  summary: string; // Expect raw Markdown summary
  isLoading: boolean;
  // Removed summaryHtml
}

// --- REMOVED Helper functions for Copy-to-Clipboard Logic ---


export default function SummaryDisplay({ summary, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Copy function - copies raw markdown for now
  // TODO: Re-implement pre-formatted text copy logic if needed later
  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary || '');
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };


  // Loading state
  if (isLoading) { return ( <div className="bg-white rounded-2xl shadow-lg p-6"><div className="animate-pulse">...</div></div> ); }
  // No summary
  if (!summary) { return null; }

  // Animation variants
  const containerVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
  const buttonVariants = { hover: { scale: 1.05 }, tap: { scale: 0.95 } };

  return (
    <MotionDiv variants={containerVariants} initial="hidden" animate="visible" className="bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 text-white">
        <h2 className="text-2xl font-bold flex items-center pr-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">...</svg>
          Samenvatting
        </h2>
        {/* Tooltip */}
        <AnimatePresence> {copied && ( <MotionDiv className="absolute top-16 right-8 ...">Gekopieerd!</MotionDiv> )} </AnimatePresence>
        {/* Copy button */}
        <MotionButton variants={buttonVariants} whileHover="hover" whileTap="tap" onClick={copyToClipboard} className="absolute top-6 right-6 ..." title="Kopiëren" type="button">
          {copied ? ( <svg>...</svg> ) : ( <svg>...</svg> )}
        </MotionButton>
      </div>

      {/* Content area - Use markdown-to-jsx */}
      <div className="p-8">
        <div ref={contentRef} className="summary-content max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
           {/* Render Markdown using markdown-to-jsx with overrides */}
           <Markdown options={{
               overrides: {
                   table: { component: MyTable },
                   thead: { component: MyThead },
                   tbody: { component: MyTbody },
                   tr: { component: MyTr },
                   th: { component: MyTh },
                   td: { component: MyTd },
                   p: { component: MyP },
                   ul: { component: MyUl },
                   ol: { component: MyOl },
                   li: { component: MyLi },
                   h2: { component: MyH2 },
                   h3: { component: MyH3 },
                   strong: { component: MyStrong },
                   hr: { component: MyHr },
                   // Add overrides for other elements if default styling is not desired
               }
           }}>
               {summary}
           </Markdown>
         </div>
       </div>

      {/* Styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        /* Removed global table styles - handled by overrides now */
       `}</style>
     </MotionDiv>
   );
}
