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
  type: 'section' | 'formatted' | 'paragraph' | 'bullet-list' | 'dash-separator' | 'raw-table' | 'table';
  content: string;
  items?: string[];
  level?: number;
  number?: string;
  title?: string;
  tableLines?: string[];
  tableHeaders?: string[];
  tableRows?: string[][];
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
    
    // Split the text by sections (double newlines)
    const sections = text.split(/\n\n+/);
    const result: string[] = [];
    
    for (const section of sections) {
      // Check if this section contains a table
      if (isTableSection(section)) {
        // Format the table for email
        const formattedTable = formatTableForEmail(section);
        result.push(formattedTable);
      } else {
        // Not a table, add as is
        result.push(section);
      }
    }
    
    return result.join('\n\n');
  };

  // Check if a section of text is a table
  const isTableSection = (text: string): boolean => {
    const lines = text.split('\n');
    
    // A table should have multiple lines with pipe characters
    let pipeLineCount = 0;
    for (const line of lines) {
      if (line.includes('|') && (line.match(/\|/g) || []).length >= 2) {
        pipeLineCount++;
      }
    }
    
    // If more than 2 lines contain pipes, it's likely a table
    return pipeLineCount >= 2;
  };

  // Format a table for email copying
  const formatTableForEmail = (tableText: string): string => {
    const lines = tableText.split('\n');
    const tableRows: string[][] = [];
    
    // Parse each line into cells
    for (const line of lines) {
      // Skip separator lines (those with only dashes, pipes and spaces)
      if (line.match(/^[\s\-|]+$/)) continue;
      
      if (line.includes('|')) {
        // Split by pipes and clean up cells
        const cells = line.split('|')
          .map(cell => cell.trim())
          .filter(Boolean); // Remove empty cells
        
        if (cells.length > 0) {
          tableRows.push(cells);
        }
      } else {
        // Not a table row, could be a caption or other text
        if (line.trim()) {
          tableRows.push([line.trim()]);
        }
      }
    }
    
    // Format with fixed width columns for email
    if (tableRows.length > 0) {
      // Get the maximum number of columns
      const maxColumns = Math.max(...tableRows.map(row => row.length));
      
      // Calculate column widths (max width of each column)
      const columnWidths: number[] = [];
      for (let col = 0; col < maxColumns; col++) {
        const colValues = tableRows.map(row => row[col] || '');
        columnWidths[col] = Math.max(
          ...colValues.map(value => value.length),
          10 // Minimum column width
        );
      }
      
      // Format each row with fixed width columns
      const formattedRows = tableRows.map(row => {
        if (row.length === 1 && !isTableSection(row[0])) {
          // This is a caption or non-table row
          return row[0];
        }
        
        // Format as a table row with proper spacing
        return row.map((cell, idx) => {
          const width = columnWidths[idx] || 10;
          return cell.padEnd(width + 2);
        }).join(' ');
      });
      
      return formattedRows.join('\n');
    }
    
    return tableText; // Fallback to original if parsing fails
  };

  // Parse table from text
  const parseTable = (tableText: string): { headers: string[], rows: string[][] } => {
    const lines = tableText.split('\n');
    let headers: string[] = [];
    const rows: string[][] = [];
    
    // Find table headers and rows
    let headerFound = false;
    
    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Skip separator lines (contain only pipes, dashes and spaces)
      if (line.match(/^[\s\-|]+$/)) continue;
      
      // Process table row
      if (line.includes('|')) {
        const cells = line.split('|')
          .map(cell => cell.trim())
          .filter(Boolean);
        
        if (cells.length > 0) {
          if (!headerFound) {
            headers = cells;
            headerFound = true;
          } else {
            rows.push(cells);
          }
        }
      }
    }
    
    return { headers, rows };
  };

  const copyToClipboard = () => {
    const emailFriendlyText = createEmailFriendlyText(summary || '');
    navigator.clipboard.writeText(emailFriendlyText);
    setCopied(true);
    
    setTimeout(() => {
      setCopied(false);
    }, 2000);
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
      const lines = paragraph.split('\n');
      const tableLines = lines.filter(line => 
        line.includes('|') && (line.match(/\|/g) || []).length >= 2
      );
      
      if (tableLines.length > 0 && tableLines.length >= lines.length * 0.5) {
        // This paragraph is primarily a table
        try {
          // Try to parse as a structured table
          const { headers, rows } = parseTable(paragraph);
          
          if (rows.length > 0) {
            sections.push({
              type: 'table',
              content: paragraph,
              tableHeaders: headers,
              tableRows: rows
            });
          } else {
            // Fallback to raw table display
            sections.push({
              type: 'raw-table',
              content: paragraph,
              tableLines: lines
            });
          }
        } catch (e) {
          // If parsing fails, treat as raw table
          sections.push({
            type: 'raw-table',
            content: paragraph,
            tableLines: lines
          });
        }
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

  // Auto-expand all tables on initial render
  useEffect(() => {
    if (summary) {
      // Set all tables to be expanded by default
      const sections = processSummary(summary);
      const newExpandedState: {[key: number]: boolean} = {};
      
      sections.forEach((section, index) => {
        if (section.type === 'table' || section.type === 'raw-table') {
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
                if (section.type === 'table' && section.tableHeaders && section.tableRows) {
                  // Render structured table
                  return (
                    <div key={index} className="mb-6 overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead className="bg-gray-100">
                          <tr>
                            {section.tableHeaders.map((header, idx) => (
                              <th key={idx} className="py-2 px-4 border border-gray-300 text-left text-sm font-medium text-gray-700">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.tableRows.map((row, rowIdx) => (
                            <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              {row.map((cell, cellIdx) => (
                                <td key={cellIdx} className="py-2 px-4 border border-gray-300 text-sm text-gray-700">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                } else if (section.type === 'raw-table' && section.tableLines) {
                  // Render raw table (pre-formatted)
                  return (
                    <div key={index} className="mb-6 overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <tbody>
                          {section.tableLines.map((line, lineIdx) => {
                            if (line.includes('|')) {
                              // This is a table row
                              const cells = line.split('|')
                                .map(cell => cell.trim())
                                .filter(Boolean);
                              
                              if (cells.length === 0) return null;
                              
                              // Determine if this is a header row (usually the first row or follows a separator)
                              const isHeader = lineIdx === 0 || 
                                (lineIdx > 0 && section.tableLines[lineIdx - 1].match(/^[\s\-|]+$/));
                              
                              if (isHeader) {
                                return (
                                  <tr key={lineIdx} className="bg-gray-100">
                                    {cells.map((cell, cellIdx) => (
                                      <th key={cellIdx} className="py-2 px-4 border border-gray-300 text-left text-sm font-medium text-gray-700">
                                        {cell}
                                      </th>
                                    ))}
                                  </tr>
                                );
                              }
                              
                              return (
                                <tr key={lineIdx} className={lineIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  {cells.map((cell, cellIdx) => (
                                    <td key={cellIdx} className="py-2 px-4 border border-gray-300 text-sm text-gray-700">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              );
                            } else if (line.match(/^[\s\-|]+$/)) {
                              // This is a separator line, skip rendering
                              return null;
                            } else if (line.trim()) {
                              // This is non-table text
                              return (
                                <tr key={lineIdx} className="bg-gray-50">
                                  <td colSpan={20} className="py-2 px-4 border border-gray-300 text-sm text-gray-700">
                                    {line}
                                  </td>
                                </tr>
                              );
                            }
                            return null;
                          }).filter(Boolean)}
                        </tbody>
                      </table>
                    </div>
                  );
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