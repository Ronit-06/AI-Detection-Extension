// Utility shared across popup and background code to flag AI-centric hostnames.
const AI_DOMAINS = [
	// OpenAI
	'chat.openai.com',
	'chatgpt.com',
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
	'bing.com',

	// Miscellaneous tools
	'perplexity.ai',
	'poe.com',
	'you.com',
	'huggingface.co',
	'character.ai',
	'pi.ai',
	'jasper.ai',
];

// Extracts a hostname from a URL string while trimming the www prefix.
function normalizeHostname(url) {
	try {
		const { hostname } = new URL(url);
		return hostname.replace(/^www\./i, '');
	} catch (error) {
		return '';
	}
}

// Checks whether the hostname matches a known AI-related domain.
function isAiHostname(hostname) {
	return AI_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

// Public helper that reports whether the given URL belongs to an AI tool.
export default function checkAi(url) {
	const hostname = normalizeHostname(url);
	return Boolean(hostname && isAiHostname(hostname));
}

// Logs detections and informs the background script when available.
function logDetection(url) {
	if (!checkAi(url)) {
		return;
	}

	console.info('[checkAiInUrl] AI domain detected:', url);
	if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
		const result = chrome.runtime.sendMessage({ type: 'ai-domain-detected', url });
		if (result && typeof result.catch === 'function') {
			result.catch(() => {});
		}
	}
}

// Hooks tab events so background contexts can react to AI usage.
if (typeof chrome !== 'undefined' && chrome?.tabs) {
	chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
		if (changeInfo.status === 'complete' && tab?.url) {
			logDetection(tab.url);
		}
	});

	chrome.tabs.onActivated.addListener((activeInfo) => {
		chrome.tabs.get(activeInfo.tabId, (tab) => {
			if (tab?.url) {
				logDetection(tab.url);
			}
		});
	});
}
