// Content script for ESPN Fantasy pages
// This runs on fantasy.espn.com pages to detect login status and provide notifications

console.log('[Rumbledore] Content script loaded on ESPN Fantasy');

// Check if user is logged in by looking for user elements
function checkLoginStatus() {
  // ESPN shows user info in various places when logged in
  const userElements = [
    document.querySelector('.user-profile-wrapper'),
    document.querySelector('.user--name'),
    document.querySelector('[class*="userName"]'),
    document.querySelector('.display-user'),
    document.querySelector('.user-links')
  ];
  
  const isLoggedIn = userElements.some(el => el !== null);
  
  // Also check for the presence of cookies in the page
  const hasCookies = document.cookie.includes('SWID') && document.cookie.includes('espn_s2');
  
  return isLoggedIn || hasCookies;
}

// Create a floating notification element
function createNotification(message, type = 'info') {
  // Remove any existing notifications
  const existing = document.getElementById('rumbledore-notification');
  if (existing) {
    existing.remove();
  }
  
  const notification = document.createElement('div');
  notification.id = 'rumbledore-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    padding: 16px 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 400px;
    animation: slideIn 0.3s ease-out;
    cursor: pointer;
  `;
  
  // Add icon
  const icon = document.createElement('div');
  icon.innerHTML = '🏈';
  icon.style.fontSize = '20px';
  notification.appendChild(icon);
  
  // Add message
  const text = document.createElement('div');
  text.textContent = message;
  notification.appendChild(text);
  
  // Add close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    margin-left: auto;
    background: none;
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.onclick = () => notification.remove();
  notification.appendChild(closeBtn);
  
  // Add click handler to open extension
  notification.onclick = (e) => {
    if (e.target !== closeBtn) {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    }
  };
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  #rumbledore-notification:hover {
    transform: scale(1.02);
    transition: transform 0.2s ease;
  }
`;
document.head.appendChild(style);

// Check login status and notify
function init() {
  const isLoggedIn = checkLoginStatus();
  
  if (isLoggedIn) {
    console.log('[Rumbledore] User is logged into ESPN Fantasy');
    
    // Check if this is the first visit after login
    chrome.storage.local.get(['hasShownLoginNotification'], (result) => {
      if (!result.hasShownLoginNotification) {
        createNotification(
          'ESPN login detected! Click the Rumbledore extension to capture your cookies.',
          'success'
        );
        chrome.storage.local.set({ hasShownLoginNotification: true });
      }
    });
    
    // Send message to background script
    chrome.runtime.sendMessage({ 
      action: 'espnLoginDetected',
      url: window.location.href
    });
  } else {
    console.log('[Rumbledore] User is not logged into ESPN Fantasy');
  }
}

// Add a Rumbledore button to the ESPN Fantasy nav if logged in
function addRumbledoreButton() {
  // Wait for the nav to load
  const checkNav = setInterval(() => {
    const nav = document.querySelector('.Nav__Primary') || 
               document.querySelector('.navigation') ||
               document.querySelector('[class*="nav"]');
    
    if (nav && checkLoginStatus()) {
      clearInterval(checkNav);
      
      // Check if button already exists
      if (document.getElementById('rumbledore-nav-button')) {
        return;
      }
      
      const button = document.createElement('button');
      button.id = 'rumbledore-nav-button';
      button.innerHTML = '🏈 Rumbledore';
      button.style.cssText = `
        background: #3b82f6;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        margin-left: 16px;
        transition: background 0.2s ease;
      `;
      
      button.onmouseover = () => {
        button.style.background = '#2563eb';
      };
      
      button.onmouseout = () => {
        button.style.background = '#3b82f6';
      };
      
      button.onclick = () => {
        createNotification('Click the Rumbledore extension icon to capture cookies', 'info');
      };
      
      // Try to find a good place to insert the button
      const userSection = nav.querySelector('.user-links') || 
                         nav.querySelector('[class*="user"]') ||
                         nav;
      
      if (userSection === nav) {
        nav.appendChild(button);
      } else {
        userSection.parentNode.insertBefore(button, userSection);
      }
    }
  }, 1000);
  
  // Stop checking after 10 seconds
  setTimeout(() => clearInterval(checkNav), 10000);
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkLoginStatus') {
    const isLoggedIn = checkLoginStatus();
    sendResponse({ isLoggedIn });
  } else if (request.action === 'showNotification') {
    createNotification(request.message, request.type);
    sendResponse({ success: true });
  }
  return true;
});

// Monitor for login state changes
let lastLoginState = checkLoginStatus();
setInterval(() => {
  const currentLoginState = checkLoginStatus();
  if (currentLoginState !== lastLoginState) {
    lastLoginState = currentLoginState;
    if (currentLoginState) {
      createNotification(
        'You are now logged in! Capture your cookies with Rumbledore.',
        'success'
      );
      addRumbledoreButton();
    }
  }
}, 5000);

// Initialize
init();
addRumbledoreButton();

// Also check when the page is fully loaded
window.addEventListener('load', () => {
  init();
  addRumbledoreButton();
});