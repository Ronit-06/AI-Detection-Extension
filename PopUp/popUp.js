// Buttons surface user intent so other scripts can log the decision.
// Navigates the user to the approved AI site when they choose redirect.
document.getElementById('redirect').addEventListener('click', () => {
	console.log('redirecting');
	window.location.href = 'https://chatgpt.com/';
});

// Keeps the popup visible and lets the user remain on the original page.
document.getElementById('continue').addEventListener('click', () => {
	console.log('continuing');
	// continue onto the webite selected
});