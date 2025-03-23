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
  type: 'section' | 'formatted' | 'paragraph' | 'bullet-list' | 'dash-separator' | 'table';
  content: string;
  items?: string[];
  level?: number;
  number?: string;
  title?: string;
  tableData?: {
    headers: string[];
    rows: string[][];
  };
};

// Safe regex matching function
const safeMatch = (text: string | undefined | null, pattern: RegExp): RegExpMatchArray | null => {
  if (!text) return null;
  return text.match(pattern);
};

export default function SummaryDisplay({ summary, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Function to detect and parse markdown tables with support for unusual formats
  const parseMarkdownTable = (text: string): { headers: string[]; rows: string[][] } | null => {
    // First, check if we have pipe characters which would indicate a table
    if (!text.includes('|')) return null;
    
    // Split into lines
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    
    // Find the header line - it's usually the first line with pipe characters
    // that isn't just a separator line
    let headerLine = '';
    let headerIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip lines that are just separators (only dashes and pipes)
      if (line.match(/^[-\|]+$/)) continue;
      
      if (line.includes('|')) {
        headerLine = line;
        headerIndex = i;
        break;
      }
    }
    
    if (!headerLine || headerIndex === -1) return null;
    
    // Parse the headers - cleanup any extra dashes
    const headers = headerLine.split('|')
      .map(cell => cell.trim().replace(/^-+|-+$/g, ''))
      .filter(cell => cell !== '');
    
    if (headers.length === 0) return null;
    
    // Extract rows - skip separator lines
    const rows: string[][] = [];
    
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip separator lines
      if (line.match(/^[-\|]+$/)) continue;
      
      // If it has pipes, it's probably a data row
      if (line.includes('|')) {
        const cells = line.split('|')
          .map(cell => cell.trim().replace(/^-+|-+$/g, ''))
          .filter((cell, idx) => idx > 0 || cell !== '');
        
        if (cells.length > 0) {
          rows.push(cells);
        }
      }
    }
    
    return { headers, rows };
  };

  // Process the summary text to properly render formatting
  const processSummary = (text: string): Section[] => {
    if (!text) return [];
    
    // Split text into sections or paragraphs
    let sections: Section[] = [];
    
    try {
      // Split by double line breaks first
      const tableSections = text.split(/\n\n+/);
      
      for (const section of tableSections) {
        if (!section || !section.trim()) continue;
        
        // Check if this section has multiple pipe characters across multiple lines
        // which is a strong indicator of a table
        if (section.includes('|') && section.includes('\n') && 
            (section.split('|').length > 3) && (section.split('\n').filter(line => line.includes('|')).length > 1)) {
          
          const tableData = parseMarkdownTable(section);
          if (tableData && tableData.headers.length > 0) {
            sections.push({
              type: 'table',
              content: section,
              tableData
            });
            continue;
          }
        }
        
        // Split by double line breaks first
        const blocks = section.split(/\n\n+/);
        
        for (const block of blocks) {
          if (!block || !block.trim()) continue;
          
          // Check if this is a section header with pattern like "1. Deelnemers" or "2. Woning- en Hypotheekdetails"
          if (safeMatch(block, /^(\d+\.\s*)([A-Z][^.]+)/)) {
            const sectionMatch = safeMatch(block, /^(\d+\.\s*)([A-Z][^:]+)(:?)([^]*?)$/);
            
            if (sectionMatch) {
              // This is a numbered section with a title
              sections.push({
                type: 'section',
                number: sectionMatch[1] || '',
                title: (sectionMatch[2] || '').trim(),
                content: (sectionMatch[4] || '').trim()
              });
            } else {
              // Regular paragraph
              sections.push({
                type: 'paragraph',
                content: block
              });
            }
          } 
          // Check if this is a bullet list
          else if (
            safeMatch(block, /^[•*-]\s+/m) || 
            safeMatch(block, /^\d+\.\s+/m)
          ) {
            // This is a list - process line by line
            const listItems: string[] = [];
            let currentSection = '';
            const lines = block.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]?.trim() || '';
              if (!line) continue;
              
              // Check if this line is a bullet point
              if (
                safeMatch(line, /^[•*-]\s+/) || 
                safeMatch(line, /^\d+\.\s+/)
              ) {
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
              // Regular line - either add to current paragraph or start a new one
              else {
                if (i > 0 && (
                  safeMatch(lines[i-1], /^[•*-]\s+/) || 
                  safeMatch(lines[i-1], /^\d+\.\s+/)
                )) {
                  // This line is part of the previous bullet point
                  if (listItems.length > 0) {
                    listItems[listItems.length - 1] += ' ' + line;
                  }
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
          else {
            // Regular paragraph
            sections.push({
              type: 'paragraph',
              content: block
            });
          }
        }
      }
    } catch (e) {
      console.error("Error processing summary:", e);
      // Fallback to simple paragraph rendering
      return [{
        type: 'paragraph',
        content: text
      }];
    }
    
    return sections;
  };

  // Process bullet point to ensure proper display
  const processBulletPoint = (bulletText: string) => {
    if (!bulletText) return '';
    
    try {
      // Replace the bullet character with a properly styled one
      if (bulletText.startsWith('•')) {
        return bulletText.replace(/^•\s+/, '');
      } else if (bulletText.startsWith('-')) {
        return bulletText.replace(/^-\s+/, '');
      } else if (bulletText.startsWith('*')) {
        return bulletText.replace(/^\*\s+/, '');
      } else if (safeMatch(bulletText, /^\d+\.\s+/)) {
        // For numbered bullets, preserve the number but style it
        return bulletText.replace(/^(\d+\.)\s+/, '<span class="font-semibold mr-2">$1</span> ');
      }
      return bulletText;
    } catch (e) {
      console.error("Error processing bullet point:", e);
      return bulletText; // Return the original text if processing fails
    }
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

  let sections: Section[] = [];
  try {
    sections = processSummary(summary);
  } catch (e) {
    console.error("Failed to process summary:", e);
    // Fallback to simple rendering
    sections = [{
      type: 'paragraph',
      content: summary
    }];
  }

  return (
    <MotionDiv 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="bg-white rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Header with gradient background */}
      <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 text-white">
        <h2 className="text-2xl font-bold flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Samenvatting
        </h2>
        
        {/* Copy button */}
        <MotionButton 
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={copyToClipboard}
          className="absolute top-6 right-6 text-white bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
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
      
      {/* Content */}
      <div className="p-8">
        <div className="max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar text-gray-700 leading-relaxed">
          <div className="space-y-6">
            {sections.map((section, index) => {
              try {
                if (section.type === 'section') {
                  return (
                    <div key={index} className="mb-8">
                      <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                        {section.number && (
                          <span className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 rounded-full mr-3 text-sm font-bold">
                            {parseInt(section.number)}
                          </span>
                        )}
                        <span>{section.title || ''}</span>
                      </h3>
                      <div className="pl-11 text-gray-700 leading-relaxed">
                        {section.content}
                      </div>
                    </div>
                  );
                } else if (section.type === 'table' && section.tableData) {
                  // Render a properly formatted HTML table
                  return (
                    <div key={index} className="mb-8 overflow-x-auto">
                      <table className="min-w-full border-collapse border border-gray-300 text-sm">
                        <thead>
                          <tr className="bg-gray-100">
                            {section.tableData.headers.map((header, headerIndex) => (
                              <th key={headerIndex} className="border border-gray-300 px-3 py-2 text-left font-semibold">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.tableData.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              {row.map((cell, cellIndex) => {
                                // For each cell, handle potential special formatting
                                const content = cell
                                  .replace(/\|\|+/g, '')  // Remove multiple pipe characters
                                  .replace(/^\s*\|\s*|\s*\|\s*$/, '')  // Remove pipe chars at start/end
                                  .replace(/^\s*-+\s*|-+\s*$/g, '')  // Remove dashes at start/end
                                  .trim();
                                  
                                return (
                                  <td key={cellIndex} className="border border-gray-300 px-3 py-2">
                                    {content || '\u00A0'} {/* Use non-breaking space if empty */}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                } else if (section.type === 'bullet-list') {
                  return (
                    <div key={index} className="mb-6 pl-6">
                      <ul className="space-y-4">
                        {section.items?.map((item, itemIndex) => {
                          const isBullet = item.startsWith('•') || item.startsWith('-') || item.startsWith('*');
                          const isNumbered = safeMatch(item, /^\d+\.\s+/);
                          
                          return (
                            <li key={itemIndex} className="flex items-start">
                              {isBullet ? (
                                <span className="flex-shrink-0 w-6 h-6 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                  •
                                </span>
                              ) : isNumbered ? (
                                <span className="flex-shrink-0 w-6 h-6 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mr-3 mt-0.5 text-sm font-medium">
                                  {parseInt(item)}
                                </span>
                              ) : null}
                              <span className="flex-grow">
                                {isBullet ? 
                                  item.replace(/^[•*-]\s+/, '') : 
                                  item.replace(/^\d+\.\s+/, '')}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                } else {
                  return (
                    <p key={index} className="text-gray-700 leading-relaxed mb-4">
                      {section.content}
                    </p>
                  );
                }
              } catch (e) {
                console.error("Error rendering section:", e);
                return <p key={index} className="mb-4 text-red-500">Error rendering content</p>;
              }
            })}
          </div>
        </div>
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