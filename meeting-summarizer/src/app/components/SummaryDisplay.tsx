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
interface TableRow {
  cells: string[];
}
interface TableSection {
  title?: string; // Optional title like "Zakelijke Risico's:"
  subtitle?: string; // Optional subtitle like "Per bv..."
  headers: string[];
  rows: TableRow[];
  alignments?: (string | null)[]; // Store alignment info if present
}

// Check if a block of text looks like a Markdown table
const isTableSection = (text: string): boolean => {
  const lines = text.split('\n');
  let pipeLineCount = 0;
  let separatorLineFound = false;
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.includes('|')) {
      pipeLineCount++;
      // Check for separator line like |---|---|
      if (trimmedLine.match(/^\|?\s*:(?!--)-+:(?!--)\s*\|?$/) || // Center-aligned
          trimmedLine.match(/^\|?\s*:(?!--)-+\s*\|?$/) ||       // Left-aligned
          trimmedLine.match(/^\|?\s*-+:(?!--)\s*\|?$/) ||       // Right-aligned
          trimmedLine.match(/^\|?\s*-+\s*\|?$/)) {              // Default-aligned
         // More robust check for separator line structure
         if (trimmedLine.split('|').slice(1, -1).every(seg => seg.trim().match(/^:?-+:?$/))) {
            separatorLineFound = true;
         }
      }
    }
  }
  // Require at least a header, separator, and one row of data
  return pipeLineCount >= 3 && separatorLineFound;
};

// Parse Markdown table text into structured data
const parseMarkdownTable = (tableText: string): TableSection[] => {
  const sections: TableSection[] = [];
  let currentSection: TableSection | null = null;
  let lines = tableText.split('\n');
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    let line = lines[lineIndex].trim();

    // Detect potential section headers (like "Zakelijke Risico's:")
    if (!line.includes('|') && line.length > 0 && lines[lineIndex + 1]?.trim().includes('|')) {
       if (currentSection) sections.push(currentSection); // Save previous section

       currentSection = { headers: [], rows: [], alignments: [], title: line };

       // Check for subtitle
       let nextLine = lines[lineIndex + 1]?.trim();
       if (nextLine && !nextLine.includes('|') && lines[lineIndex + 2]?.trim().includes('|')) {
          currentSection.subtitle = nextLine;
          lineIndex++; // Skip subtitle line
       }
       lineIndex++; // Move to header line
       line = lines[lineIndex]?.trim();
    } else if (!currentSection && line.includes('|')) {
        // Start a new section if none exists and we find a table line
        currentSection = { headers: [], rows: [], alignments: [] };
    }

    if (!currentSection || !line) {
        lineIndex++;
        continue;
    }

    // Process Header Row
    if (currentSection.headers.length === 0 && line.includes('|')) {
      currentSection.headers = line.split('|').map(h => h.trim()).filter((h, i, arr) => i !== 0 || i !== arr.length -1 || h); // Basic header extraction
      lineIndex++;
      line = lines[lineIndex]?.trim();

      // Process Separator Row (and extract alignment)
      if (line && line.includes('|') && line.includes('-')) {
         const segments = line.split('|').map(s => s.trim()).filter((s, i, arr) => i !== 0 || i !== arr.length -1 || s);
         currentSection.alignments = segments.map(seg => {
             if (seg.startsWith(':') && seg.endsWith(':')) return 'center';
             if (seg.startsWith(':')) return 'left';
             if (seg.endsWith(':')) return 'right';
             return null; // Default (usually left)
         });
         lineIndex++;
         line = lines[lineIndex]?.trim();
      } else {
          // No valid separator found, maybe not a table? Reset headers.
          currentSection.headers = [];
          currentSection.alignments = [];
          // Don't increment lineIndex, re-evaluate current line
          continue;
      }
    }

    // Process Data Rows
    if (currentSection.headers.length > 0 && line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter((c, i, arr) => i !== 0 || i !== arr.length -1 || c);
      // Ensure row has same number of cells as headers (or handle mismatch)
      if (cells.length === currentSection.headers.length) {
         currentSection.rows.push({ cells });
      } else {
         // Handle potential row mismatch - maybe log a warning or try to pad?
         // For now, just add if cells exist
         if(cells.length > 0) currentSection.rows.push({ cells });
      }
    } else if (currentSection.headers.length > 0 && !line.includes('|')) {
        // End of table section if we encounter a non-pipe line after headers
        if (currentSection) sections.push(currentSection);
        currentSection = null; // Reset for next potential table
    }

    lineIndex++;
  }

  // Add the last section if it exists
  if (currentSection) sections.push(currentSection);

  return sections.filter(s => s.headers.length > 0 && s.rows.length > 0); // Only return valid tables
};


// Format parsed table data into pre-formatted plain text
const formatTableForPlainText = (tableData: TableSection): string => {
  const colCount = tableData.headers.length;
  if (colCount === 0) return '';

  // Calculate max width for each column
  const colWidths: number[] = tableData.headers.map(h => h.length);
  tableData.rows.forEach(row => {
    row.cells.forEach((cell, i) => {
      if (i < colCount) {
        colWidths[i] = Math.max(colWidths[i] || 0, cell.length);
      }
    });
  });

  // Function to create a padded cell string based on alignment
  const padCell = (text: string, width: number, align: string | null): string => {
    const padding = width - text.length;
    if (align === 'right') {
      return ' '.repeat(padding) + text;
    } else if (align === 'center') {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    } else { // Default left align
      return text + ' '.repeat(padding);
    }
  };

  // Build the text output
  let output = '';
  if (tableData.title) output += `${tableData.title}\n`;
  if (tableData.subtitle) output += `${tableData.subtitle}\n`;

  // Header row
  const headerLine = tableData.headers.map((header, i) => padCell(header, colWidths[i], tableData.alignments?.[i] ?? null)).join(' | '); // Added ?? null
  output += `| ${headerLine} |\n`;

  // Separator row
   const separatorLineAdjusted = colWidths.map((width, i) => {
       const align = tableData.alignments?.[i] ?? null; // Added ?? null
       const dashWidth = colWidths[i];
       if (align === 'center') return `:${'-'.repeat(dashWidth > 1 ? dashWidth - 2 : 0)}:`; // Ensure dashWidth > 1 for center
       if (align === 'left') return `:${'-'.repeat(dashWidth > 0 ? dashWidth -1 : 0)}`;
       if (align === 'right') return `${'-'.repeat(dashWidth > 0 ? dashWidth -1 : 0)}:`;
       return '-'.repeat(dashWidth); // Default align
   }).join(' | ');
  output += `| ${separatorLineAdjusted} |\n`;


  // Data rows
  tableData.rows.forEach(row => {
    const rowLine = row.cells.map((cell, i) => padCell(cell, colWidths[i], tableData.alignments?.[i] ?? null)).join(' | '); // Added ?? null
    output += `| ${rowLine} |\n`;
  });

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
      const sections = summary.split(/(\n\n+|(?=\n(?:Zakelijke Risico's:|Privé Risico's:)))/); // Split by double newlines or table headers
      let clipboardText = '';

      for (const section of sections) {
        if (!section || section.trim() === '') continue;

        if (isTableSection(section)) {
          const parsedTables = parseMarkdownTable(section);
          parsedTables.forEach(table => {
            clipboardText += formatTableForPlainText(table) + '\n\n'; // Add extra newline after table
          });
        } else {
          // Append non-table text, ensuring consistent newlines
          clipboardText += section.trim() + '\n\n';
        }
      }

      navigator.clipboard.writeText(clipboardText.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

    } catch (error) {
      console.error("Error preparing text for clipboard:", error);
      // Fallback to copying raw summary if formatting fails
      navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };


  // Loading state remains the same
  if (isLoading) {
    return ( <div className="bg-white rounded-2xl shadow-lg p-6"><div className="animate-pulse">...</div></div> );
  }

  // If no summaryHtml, return null
  if (!summaryHtml) {
    return null;
  }

  // Animation variants remain the same
  const containerVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
  const buttonVariants = { hover: { scale: 1.05 }, tap: { scale: 0.95 } };

  return (
    <MotionDiv
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="bg-white rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Header remains the same */}
      <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 text-white">
        <h2 className="text-2xl font-bold flex items-center pr-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">...</svg>
          Samenvatting
        </h2>
        {/* Tooltip remains the same */}
        <AnimatePresence>
          {copied && ( <MotionDiv className="absolute top-16 right-8 ...">Gekopieerd!</MotionDiv> )}
        </AnimatePresence>
        {/* Copy button - uses updated copyToClipboard */}
        <MotionButton variants={buttonVariants} whileHover="hover" whileTap="tap" onClick={copyToClipboard} className="absolute top-6 right-6 ..." title="Kopiëren (pre-formatted text)" type="button">
          {copied ? ( <svg>...</svg> ) : ( <svg>...</svg> )}
        </MotionButton>
      </div>

      {/* Content area - Render pre-generated HTML */}
      <div className="p-8">
        <div ref={contentRef} className="max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
           <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
         </div>
       </div>

      {/* Styles remain the same */}
      <style jsx global>{`...`}</style>
     </MotionDiv>
   );
}
