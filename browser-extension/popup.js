// Popup script for Rumbledore ESPN Cookie Capture extension

// DOM elements
const statusDiv = document.getElementById('status');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');
const loginSection = document.getElementById('login-section');
const mainSection = document.getElementById('main-section');
const captureBtn = document.getElementById('capture');
const validateBtn = document.getElementById('validate');
const sendBtn = document.getElementById('send');
const clearBtn = document.getElementById('clear');
const openEspnBtn = document.getElementById('open-espn');
const cookieInfoDiv = document.getElementById('cookie-info');
const leagueSection = document.getElementById('league-section');
const leagueIdInput = document.getElementById('league-id');
const actionsDiv = document.getElementById('actions');
const swidPreview = document.getElementById('swid-preview');
const espnS2Preview = document.getElementById('espn-s2-preview');
const captureTime = document.getElementById('capture-time');

// State
let capturedCookies = null;
let isLoggedIn = false;

// Icons
const icons = {
  success: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>',
  error: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>',
  warning: '<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>',
  info: '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>'
};

// Initialize popup
async function init() {
  // Check if user is logged into ESPN
  chrome.runtime.sendMessage({ action: 'checkESPNLogin' }, (response) => {
    if (response.success) {
      isLoggedIn = response.isLoggedIn;
      
      if (isLoggedIn) {
        loginSection.classList.add('hidden');
        mainSection.classList.remove('hidden');
        checkForCapturedCookies();
      } else {
        loginSection.classList.remove('hidden');
        mainSection.classList.add('hidden');
      }
    }
  });
  
  // Load saved league ID if exists
  chrome.storage.local.get(['savedLeagueId'], (result) => {
    if (result.savedLeagueId) {
      leagueIdInput.value = result.savedLeagueId;
    }
  });
}

// Check for previously captured cookies
function checkForCapturedCookies() {
  chrome.runtime.sendMessage({ action: 'getCapturedCookies' }, (response) => {
    if (response.success && response.cookies) {
      capturedCookies = response.cookies;
      displayCapturedCookies();
    }
  });
}

// Display captured cookies
function displayCapturedCookies() {
  if (!capturedCookies) return;
  
  // Show cookie info
  cookieInfoDiv.classList.remove('hidden');
  swidPreview.textContent = capturedCookies.swid.substring(0, 20) + '...';
  espnS2Preview.textContent = capturedCookies.espnS2.substring(0, 20) + '...';
  captureTime.textContent = new Date(capturedCookies.capturedAt).toLocaleString();
  
  // Show league input and actions
  leagueSection.classList.remove('hidden');
  actionsDiv.classList.remove('hidden');
  clearBtn.classList.remove('hidden');
  
  // Update capture button
  captureBtn.textContent = 'Re-capture Cookies';
  
  showStatus('Cookies captured successfully!', 'success');
}

// Show status message
function showStatus(message, type = 'info') {
  statusDiv.classList.remove('hidden');
  statusDiv.className = `status-card ${type}`;
  statusIcon.innerHTML = icons[type] || icons.info;
  statusText.textContent = message;
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  }
}

// Capture cookies
captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  showStatus('Capturing ESPN cookies...', 'info');
  
  chrome.runtime.sendMessage({ action: 'captureCookies' }, (response) => {
    captureBtn.disabled = false;
    
    if (response.success) {
      capturedCookies = response.cookies;
      displayCapturedCookies();
    } else {
      showStatus(response.error || 'Failed to capture cookies', 'error');
    }
  });
});

// Validate cookies
validateBtn.addEventListener('click', async () => {
  if (!capturedCookies) {
    showStatus('No cookies to validate', 'warning');
    return;
  }
  
  validateBtn.disabled = true;
  showStatus('Validating cookies...', 'info');
  
  chrome.runtime.sendMessage(
    { action: 'validateCookies', cookies: capturedCookies },
    (response) => {
      validateBtn.disabled = false;
      
      if (response.success) {
        if (response.isValid) {
          showStatus('Cookies are valid!', 'success');
        } else {
          showStatus('Cookies are invalid or expired', 'error');
        }
      } else {
        showStatus(response.error || 'Validation failed', 'error');
      }
    }
  );
});

// Send cookies to Rumbledore
sendBtn.addEventListener('click', async () => {
  if (!capturedCookies) {
    showStatus('No cookies to send', 'warning');
    return;
  }
  
  const leagueId = leagueIdInput.value.trim();
  
  if (!leagueId) {
    showStatus('Please enter your League ID', 'warning');
    leagueIdInput.focus();
    return;
  }
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(leagueId)) {
    showStatus('Invalid League ID format. Must be a UUID.', 'error');
    leagueIdInput.focus();
    return;
  }
  
  // Save league ID for next time
  chrome.storage.local.set({ savedLeagueId: leagueId });
  
  sendBtn.disabled = true;
  showStatus('Sending cookies to Rumbledore...', 'info');
  
  chrome.runtime.sendMessage(
    { 
      action: 'sendToRumbledore', 
      cookies: capturedCookies,
      leagueId: leagueId
    },
    (response) => {
      sendBtn.disabled = false;
      
      if (response.success) {
        showStatus('Cookies sent successfully!', 'success');
        
        // Clear the captured cookies
        capturedCookies = null;
        cookieInfoDiv.classList.add('hidden');
        leagueSection.classList.add('hidden');
        actionsDiv.classList.add('hidden');
        clearBtn.classList.add('hidden');
        captureBtn.textContent = 'Capture ESPN Cookies';
        
        // Clear from storage
        chrome.runtime.sendMessage({ action: 'clearCookies' });
      } else {
        showStatus(response.error || 'Failed to send cookies', 'error');
      }
    }
  );
});

// Clear cookies
clearBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear the captured cookies?')) {
    chrome.runtime.sendMessage({ action: 'clearCookies' }, (response) => {
      if (response.success) {
        capturedCookies = null;
        cookieInfoDiv.classList.add('hidden');
        leagueSection.classList.add('hidden');
        actionsDiv.classList.add('hidden');
        clearBtn.classList.add('hidden');
        captureBtn.textContent = 'Capture ESPN Cookies';
        showStatus('Cookies cleared', 'info');
      }
    });
  }
});

// Open ESPN Fantasy
openEspnBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://fantasy.espn.com' });
  window.close();
});

// Initialize on load
document.addEventListener('DOMContentLoaded', init);