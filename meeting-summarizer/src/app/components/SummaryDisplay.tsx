// src/app/components/SummaryDisplay.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';

// Define MotionDiv and MotionButton components
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
  summary: string; // Raw Markdown for copy logic
  summaryHtml: string; // HTML for display
  isLoading: boolean;
}

// --- Helper functions for Copy-to-Clipboard Logic ---
// Interfaces for parsed table data
interface TableRow { cells: string[]; }
interface TableSection {
  title?: string; subtitle?: string; headers: string[]; rows: TableRow[]; alignments?: (string | null)[];
}
// Check if a block of text looks like a Markdown table
const isTableSection = (text: string): boolean => {
  const lines = text.split('\n'); let pipeLineCount = 0; let separatorLineFound = false;
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.includes('|')) {
      pipeLineCount++;
      if (trimmedLine.match(/^\|?\s*:(?!--)-+:(?!--)\s*\|?$/) || trimmedLine.match(/^\|?\s*:(?!--)-+\s*\|?$/) || trimmedLine.match(/^\|?\s*-+:(?!--)\s*\|?$/) || trimmedLine.match(/^\|?\s*-+\s*\|?$/)) {
         if (trimmedLine.split('|').slice(1, -1).every(seg => seg.trim().match(/^:?-+:?$/))) { separatorLineFound = true; }
      }
    }
  }
  return pipeLineCount >= 3 && separatorLineFound;
};
// Parse Markdown table text into structured data
const parseMarkdownTable = (tableText: string): TableSection[] => {
  const sections: TableSection[] = []; let currentSection: TableSection | null = null; let lines = tableText.split('\n'); let lineIndex = 0;
  while (lineIndex < lines.length) {
    let line = lines[lineIndex].trim();
    if (!line.includes('|') && line.length > 0 && lines[lineIndex + 1]?.trim().includes('|')) {
       if (currentSection) sections.push(currentSection);
       currentSection = { headers: [], rows: [], alignments: [], title: line };
       let nextLine = lines[lineIndex + 1]?.trim();
       if (nextLine && !nextLine.includes('|') && lines[lineIndex + 2]?.trim().includes('|')) { currentSection.subtitle = nextLine; lineIndex++; }
       lineIndex++; line = lines[lineIndex]?.trim();
    } else if (!currentSection && line.includes('|')) { currentSection = { headers: [], rows: [], alignments: [] }; }
    if (!currentSection || !line) { lineIndex++; continue; }
    if (currentSection.headers.length === 0 && line.includes('|')) {
      currentSection.headers = line.split('|').map(h => h.trim()).filter((h, i, arr) => i !== 0 || i !== arr.length -1 || h); lineIndex++; line = lines[lineIndex]?.trim();
      if (line && line.includes('|') && line.includes('-')) {
         const segments = line.split('|').map(s => s.trim()).filter((s, i, arr) => i !== 0 || i !== arr.length -1 || s);
         currentSection.alignments = segments.map(seg => { if (seg.startsWith(':') && seg.endsWith(':')) return 'center'; if (seg.startsWith(':')) return 'left'; if (seg.endsWith(':')) return 'right'; return null; });
         lineIndex++; line = lines[lineIndex]?.trim();
      } else { currentSection.headers = []; currentSection.alignments = []; continue; }
    }
    if (currentSection.headers.length > 0 && line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter((c, i, arr) => i !== 0 || i !== arr.length -1 || c);
      if (cells.length === currentSection.headers.length) { currentSection.rows.push({ cells }); }
      else { if(cells.length > 0) currentSection.rows.push({ cells }); }
    } else if (currentSection.headers.length > 0 && !line.includes('|')) { if (currentSection) sections.push(currentSection); currentSection = null; }
    lineIndex++;
  }
  if (currentSection) sections.push(currentSection);
  return sections.filter(s => s.headers.length > 0 && s.rows.length > 0);
};
// Format parsed table data into pre-formatted plain text
const formatTableForPlainText = (tableData: TableSection): string => {
  const colCount = tableData.headers.length; if (colCount === 0) return '';
  const colWidths: number[] = tableData.headers.map(h => h.length);
  tableData.rows.forEach(row => { row.cells.forEach((cell, i) => { if (i < colCount) { colWidths[i] = Math.max(colWidths[i] || 0, cell.length); } }); });
  const padCell = (text: string, width: number, align: string | null): string => {
    const padding = width - text.length; if (align === 'right') { return ' '.repeat(padding) + text; } else if (align === 'center') { const leftPad = Math.floor(padding / 2); const rightPad = padding - leftPad; return ' '.repeat(leftPad) + text + ' '.repeat(rightPad); } else { return text + ' '.repeat(padding); }
  };
  let output = ''; if (tableData.title) output += `${tableData.title}\n`; if (tableData.subtitle) output += `${tableData.subtitle}\n`;
  const headerLine = tableData.headers.map((header, i) => padCell(header, colWidths[i], tableData.alignments?.[i] ?? null)).join(' | '); output += `| ${headerLine} |\n`;
  const separatorLineAdjusted = colWidths.map((width, i) => { const align = tableData.alignments?.[i] ?? null; const dashWidth = colWidths[i]; if (align === 'center') return `:${'-'.repeat(dashWidth > 1 ? dashWidth - 2 : 0)}:`; if (align === 'left') return `:${'-'.repeat(dashWidth > 0 ? dashWidth -1 : 0)}`; if (align === 'right') return `${'-'.repeat(dashWidth > 0 ? dashWidth -1 : 0)}:`; return '-'.repeat(dashWidth); }).join(' | '); output += `| ${separatorLineAdjusted} |\n`;
  tableData.rows.forEach(row => { const rowLine = row.cells.map((cell, i) => padCell(cell, colWidths[i], tableData.alignments?.[i] ?? null)).join(' | '); output += `| ${rowLine} |\n`; });
  return output;
};
// --- End Helper functions ---


export default function SummaryDisplay({ summary, summaryHtml, isLoading }: SummaryDisplayProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Updated copyToClipboard function
  const copyToClipboard = () => {
    if (!summary) return;
    try {
      const sections = summary.split(/(\n\n+|(?=\n(?:Zakelijke Risico's:|Privé Risico's:)))/);
      let clipboardText = '';
      for (const section of sections) {
        if (!section || section.trim() === '') continue;
        if (isTableSection(section)) {
          const parsedTables = parseMarkdownTable(section);
          parsedTables.forEach(table => { clipboardText += formatTableForPlainText(table) + '\n\n'; });
        } else { clipboardText += section.trim() + '\n\n'; }
      }
      navigator.clipboard.writeText(clipboardText.trim());
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error preparing text for clipboard:", error);
      navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  // Loading state
  if (isLoading) { return ( <div className="bg-white rounded-2xl shadow-lg p-6"><div className="animate-pulse">...</div></div> ); }
  // No summary
  if (!summaryHtml) { return null; }

  // Animation variants
  const containerVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
  const buttonVariants = { hover: { scale: 1.05 }, tap: { scale: 0.95 } };

  return (
    <MotionDiv variants={containerVariants} initial="hidden" animate="visible" className="bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 text-white">
        <h2 className="text-2xl font-bold flex items-center pr-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">...</svg>
          Samenvatting
        </h2>
        {/* Tooltip */}
        <AnimatePresence> {copied && ( <MotionDiv className="absolute top-16 right-8 ...">Gekopieerd!</MotionDiv> )} </AnimatePresence>
        {/* Copy button */}
        <MotionButton variants={buttonVariants} whileHover="hover" whileTap="tap" onClick={copyToClipboard} className="absolute top-6 right-6 ..." title="Kopiëren (pre-formatted text)" type="button">
          {copied ? ( <svg>...</svg> ) : ( <svg>...</svg> )}
        </MotionButton>
      </div>

      {/* Content area - Render pre-generated HTML */}
      <div className="p-8">
        <div ref={contentRef} className="max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
           {/* Apply prose styles DIRECTLY to the div rendering the HTML */}
           <div
             className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none"
             dangerouslySetInnerHTML={{ __html: summaryHtml }}
           />
         </div>
       </div>

      {/* Styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }

         /* Basic table styling (applied directly to HTML elements via prose) */
         /* Ensure prose styles are sufficient, otherwise add specific overrides here */
         /* Example: Force borders if prose doesn't add them reliably */
         .prose table { border-collapse: collapse; width: 100%; margin-top: 1em; margin-bottom: 1em; }
         .prose th, .prose td { border: 1px solid #e5e7eb; padding: 0.5em 1em; vertical-align: top; text-align: left; }
         .prose th { background-color: #f9fafb; font-weight: 600; }
       `}</style>
     </MotionDiv>
   );
}
