// src/app/components/SummaryDisplay.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
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
  type: 'section' | 'formatted' | 'paragraph' | 'bullet-list' | 'dash-separator' | 'raw-table';
  content: string;
  items?: string[];
  level?: number;
  number?: string;
  title?: string;
  tableLines?: string[];
};

// Safe regex matching function
const safeMatch = (text: string | undefined | null, pattern: RegExp): RegExpMatchArray | null => {
  if (!text) return null;
  return text.match(pattern);
};

export default function SummaryDisplay({ summary, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [expandedTables, setExpandedTables] = useState<{[key: number]: boolean}>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Process text to be email-friendly when copying
  const createEmailFriendlyText = (text: string): string => {
    if (!text) return '';
    
    // Handle tables in a special way for email formatting
    const formattedLines: string[] = [];
    let insideTable = false;
    let tableRows: string[][] = [];
    
    // Process line by line
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this line starts or is part of a table
      if (line.includes('|') && (line.match(/\|/g) || []).length >= 2) {
        if (!insideTable) {
          // Starting a new table
          insideTable = true;
          tableRows = [];
        }
        
        // Skip separator lines (those with only dashes, pipes and spaces)
        if (!line.match(/^[\s\-|]+$/)) {
          // Process cells - split by | and clean up each cell
          const cells = line.split('|')
            .map(cell => cell.trim())
            .filter(Boolean);
          
          if (cells.length > 0) {
            tableRows.push(cells);
          }
        }
      } else if (insideTable) {
        // This line doesn't have pipes but we were inside a table,
        // so the table has ended. Format and add the table.
        formattedLines.push(formatTableForEmail(tableRows));
        insideTable = false;
        
        // Add the current non-table line
        if (line.trim()) {
          formattedLines.push(line);
        }
      } else {
        // Not part of a table
        if (line.trim()) {
          formattedLines.push(line);
        }
      }
    }
    
    // If we ended while still inside a table
    if (insideTable && tableRows.length > 0) {
      formattedLines.push(formatTableForEmail(tableRows));
    }
    
    return formattedLines.join('\n\n');
  };

  // Format a table for email
  const formatTableForEmail = (tableRows: string[][]): string => {
    if (tableRows.length === 0) return '';
    
    // Get the maximum number of columns in any row
    const maxColumns = Math.max(...tableRows.map(row => row.length));
    
    // Calculate the maximum width needed for each column
    const columnWidths: number[] = Array(maxColumns).fill(0);
    
    tableRows.forEach(row => {
      row.forEach((cell, cellIndex) => {
        if (cell.length > columnWidths[cellIndex]) {
          columnWidths[cellIndex] = Math.min(cell.length, 40); // Cap width at 40 chars
        }
      });
    });
    
    // Format each row with proper spacing
    const formattedTable = tableRows.map(row => {
      const formattedRow = row.map((cell, cellIndex) => {
        // Use padEnd to create consistent column widths
        return cell.padEnd(columnWidths[cellIndex] + 2);
      }).join('');
      
      return formattedRow;
    }).join('\n');
    
    return formattedTable;
  };

  const copyToClipboard = () => {
    const emailFriendlyText = createEmailFriendlyText(summary || '');
    navigator.clipboard.writeText(emailFriendlyText);
    setCopied(true);
    
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  // Check if a section of text is likely a table
  const isTableSection = (text: string): boolean => {
    const lines = text.split('\n');
    const pipeLines = lines.filter(line => line.includes('|') && (line.match(/\|/g) || []).length >= 2);
    return pipeLines.length >= 2;
  };

  // Process the summary text to properly render formatting
  const processSummary = (text: string): Section[] => {
    if (!text) return [];
    
    // Split the text by paragraphs (double newlines)
    const paragraphs = text.split(/\n\n+/);
    const sections: Section[] = [];
    
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      
      // Check if this paragraph contains table-like content
      if (isTableSection(paragraph)) {
        // This paragraph is primarily a table
        sections.push({
          type: 'raw-table',
          content: paragraph
        });
      } 
      // Check if this is a bullet list
      else if (paragraph.match(/^[•*-]\s+/m) || paragraph.match(/^\d+\.\s+/m)) {
        const items = paragraph
          .split('\n')
          .filter(line => line.trim().match(/^[•*-]\s+/) || line.trim().match(/^\d+\.\s+/));
        
        sections.push({
          type: 'bullet-list',
          content: paragraph,
          items
        });
      } 
      // Regular paragraph
      else {
        sections.push({
          type: 'paragraph',
          content: paragraph
        });
      }
    }
    
    return sections;
  };

  // Render a table from text
  const renderTable = (content: string, index: number) => {
    try {
      const lines = content.split('\n');
      
      // Filter out empty lines and separator lines
      const contentLines = lines.filter(line => {
        return line.trim() && !line.match(/^[\s\-|]+$/);
      });
      
      // Parse the table structure
      const rows = contentLines.map(line => {
        if (line.includes('|')) {
          const cells = line.split('|')
            .map(cell => cell.trim())
            .filter(Boolean);
          return cells;
        }
        return [line]; // Non-table line as a single cell row
      });
      
      // Determine if the first row should be a header
      const hasHeader = rows.length > 0;
      
      return (
        <div key={index} className="mb-6 overflow-x-auto">
          <table className="min-w-full border-collapse table-auto">
            {hasHeader && (
              <thead>
                <tr>
                  {rows[0].map((cell, cellIndex) => (
                    <th 
                      key={cellIndex} 
                      className="py-3 px-4 bg-gray-100 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border border-gray-300"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.slice(hasHeader ? 1 : 0).map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {row.map((cell, cellIndex) => (
                    <td 
                      key={cellIndex} 
                      className="py-3 px-4 whitespace-pre-wrap border border-gray-300 text-sm text-gray-700"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } catch (e) {
      console.error("Error rendering table:", e);
      // Fallback rendering as pre-formatted text
      return (
        <div key={index} className="mb-6 overflow-x-auto bg-gray-50 p-4 rounded-lg border border-gray-300">
          <pre className="whitespace-pre-wrap text-sm text-gray-700">{content}</pre>
        </div>
      );
    }
  };

  // Auto-expand all tables on initial render
  useEffect(() => {
    if (summary) {
      // Set all tables to be expanded by default
      const sections = processSummary(summary);
      const newExpandedState: {[key: number]: boolean} = {};
      
      sections.forEach((section, index) => {
        if (section.type === 'raw-table') {
          newExpandedState[index] = true;
        }
      });
      
      setExpandedTables(newExpandedState);
    }
  }, [summary]);

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
        
        {/* Tooltip for copy button */}
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
        
        {/* Copy button */}
        <MotionButton 
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={copyToClipboard}
          className="absolute top-6 right-6 text-white bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
          title="Kopiëren naar klembord (email-vriendelijk formaat)"
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
        <div 
          ref={contentRef}
          className="max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar text-gray-700 leading-relaxed"
        >
          <div className="space-y-6">
            {sections.map((section, index) => {
              try {
                if (section.type === 'raw-table') {
                  return renderTable(section.content, index);
                } else if (section.type === 'bullet-list' && section.items) {
                  return (
                    <div key={index} className="mb-6">
                      <ul className="list-disc pl-8 space-y-2">
                        {section.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="text-gray-700">{item}</li>
                        ))}
                      </ul>
                    </div>
                  );
                } else {
                  return (
                    <p key={index} className="text-gray-700 mb-4 whitespace-pre-wrap">
                      {section.content}
                    </p>
                  );
                }
              } catch (e) {
                console.error("Error rendering section:", e);
                return (
                  <div key={index} className="mb-6 bg-red-50 p-4 rounded-lg text-red-800">
                    <p className="font-bold">Error rendering content:</p>
                    <p className="whitespace-pre-wrap">{section.content}</p>
                  </div>
                );
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