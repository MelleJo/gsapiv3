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
    
    const paragraphs = text.split(/\n\n+/);
    const result: string[] = [];
    
    for (const paragraph of paragraphs) {
      if (isTableSection(paragraph)) {
        // It's a table, format it specially for email
        result.push(formatTableForEmail(paragraph));
      } else {
        // Not a table, wrap in a paragraph
        result.push(`<p style="margin: 0 0 16px 0; color: #111827;">${paragraph}</p>`);
      }
    }
    
    return result.join('\n\n');
  };

  // Check if a section of text contains a table
  const isTableSection = (text: string): boolean => {
    const lines = text.split('\n').map(line => line.trim());
    if (lines.length < 2) return false;

    // Look for section headers and table structure
    let hasTableHeader = false;
    let hasTableContent = false;

    for (const line of lines) {
      if (line.endsWith("Risico's:")) {
        hasTableHeader = true;
      }
      if (line.includes('|') || line.match(/^[-]+$/)) {
        hasTableContent = true;
      }
    }

    return hasTableHeader || hasTableContent;
  };

  interface TableCell {
    content: string;
    align?: 'left' | 'center' | 'right';
  }

  interface TableRow {
    cells: TableCell[];
  }

  interface TableSection {
    title?: string;
    subtitle?: string;
    headers: TableCell[];
    rows: TableRow[];
  }

  // Parse markdown table alignment from separator row
  const parseColumnAlignment = (separator: string): ('left' | 'center' | 'right')[] => {
    return separator
      .split('|')
      .filter(Boolean)
      .map(cell => {
        cell = cell.trim();
        if (cell.startsWith(':') && cell.endsWith(':')) return 'center' as const;
        if (cell.endsWith(':')) return 'right' as const;
        return 'left' as const;
      });
  };

  // Parse a row of the markdown table
  const parseTableRow = (line: string): TableCell[] => {
    return line
      .split('|')
      .filter(Boolean)
      .map(cell => ({
        content: cell.trim(),
        align: 'left' as const
      }));
  };

  // Format a table for email with HTML
  const formatTableForEmail = (tableText: string): string => {
    try {
      const tables = parseTable(tableText);
      let formattedHtml = '';
      
      tables.forEach((table) => {
        formattedHtml += `
          <div style="margin-bottom: 24px;">
            ${table.title ? `
              <h3 style="font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 8px 0;">
                ${table.title}
              </h3>
            ` : ''}
            ${table.subtitle ? `
              <p style="font-size: 14px; color: #4B5563; margin: 0 0 16px 0;">
                ${table.subtitle}
              </p>
            ` : ''}
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #D1D5DB; font-size: 14px; margin: 0;">
              <thead>
                <tr style="background-color: #F3F4F6;">
                  <th style="width: 15%; padding: 8px; border: 1px solid #D1D5DB; text-align: left; font-weight: 600;">Risico</th>
                  <th style="width: 10%; padding: 8px; border: 1px solid #D1D5DB; text-align: center; font-weight: 600;">Besproken</th>
                  <th style="width: 35%; padding: 8px; border: 1px solid #D1D5DB; text-align: left; font-weight: 600;">Bespreking Details</th>
                  <th style="width: 25%; padding: 8px; border: 1px solid #D1D5DB; text-align: left; font-weight: 600;">Actie</th>
                  <th style="width: 15%; padding: 8px; border: 1px solid #D1D5DB; text-align: left; font-weight: 600;">Actie voor</th>
                </tr>
              </thead>
              <tbody>
                ${table.rows.map(row => `
                  <tr style="background-color: #FFFFFF;">
                    <td style="padding: 8px; border: 1px solid #D1D5DB; text-align: left; vertical-align: top;">${row.cells[0]?.content || ''}</td>
                    <td style="padding: 8px; border: 1px solid #D1D5DB; text-align: center;">${row.cells[1]?.content || ''}</td>
                    <td style="padding: 8px; border: 1px solid #D1D5DB; text-align: left; vertical-align: top;">${row.cells[2]?.content || ''}</td>
                    <td style="padding: 8px; border: 1px solid #D1D5DB; text-align: left; vertical-align: top;">${row.cells[3]?.content || ''}</td>
                    <td style="padding: 8px; border: 1px solid #D1D5DB; text-align: left;">${row.cells[4]?.content || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      });
      
      return formattedHtml;
    } catch (e) {
      console.error("Error formatting table for email:", e);
      return tableText;
    }
  };

  // Parse table into structured format
  const parseTable = (tableText: string): TableSection[] => {
    const sections: TableSection[] = [];
    const lines = tableText.split('\n');
    let title: string | undefined;
    let currentTable: TableSection | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Check for section title
      if (line.endsWith("Risico's:")) {
        if (currentTable) {
          sections.push(currentTable);
        }
        title = line;
        currentTable = {
          title,
          headers: [
            { content: 'Risico', align: 'left' as const },
            { content: 'Besproken', align: 'center' as const },
            { content: 'Bespreking Details', align: 'left' as const },
            { content: 'Actie', align: 'left' as const },
            { content: 'Actie voor', align: 'left' as const }
          ],
          rows: []
        };
        continue;
      }
      
      // Skip separator lines
      if (line.match(/^[-]+$/)) continue;
      
      // Process table rows
      if (currentTable && line.includes('|')) {
        const cells = line.split('|')
          .map(cell => cell.trim())
          .filter(Boolean)
          .map((content, index) => ({
            content,
            align: index === 1 ? ('center' as const) : ('left' as const)
          }));
        
        if (cells.length > 0) {
          // Ensure we have exactly 5 cells
          while (cells.length < 5) {
            cells.push({ content: '', align: 'left' as const });
          }
          currentTable.rows.push({ cells: cells.slice(0, 5) });
        }
      }
    }
    
    if (currentTable) {
      sections.push(currentTable);
    }
    
    return sections;
  };
  
  const copyToClipboard = async () => {
    try {
      const emailFriendlyText = createEmailFriendlyText(summary || '');
      
      // Create a temporary element to hold the HTML content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = emailFriendlyText;
      
      // Use the Clipboard API to copy HTML content
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([tempDiv.innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([tempDiv.innerText], { type: 'text/plain' })
        })
      ]);
      
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback to plain text
      navigator.clipboard.writeText(summary || '');
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  // Process the summary text to properly render formatting
  const processSummary = (text: string): Section[] => {
    if (!text) return [];
    const paragraphs = text.split(/\n\n+/);
    const sections: Section[] = [];
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      if (isTableSection(paragraph)) {
        sections.push({
          type: 'raw-table',
          content: paragraph
        });
      } else if (paragraph.match(/^[•*-]\s+/m) || paragraph.match(/^\d+\.\s+/m)) {
        const items = paragraph
          .split('\n')
          .filter(line => line.trim().match(/^[•*-]\s+/) || line.trim().match(/^\d+\.\s+/));
        sections.push({
          type: 'bullet-list',
          content: paragraph,
          items
        });
      } else {
        sections.push({
          type: 'paragraph',
          content: paragraph
        });
      }
    }
    return sections;
  };

  useEffect(() => {
    if (summary) {
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
    sections = [{ type: 'paragraph', content: summary }];
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
                  const tables = parseTable(section.content);
                  return (
                    <div key={index} className="mb-6 space-y-8">
                      {tables.map((table, tableIndex) => (
                        <div key={tableIndex}>
                          <div className="mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {table.title}
                            </h3>
                            {table.subtitle && (
                              <p className="text-sm text-gray-600 mt-1">
                                {table.subtitle}
                              </p>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <div className="inline-block min-w-full align-middle">
                              <table className="min-w-full border-collapse border border-gray-300" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                  <col style={{ width: '15%' }} />
                                  <col style={{ width: '10%' }} />
                                  <col style={{ width: '35%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '15%' }} />
                                </colgroup>
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="p-2 border border-gray-300 text-left font-semibold">Risico</th>
                                    <th className="p-2 border border-gray-300 text-center font-semibold">Besproken</th>
                                    <th className="p-2 border border-gray-300 text-left font-semibold">Bespreking Details</th>
                                    <th className="p-2 border border-gray-300 text-left font-semibold">Actie</th>
                                    <th className="p-2 border border-gray-300 text-left font-semibold">Actie voor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {table.rows.map((row, rowIndex) => (
                                    <tr key={rowIndex} className="hover:bg-gray-50">
                                      <td className="p-2 border border-gray-300 text-left align-top whitespace-pre-wrap">{row.cells[0]?.content || ''}</td>
                                      <td className="p-2 border border-gray-300 text-center">{row.cells[1]?.content || ''}</td>
                                      <td className="p-2 border border-gray-300 text-left align-top whitespace-pre-wrap">{row.cells[2]?.content || ''}</td>
                                      <td className="p-2 border border-gray-300 text-left align-top whitespace-pre-wrap">{row.cells[3]?.content || ''}</td>
                                      <td className="p-2 border border-gray-300 text-left whitespace-pre-wrap">{row.cells[4]?.content || ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      ))}
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
