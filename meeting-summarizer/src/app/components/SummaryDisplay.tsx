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
  type: 'section' | 'formatted' | 'paragraph' | 'bullet-list' | 'dash-separator';
  content: string;
  items?: string[];
  level?: number;
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
      // Check if this is a bullet list or contains bullets
      if (block.match(/^[•*-]\s+/m) || block.match(/^\d+\.\s+/m)) {
        // This is a list - process line by line to capture all formatting details
        const listItems: string[] = [];
        let currentSection = '';
        const lines = block.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Check if this line is a bullet point
          if (line.match(/^[•*-]\s+/) || line.match(/^\d+\.\s+/)) {
            // If we already have accumulated text, add it as a paragraph
            if (currentSection.trim()) {
              sections.push({
                type: 'paragraph',
                content: currentSection.trim()
              });
              currentSection = '';
            }
            
            // Parse the bullet and its content
            listItems.push(line);
          } 
          // Check if this line has a dash/em-dash separator (common in the example)
          else if (line.match(/\s+—+\s+/) || line.match(/\s+–+\s+/) || line.match(/\s+-+\s+/)) {
            sections.push({
              type: 'dash-separator',
              content: line
            });
          }
          // Regular line - either add to current paragraph or start a new one
          else {
            if (i > 0 && lines[i-1].match(/^[•*-]\s+/) || lines[i-1].match(/^\d+\.\s+/)) {
              // This line is part of the previous bullet point
              listItems[listItems.length - 1] += ' ' + line;
            } else {
              // Regular paragraph text
              currentSection += (currentSection ? ' ' : '') + line;
            }
          }
        }
        
        // Add any remaining text as a paragraph
        if (currentSection.trim()) {
          sections.push({
            type: 'paragraph',
            content: currentSection.trim()
          });
        }
        
        // Add the bullet list if we have items
        if (listItems.length > 0) {
          sections.push({
            type: 'bullet-list',
            content: block,
            items: listItems
          });
        }
      } 
      // Check if this is a section header with asterisks
      else if (block.match(/^(\d+\.\s+)?([A-Z][^.]+):/)) {
        const sectionMatch = block.match(/^(\d+\.\s+)?([A-Z][^:]+):(.*)$/s);
        
        if (sectionMatch) {
          const [, number, title, content] = sectionMatch;
          
          sections.push({
            type: 'section',
            number: number || '',
            title: title.trim() || '',
            content: content.trim()
          });
        } else {
          // Regular paragraph
          sections.push({
            type: 'paragraph',
            content: block
          });
        }
      } 
      else if (block.includes('**')) {
        // This paragraph has some bold formatting but isn't a section header
        sections.push({
          type: 'formatted',
          content: block
        });
      } 
      else {
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
      // Em dashes and separators with proper spacing
      .replace(/\s+(—+|–+|-+)\s+/g, ' <span class="text-gray-500 mx-2">$1</span> ')
      // Headers that use markdown-style formatting (#)
      .replace(/^(#{1,6})\s+(.+)$/gm, (_, level, text) => {
        const headerLevel = level.length;
        return `<h${headerLevel} class="text-xl font-bold mb-2">${text}</h${headerLevel}>`;
      });
    
    return formatted;
  };

  // Process bullet point to ensure proper display
  const processBulletPoint = (bulletText: string) => {
    // Replace the bullet character with a properly styled one
    if (bulletText.startsWith('•')) {
      return bulletText.replace(/^•\s+/, '');
    } else if (bulletText.startsWith('-')) {
      return bulletText.replace(/^-\s+/, '');
    } else if (bulletText.startsWith('*')) {
      return bulletText.replace(/^\*\s+/, '');
    } else if (bulletText.match(/^\d+\.\s+/)) {
      // For numbered bullets, preserve the number but style it
      return bulletText.replace(/^(\d+\.)\s+/, '<span class="font-semibold mr-2">$1</span> ');
    }
    return bulletText;
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
                  {section.title || ''}
                </h3>
                <div className="text-gray-700 leading-relaxed pl-1">
                  {section.content}
                </div>
              </div>
            );
          } else if (section.type === 'bullet-list') {
            return (
              <div key={index} className="mb-4 ml-1">
                <ul className="space-y-3">
                  {section.items?.map((item, itemIndex) => {
                    const bulletSymbol = item.startsWith('•') ? '•' : 
                                        item.startsWith('-') ? '–' : 
                                        item.startsWith('*') ? '•' : '';
                    
                    return (
                      <li key={itemIndex} className="flex">
                        {bulletSymbol && (
                          <span className="inline-block w-5 flex-shrink-0 text-blue-600 font-bold">{bulletSymbol}</span>
                        )}
                        <span 
                          className="flex-grow"
                          dangerouslySetInnerHTML={{ 
                            __html: processBulletPoint(item) 
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          } else if (section.type === 'dash-separator') {
            // Better render dashes and separators
            return (
              <div 
                key={index} 
                className="my-2 text-gray-700 flex items-center"
                dangerouslySetInnerHTML={{ 
                  __html: section.content
                    .replace(/\s+—+\s+/g, ' <span class="px-3 text-gray-400">—</span> ')
                    .replace(/\s+–+\s+/g, ' <span class="px-3 text-gray-400">–</span> ')
                    .replace(/\s+-+\s+/g, ' <span class="px-3 text-gray-400">-</span> ')
                }}
              />
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