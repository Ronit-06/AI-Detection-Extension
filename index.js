// Popup bootstrap: renders status UI and coordinates feature activation.
import { trackAiVisit } from './metadata.js';

const MAX_UI_SIGNALS = 8;

// Formats timestamps for human-readable display in the popup.
function formatTimestamp(timestamp) {
	try {
		return new Date(timestamp).toLocaleString();
	} catch (error) {
		console.warn('Failed to format timestamp', error);
		return timestamp;
	}
}

// Reflects the latest detection status in the popup banner.
function updateStatus(ui, entry) {
	if (!ui?.statusEl) {
		return;
	}

	if (!entry) {
		ui.statusEl.textContent = 'No AI domain detected for this page.';
		if (ui.detailsEl) {
			ui.detailsEl.hidden = true;
		}
		return;
	}

	const { domain, decision, interactionType, popupShown, timestamp } = entry;

	ui.statusEl.textContent = popupShown
		? 'AI interaction detected and popup triggered.'
		: 'AI domain detected.';

	if (ui.detailsEl) {
		ui.detailsEl.textContent = `Domain: ${domain} | Interaction: ${interactionType} | Decision: ${decision} | Time: ${formatTimestamp(
			timestamp,
		)}`;
		ui.detailsEl.hidden = false;
	}
}

// Displays or clears error text near the detection status area.
function showError(ui, message) {
	if (!ui?.errorEl) {
		return;
	}

	ui.errorEl.textContent = message;
	ui.errorEl.hidden = !message;
}

// Renders a single signal entry for the recent activity list.
function createSignalListItem(entry) {
	const item = document.createElement('li');
	item.textContent = `${formatTimestamp(entry.timestamp)} - ${entry.domain} - ${entry.interactionType} - popup: ${
		entry.popupShown ? 'yes' : 'no'
	} - decision: ${entry.decision}`;
	return item;
}

// Inserts a signal into the log while keeping the list bounded.
function appendSignal(ui, entry) {
	if (!ui?.signalListEl || !entry) {
		return;
	}

	ui.signalListEl.prepend(createSignalListItem(entry));
	while (ui.signalListEl.childElementCount > MAX_UI_SIGNALS) {
		ui.signalListEl.removeChild(ui.signalListEl.lastElementChild);
	}

	updateStatus(ui, entry);
}

// Sets up listeners for ai-signal events so the popup log stays fresh.
function setupSignalUi(ui) {
	if (!ui?.signalListEl) {
		return () => {};
	}

	ui.signalListEl.innerHTML = '';

	const recordedHandler = (event) => {
		if (event?.detail) {
			appendSignal(ui, event.detail);
		}
	};

	window.addEventListener('ai-signal-recorded', recordedHandler);

	try {
		const snapshot = window.aiSignalCollector?.getSnapshot?.() ?? [];
		snapshot.slice(-MAX_UI_SIGNALS).forEach((entry) => appendSignal(ui, entry));
	} catch (error) {
		console.warn('Failed to render existing signals', error);
	}

	return () => {
		window.removeEventListener('ai-signal-recorded', recordedHandler);
	};
}

// Performs a one-off detection run to confirm popup functionality for testers.
async function runSelfTest(ui, pageUrl) {
	if (!ui?.statusEl) {
		return;
	}

	ui.statusEl.textContent = 'Checking current page...';
	showError(ui, '');
	if (ui.detailsEl) {
		ui.detailsEl.hidden = true;
	}

	try {
		const metadata = await trackAiVisit({
			interactionType: 'popup-open',
			popupShown: false,
			decision: 'pending',
			emitEvent: false,
			triggerPopup: false,
			pageUrl,
		});

		if (!metadata) {
			updateStatus(ui, null);
			return;
		}

		uploadToUi(ui, metadata);
	} catch (error) {
		ui.statusEl.textContent = 'Detection check failed.';
		showError(ui, error.message || 'Unknown error');
		console.error('Self-test failed', error);
	}
}

// Projects metadata from a detection run into the UI log.
function uploadToUi(ui, metadata) {
	appendSignal(ui, {
		...metadata,
		signalSource: 'self-test',
	});
}

// Queries Chrome for the active tab URL so detection targets the real page.
async function resolveActiveTabUrl() {
	if (typeof chrome !== 'undefined' && chrome?.tabs?.query) {
		try {
			const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
			if (tab?.url) {
				return tab.url;
			}
		} catch (error) {
			console.warn('Unable to resolve active tab URL', error);
		}
	}

	return window.location.href || null;
}

// Central feature registry with lazy loaders for each module.
const featureRegistry = [
	{
		id: 'aiSignalCollection',
		description: 'Collect metadata logs for compliance and auditing.',
		loader: () => import('./features/collectAiSignals.js'),
	},
	{
		id: 'aiDomainDetection',
		description: 'Detect visits to defined AI-related domains.',
		loader: () => import('./features/detectPotentialAiUrls.js'),
	},
	{
		id: 'aiInAppDetection',
		description: 'Detect AI prompt interactions within approved applications.',
		loader: () => import('./features/detectAiUsageWithinApps.js'),
	},
	{
		id: 'aiUserIntervention',
		description: 'Display guidance UI and enforce routing to approved AI.',
		loader: () => import('./features/aiUsageIntervention.js'),
	},
];

const activeFeatures = new Map();

// Activates a single feature and tracks its teardown handler.
export async function activateFeature(id, context = {}) {
	const entry = featureRegistry.find((feature) => feature.id === id);
	if (!entry) {
		throw new Error(`Unknown feature: ${id}`);
	}

	if (activeFeatures.has(id)) {
		return activeFeatures.get(id);
	}

	const module = await entry.loader();
	if (!module || typeof module.init !== 'function') {
		throw new Error(`Feature ${id} must export an init function.`);
	}

	const teardown = await module.init({ ...context, featureId: id });
	const state = { module, teardown };
	activeFeatures.set(id, state);
	return state;
}

// Deactivates a feature by invoking its teardown routine.
export async function deactivateFeature(id) {
	const state = activeFeatures.get(id);
	if (!state) {
		return;
	}

	if (typeof state.teardown === 'function') {
		await state.teardown();
	}

	activeFeatures.delete(id);
}

// Sequentially activates all registered features for the popup session.
export async function bootstrap(context = {}) {
	for (const feature of featureRegistry) {
		try {
			await activateFeature(feature.id, context);
		} catch (error) {
			console.error(`Failed to activate ${feature.id}`, error);
		}
	}
}

// Bootstraps the popup once the DOM is ready and ensures cleanup.
function initializePopup() {
	const context = {
		root: document.body,
		runtime: chrome?.runtime,
		ui: {
			statusEl: document.getElementById('detection-status'),
			detailsEl: document.getElementById('detection-details'),
			errorEl: document.getElementById('detection-error'),
			signalListEl: document.getElementById('signal-log'),
		},
	};

	context.resolveActiveUrl = resolveActiveTabUrl;

	const teardownSignals = setupSignalUi(context.ui);

	(async () => {
		const pageUrl = await context.resolveActiveUrl();
		context.activePageUrl = pageUrl;

		try {
			await bootstrap(context);
		} catch (error) {
			console.error('Bootstrap failed', error);
			showError(context.ui, 'Bootstrap failed, check console for details.');
		}

		await runSelfTest(context.ui, pageUrl);
	})();

	window.addEventListener(
		'unload',
		() => {
			teardownSignals();
		},
		{ once: true },
	);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializePopup, { once: true });
} else {
	initializePopup();
}
