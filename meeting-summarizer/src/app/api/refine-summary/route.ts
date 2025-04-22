// src/app/api/refine-summary/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { chatModels } from '@/lib/config';
import { countTokens, calculateTextCost } from '@/lib/tokenCounter';

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

// Function to convert markdown tables within a string to HTML tables
const convertMarkdownTableToHtml = (markdown: string): string => {
    const lines = markdown.split('\n');
    let htmlOutput = '';
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Check for markdown table separator line - skip it
        if (line.trim().match(/^\|-*\|(?:-*\|)*$/)) {
            i++;
            continue;
        }

        // Check if the current line is a table row
        if (isPipeTableRow(line)) {
            let currentTable: string[][] = [];
            // Collect all consecutive table rows
            while (i < lines.length && isPipeTableRow(lines[i])) {
                currentTable.push(parsePipeRow(lines[i]));
                i++;
            }

            // Convert the collected table rows to HTML
            if (currentTable.length > 0) {
                let tableHtml = '<table style="border-collapse: collapse; width: 100%;">'; // Add basic inline styles for compatibility
                const hasHeaders = currentTable[0].length > 0; // Assuming first row is header

                // Add header
                if (hasHeaders) {
                    tableHtml += '<thead><tr>';
                    currentTable[0].forEach(header => {
                        tableHtml += `<th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">${header.trim()}</th>`; // Add basic inline styles
                    });
                    tableHtml += '</tr></thead>';
                }

                // Add body
                tableHtml += '<tbody>';
                const rows = hasHeaders ? currentTable.slice(1) : currentTable;
                rows.forEach(row => {
                    tableHtml += '<tr>';
                    row.forEach(cell => {
                        tableHtml += `<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${cell.trim()}</td>`; // Add basic inline styles
                    });
                    tableHtml += '</tr>';
                });
                tableHtml += '</tbody>';
                tableHtml += '</table>';
                htmlOutput += tableHtml + '\n'; // Add the HTML table to the output
            }
        } else {
            // This line is not a table row or separator, just append it
            htmlOutput += line + '\n';
            i++;
        }
    }

    return htmlOutput.trim(); // Trim trailing newline
};


// Set a higher timeout for the API request
export const maxDuration = 60; // 60 seconds
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();

    // Extract parameters
    const { summary, transcript, action, topic, customPrompt } = body;

    // Validate required inputs
    if (!summary) {
      return NextResponse.json(
        { error: 'Geen samenvatting aangeleverd voor verfijning' },
        { status: 400 }
      );
    }

    if (!action) {
      return NextResponse.json(
        { error: 'Geen actie gespecificeerd voor de verfijning' },
        { status: 400 }
      );
    }

    // Use gpt-4o as specified
    const model = 'gpt-4o';
    const selectedModel = chatModels.find(m => m.id === model) ||
                         chatModels.find(m => m.id === 'gpt-4o') ||
                         chatModels[0];

    // Create instructions based on the action
    let instructions = '';

    switch (action) {
      case 'make-detailed':
        instructions = `Je bent een expert in het schrijven van uitgebreide vergadersamenvattingen. Maak de samenvatting gedetailleerder door relevante informatie uit de transcriptie toe te voegen die in de huidige samenvatting ontbreekt.

Behoud de structuur van de originele samenvatting maar voeg meer details toe. Hou de schrijfstijl consistent. Zorg ervoor dat je de tekst formatteert in duidelijke paragrafen zonder markdown symbolen zichtbaar in de output.`;
        break;

      case 'elaborate-topic':
        if (!topic) {
          return NextResponse.json(
            { error: 'Geen onderwerp gespecificeerd voor uitbreiding' },
            { status: 400 }
          );
        }
        instructions = `Je bent een expert in het schrijven van gerichte vergadersamenvattingen. Breid de samenvatting uit met alle relevante informatie over dit specifieke onderwerp: "${topic}". Zorg ervoor dat je de tekst formatteert in duidelijke paragrafen zonder markdown symbolen zichtbaar in de output.`;
        break;

      case 'email-format':
        instructions = `Herschrijf de vergadernotulen in een formele, professionele e-mail die naar collega's gestuurd kan worden met een duidelijke onderwerpregel, intro, gestructureerde samenvatting en afsluiting. Gebruik goed geformatteerde tekst zonder zichtbare markdown symbolen.`;
        break;

      case 'custom':
        if (!customPrompt) {
          return NextResponse.json(
            { error: 'Geen aangepaste instructie ingevoerd' },
            { status: 400 }
          );
        }
        instructions = `Volg deze instructie voor het aanpassen van de samenvatting: "${customPrompt}". Zorg ervoor dat je de tekst formatteert in duidelijke paragrafen zonder markdown symbolen zichtbaar in de output.`;
        break;

      default:
        return NextResponse.json(
          { error: 'Ongeldige actie gespecificeerd' },
          { status: 400 }
        );
    }

    // Use the newer Responses API structure
    const userMessage = {
      role: "user",
      content: `Here is the summary:\n\n${summary}${transcript ? `\n\nContext from transcript:\n\n${transcript.substring(0, 4000)}` : ''}`
    };

    const devMessage = {
      role: "developer",
      content: instructions
    };

    // Set a timeout for the API call
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API timeout')), 50000); // 50 second timeout
    });

    // Race between the API call and the timeout
    const responsePromise = openai.chat.completions.create({
      model: model,
      messages: [
        devMessage,
        userMessage
      ] as any,
      temperature: 0.3,
      max_tokens: 2048, // Increased token limit for more detailed responses
    });

    // Race between the API call and the timeout
    const response = await Promise.race([responsePromise, timeoutPromise]) as any;

    // Get the refined summary
    let refinedSummary = response.choices[0].message.content || '';

    // If the action was email-format, convert markdown tables to HTML
    if (action === 'email-format') {
        refinedSummary = convertMarkdownTableToHtml(refinedSummary);
    }

    // Calculate costs
    const inputTokens = countTokens(userMessage.content + devMessage.content);
    const outputTokens = countTokens(refinedSummary);
    const cost = calculateTextCost(
      inputTokens,
      outputTokens,
      selectedModel.inputCost,
      selectedModel.outputCost
    );

    // Return the result
    return NextResponse.json({
      refinedSummary,
      usage: {
        model: selectedModel.name,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cost
      }
    });
  } catch (error) {
    console.error('Error refining summary:', error);

    let errorMessage = 'Onbekende fout bij het verfijnen van de samenvatting';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;

      if (error.message.includes('timeout')) {
        errorMessage = 'De aanvraag duurde te lang. Probeer een kleinere samenvatting of probeer het later opnieuw.';
        statusCode = 504;
      }
      // Add a check for the specific error message from the API if needed
      if (error.message.includes('Your request was rejected as a result of our safety system')) {
           errorMessage = 'De inhoud van de samenvatting kon niet worden verwerkt vanwege veiligheidsbeperkingen. Probeer de samenvatting aan te passen.';
           statusCode = 400; // Bad Request
      }
    }

    // Always return a valid JSON response even for errors
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}