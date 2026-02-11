const STORAGE_KEY = 'aiSignalsLog';
const MAX_LOG_ENTRIES = 200;

// Chooses the persistence layer depending on whether the Chrome storage API is available.
function resolveStorage(runtime) {
	if (runtime && typeof chrome !== 'undefined' && chrome?.storage?.local) {
		return {
			// Fetches stored metadata from chrome.storage.local.
			async get() {
				const payload = await chrome.storage.local.get([STORAGE_KEY]);
				return Array.isArray(payload?.[STORAGE_KEY]) ? payload[STORAGE_KEY] : [];
			},
			// Persists metadata back to chrome.storage.local.
			async set(entries) {
				await chrome.storage.local.set({ [STORAGE_KEY]: entries });
			},
		};
	}

	return {
		// Reads stored metadata from window.localStorage when Chrome storage is unavailable.
		async get() {
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				return raw ? JSON.parse(raw) : [];
			} catch (error) {
				console.warn('[aiSignalCollection] Failed to read localStorage', error);
				return [];
			}
		},
		// Writes metadata to window.localStorage with defensive error handling.
		async set(entries) {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
			} catch (error) {
				console.warn('[aiSignalCollection] Failed to persist localStorage', error);
			}
		},
	};
}

// Sanitises incoming signal detail while preserving non-sensitive fields.
function sanitize(detail = {}, fallbackDomain = 'unknown') {
	const {
		interactionType = 'unspecified',
		signalSource = 'unknown',
		popupShown = false,
		decision = 'unknown',
		userRole = 'unknown',
		domain = fallbackDomain,
	} = detail;

	return {
		interactionType,
		signalSource,
		popupShown: Boolean(popupShown),
		decision,
		userRole,
		domain,
	};
}

// Primary entry point that captures ai-signal events and persists metadata snapshots.
export async function init(context = {}) {
	const storage = resolveStorage(context.runtime);
	let entries = await storage.get();
	let lastKnownDomain = extractDomain(context.activePageUrl) || 'unknown';
	const listeners = [];

	// Trims entries to MAX_LOG_ENTRIES and writes them to storage.
	function trimAndPersist(updated) {
		if (updated.length > MAX_LOG_ENTRIES) {
			updated.splice(0, updated.length - MAX_LOG_ENTRIES);
		}

		storage.set(updated).catch((error) => {
			console.error('[aiSignalCollection] Persist failed', error);
		});
	}

	// Adds an entry to the in-memory log before persisting.
	function record(entry) {
		entries = [...entries, entry];
		trimAndPersist(entries);
	}

	// Converts incoming ai-signal events into persisted log entries.
	function handleSignal(event) {
		const sanitized = sanitize(event?.detail, lastKnownDomain);
		if (sanitized.domain) {
			lastKnownDomain = sanitized.domain;
		}

		const logEntry = {
			...sanitized,
			timestamp: new Date().toISOString(),
			continued: sanitized.decision === 'continued',
			redirected: sanitized.decision === 'redirected',
		};

		record(logEntry);

		if (window.top) {
			window.top.dispatchEvent(new CustomEvent('ai-signal-recorded', { detail: logEntry }));
		}
	}

	window.addEventListener('ai-signal', handleSignal, true);
	listeners.push(() => window.removeEventListener('ai-signal', handleSignal, true));

	// Allows other modules to emit signals directly through the collector.
	function emitSignal(payload) {
		handleSignal({ detail: payload });
	}

	window.aiSignalCollector = {
		emit: emitSignal,
		// Returns a shallow copy of the current metadata entries for diagnostics.
		getSnapshot: () => [...entries],
	};

	return () => {
		while (listeners.length) {
			const teardown = listeners.pop();
			try {
				teardown();
			} catch (error) {
				console.warn('[aiSignalCollection] Listener teardown failed', error);
			}
		}

		if (window.aiSignalCollector?.emit === emitSignal) {
			delete window.aiSignalCollector;
		}
	};
}

// Extracts the hostname from a page URL with graceful fallback.
function extractDomain(pageUrl) {
	if (!pageUrl) {
		return null;
	}

	try {
		return new URL(pageUrl).hostname;
	} catch (error) {
		console.warn('[aiSignalCollection] Failed to parse domain', pageUrl, error);
		return null;
	}
}
