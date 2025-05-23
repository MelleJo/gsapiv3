// src/app/components/SummaryDisplay.tsx
'use client';

import { useState, useRef, useMemo } from 'react'; // Added useMemo
import React, { ReactNode } from 'react';
import Markdown from 'markdown-to-jsx';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2 } from 'lucide-react'; // Import icons

// Removed MotionDiv and MotionButton definitions

// --- Custom Components for Markdown Overrides ---
// Add ReactNode type for children
// Increased table margin
const MyTable = ({ children, ...props }: { children?: ReactNode }) => <table className="min-w-full border-collapse border border-gray-300 my-8 text-sm rounded-lg overflow-hidden shadow" {...props}>{children}</table>;
const MyThead = ({ children, ...props }: { children?: ReactNode }) => <thead className="bg-gray-200" {...props}>{children}</thead>;
const MyTbody = ({ children, ...props }: { children?: ReactNode }) => <tbody className="divide-y divide-gray-200" {...props}>{children}</tbody>;
const MyTr = ({ children, ...props }: { children?: ReactNode }) => <tr className="hover:bg-gray-50" {...props}>{children}</tr>;
const MyTh = ({ children, ...props }: { children?: ReactNode }) => <th className="border-l border-r border-gray-300 px-4 py-3 text-left font-medium text-gray-800 bg-gray-100 first:border-l-0 last:border-r-0" {...props}>{children}</th>;
const MyTd = ({ children, ...props }: { children?: ReactNode }) => <td className="border-l border-r border-gray-300 px-4 py-3 text-gray-700 align-top first:border-l-0 last:border-r-0" {...props}>{children}</td>;
// Increased paragraph bottom margin
const MyP = ({ children, ...props }: { children?: ReactNode }) => <p className="mb-5" {...props}>{children}</p>;
// Increased list bottom margin and item spacing
const MyUl = ({ children, ...props }: { children?: ReactNode }) => <ul className="list-disc pl-6 mb-5 space-y-2" {...props}>{children}</ul>;
const MyOl = ({ children, ...props }: { children?: ReactNode }) => <ol className="list-decimal pl-6 mb-5 space-y-2" {...props}>{children}</ol>; // Corrected closing tag implicitly
const MyLi = ({ children, ...props }: { children?: ReactNode }) => <li className="mb-2" {...props}>{children}</li>; // Slightly more space between list items
// Increased heading margins
const MyH2 = ({ children, ...props }: { children?: ReactNode }) => <h2 className="text-2xl font-semibold mt-8 mb-5 border-b border-gray-300 pb-2 text-gray-800" {...props}>{children}</h2>;
const MyH3 = ({ children, ...props }: { children?: ReactNode }) => <h3 className="text-xl font-medium mt-6 mb-4 text-gray-700" {...props}>{children}</h3>;
const MyStrong = ({ children, ...props }: { children?: ReactNode }) => <strong className="font-semibold text-gray-900" {...props}>{children}</strong>;
// Increased hr margin
const MyHr = ({ ...props }) => <hr className="my-8 border-t border-gray-200" {...props} />;
// --- End Custom Components ---

// Helper function to check if a line looks like a pipe-separated table row
const isPipeTableRow = (line: string): boolean => {
  const trimmed = line.trim();
  // Must start and end with '|' and contain at least one more '|' inside
  // Also check it doesn't look like a markdown separator line |---|---|
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.slice(1, -1).includes('|') && !trimmed.match(/^\|-*\|(?:-*\|)*$/);
};

// Helper function to parse a pipe-separated row into cells
const parsePipeRow = (line: string): string[] => {
  return line.trim().slice(1, -1).split('|').map(cell => cell.trim());
};


interface SummaryDisplayProps {
  summary: string;
  isLoading: boolean;
}

export default function SummaryDisplay({ summary, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = async () => {
    if (!summary) return;

    let plainTextContent = '';
    let htmlContent = '';

    // Simple markdown to HTML conversion for basic elements (paragraphs, line breaks)
    const markdownToSimpleHtml = (markdown: string): string => {
        // Replace double newlines with paragraph tags
        let html = markdown.split('\n\n').map(paragraph => `<p>${paragraph.trim()}</p>`).join('');
        // Replace single newlines within paragraphs with <br> (if not already handled by <p>)
        html = html.replace(/(<p>.*?)\n(.*?<\/p>)/g, '$1<br>$2');
        return html;
    };

    // Function to generate HTML table from parsed table content
    const generateHtmlTable = (tableContent: string[][]): string => {
        if (tableContent.length === 0) return '';

        let html = '<table style="border-collapse: collapse; width: 100%;">'; // Add basic inline styles for compatibility
        const hasHeaders = tableContent[0].length > 0; // Assuming first row is header

        // Add header
        if (hasHeaders) {
            html += '<thead><tr>';
            tableContent[0].forEach(header => {
                html += `<th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">${header.trim()}</th>`; // Add basic inline styles
            });
            html += '</tr></thead>';
        }

        // Add body
        html += '<tbody>';
        const rows = hasHeaders ? tableContent.slice(1) : tableContent;
        rows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${cell.trim()}</td>`; // Add basic inline styles
            });
            html += '</tr>';
        });
        html += '</tbody>';
        html += '</table>';
        return html;
    };


    parsedContent.forEach(item => {
      if (item.type === 'markdown' && typeof item.content === 'string') {
        plainTextContent += item.content + '\n'; // Keep original markdown for plain text
        htmlContent += markdownToSimpleHtml(item.content) + '\n'; // Convert markdown to simple HTML
      } else if (item.type === 'table' && Array.isArray(item.content)) {
        // For plain text, recreate the markdown table format
        plainTextContent += item.content.map(row => '| ' + row.join(' | ') + ' |').join('\n') + '\n';
        // Add the separator line for plain text markdown table
        if (item.content.length > 0) {
             plainTextContent += '|' + item.content[0].map(() => '---|').join('') + '|\n';
        }
        htmlContent += generateHtmlTable(item.content) + '\n'; // Generate HTML table
      }
    });
 
    try {
      // Use the modern Clipboard API for rich text
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([plainTextContent], { type: 'text/plain' }),
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
        }),
      ]);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy content: ', err);
      // Fallback to old method if modern API fails
      navigator.clipboard.writeText(plainTextContent);
      setCopied(true); // Still indicate copied, though it's just plain text
    }

    setTimeout(() => setCopied(false), 2000);
  };

  // Parse the summary content to separate markdown text and pseudo-tables
  const parsedContent = useMemo(() => {
    if (!summary) return [];

    const lines = summary.split('\n');
    const result: Array<{ type: 'markdown' | 'table'; content: string | string[][] }> = [];
    let currentTable: string[][] | null = null;
    let currentMarkdown = '';

    lines.forEach((line) => {
      // Skip empty lines or lines that are just markdown table separators
      if (!line.trim() || line.trim().match(/^\|-*\|(?:-*\|)*$/)) {
         // If we were building markdown, add it before skipping
         if (currentMarkdown) {
            result.push({ type: 'markdown', content: currentMarkdown }); // Keep trailing newlines for spacing
            currentMarkdown = '';
         }
         // If we were building a table, add it before skipping
         if (currentTable) {
             result.push({ type: 'table', content: currentTable });
             currentTable = null;
         }
         // Add the separator/empty line as markdown if it's not part of table detection logic
         if (!line.trim().match(/^\|-*\|(?:-*\|)*$/)) {
             currentMarkdown += line + '\n';
         }
         return; // Skip processing this line further
      }


      if (isPipeTableRow(line)) {
        if (currentMarkdown) {
          // Add pending markdown block (trim end only to preserve internal structure)
          result.push({ type: 'markdown', content: currentMarkdown.replace(/\n$/, '') });
          currentMarkdown = '';
        }
        if (!currentTable) {
          currentTable = []; // Start a new table
        }
        currentTable.push(parsePipeRow(line));
      } else {
        // This line is not a table row
        if (currentTable) {
          // Finalize the previous table block
          result.push({ type: 'table', content: currentTable });
          currentTable = null;
        }
        // Add line to the current markdown block
        currentMarkdown += line + '\n';
      }
    });

    // Add any remaining content
    if (currentTable) {
      result.push({ type: 'table', content: currentTable });
    }
    if (currentMarkdown) {
       // Add remaining markdown block (trim end only)
      result.push({ type: 'markdown', content: currentMarkdown.replace(/\n$/, '') });
    }

    return result;
  }, [summary]);


  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Samenvatting Laden...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-full"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) { return null; }

  const markdownOptions = {
    overrides: {
      table: { component: MyTable },
      thead: { component: MyThead },
      tbody: { component: MyTbody },
      tr: { component: MyTr },
      th: { component: MyTh },
      td: { component: MyTd },
      p: { component: MyP },
      ul: { component: MyUl },
      ol: { component: MyOl },
      li: { component: MyLi },
      h2: { component: MyH2 },
      h3: { component: MyH3 },
      strong: { component: MyStrong },
      hr: { component: MyHr },
    }
  };

  return (
    // Override Card styles for SummaryDisplay: white bg, dark text
    <Card className="overflow-hidden bg-white text-gray-900 border border-gray-200 shadow-md">
      {/* Adjust Header for white background */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-gray-50 border-b border-gray-200">
        <CardTitle className="text-xl font-semibold text-gray-800"> {/* Darker title */}
          Samenvatting
        </CardTitle>
        {/* Adjust copy button for light background */}
        <Button variant="ghost" size="icon" onClick={copyToClipboard} aria-label="Kopieer samenvatting" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100">
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <CardContent className="p-6">
         {/* Ensure container text color is dark */}
        <div ref={contentRef} className="max-w-none max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar text-sm text-gray-800"> {/* Set base text color */}
          {parsedContent.map((item, index) => {
            // Render Table Block - Ensure table components use appropriate colors for light bg
            if (item.type === 'table' && Array.isArray(item.content) && item.content.length > 0) {
              const headers = item.content[0];
              const rows = item.content.slice(1);
              // Basic check if the first row looks like headers (optional, but good practice)
              const hasHeaders = headers.length > 0; // Assuming first row is always header

              return (
                <MyTable key={`table-${index}`}>
                  {hasHeaders && (
                    <MyThead>
                      <MyTr>
                        {headers.map((header, hIndex) => (
                          <MyTh key={`th-${index}-${hIndex}`}>{header}</MyTh>
                        ))}
                      </MyTr>
                    </MyThead>
                  )}
                  <MyTbody>
                    {/* Render rows starting from index 0 if no headers, 1 otherwise */}
                    {(hasHeaders ? rows : item.content).map((row, rIndex) => (
                      <MyTr key={`tr-${index}-${rIndex}`}>
                        {row.map((cell, cIndex) => (
                          <MyTd key={`td-${index}-${rIndex}-${cIndex}`}>
                            {/* Render cell content using Markdown again */}
                            <Markdown options={markdownOptions}>{cell || ''}</Markdown>
                          </MyTd>
                        ))}
                      </MyTr>
                    ))}
                  </MyTbody>
                </MyTable>
              );
            // Render Markdown Block
            } else if (item.type === 'markdown' && typeof item.content === 'string' && item.content.trim()) {
              return <Markdown key={`md-${index}`} options={markdownOptions}>{item.content}</Markdown>;
            }
            // Skip rendering empty markdown blocks entirely
            return null; // Return null for empty blocks or unhandled types
          })}
        </div>
      </CardContent>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: hsl(var(--muted)); border-radius: 10px; } /* Use theme color */
        .custom-scrollbar::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 10px; } /* Use theme color */
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--input)); } /* Use theme color */
       `}</style>
     </Card>
   );
}
