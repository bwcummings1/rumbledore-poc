// Rumbledore ESPN Cookie Capture - Background Service Worker

const RUMBLEDORE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://rumbledore.app' 
  : 'http://localhost:3000';
const ESPN_DOMAIN = '.espn.com';
const ESPN_FANTASY_URL = 'https://fantasy.espn.com';

// Store state
let capturedCookies = null;
let lastCaptureTime = null;

/**
 * Listen for cookie changes on ESPN domain
 */
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!changeInfo.cookie.domain.includes('espn.com')) return;
  
  const { cookie } = changeInfo;
  
  // We're interested in SWID and espn_s2 cookies
  if (cookie.name === 'SWID' || cookie.name === 'espn_s2') {
    console.log(`ESPN cookie ${cookie.name} changed:`, changeInfo.cause);
    
    // Store the cookie change in local storage
    chrome.storage.local.get(['espnCookies'], (result) => {
      const cookies = result.espnCookies || {};
      cookies[cookie.name] = {
        value: cookie.value,
        domain: cookie.domain,
        expirationDate: cookie.expirationDate,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
        updatedAt: new Date().toISOString()
      };
      
      chrome.storage.local.set({ espnCookies: cookies });
      
      // Update badge to show cookies are available
      updateExtensionBadge(true);
    });
  }
});

/**
 * Capture ESPN cookies on demand
 */
async function captureESPNCookies() {
  try {
    // Get SWID cookie
    const swid = await chrome.cookies.get({
      url: ESPN_FANTASY_URL,
      name: 'SWID'
    });
    
    // Get espn_s2 cookie
    const espnS2 = await chrome.cookies.get({
      url: ESPN_FANTASY_URL,
      name: 'espn_s2'
    });
    
    if (!swid || !espnS2) {
      throw new Error('ESPN cookies not found. Please log in to ESPN Fantasy first.');
    }
    
    // Clean and format the cookies
    const cookies = {
      swid: swid.value.replace(/[{"}]/g, ''), // Remove braces and quotes from SWID
      espnS2: espnS2.value,
      capturedAt: new Date().toISOString(),
      domain: ESPN_DOMAIN,
      expiresAt: new Date(Math.min(
        swid.expirationDate ? swid.expirationDate * 1000 : Date.now() + 365 * 24 * 60 * 60 * 1000,
        espnS2.expirationDate ? espnS2.expirationDate * 1000 : Date.now() + 365 * 24 * 60 * 60 * 1000
      )).toISOString()
    };
    
    // Store in memory and local storage
    capturedCookies = cookies;
    lastCaptureTime = Date.now();
    await chrome.storage.local.set({ 
      capturedCookies: cookies,
      lastCaptureTime: lastCaptureTime 
    });
    
    return cookies;
  } catch (error) {
    console.error('Failed to capture ESPN cookies:', error);
    throw error;
  }
}

/**
 * Send cookies to Rumbledore backend
 */
async function sendCookiesToRumbledore(cookies, leagueId) {
  try {
    const response = await fetch(`${RUMBLEDORE_URL}/api/espn/cookies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': chrome.runtime.getManifest().version
      },
      body: JSON.stringify({
        swid: cookies.swid,
        espnS2: cookies.espnS2,
        leagueId: leagueId,
        capturedAt: cookies.capturedAt
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send cookies to Rumbledore');
    }
    
    const result = await response.json();
    
    // Clear stored cookies after successful send
    await chrome.storage.local.remove(['capturedCookies']);
    capturedCookies = null;
    
    // Update badge
    updateExtensionBadge(false);
    
    return result;
  } catch (error) {
    console.error('Failed to send cookies:', error);
    throw error;
  }
}

/**
 * Validate cookies against ESPN API
 */
async function validateCookies(cookies) {
  try {
    // Try to fetch user's leagues as a validation test
    const testUrl = 'https://fantasy.espn.com/apis/v3/games/ffl/seasons/2024/segments/0/leagues?view=mTeam';
    
    const response = await fetch(testUrl, {
      headers: {
        'Cookie': `SWID={${cookies.swid}}; espn_s2=${cookies.espnS2}`
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Cookie validation failed:', error);
    return false;
  }
}

/**
 * Update extension badge
 */
function updateExtensionBadge(hasCookies) {
  if (hasCookies) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Green
    chrome.action.setTitle({ title: 'ESPN cookies captured - Click to send' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Rumbledore ESPN Integration' });
  }
}

/**
 * Check for existing cookies on startup
 */
chrome.runtime.onStartup.addListener(async () => {
  const result = await chrome.storage.local.get(['capturedCookies']);
  if (result.capturedCookies) {
    updateExtensionBadge(true);
  }
});

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);
  
  switch (request.action) {
    case 'captureCookies':
      captureESPNCookies()
        .then(cookies => {
          sendResponse({ success: true, cookies });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response
      
    case 'sendToRumbledore':
      if (!request.cookies || !request.leagueId) {
        sendResponse({ success: false, error: 'Missing required data' });
        return false;
      }
      
      sendCookiesToRumbledore(request.cookies, request.leagueId)
        .then(result => {
          sendResponse({ success: true, result });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response
      
    case 'validateCookies':
      if (!request.cookies) {
        sendResponse({ success: false, error: 'No cookies to validate' });
        return false;
      }
      
      validateCookies(request.cookies)
        .then(isValid => {
          sendResponse({ success: true, isValid });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response
      
    case 'getCapturedCookies':
      chrome.storage.local.get(['capturedCookies'], (result) => {
        sendResponse({ 
          success: true, 
          cookies: result.capturedCookies || null 
        });
      });
      return true; // Keep channel open for async response
      
    case 'clearCookies':
      chrome.storage.local.remove(['capturedCookies'], () => {
        capturedCookies = null;
        updateExtensionBadge(false);
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response
      
    case 'checkESPNLogin':
      // Check if user is logged into ESPN
      chrome.cookies.getAll({ domain: ESPN_DOMAIN }, (cookies) => {
        const hasSwid = cookies.some(c => c.name === 'SWID');
        const hasEspnS2 = cookies.some(c => c.name === 'espn_s2');
        sendResponse({ 
          success: true, 
          isLoggedIn: hasSwid && hasEspnS2 
        });
      });
      return true; // Keep channel open for async response
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

/**
 * Open ESPN Fantasy when extension is installed
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open ESPN Fantasy in a new tab
    chrome.tabs.create({
      url: 'https://fantasy.espn.com/',
      active: true
    });
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Rumbledore Extension Installed',
      message: 'Please log in to ESPN Fantasy to capture your cookies.'
    });
  }
});

/**
 * Context menu for quick actions
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'captureESPNCookies',
    title: 'Capture ESPN Cookies',
    contexts: ['page'],
    documentUrlPatterns: ['https://fantasy.espn.com/*']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'captureESPNCookies') {
    captureESPNCookies()
      .then(() => {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: 'Cookies Captured',
          message: 'ESPN cookies captured successfully. Click the extension icon to send them to Rumbledore.'
        });
      })
      .catch(error => {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: 'Capture Failed',
          message: error.message
        });
      });
  }
});

// Log for debugging
console.log('Rumbledore ESPN Cookie Capture background service worker loaded');