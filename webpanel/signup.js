'use strict';

const form = document.querySelector('#signup-form');
const usernameInput = document.querySelector('#signup-username');
const passwordInput = document.querySelector('#signup-password');
const confirmInput = document.querySelector('#signup-confirm');
const inviteInput = document.querySelector('#signup-invite');
const inviteField = document.querySelector('#invite-field');
const errorEl = document.querySelector('#signup-error');
const submitBtn = document.querySelector('#signup-submit');

function showError(message) {
  errorEl.textContent = message || '';
  errorEl.hidden = !message;
}

async function loadRegistrationOptions() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api/auth/state', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      inviteField.hidden = false;
      return;
    }
    const state = await response.json();
    if (state && state.inviteRequired) inviteField.hidden = false;
  } catch {
    // If the state check fails, still let the user enter an invite code.
    inviteField.hidden = false;
  } finally {
    clearTimeout(timer);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const confirmation = confirmInput.value;
  const inviteCode = inviteInput.value.trim();

  if (!username || !password) {
    showError('Username and password are required.');
    return;
  }
  if (password !== confirmation) {
    showError('Passwords do not match.');
    return;
  }

  submitBtn.disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password, inviteCode: inviteCode || undefined }),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      showError((data && data.error) || `Registration failed (${response.status}).`);
      return;
    }
    if (!data || !data.token) {
      showError('The account was created, but no session was returned. Please sign in.');
      return;
    }
    localStorage.setItem('wp_token', data.token);
    window.location.replace('/webpanel/');
  } catch (error) {
    if (error && error.name === 'AbortError') {
      showError('The panel server did not respond in time. Try again.');
    } else {
      showError(`Could not reach the panel server: ${error.message}`);
    }
  } finally {
    clearTimeout(timer);
    submitBtn.disabled = false;
  }
});

loadRegistrationOptions();
