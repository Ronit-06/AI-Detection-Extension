// Emits metadata when users interact with prompt-like UI elements.
const SIGNAL_DEFAULTS = {
	interactionType: 'in-app-interaction',
	decision: 'pending',
	popupShown: false,
};

// Registers listeners that infer AI usage inside approved applications.
export async function init(context = {}) {
	// Listen for prompt-like interactions so we can emit metadata-only signals.
	const { userRole = 'unknown' } = context;
	const listeners = [];

	const emit = (interactionType) => {
		emitSignal({ ...SIGNAL_DEFAULTS, interactionType, userRole });
	};

	const focusHandler = (event) => {
		if (looksLikePromptField(event.target)) {
			emit('prompt-focus');
		}
	};

	const pasteHandler = (event) => {
		if (looksLikePromptField(event.target)) {
			emit('prompt-paste');
		}
	};

	document.addEventListener('focusin', focusHandler, true);
	listeners.push(() => document.removeEventListener('focusin', focusHandler, true));

	document.addEventListener('paste', pasteHandler, true);
	listeners.push(() => document.removeEventListener('paste', pasteHandler, true));

	return () => {
		while (listeners.length) {
			const teardown = listeners.pop();
			try {
				teardown();
			} catch (error) {
				console.warn('[detectAiUsageWithinApps] Listener teardown failed', error);
			}
		}
	};
}

// Forwards metadata either through the collector or as a raw event.
function emitSignal(detail) {
	const eventDetail = {
		...detail,
		signalSource: 'ai-in-app-detection',
	};

	if (window.aiSignalCollector?.emit) {
		window.aiSignalCollector.emit(eventDetail);
	} else {
		window.dispatchEvent(new CustomEvent('ai-signal', { detail: eventDetail }));
	}
}



// Applies heuristics to decide whether a DOM node behaves like a prompt input.
function looksLikePromptField(node) {
	const docCtor = typeof Document !== 'undefined' ? Document : null;
	const winCtor = typeof Window !== 'undefined' ? Window : null;

	if (
		!node ||
		(docCtor && node instanceof docCtor) ||
		(winCtor && node instanceof winCtor)
	) {
		return false;
	}

	const tag = node.tagName?.toLowerCase();
	if (!tag) {
		return false;
	}

	if (tag === 'textarea') {
		return true;
	}

	if (tag === 'input') {
		const type = node.getAttribute('type')?.toLowerCase() || 'text';
		return ['text', 'search'].includes(type);
	}

	return Boolean(node.getAttribute?.('role') === 'textbox');
}
