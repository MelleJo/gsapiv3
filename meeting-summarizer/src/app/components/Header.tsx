'use client';

import { motion } from 'framer-motion';

export default function Header() {
  return (
    <header className="relative w-full overflow-hidden">
      {/* Gradient background with blur effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 backdrop-blur-xl z-0" />
      
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div 
          className="absolute w-64 h-64 rounded-full bg-blue-500/10"
          initial={{ x: -100, y: -100 }}
          animate={{ 
            x: ["-10%", "5%", "-5%"],
            y: ["-10%", "5%", "-5%"],
          }}
          transition={{ 
            duration: 15, 
            repeat: Infinity, 
            repeatType: "reverse" 
          }}
        />
        <motion.div 
          className="absolute right-0 top-1/3 w-96 h-96 rounded-full bg-purple-500/10"
          initial={{ x: 100, y: 50 }}
          animate={{ 
            x: ["10%", "-5%", "8%"],
            y: ["5%", "-8%", "3%"],
          }}
          transition={{ 
            duration: 18, 
            repeat: Infinity, 
            repeatType: "reverse" 
          }}
        />
      </div>
      
      {/* Content */}
      <div className="relative z-10 w-full py-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold mb-3 text-gradient">
              Meeting Summarizer
            </h1>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <p className="text-lg text-neutral-700 max-w-2xl mx-auto">
              Transform your audio recordings into comprehensive meeting notes 
              and actionable summaries with AI
            </p>
          </motion.div>
        </div>
      </div>
    </header>
  );
}