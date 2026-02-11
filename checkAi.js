const AI_DOMAINS = [
  // OpenAI
  'chat.openai.com',
  'chatgpt.com',
  'openai.com/chat',
  'openai.com',
  
  // Anthropic
  'claude.ai',
  
  // Google
  'gemini.google.com',
  'bard.google.com',
  'ai.google.dev',
  
  // Microsoft
  'copilot.microsoft.com',
  'copilot.live.com',
  'bing.com/chat',
  
  
  'perplexity.ai',
  'poe.com',
  'you.com',
  'huggingface.co/chat',
  'character.ai',
  'pi.ai',
  'jasper.ai'
];

const WHITELIST_AI_SITES = [
  'chat.openai.com',
  'chatgpt.com',
  'openai.com/chat',
]

// function to check if a domain is ai

function isAIDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    
    return AI_DOMAINS.some(aiDomain => 
      hostname === aiDomain || hostname.endsWith('.' + aiDomain)
    );
  } catch (e) {
    return false;
  }
}




chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log("tab loaded");
  if (changeInfo.status === 'complete' && tab.url) {
    isAIDomain(tab.url, tabId);
  }
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url) {
      isAIDomain(tab.url);
    }
  });
});



