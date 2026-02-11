// Bridges AI-domain detection with metadata logging and popup signalling.
import checkAi from './scripts/checkAiInUrl.js';

const DEFAULT_INTERACTION = 'page-load';
const DEFAULT_DECISION = 'continued';
const SIGNAL_SOURCE = 'ai-domain-detection';
const POPUP_RESOURCE = 'PopUp/popUp.html';

// Normalises the interaction type that will be recorded for analytics.
function coerceInteractionType(interactionType) {
	if (!interactionType || typeof interactionType !== 'string') {
		return DEFAULT_INTERACTION;
	}

	return interactionType;
}

// Normalises user decisions so downstream records are consistent.
function coerceDecision(decision) {
	if (!decision || typeof decision !== 'string') {
		return DEFAULT_DECISION;
	}

	return decision;
}

// Emits ai-signal CustomEvents when the collector module is not active.
function emitSignal({ interactionType, popupShown, decision, userRole, domain }) {
	const detail = {
		interactionType,
		signalSource: SIGNAL_SOURCE,
		popupShown,
		decision,
		userRole,
		domain,
	};

	window.dispatchEvent(new CustomEvent('ai-signal', { detail }));
}

// Resolves the URL used to display the policy popup.
function resolvePopupUrl() {
	if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
		return chrome.runtime.getURL(POPUP_RESOURCE);
	}

	return POPUP_RESOURCE;
}

// Attempts to parse a usable URL object for downstream metadata usage.
function parseTargetLocation(pageUrl) {
	const candidate = pageUrl || window.location.href;
	try {
		return new URL(candidate);
	} catch (error) {
		console.warn('[metadata] Unable to parse page URL', candidate, error);
		return null;
	}
}

// Runs AI-domain checks and emits sanitized telemetry for downstream consumers.
export async function trackAiVisit(options = {}) {
	const {
		interactionType: rawInteractionType,
		popupShown: rawPopupShown,
		decision: rawDecision,
		userRole = 'unknown',
		triggerPopup = true,
		emitEvent = true,
		pageUrl = null,
	} = options;

	const interactionType = coerceInteractionType(rawInteractionType);
	const decision = coerceDecision(rawDecision);
	const popupShown = Boolean(rawPopupShown ?? true);
	const locationInfo = parseTargetLocation(pageUrl);
	if (!locationInfo) {
		return null;
	}

	const isAiSite = await checkAi(locationInfo.href);
	if (!isAiSite) {
		return null;
	}

	if (triggerPopup && popupShown) {
		const popupUrl = resolvePopupUrl();
		window.dispatchEvent(
			new CustomEvent('ai-popup-requested', {
				detail: { popupUrl, interactionType },
			}),
		);
	}

	const domain = locationInfo.hostname;
	const metadata = {
		domain,
		timestamp: new Date().toISOString(),
		interactionType,
		popupShown,
		decision,
		continued: decision === 'continued',
		redirected: decision === 'redirected',
		pageUrl: locationInfo.href,
	};

	if (emitEvent) {
		const payload = { interactionType, popupShown, decision, userRole, domain };
		if (window.aiSignalCollector?.emit) {
			window.aiSignalCollector.emit({
				...payload,
				signalSource: SIGNAL_SOURCE,
			});
		} else {
			emitSignal(payload);
		}
	}

	return metadata;
}
