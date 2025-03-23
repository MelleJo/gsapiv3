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
    
    // Split the summary into lines
    const lines = text.split('\n');
    const result: string[] = [];
    
    let inTable = false;
    let tableStartIndex = -1;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines but add them to output
      if (!line) {
        result.push('');
        continue;
      }
      
      // Check if this line might be part of a table (contains multiple pipe characters)
      const pipeCount = (line.match(/\|/g) || []).length;
      
      if (pipeCount >= 3) {
        // This might be a table row
        if (!inTable) {
          inTable = true;
          tableStartIndex = result.length;
          // Add a blank line before table if needed
          if (result.length > 0 && result[result.length - 1] !== '') {
            result.push('');
          }
        }
        
        // Skip purely decorative lines with just dashes and pipes
        if (line.match(/^[-|\s]+$/)) {
          continue;
        }
        
        // Process row - split by pipes but keep bullet points and other formatting
        const cells = line.split('|')
          .map(cell => cell.trim())
          .filter(cell => cell !== '');
          
        // Build a tab-delimited row, preserving bullets and other formatting
        const formattedRow = cells.join('\t');
        result.push(formattedRow);
      } else {
        // Not a table row
        if (inTable) {
          inTable = false;
          // Add a blank line after table
          result.push('');
        }
        
        // Add the line as is
        result.push(line);
      }
    }
    
    // Join lines back together
    return result.join('\n');
  };

  const copyToClipboard = () => {
    const emailFriendlyText = createEmailFriendlyText(summary || '');
    navigator.clipboard.writeText(emailFriendlyText);
    setCopied(true);
    
    // Show success message and reset after 2 seconds
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  // Toggle expanded state for a specific table
  const toggleTableExpanded = (index: number) => {
    setExpandedTables(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Detect tables with a more robust approach
  const detectTables = (text: string): { tables: string[]; otherContent: string[] } => {
    const lines = text.split('\n');
    const tables: string[] = [];
    const otherContent: string[] = [];
    
    let currentTable: string[] = [];
    let inTable = false;
    let nonTableContent = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check if this line looks like part of a table
      const pipeCount = (trimmedLine.match(/\|/g) || []).length;
      const hasDashes = trimmedLine.includes('-');
      
      // Conditions for a line to be part of a table:
      // 1. Has 3+ pipe characters
      // 2. Is a header/separator line (pipes and dashes)
      const isTableLine = pipeCount >= 3 || (pipeCount >= 1 && hasDashes && trimmedLine.match(/^[-|\s]+$/));
      
      if (isTableLine) {
        // If we were collecting non-table content, add it
        if (nonTableContent.trim()) {
          otherContent.push(nonTableContent.trim());
          nonTableContent = '';
        }
        
        // Start or continue a table
        if (!inTable) {
          inTable = true;
          currentTable = [];
        }
        
        currentTable.push(line);
      } else {
        // Handle end of table
        if (inTable) {
          // Check if this is just a blank line within a table
          if (!trimmedLine && i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            const nextPipeCount = (nextLine.match(/\|/g) || []).length;
            
            // If next line looks like a table row, keep in table
            if (nextPipeCount >= 3) {
              currentTable.push(line);
              continue;
            }
          }
          
          // End the current table
          if (currentTable.length > 0) {
            tables.push(currentTable.join('\n'));
          }
          currentTable = [];
          inTable = false;
        }
        
        // Add to non-table content
        nonTableContent += line + '\n';
      }
    }
    
    // Handle any remaining content
    if (inTable && currentTable.length > 0) {
      tables.push(currentTable.join('\n'));
    }
    
    if (nonTableContent.trim()) {
      otherContent.push(nonTableContent.trim());
    }
    
    return { tables, otherContent };
  };

  // Process the summary text to properly render formatting
  const processSummary = (text: string): Section[] => {
    if (!text) return [];
    
    let sections: Section[] = [];
    
    try {
      // First, extract tables and non-table content
      const { tables, otherContent } = detectTables(text);
      
      // Add tables as raw-table sections
      tables.forEach(tableText => {
        const tableLines = tableText.split('\n').filter(line => line.trim());
        sections.push({
          type: 'raw-table',
          content: tableText,
          tableLines
        });
      });
      
      // Process non-table content
      otherContent.forEach(block => {
        if (!block || !block.trim()) return;
        
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
          safeMatch(block, /^\d+\.\s+/m) ||
          safeMatch(block, /^•\s+/m)
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
              safeMatch(line, /^\d+\.\s+/) ||
              safeMatch(line, /^•\s+/)
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
                safeMatch(lines[i-1], /^\d+\.\s+/) ||
                safeMatch(lines[i-1], /^•\s+/)
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
      });
      
      // Sort sections based on their position in the original text
      sections.sort((a, b) => {
        const posA = text.indexOf(a.content);
        const posB = text.indexOf(b.content);
        return posA - posB;
      });
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

  // Auto-collapse large tables on initial render
  useEffect(() => {
    if (summary && contentRef.current) {
      // Reset expanded state when summary changes
      setExpandedTables({});
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
                } else if (section.type === 'raw-table' && section.tableLines && section.tableLines.length > 0) {
                  // Determine if table should be expanded or collapsed
                  const isExpanded = expandedTables[index] !== false;
                  const tableLines = section.tableLines;
                  
                  // Calculate approximate table size to determine if we should auto-collapse
                  const isLargeTable = tableLines.length > 10;
                  
                  return (
                    <div key={index} className="mb-8">
                      {isLargeTable && (
                        <div className="flex justify-end mb-2">
                          <button 
                            onClick={() => toggleTableExpanded(index)}
                            className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            {isExpanded ? 'Inklappen' : 'Uitklappen'}
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              width="16" 
                              height="16" 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                              className={`ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            >
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                          </button>
                        </div>
                      )}
                      
                      <div className="overflow-x-auto" style={{ overflowWrap: 'break-word', wordWrap: 'break-word' }}>
                        <table className="w-full border-collapse border border-gray-300 text-sm table-fixed">
                          <tbody>
                            {tableLines.slice(0, isExpanded ? tableLines.length : Math.min(5, tableLines.length)).map((line, lineIndex) => {
                              // Check if this is a separator line (only dashes and pipes)
                              const isSeparator = line.match(/^[-|\s]+$/);
                              
                              if (isSeparator) {
                                // Skip separator lines entirely
                                return null;
                              }
                              
                              // Check if this is likely a header row
                              const isHeader = lineIndex === 0 || (lineIndex === 1 && tableLines[0].match(/^[-|\s]+$/));
                              
                              // Replace consecutive ||| with a single |
                              const cleanedLine = line.replace(/\|{2,}/g, '|');
                              
                              // Split the line by | but preserve bullet points
                              const cells = cleanedLine.split('|').map(part => {
                                // Preserve bullet points, clean up whitespace
                                return part.trim();
                              }).filter((cell, i, arr) => {
                                // Skip first and last cell if empty
                                return !(i === 0 && !cell) && !(i === arr.length - 1 && !cell);
                              });
                              
                              return (
                                <tr key={lineIndex} className={isHeader ? "bg-gray-100" : (lineIndex % 2 === 0 ? "bg-white" : "bg-gray-50")}>
                                  {cells.map((cell, cellIndex) => {
                                    // If this is a header cell
                                    if (isHeader) {
                                      return (
                                        <th 
                                          key={cellIndex} 
                                          className="border border-gray-300 px-3 py-2 text-left font-semibold"
                                        >
                                          {cell || '\u00A0'}
                                        </th>
                                      );
                                    }
                                    
                                    // Return normal cell
                                    return (
                                      <td 
                                        key={cellIndex} 
                                        className="border border-gray-300 px-3 py-2 align-top"
                                      >
                                        {cell || '\u00A0'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        
                        {/* Show "Show more" button for large tables */}
                        {!isExpanded && isLargeTable && tableLines.length > 5 && (
                          <div 
                            className="text-center py-2 bg-gray-50 border-t border-gray-300 text-sm text-blue-600 hover:bg-gray-100 cursor-pointer"
                            onClick={() => toggleTableExpanded(index)}
                          >
                            {tableLines.length - 5} meer rijen tonen...
                          </div>
                        )}
                      </div>
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