// src/types/env.d.ts

declare global {
    namespace NodeJS {
      interface ProcessEnv {
        // OpenAI API
        OPENAI_API_KEY: string;
        
        // Email configuration
        EMAIL_HOST?: string;
        EMAIL_PORT?: string;
        EMAIL_SECURE?: string;
        EMAIL_USER?: string;
        EMAIL_PASSWORD?: string;
        EMAIL_FROM?: string;
        
        NODE_ENV: 'development' | 'production' | 'test';
      }
    }
  }
  
  export {}