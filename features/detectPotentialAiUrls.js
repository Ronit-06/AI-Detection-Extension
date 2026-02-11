// Runs domain-level checks on navigation changes inside the popup context.
import { trackAiVisit } from '../metadata.js';

const EVENT_NAME = 'ai-navigation';

// Entry point for the domain detection feature loaded by the popup bootstrapper.
export async function init(context = {}) {
	await safeTrack({ ...context, interactionType: EVENT_NAME });

	const handlers = [];

	// Re-evaluate the active tab whenever navigation events fire within the popup.
	const rerunDetection = () => {
		safeTrack({ ...context, interactionType: EVENT_NAME });
	};

	window.addEventListener('hashchange', rerunDetection);
	handlers.push(() => window.removeEventListener('hashchange', rerunDetection));

	window.addEventListener('popstate', rerunDetection);
	handlers.push(() => window.removeEventListener('popstate', rerunDetection));

	return () => {
		while (handlers.length) {
			const teardown = handlers.pop();
			try {
				teardown();
			} catch (error) {
				console.warn('[detectPotentialAiUrls] Failed to remove handler', error);
			}
		}
	};
}

// Wraps the tracker with robust error handling and active URL resolution.
async function safeTrack({ userRole = 'unknown', interactionType, resolveActiveUrl }) {
	try {
		const pageUrl = await resolvePageUrl(resolveActiveUrl);
		if (!pageUrl) {
			return;
		}
		await trackAiVisit({ userRole, interactionType, pageUrl });
	} catch (error) {
		console.error('[detectPotentialAiUrls] trackAiVisit failed', error);
	}
}

// Determines the best active page URL using popup-provided helpers.
async function resolvePageUrl(resolveActiveUrl) {
	if (typeof resolveActiveUrl === 'function') {
		try {
			const url = await resolveActiveUrl();
			if (url) {
				return url;
			}
		} catch (error) {
			console.warn('[detectPotentialAiUrls] resolveActiveUrl failure', error);
		}
	}

	return window.location.href || null;
}
