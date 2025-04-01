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
const MyTable = ({ children, ...props }: { children?: ReactNode }) => <table className="min-w-full border-collapse border border-gray-300 my-6 text-sm rounded-lg overflow-hidden shadow" {...props}>{children}</table>; // Added shadow
const MyThead = ({ children, ...props }: { children?: ReactNode }) => <thead className="bg-gray-200" {...props}>{children}</thead>;
const MyTbody = ({ children, ...props }: { children?: ReactNode }) => <tbody className="divide-y divide-gray-200" {...props}>{children}</tbody>; // Added divide for horizontal lines
const MyTr = ({ children, ...props }: { children?: ReactNode }) => <tr className="hover:bg-gray-50" {...props}>{children}</tr>; // Removed border-b (handled by tbody divide)
const MyTh = ({ children, ...props }: { children?: ReactNode }) => <th className="border-l border-r border-gray-300 px-4 py-3 text-left font-medium text-gray-800 bg-gray-100 first:border-l-0 last:border-r-0" {...props}>{children}</th>; // Added border-l/r, removed top/bottom border, handle edges
const MyTd = ({ children, ...props }: { children?: ReactNode }) => <td className="border-l border-r border-gray-300 px-4 py-3 text-gray-700 align-top first:border-l-0 last:border-r-0" {...props}>{children}</td>; // Added border-l/r, removed top/bottom border, handle edges, align-top
const MyP = ({ children, ...props }: { children?: ReactNode }) => <p className="mb-4" {...props}>{children}</p>; // Adjusted mb-5 to mb-4 for consistency
const MyUl = ({ children, ...props }: { children?: ReactNode }) => <ul className="list-disc pl-6 mb-4 space-y-1" {...props}>{children}</ul>; // Adjusted mb-5 to mb-4, added space-y-1
const MyOl = ({ children, ...props }: { children?: ReactNode }) => <ol className="list-decimal pl-6 mb-4 space-y-1" {...props}>{children}</ol>; // Adjusted mb-5 to mb-4, added space-y-1
const MyLi = ({ children, ...props }: { children?: ReactNode }) => <li className="mb-1" {...props}>{children}</li>; // Adjusted mb-2 to mb-1 (space-y on parent handles list item spacing)
const MyH2 = ({ children, ...props }: { children?: ReactNode }) => <h2 className="text-2xl font-semibold mt-6 mb-3 border-b border-gray-300 pb-2 text-gray-800" {...props}>{children}</h2>; // Adjusted margins/border
const MyH3 = ({ children, ...props }: { children?: ReactNode }) => <h3 className="text-xl font-medium mt-5 mb-2 text-gray-700" {...props}>{children}</h3>; // Adjusted margins
const MyStrong = ({ children, ...props }: { children?: ReactNode }) => <strong className="font-semibold text-gray-900" {...props}>{children}</strong>;
const MyHr = ({ ...props }) => <hr className="my-6 border-t border-gray-200" {...props} />; // Adjusted margin
// --- End Custom Components ---

// Helper function to check if a line looks like a pipe-separated table row
const isPipeTableRow = (line: string): boolean => {
  const trimmed = line.trim();
  // Must start and end with '|' and contain at least one more '|' inside
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.slice(1, -1).includes('|');
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

  const copyToClipboard = () => {
    // Try to copy the rendered text content first for better formatting
    let textToCopy = summary || ''; // Fallback to raw summary
    if (contentRef.current) {
      textToCopy = contentRef.current.innerText || textToCopy;
    }
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
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
      if (isPipeTableRow(line)) {
        if (currentMarkdown) {
          result.push({ type: 'markdown', content: currentMarkdown.trim() });
          currentMarkdown = '';
        }
        if (!currentTable) {
          currentTable = [];
        }
        currentTable.push(parsePipeRow(line));
      } else {
        if (currentTable) {
          result.push({ type: 'table', content: currentTable });
          currentTable = null;
        }
        currentMarkdown += line + '\n';
      }
    });

    // Add any remaining content
    if (currentTable) {
      result.push({ type: 'table', content: currentTable });
    }
    if (currentMarkdown) {
      result.push({ type: 'markdown', content: currentMarkdown.trim() });
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
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-muted/30 border-b">
        <CardTitle className="text-xl font-semibold">
          Samenvatting
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={copyToClipboard} aria-label="Kopieer samenvatting">
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <CardContent className="p-6">
        <div ref={contentRef} className="prose prose-sm max-w-none max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
          {parsedContent.map((item, index) => {
            if (item.type === 'table' && Array.isArray(item.content) && item.content.length > 0) {
              const headers = item.content[0];
              const rows = item.content.slice(1);
              return (
                <MyTable key={`table-${index}`}>
                  <MyThead>
                    <MyTr>
                      {headers.map((header, hIndex) => (
                        <MyTh key={`th-${index}-${hIndex}`}>{header}</MyTh>
                      ))}
                    </MyTr>
                  </MyThead>
                  <MyTbody>
                    {rows.map((row, rIndex) => (
                      <MyTr key={`tr-${index}-${rIndex}`}>
                        {row.map((cell, cIndex) => (
                          <MyTd key={`td-${index}-${rIndex}-${cIndex}`}>
                            {/* Render cell content as markdown to handle potential inline formatting */}
                            <Markdown options={markdownOptions}>{cell || ''}</Markdown>
                          </MyTd>
                        ))}
                      </MyTr>
                    ))}
                  </MyTbody>
                </MyTable>
              );
            } else if (item.type === 'markdown' && typeof item.content === 'string') {
              // Render regular markdown sections
              return <Markdown key={`md-${index}`} options={markdownOptions}>{item.content}</Markdown>;
            }
            return null; // Should not happen
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
