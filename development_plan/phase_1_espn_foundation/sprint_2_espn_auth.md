# Sprint 2: ESPN Authentication System

## Sprint Overview
**Phase**: 1 - ESPN Foundation & Core Infrastructure  
**Sprint**: 2 of 4  
**Duration**: 2 weeks  
**Focus**: Implement secure ESPN cookie management with browser extension  
**Risk Level**: Medium (Browser extension complexity, cookie security)

## Objectives
1. Build browser extension for ESPN cookie capture
2. Implement secure cookie encryption/decryption
3. Create cookie validation and refresh logic
4. Develop admin UI for credential management
5. Establish error handling and retry mechanisms

## Prerequisites
- Sprint 1 completed (database, API structure)
- ESPN Fantasy account for testing
- Chrome browser for extension development
- Understanding of browser extension APIs

## Technical Tasks

### Task 1: Cookie Encryption Service (Day 1-2)

#### 1.1 Encryption Implementation
```typescript
// lib/crypto/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const IV_LENGTH = 16;
const ITERATIONS = 100000;

export class CookieEncryption {
  private key: Buffer;

  constructor(masterKey: string) {
    // Derive key from master key
    const salt = crypto.randomBytes(SALT_LENGTH);
    this.key = crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, 32, 'sha256');
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine salt, iv, tag, and encrypted data
    return Buffer.concat([
      Buffer.from(iv),
      tag,
      Buffer.from(encrypted, 'hex')
    ]).toString('base64');
  }

  decrypt(encryptedData: string): string {
    const buffer = Buffer.from(encryptedData, 'base64');
    
    const iv = buffer.slice(0, IV_LENGTH);
    const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// lib/crypto/cookie-manager.ts
import { CookieEncryption } from './encryption';
import { prisma } from '@/lib/prisma';

export interface ESPNCookies {
  swid: string;
  espnS2: string;
}

export class CookieManager {
  private encryption: CookieEncryption;

  constructor() {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
      throw new Error('ENCRYPTION_MASTER_KEY not configured');
    }
    this.encryption = new CookieEncryption(masterKey);
  }

  async storeCookies(
    userId: string,
    leagueId: string,
    cookies: ESPNCookies
  ): Promise<void> {
    const encryptedSwid = this.encryption.encrypt(cookies.swid);
    const encryptedEspnS2 = this.encryption.encrypt(cookies.espnS2);
    
    await prisma.espnCredential.upsert({
      where: {
        userId_leagueId: { userId, leagueId }
      },
      update: {
        encryptedSwid,
        encryptedEspnS2,
        lastValidated: new Date(),
        updatedAt: new Date()
      },
      create: {
        userId,
        leagueId,
        encryptedSwid,
        encryptedEspnS2,
        lastValidated: new Date()
      }
    });
  }

  async getCookies(
    userId: string,
    leagueId: string
  ): Promise<ESPNCookies | null> {
    const credential = await prisma.espnCredential.findUnique({
      where: {
        userId_leagueId: { userId, leagueId }
      }
    });

    if (!credential) {
      return null;
    }

    return {
      swid: this.encryption.decrypt(credential.encryptedSwid),
      espnS2: this.encryption.decrypt(credential.encryptedEspnS2)
    };
  }
}
```

### Task 2: Browser Extension Development (Day 3-5)

#### 2.1 Extension Manifest
```json
// browser-extension/manifest.json
{
  "manifest_version": 3,
  "name": "Rumbledore ESPN Cookie Capture",
  "version": "1.0.0",
  "description": "Securely capture ESPN Fantasy cookies for Rumbledore",
  "permissions": [
    "cookies",
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "https://*.espn.com/*",
    "http://localhost:3000/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://fantasy.espn.com/*"],
      "js": ["content.js"]
    }
  ]
}
```

#### 2.2 Background Service Worker
```javascript
// browser-extension/background.js
const RUMBLEDORE_URL = 'http://localhost:3000';
const ESPN_DOMAIN = '.espn.com';

// Listen for cookie changes
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.cookie.domain !== ESPN_DOMAIN) return;
  
  const { cookie } = changeInfo;
  if (cookie.name === 'SWID' || cookie.name === 'espn_s2') {
    await storeCookieUpdate(cookie);
  }
});

async function storeCookieUpdate(cookie) {
  const stored = await chrome.storage.local.get(['cookies']);
  const cookies = stored.cookies || {};
  
  cookies[cookie.name] = {
    value: cookie.value,
    expirationDate: cookie.expirationDate,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure
  };
  
  await chrome.storage.local.set({ cookies });
}

// Capture cookies on demand
async function captureESPNCookies() {
  try {
    const swid = await chrome.cookies.get({
      url: 'https://fantasy.espn.com',
      name: 'SWID'
    });
    
    const espnS2 = await chrome.cookies.get({
      url: 'https://fantasy.espn.com',
      name: 'espn_s2'
    });
    
    if (!swid || !espnS2) {
      throw new Error('ESPN cookies not found. Please log in to ESPN Fantasy.');
    }
    
    return {
      swid: swid.value.replace(/[{"}]/g, ''), // Clean SWID format
      espnS2: espnS2.value,
      capturedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Failed to capture cookies:', error);
    throw error;
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureCookies') {
    captureESPNCookies()
      .then(cookies => sendResponse({ success: true, cookies }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'sendToRumbledore') {
    sendCookiesToRumbledore(request.cookies)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function sendCookiesToRumbledore(cookies) {
  const response = await fetch(`${RUMBLEDORE_URL}/api/espn/cookies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(cookies)
  });
  
  if (!response.ok) {
    throw new Error('Failed to send cookies to Rumbledore');
  }
  
  return response.json();
}
```

#### 2.3 Extension Popup UI
```html
<!-- browser-extension/popup.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      width: 350px;
      padding: 16px;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .status {
      padding: 8px;
      border-radius: 4px;
      font-size: 14px;
    }
    .status.success {
      background: #10b981;
      color: white;
    }
    .status.error {
      background: #ef4444;
      color: white;
    }
    .status.warning {
      background: #f59e0b;
      color: white;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: #3b82f6;
      color: white;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover {
      background: #2563eb;
    }
    button:disabled {
      background: #94a3b8;
      cursor: not-allowed;
    }
    .cookie-info {
      font-size: 12px;
      color: #64748b;
      padding: 8px;
      background: #f1f5f9;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h3>Rumbledore ESPN Integration</h3>
    <div id="status" class="status" style="display: none;"></div>
    <button id="capture">Capture ESPN Cookies</button>
    <button id="send" style="display: none;">Send to Rumbledore</button>
    <div id="cookie-info" class="cookie-info" style="display: none;"></div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

```javascript
// browser-extension/popup.js
const captureBtn = document.getElementById('capture');
const sendBtn = document.getElementById('send');
const statusDiv = document.getElementById('status');
const cookieInfoDiv = document.getElementById('cookie-info');

let capturedCookies = null;

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  statusDiv.style.display = 'none';
  
  chrome.runtime.sendMessage(
    { action: 'captureCookies' },
    (response) => {
      captureBtn.disabled = false;
      
      if (response.success) {
        capturedCookies = response.cookies;
        showStatus('Cookies captured successfully!', 'success');
        displayCookieInfo(response.cookies);
        sendBtn.style.display = 'block';
      } else {
        showStatus(response.error, 'error');
      }
    }
  );
});

sendBtn.addEventListener('click', async () => {
  if (!capturedCookies) return;
  
  sendBtn.disabled = true;
  
  chrome.runtime.sendMessage(
    { action: 'sendToRumbledore', cookies: capturedCookies },
    (response) => {
      sendBtn.disabled = false;
      
      if (response.success) {
        showStatus('Cookies sent to Rumbledore!', 'success');
        sendBtn.style.display = 'none';
      } else {
        showStatus(response.error, 'error');
      }
    }
  );
});

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
}

function displayCookieInfo(cookies) {
  cookieInfoDiv.innerHTML = `
    <strong>Captured Cookies:</strong><br>
    SWID: ${cookies.swid.substring(0, 20)}...<br>
    ESPN_S2: ${cookies.espnS2.substring(0, 20)}...<br>
    Captured: ${new Date(cookies.capturedAt).toLocaleString()}
  `;
  cookieInfoDiv.style.display = 'block';
}
```

### Task 3: Cookie Validation Logic (Day 6-7)

#### 3.1 ESPN API Validator
```typescript
// lib/espn/validator.ts
import { ESPNCookies } from '@/lib/crypto/cookie-manager';

export class ESPNValidator {
  private baseUrl = 'https://fantasy.espn.com/apis/v3/games/ffl';

  async validateCookies(
    cookies: ESPNCookies,
    leagueId: number,
    season: number
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/seasons/${season}/segments/0/leagues/${leagueId}`,
        {
          headers: {
            'Cookie': `SWID={${cookies.swid}}; espn_s2=${cookies.espnS2}`,
            'Accept': 'application/json'
          }
        }
      );

      if (response.status === 401) {
        return false; // Invalid cookies
      }

      if (response.status === 404) {
        throw new Error('League not found');
      }

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status}`);
      }

      const data = await response.json();
      return !!data.id; // Valid if we got league data
    } catch (error) {
      console.error('Cookie validation error:', error);
      return false;
    }
  }

  async refreshCookies(
    currentCookies: ESPNCookies
  ): Promise<ESPNCookies | null> {
    // ESPN cookies typically don't refresh programmatically
    // This would trigger a user notification to re-authenticate
    return null;
  }
}

// lib/espn/cookie-refresh.ts
import { CookieManager } from '@/lib/crypto/cookie-manager';
import { ESPNValidator } from './validator';
import { prisma } from '@/lib/prisma';

export class CookieRefreshService {
  private manager: CookieManager;
  private validator: ESPNValidator;

  constructor() {
    this.manager = new CookieManager();
    this.validator = new ESPNValidator();
  }

  async validateAndRefresh(
    userId: string,
    leagueId: string
  ): Promise<boolean> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId }
    });

    if (!league) {
      throw new Error('League not found');
    }

    const cookies = await this.manager.getCookies(userId, leagueId);
    if (!cookies) {
      return false;
    }

    const isValid = await this.validator.validateCookies(
      cookies,
      Number(league.espnLeagueId),
      league.season
    );

    if (isValid) {
      // Update last validated timestamp
      await prisma.espnCredential.update({
        where: {
          userId_leagueId: { userId, leagueId }
        },
        data: {
          lastValidated: new Date()
        }
      });
    } else {
      // Mark as expired
      await prisma.espnCredential.update({
        where: {
          userId_leagueId: { userId, leagueId }
        },
        data: {
          expiresAt: new Date()
        }
      });
    }

    return isValid;
  }
}
```

### Task 4: API Endpoints (Day 8-9)

#### 4.1 Cookie Management API
```typescript
// app/api/espn/cookies/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CookieManager } from '@/lib/crypto/cookie-manager';
import { ESPNValidator } from '@/lib/espn/validator';
import { createApiHandler, validateRequest } from '@/lib/api/handler';

const CookieSchema = z.object({
  swid: z.string(),
  espnS2: z.string(),
  leagueId: z.string().uuid(),
});

export const POST = createApiHandler(async (request, context) => {
  const body = await request.json();
  const { swid, espnS2, leagueId } = validateRequest(CookieSchema, body);
  
  // Get user from session
  const userId = context.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const manager = new CookieManager();
  const validator = new ESPNValidator();

  // Validate cookies before storing
  const league = await prisma.league.findUnique({
    where: { id: leagueId }
  });

  if (!league) {
    return NextResponse.json(
      { error: 'League not found' },
      { status: 404 }
    );
  }

  const isValid = await validator.validateCookies(
    { swid, espnS2 },
    Number(league.espnLeagueId),
    league.season
  );

  if (!isValid) {
    return NextResponse.json(
      { error: 'Invalid ESPN cookies' },
      { status: 400 }
    );
  }

  await manager.storeCookies(userId, leagueId, { swid, espnS2 });

  return NextResponse.json({
    success: true,
    message: 'Cookies stored successfully'
  });
});

export const GET = createApiHandler(async (request, context) => {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get('leagueId');

  if (!leagueId) {
    return NextResponse.json(
      { error: 'League ID required' },
      { status: 400 }
    );
  }

  const userId = context.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const credential = await prisma.espnCredential.findUnique({
    where: {
      userId_leagueId: { userId, leagueId }
    },
    select: {
      lastValidated: true,
      expiresAt: true,
      createdAt: true
    }
  });

  if (!credential) {
    return NextResponse.json({
      hasCredentials: false
    });
  }

  const isExpired = credential.expiresAt && credential.expiresAt < new Date();

  return NextResponse.json({
    hasCredentials: true,
    isExpired,
    lastValidated: credential.lastValidated,
    createdAt: credential.createdAt
  });
});
```

### Task 5: Admin UI for Credentials (Day 10-11)

#### 5.1 Credential Management Component
```tsx
// components/admin/credential-manager.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

interface CredentialStatus {
  hasCredentials: boolean;
  isExpired: boolean;
  lastValidated?: string;
  createdAt?: string;
}

export function CredentialManager({ leagueId }: { leagueId: string }) {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [leagueId]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/espn/cookies?leagueId=${leagueId}`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch credential status:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateCredentials = async () => {
    setValidating(true);
    try {
      const response = await fetch(`/api/espn/cookies/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId })
      });
      
      const result = await response.json();
      if (result.valid) {
        await fetchStatus();
      }
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return <div>Loading credential status...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          ESPN Credentials
        </CardTitle>
        <CardDescription>
          Manage ESPN Fantasy authentication for data synchronization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.hasCredentials ? (
          <>
            <Alert className={status.isExpired ? 'border-orange-500' : 'border-green-500'}>
              <AlertDescription className="flex items-center gap-2">
                {status.isExpired ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span>Credentials expired. Please update.</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Credentials active</span>
                  </>
                )}
              </AlertDescription>
            </Alert>

            <div className="text-sm text-muted-foreground space-y-1">
              <p>Created: {new Date(status.createdAt!).toLocaleString()}</p>
              {status.lastValidated && (
                <p>Last validated: {new Date(status.lastValidated).toLocaleString()}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={validateCredentials}
                disabled={validating}
                variant="outline"
                size="sm"
              >
                {validating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  'Validate'
                )}
              </Button>
              <Button variant="outline" size="sm">
                Update Credentials
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert>
              <AlertDescription>
                No ESPN credentials found. Install the browser extension and capture cookies from ESPN Fantasy.
              </AlertDescription>
            </Alert>
            <Button>Setup ESPN Integration</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

### Task 6: Error Handling & Retry (Day 12)

#### 6.1 Retry Logic Implementation
```typescript
// lib/utils/retry.ts
export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: any) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    shouldRetry = () => true
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError;
}

// lib/espn/error-handler.ts
export class ESPNError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ESPNError';
  }
}

export function handleESPNError(error: any): never {
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 401:
        throw new ESPNError(
          'Invalid or expired ESPN credentials',
          'AUTH_INVALID',
          401,
          false
        );
      case 404:
        throw new ESPNError(
          'League not found',
          'LEAGUE_NOT_FOUND',
          404,
          false
        );
      case 429:
        throw new ESPNError(
          'Rate limit exceeded',
          'RATE_LIMIT',
          429,
          true
        );
      case 500:
      case 502:
      case 503:
        throw new ESPNError(
          'ESPN service temporarily unavailable',
          'SERVICE_UNAVAILABLE',
          status,
          true
        );
      default:
        throw new ESPNError(
          `ESPN API error: ${status}`,
          'API_ERROR',
          status,
          false
        );
    }
  }
  
  throw new ESPNError(
    'Network error connecting to ESPN',
    'NETWORK_ERROR',
    undefined,
    true
  );
}
```

## Validation Criteria

### Security Checklist
- [ ] Cookies encrypted with AES-256-GCM
- [ ] Master key stored securely in environment
- [ ] No plaintext cookies in database
- [ ] HTTPS only for cookie transmission
- [ ] Browser extension uses secure messaging

### Functionality Checklist
- [ ] Browser extension captures cookies
- [ ] Cookies validated against ESPN API
- [ ] Encrypted storage working
- [ ] Decryption for API use working
- [ ] Admin UI displays status correctly

### Error Handling Checklist
- [ ] Invalid cookies handled gracefully
- [ ] Expired cookies detected
- [ ] Network errors retry appropriately
- [ ] Rate limits respected
- [ ] User notifications for failures

## Testing Instructions

### Manual Testing
1. Install browser extension in Chrome
2. Log in to ESPN Fantasy
3. Click extension icon and capture cookies
4. Send cookies to Rumbledore
5. Verify in admin UI
6. Test validation endpoint
7. Test with invalid cookies

### Automated Tests
```typescript
// __tests__/lib/crypto/encryption.test.ts
describe('CookieEncryption', () => {
  it('should encrypt and decrypt cookies', () => {
    const encryption = new CookieEncryption('test-key');
    const original = 'test-cookie-value';
    
    const encrypted = encryption.encrypt(original);
    const decrypted = encryption.decrypt(encrypted);
    
    expect(decrypted).toBe(original);
    expect(encrypted).not.toBe(original);
  });
});

// __tests__/lib/espn/validator.test.ts
describe('ESPNValidator', () => {
  it('should validate valid cookies', async () => {
    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 123456 })
    });
    
    const validator = new ESPNValidator();
    const result = await validator.validateCookies(
      { swid: 'test', espnS2: 'test' },
      123456,
      2024
    );
    
    expect(result).toBe(true);
  });
});
```

## Deliverables

### Code Deliverables
- ✅ Cookie encryption service
- ✅ Browser extension (Chrome)
- ✅ Cookie validation logic
- ✅ API endpoints for cookie management
- ✅ Admin UI component
- ✅ Error handling and retry logic

### Documentation Deliverables
- ✅ Extension installation guide
- ✅ Cookie capture instructions
- ✅ Security documentation
- ✅ API endpoint documentation
- ✅ Troubleshooting guide

## Success Metrics
- Cookie encryption working: ✅
- Extension capturing cookies: ✅
- Validation against ESPN: ✅
- Admin UI functional: ✅
- Error handling robust: ✅

---

*Sprint 2 establishes secure ESPN authentication. Ensure all security measures are properly implemented before proceeding.*