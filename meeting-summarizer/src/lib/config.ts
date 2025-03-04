// src/lib/config.ts

export interface ModelConfig {
    id: string;
    name: string;
    description: string;
    inputCost: number; // Cost per 1M tokens
    outputCost: number; // Cost per 1M tokens
    supportsTemperature: boolean;
  }
  
  export interface WhisperConfig {
    id: string;
    name: string;
    description: string;
    costPerMinute: number;
  }
  
  export const whisperModels: WhisperConfig[] = [
    {
      id: 'whisper-1',
      name: 'Whisper',
      description: 'Standaard transcriptiemodel',
      costPerMinute: 0.006
    }
  ];
  
  export const chatModels: ModelConfig[] = [
    {
      id: 'gpt-4.5-preview',
      name: 'GPT-4.5 Preview',
      description: 'Meest capabel model (duurst)',
      inputCost: 75.00,
      outputCost: 150.00,
      supportsTemperature: true
    },
    {
      id: 'o1',
      name: 'o1',
      description: 'Geavanceerde redeneercapaciteiten',
      inputCost: 15.00,
      outputCost: 60.00,
      supportsTemperature: false
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      description: 'Krachtig algemeen model',
      inputCost: 2.50,
      outputCost: 10.00,
      supportsTemperature: true
    },
    {
      id: 'o3-mini',
      name: 'o3-mini',
      description: 'Krachtig model met goede kostenbalans',
      inputCost: 1.10,
      outputCost: 4.40,
      supportsTemperature: false
    },
    {
      id: 'o1-mini',
      name: 'o1-mini',
      description: 'Kleiner redeneermodel',
      inputCost: 1.10,
      outputCost: 4.40,
      supportsTemperature: false
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Kosteneffectief model voor eenvoudigere taken',
      inputCost: 0.15,
      outputCost: 0.60,
      supportsTemperature: true
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      description: 'Snel, economisch model',
      inputCost: 0.50,
      outputCost: 1.50,
      supportsTemperature: true
    }
  ];
  
  export const defaultConfig = {
    transcriptionModel: 'whisper-1',
    summarizationModel: 'gpt-4o-mini',
    temperature: 0.3,
    showCosts: true
  };