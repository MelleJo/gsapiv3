// src/app/components/SummaryDisplay.tsx
'use client';

import { useState } from 'react';
import { motion, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';

type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

type MotionButtonProps = HTMLAttributes<HTMLButtonElement> & MotionProps & {
  onClick?: () => void;
};
const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>((props, ref) => (
  <motion.button ref={ref} {...props} />
));
MotionButton.displayName = 'MotionButton';

interface SummaryDisplayProps {
  summary: string;
  isLoading: boolean;
}

export default function SummaryDisplay({ summary, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  if (!summary) {
    return null;
  }

  // Format the summary to highlight sections using regex
  const formattedSummary = formatSummaryWithSections(summary);

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
      className="bg-white rounded-2xl shadow-lg p-6"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Samenvatting</h2>
        <MotionButton 
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={copyToClipboard}
          className="text-gray-500 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50"
          title="Kopiëren naar klembord"
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
              className="w-5 h-5 text-green-600"
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
      
      <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        {/* Render the formatted summary sections */}
        {formattedSummary.map((section, i) => {
          if (section.type === 'header') {
            return (
              <h3 key={i} className="text-lg font-semibold text-blue-700 mt-4 mb-2 pb-1 border-b border-blue-200">
                {section.content}
              </h3>
            );
          } else {
            return (
              <p key={i} className="mb-3 text-gray-700 leading-relaxed">
                {section.content}
              </p>
            );
          }
        })}
      </div>

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
      `}</style>
    </MotionDiv>
  );
}

// Helper function to format the summary with sections
function formatSummaryWithSections(summary: string): { type: 'header' | 'paragraph', content: string }[] {
  const result: { type: 'header' | 'paragraph', content: string }[] = [];
  
  // Common section titles in Dutch that we want to highlight
  const sectionPatterns = [
    /^(Overzicht|OVERZICHT):/i,
    /^(Belangrijkste discussiepunten|BELANGRIJKSTE DISCUSSIEPUNTEN):/i,
    /^(Genomen beslissingen|GENOMEN BESLISSINGEN|Beslissingen|BESLISSINGEN):/i,
    /^(Actiepunten|ACTIEPUNTEN):/i,
    /^(Vervolgstappen|VERVOLGSTAPPEN|Volgende stappen|VOLGENDE STAPPEN):/i,
    /^(Deelnemers|DEELNEMERS):/i,
    /^(Conclusie|CONCLUSIE):/i
  ];
  
  const lines = summary.split('\n');
  let currentParagraph = '';
  
  for (const line of lines) {
    // Check if this line is a section header
    const isHeader = sectionPatterns.some(pattern => pattern.test(line));
    
    if (isHeader) {
      // If we had a paragraph in progress, add it first
      if (currentParagraph.trim()) {
        result.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      
      // Add the header
      result.push({ type: 'header', content: line });
    } else if (line.trim()) {
      // For non-empty lines, add to the current paragraph
      currentParagraph += (currentParagraph ? '\n' : '') + line;
    } else if (currentParagraph.trim()) {
      // Empty line and we have a paragraph - finish it
      result.push({ type: 'paragraph', content: currentParagraph.trim() });
      currentParagraph = '';
    }
  }
  
  // Add the last paragraph if there's one
  if (currentParagraph.trim()) {
    result.push({ type: 'paragraph', content: currentParagraph.trim() });
  }
  
  return result;
}