# Rumbledore ESPN Cookie Capture Extension

## Overview
This Chrome extension securely captures ESPN Fantasy cookies for use with the Rumbledore platform. It enables automatic synchronization of your fantasy league data without storing your ESPN password.

## Installation Guide

### Step 1: Download the Extension
1. Navigate to the `browser-extension` folder in your Rumbledore project
2. Ensure all files are present:
   - `manifest.json`
   - `background.js`
   - `popup.html`
   - `popup.js`
   - `content.js`
   - `icons/` folder (optional, but recommended)

### Step 2: Install in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right corner)
3. Click "Load unpacked"
4. Select the `browser-extension` folder from your Rumbledore project
5. The extension should now appear in your extensions list

### Step 3: Pin the Extension
1. Click the puzzle piece icon in Chrome's toolbar
2. Find "Rumbledore ESPN Cookie Capture"
3. Click the pin icon to keep it visible in your toolbar

## Usage Instructions

### Capturing ESPN Cookies

1. **Log in to ESPN Fantasy**
   - Go to [fantasy.espn.com](https://fantasy.espn.com)
   - Sign in with your ESPN account
   - Navigate to your fantasy league

2. **Capture Cookies**
   - Click the Rumbledore extension icon in your toolbar
   - Click "Capture ESPN Cookies"
   - You should see your captured cookies displayed

3. **Send to Rumbledore**
   - Enter your League ID (UUID format) from the Rumbledore dashboard
   - Click "Send to Rumbledore"
   - The cookies will be encrypted and stored securely

### Important Notes

- **Security**: Cookies are encrypted using AES-256-GCM before storage
- **Privacy**: Your ESPN password is never captured or stored
- **Expiration**: ESPN cookies typically last 1 year
- **Re-authentication**: You'll need to recapture cookies if they expire

## Features

### Automatic Detection
The extension automatically detects when you're logged into ESPN Fantasy and displays a notification.

### Visual Indicators
- **Green badge (!)**: Cookies captured and ready to send
- **Popup status messages**: Clear feedback on all operations

### Persistent Storage
Captured cookies are stored locally until sent to Rumbledore, so you won't lose them if you close the popup.

## Troubleshooting

### "ESPN cookies not found"
- Make sure you're logged into ESPN Fantasy
- Try refreshing the ESPN page
- Clear your browser cache and log in again

### "Invalid League ID format"
- League IDs must be in UUID format (e.g., `123e4567-e89b-12d3-a456-426614174000`)
- Get your League ID from the Rumbledore dashboard

### Extension not working
1. Check Chrome console for errors:
   - Right-click extension icon → "Inspect popup"
   - Check for any red error messages
2. Reload the extension:
   - Go to `chrome://extensions/`
   - Click the refresh icon on the Rumbledore extension
3. Reinstall the extension:
   - Remove the extension
   - Follow installation steps again

### Cannot connect to Rumbledore
- Ensure your Rumbledore development server is running (`npm run dev`)
- Check that the server is accessible at `http://localhost:3000`
- For production, update the `RUMBLEDORE_URL` in `background.js`

## Development

### Testing Locally
1. Start your Rumbledore development server:
   ```bash
   npm run dev
   ```

2. The extension is configured to work with `http://localhost:3000` by default

3. To test with a different URL, edit `background.js`:
   ```javascript
   const RUMBLEDORE_URL = 'your-url-here';
   ```

### Creating Icons
The extension works without icons, but you should add them for a better user experience:

1. Create three PNG images:
   - `icons/icon-16.png` (16x16 pixels)
   - `icons/icon-48.png` (48x48 pixels)
   - `icons/icon-128.png` (128x128 pixels)

2. Use a football or fantasy sports theme
3. Recommended: Dark background (#1a1a2e) with blue accent (#3b82f6)

### Debugging
Enable debug logging by opening the browser console:
1. Right-click the extension icon
2. Select "Inspect popup"
3. Check the Console tab for debug messages

## Security Considerations

### What the Extension Accesses
- **Cookies**: Only from `*.espn.com` domains
- **Storage**: Local browser storage for temporary cookie storage
- **Tabs**: To detect which ESPN page you're on

### What the Extension Does NOT Do
- Does not capture passwords
- Does not access cookies from other sites
- Does not send data anywhere except your Rumbledore instance
- Does not run when you're not on ESPN pages

## API Integration

The extension communicates with these Rumbledore endpoints:
- `POST /api/espn/cookies` - Store captured cookies
- `GET /api/espn/cookies/validate` - Validate stored cookies

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the browser console for error messages
3. Check the Rumbledore server logs
4. Open an issue in the Rumbledore repository

## License

This extension is part of the Rumbledore platform and follows the same license terms.

---

**Version**: 1.0.0  
**Last Updated**: August 2025  
**Compatible With**: Chrome 88+, Edge 88+