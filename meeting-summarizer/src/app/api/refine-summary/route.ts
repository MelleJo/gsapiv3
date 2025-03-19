// src/app/api/refine-summary/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { chatModels } from '@/lib/config';
import { countTokens, calculateTextCost } from '@/lib/tokenCounter';

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Extract parameters
    const { summary, transcript, action, topic, customPrompt } = body;
    
    // Validate required inputs - don't check for audio URL
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

    // Use GPT-4o-mini as default model for summary refinements
    const model = 'gpt-4o-mini';
    const selectedModel = chatModels.find(m => m.id === model) || chatModels.find(m => m.id === 'gpt-4o-mini') || chatModels[0];

    // Create the system prompt based on the action
    let systemPrompt = '';
    
    switch (action) {
      case 'make-detailed':
        systemPrompt = `Je bent een expert in het schrijven van uitgebreide vergadersamenvattingen. Ik geef je een bestaande samenvatting en de ruwe transcriptie van een vergadering. Maak de samenvatting gedetailleerder door relevante informatie uit de transcriptie toe te voegen die in de huidige samenvatting ontbreekt.

Behoud de structuur van de originele samenvatting maar voeg meer details, voorbeelden, en feitelijke informatie toe. Hou de schrijfstijl consistent. Als er in de transcriptie belangrijke discussiepunten, beslissingen, of actiepunten staan die in de samenvatting missen, voeg deze dan toe.`;
        break;
        
      case 'elaborate-topic':
        if (!topic) {
          return NextResponse.json(
            { error: 'Geen onderwerp gespecificeerd voor uitbreiding' },
            { status: 400 }
          );
        }
        systemPrompt = `Je bent een expert in het schrijven van gerichte vergadersamenvattingen. Ik geef je een bestaande samenvatting en de ruwe transcriptie van een vergadering, plus een specifiek onderwerp waarover ik meer details wil. Breid de samenvatting uit met alle relevante informatie uit de transcriptie over dit specifieke onderwerp: "${topic}".

Voeg details, context, discussiepunten, en besluiten toe die gerelateerd zijn aan dit onderwerp en die in de transcriptie voorkomen. Als het onderwerp niet of nauwelijks in de transcriptie voorkomt, geef dan aan dat er weinig informatie over beschikbaar is. Behoud de algehele structuur van de samenvatting maar verfijn het gedeelte over het gevraagde onderwerp.`;
        break;
        
      case 'email-format':
        systemPrompt = `Je bent een communicatie-expert die vergadernotities herstructureert in e-mailformaat. Ik geef je een samenvatting van een vergadering en optioneel een transcriptie. Herschrijf deze in een formele, professionele e-mail die naar collega's gestuurd kan worden.

De e-mail moet een duidelijke onderwerpregel bevatten (die je mag suggereren), een korte intro, een gestructureerde samenvatting van de belangrijkste punten, en een professionele afsluiting. Zorg voor een duidelijke structuur met kopjes of opsommingstekens voor de belangrijkste punten. De toon moet professioneel maar toegankelijk zijn.`;
        break;
        
      case 'custom':
        if (!customPrompt) {
          return NextResponse.json(
            { error: 'Geen aangepaste instructie ingevoerd' },
            { status: 400 }
          );
        }
        systemPrompt = `Je bent een expert in het verfijnen van vergadersamenvattingen. Ik geef je een bestaande samenvatting, de ruwe transcriptie, en een specifieke instructie voor hoe je de samenvatting moet aanpassen. Volg deze instructie nauwkeurig: "${customPrompt}".

Gebruik de transcriptie als bron van extra informatie maar focus op het uitvoeren van de gevraagde aanpassing. Behoud de professionaliteit en helderheid van de originele samenvatting, tenzij anders gevraagd in de instructie.`;
        break;
        
      default:
        return NextResponse.json(
          { error: 'Ongeldige actie gespecificeerd' },
          { status: 400 }
        );
    }

    // Create chat completion request
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Hier is de samenvatting:\n\n${summary}\n\n${transcript ? `Hier is de transcriptie:\n\n${transcript}` : ''}\n\n${topic ? `Focus op het onderwerp: ${topic}` : ''}${customPrompt ? `Specifieke instructie: ${customPrompt}` : ''}` }
    ];

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages as any,
      temperature: 0.3, // Use a moderate temperature for refinements
    });

    // Get the refined summary
    const refinedSummary = response.choices[0].message.content || '';

    // Calculate costs
    const inputTokens = countTokens(messages.map(m => m.content).join(' '));
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
    
    const errorMessage = error instanceof Error ? error.message : 'Onbekende fout bij het verfijnen van de samenvatting';
    const statusCode = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}