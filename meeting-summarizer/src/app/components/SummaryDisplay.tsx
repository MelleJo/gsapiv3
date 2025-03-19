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
  type?: "button" | "submit" | "reset";
};
const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>((props, ref) => (
  <motion.button ref={ref} {...props} />
));
MotionButton.displayName = 'MotionButton';

interface SummaryDisplayProps {
  summary: string;
  isLoading: boolean;
}

// Define types for sections
type Section = {
  type: 'section' | 'formatted' | 'paragraph' | 'bullet-list';
  content: string;
  items?: string[];
  number?: string;
  title?: string;
};

export default function SummaryDisplay({ summary, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Process the summary text to properly render formatting
  const processSummary = (text: string): Section[] => {
    if (!text) return [];
    
    // Split text into sections or paragraphs
    let sections: Section[] = [];
    
    // Split by double line breaks first
    const blocks = text.split(/\n\n+/);
    
    for (const block of blocks) {
      // Check if this is a bullet list
      if (block.match(/^[-*]\s+/m) || block.match(/^\d+\.\s+/m)) {
        // This is a list - split into items
        const items: string[] = [];
        const listLines = block.split('\n');
        let currentItem = '';
        
        for (let i = 0; i < listLines.length; i++) {
          const line = listLines[i];
          // If this line starts with a bullet or number, it's a new item
          if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
            if (currentItem) {
              items.push(currentItem);
              currentItem = '';
            }
            currentItem = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
          } else if (line.trim() && currentItem) {
            // This is a continuation of the current item
            currentItem += ' ' + line.trim();
          }
        }
        
        // Add the last item if there is one
        if (currentItem) {
          items.push(currentItem);
        }
        
        if (items.length > 0) {
          sections.push({
            type: 'bullet-list',
            content: block,
            items: items
          });
          continue;
        }
      }
      
      // Check if this is a section header with asterisks - without using /s flag
      const sectionMatch = block.match(/^(\d+\.\s+)?(\*\*([^*]+)\*\*)([^]*?)$/);
      
      if (sectionMatch) {
        const [, number, , title, content] = sectionMatch;
        
        sections.push({
          type: 'section',
          number: number || '',
          title: title || '', // Ensure title is never undefined
          content: content.trim()
        });
      } else if (block.includes('**')) {
        // This paragraph has some bold formatting but isn't a section header
        sections.push({
          type: 'formatted',
          content: block
        });
      } else {
        // Regular paragraph
        sections.push({
          type: 'paragraph',
          content: block
        });
      }
    }
    
    return sections;
  };

  // Render formatted text with proper HTML
  const renderFormattedText = (text: string) => {
    if (!text) return text;
    
    // Replace markdown-style formatting with HTML tags
    const formatted = text
      // Bold text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic text
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Headers that use markdown-style formatting (#)
      .replace(/^(#{1,6})\s+(.+)$/gm, (_, level, text) => {
        const headerLevel = level.length;
        return `<h${headerLevel} class="text-xl font-bold mb-2">${text}</h${headerLevel}>`;
      });
    
    return formatted;
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

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  const buttonVariants = {
    hover: { scale: 1.05 },
    tap: { scale: 0.95 }
  };

  const sections = processSummary(summary);

  return (
    <MotionDiv 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="bg-white rounded-2xl shadow-lg p-8 border-l-4 border-blue-500"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Samenvatting</h2>
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
      
      <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar text-gray-700 leading-relaxed">
        {sections.map((section, index) => {
          if (section.type === 'section') {
            return (
              <div key={index} className="mb-6">
                <h3 className="text-lg font-semibold text-blue-700 mb-3 pb-1 border-b border-blue-100">
                  {section.number && <span className="mr-1">{section.number}</span>}
                  {section.title ? section.title.replace(/\*\*/g, '') : ''}
                </h3>
                <div className="text-gray-700 leading-relaxed pl-1">
                  {section.content}
                </div>
              </div>
            );
          } else if (section.type === 'bullet-list') {
            return (
              <div key={index} className="mb-4 pl-2">
                <ul className="list-disc space-y-2 pl-5">
                  {section.items?.map((item, itemIndex) => (
                    <li key={itemIndex} className="pl-1">{item}</li>
                  ))}
                </ul>
              </div>
            );
          } else if (section.type === 'formatted') {
            return (
              <div 
                key={index} 
                className="mb-4"
                dangerouslySetInnerHTML={{ __html: renderFormattedText(section.content) }}
              />
            );
          } else {
            return (
              <p key={index} className="mb-4">
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
        
        /* Additional styling for enhanced summary rendering */
        strong {
          font-weight: 600;
          color: #111827;
        }
        
        em {
          font-style: italic;
          color: #374151;
        }
      `}</style>
    </MotionDiv>
  );
}