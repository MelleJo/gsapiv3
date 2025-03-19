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

export default function SummaryDisplay({ summary, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Process the summary text to properly render formatting
  const processSummary = (text: string) => {
    if (!text) return [];
    
    // Split text into sections or paragraphs
    let sections = [];
    
    // Check if the summary has numbered sections (like "1. **Title:**")
    const hasNumberedSections = /\d+\.\s+\*\*[^*]+\*\*/.test(text);
    
    // Check for special formatting patterns
    const hasAsterisks = text.includes('**');
    
    if (hasNumberedSections || hasAsterisks) {
      // Split by double line breaks first
      const blocks = text.split(/\n\n+/);
      
      for (const block of blocks) {
        // Check if this is a section header with asterisks
        const sectionMatch = block.match(/^(\d+\.\s+)?(\*\*([^*]+)\*\*)(.*)$/s);
        
        if (sectionMatch) {
          const [, number, , title, content] = sectionMatch;
          
          sections.push({
            type: 'section',
            number: number || '',
            title: title,
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
    } else {
      // Simple paragraph processing for plain text
      const paragraphs = text.split(/\n\n+/);
      
      for (const para of paragraphs) {
        sections.push({
          type: 'paragraph',
          content: para
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
        {sections.map((section, index) => {
          if (section.type === 'section') {
            return (
              <div key={index} className="mb-4">
                <h3 className="text-lg font-semibold text-blue-700 mt-4 mb-2 pb-1 border-b border-blue-200">
                  {section.number && <span className="mr-1">{section.number}</span>}
                  {section.title.replace(/\*\*/g, '')}
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  {section.content}
                </p>
              </div>
            );
          } else if (section.type === 'formatted') {
            return (
              <div 
                key={index} 
                className="mb-4 text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderFormattedText(section.content) }}
              />
            );
          } else {
            return (
              <p key={index} className="mb-4 text-gray-700 leading-relaxed">
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