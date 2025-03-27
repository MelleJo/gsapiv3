// src/app/components/SummaryDisplay.tsx
'use client';

import { useState, useRef, useEffect } from 'react'; // Added useEffect
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';
// Removed ReactMarkdown and remarkGfm imports

// Define MotionDiv and MotionButton components (no changes needed here)
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

interface SummaryDisplayProps {
  // Expect summaryHtml instead of summary
  summaryHtml: string;
  isLoading: boolean;
}

export default function SummaryDisplay({ summaryHtml, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Function to extract plain text from HTML for copying
  const extractTextFromHtml = (html: string): string => {
    if (typeof window === 'undefined') return ''; // Avoid errors during SSR
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      // Add line breaks between block elements for better readability
      tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, tr').forEach(el => {
        el.insertAdjacentText('afterend', '\n');
      });
      // Add extra line break after tables
      tempDiv.querySelectorAll('table').forEach(el => {
        el.insertAdjacentText('afterend', '\n\n');
      });
      return tempDiv.textContent || tempDiv.innerText || '';
    } catch (e) {
      console.error("Error extracting text from HTML:", e);
      return ''; // Fallback
    }
  };

  const copyToClipboard = () => {
    const plainText = extractTextFromHtml(summaryHtml || '');
    if (plainText) {
      navigator.clipboard.writeText(plainText.trim());
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } else {
      console.warn("Could not extract text to copy.");
      // Optionally provide user feedback here
    }
  };


  // Loading state remains the same
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-7 bg-gray-200 rounded-md w-1/4 mb-6"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded-md"></div>
            <div className="h-4 bg-gray-200 rounded-md"></div>
            <div className="h-4 bg-gray-200 rounded-md"></div>
            <div className="h-4 bg-gray-200 rounded-md"></div>
            <div className="h-4 bg-gray-200 rounded-md w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  // If no summaryHtml, return null
  if (!summaryHtml) {
    return null;
  }

  // Animation variants remain the same
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  const buttonVariants = {
    hover: { scale: 1.05 },
    tap: { scale: 0.95 }
  };

  return (
    <MotionDiv
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="bg-white rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Header remains the same */}
      <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 text-white">
        <h2 className="text-2xl font-bold flex items-center pr-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Samenvatting
        </h2>

        {/* Tooltip remains the same */}
        <AnimatePresence>
          {copied && (
            <MotionDiv
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-16 right-8 bg-white text-green-600 px-3 py-1 rounded-md shadow-md text-sm"
            >
              Gekopieerd!
            </MotionDiv>
          )}
        </AnimatePresence>

        {/* Copy button - now copies extracted plain text */}
        <MotionButton
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={copyToClipboard}
          className="absolute top-6 right-6 text-white bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
          title="Kopiëren als platte tekst"
          type="button"
        >
          {copied ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <path d="M20 6L9 17l-5-5"></path>
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          )}
        </MotionButton>
      </div>

      {/* Content area - Render pre-generated HTML */}
      <div className="p-8">
        <div
          ref={contentRef}
           className="max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar"
         >
           {/* Apply prose styles to the container for default markdown element styling */}
           {/* Render the HTML string directly */}
           <div
             className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none"
             dangerouslySetInnerHTML={{ __html: summaryHtml }}
           />
         </div>
       </div>

      {/* Scrollbar styles remain the same */}
      {/* Add global styles for basic table appearance if prose doesn't cover it well enough */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
           background: #9ca3af;
         }

         /* Basic table styling (applied directly to HTML elements) */
         /* These might be needed if prose styles don't apply well via dangerouslySetInnerHTML */
         .prose table {
           width: 100%;
           border-collapse: collapse;
           margin-top: 1em;
           margin-bottom: 1em;
         }
         .prose th, .prose td {
           border: 1px solid #e5e7eb; /* gray-200 */
           padding: 0.5em 1em;
           vertical-align: top;
         }
         .prose th {
           background-color: #f9fafb; /* gray-50 */
           font-weight: 600;
           text-align: left;
         }
         /* Optional: Add alternating row color if desired */
         /* .prose tbody tr:nth-child(even) {
           background-color: #f9fafb; /* gray-50 */
         } */
       `}</style>
     </MotionDiv>
   );
}
