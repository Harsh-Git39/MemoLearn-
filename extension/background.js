// background.js - Service Worker for MemoLearn with Context Menu Support
const API_BASE = 'http://localhost:3000';

console.log('[MemoLearn] Background service worker initialized');

// ============================================
// CREATE CONTEXT MENU ON INSTALL
// ============================================
chrome.runtime.onInstalled.addListener(() => {
  console.log('[MemoLearn] Extension installed/updated');
  
  // Create context menu for text selection
  chrome.contextMenus.create({
    id: "pin-to-memolearn",
    title: "📌 Pin to MemoLearn",
    contexts: ["selection"]
  });
  
  console.log('[MemoLearn] Context menu created');
});

// ============================================
// UPDATE CONTEXT MENU BASED ON CURRENT QUERY
// ============================================
// Update menu title when query changes
function updateContextMenuTitle(query) {
  if (query) {
    chrome.contextMenus.update("pin-to-memolearn", {
      title: `📌 Pin to MemoLearn: "${query.substring(0, 30)}${query.length > 30 ? '...' : ''}"`
    });
  } else {
    chrome.contextMenus.update("pin-to-memolearn", {
      title: "📌 Pin to MemoLearn"
    });
  }
}

// ============================================
// HANDLE CONTEXT MENU CLICKS
// ============================================
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pin-to-memolearn") {
    console.log('[MemoLearn] Context menu clicked');
    console.log('[MemoLearn] Selected text:', info.selectionText?.substring(0, 50));
    
    // Get current query from session storage
    chrome.storage.session.get(['currentQuery'], (result) => {
      const query = result.currentQuery || 'Manual Entry';
      const selectedText = info.selectionText;
      
      if (!selectedText) {
        console.error('[MemoLearn] No text selected');
        return;
      }
      
      console.log('[MemoLearn] Pinning with query:', query);
      
      // Save to backend
      fetch(`${API_BASE}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          answer: selectedText,
          id: Date.now().toString()
        })
      })
      .then(res => res.json())
      .then(data => {
        console.log('[MemoLearn] Save response:', data);
        
        if (data.success) {
          // Show success notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '✅ MemoLearn',
            message: `Pinned successfully!\nQuery: ${query.substring(0, 40)}${query.length > 40 ? '...' : ''}`
          });
        } else {
          // Show error notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '❌ MemoLearn',
            message: data.error || 'Failed to pin answer'
          });
        }
      })
      .catch(err => {
        console.error('[MemoLearn] Save error:', err);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '❌ MemoLearn Error',
          message: 'Could not connect to server. Make sure it\'s running on localhost:3000'
        });
      });
    });
  }
});

// ============================================
// LISTEN FOR MESSAGES FROM CONTENT SCRIPT
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Match query with backend
  if (request.action === 'matchQuery') {
    console.log('[MemoLearn] Matching query:', request.query);
    
    fetch(`${API_BASE}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: request.query })
    })
    .then(res => res.json())
    .then(data => {
      console.log('[MemoLearn] Match results:', data.matches?.length || 0, 'matches');
      sendResponse({ 
        success: true,
        matches: data.matches || [] 
      });
    })
    .catch(err => {
      console.error('[MemoLearn] Match error:', err);
      sendResponse({ 
        success: false,
        error: err.message 
      });
    });
    
    return true; // Keep channel open for async response
  }

    // ✅ NEW: Get popup HTML via background script (CSP bypass)
  if (request.action === 'getPopupHTML') {
    console.log('[MemoLearn] Fetching popup HTML for', request.matches?.length || 0, 'matches');
    
    fetch(`${API_BASE}/popup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches: request.matches || [] })
    })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }
      return res.text();
    })
    .then(html => {
      console.log('[MemoLearn] Popup HTML fetched successfully');
      sendResponse({
        success: true,
        html: html
      });
    })
    .catch(err => {
      console.error('[MemoLearn] Error fetching popup HTML:', err);
      sendResponse({
        success: false,
        error: err.message
      });
    });
    
    return true; // Keep channel open for async response
  }

  
  // Save query to backend
  if (request.action === 'saveQuery') {
    console.log('[MemoLearn] Saving query via message');
    
    fetch(`${API_BASE}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: request.query,
        answer: request.answer,
        id: request.id || Date.now().toString()
      })
    })
    .then(res => res.json())
    .then(data => {
      console.log('[MemoLearn] Save response:', data);
      sendResponse({ 
        success: data.success || false,
        message: data.message,
        item: data.item
      });
    })
    .catch(err => {
      console.error('[MemoLearn] Save error:', err);
      sendResponse({ 
        success: false,
        error: err.message 
      });
    });
    
    return true;
  }
  
  // Delete query
  if (request.action === 'deleteQuery') {
    console.log('[MemoLearn] Deleting query:', request.id);
    
    fetch(`${API_BASE}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: request.id })
    })
    .then(res => res.json())
    .then(data => {
      console.log('[MemoLearn] Delete response:', data);
      sendResponse({ 
        success: data.success || false,
        message: data.message
      });
    })
    .catch(err => {
      console.error('[MemoLearn] Delete error:', err);
      sendResponse({ 
        success: false,
        error: err.message 
      });
    });
    
    return true;
  }
  
  // Update context menu title
  if (request.action === 'updateContextMenu') {
    console.log('[MemoLearn] Updating context menu for query:', request.query);
    updateContextMenuTitle(request.query);
    sendResponse({ success: true });
    return true;
  }
});

// ============================================
// LISTEN FOR TAB UPDATES (NEW SEARCHES)
// ============================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isSearchPage = tab.url.includes('google.com/search') || 
                        tab.url.includes('bing.com/search');
    
    if (isSearchPage) {
      try {
        const url = new URL(tab.url);
        const query = url.searchParams.get('q');
        
        if (query) {
          console.log('[MemoLearn] New search detected:', query);
          
          // Store query in session storage
          chrome.storage.session.set({ currentQuery: query }, () => {
            console.log('[MemoLearn] Query stored in session');
          });
          
          // Update context menu
          updateContextMenuTitle(query);
          
          // Send to content script
          chrome.tabs.sendMessage(tabId, {
            action: 'checkQuery',
            query: query
          }).catch(err => {
            console.log('[MemoLearn] Tab not ready yet:', err.message);
          });
        }
      } catch (err) {
        console.error('[MemoLearn] URL parse error:', err);
      }
    }
  }
});

// ============================================
// MONITOR STORAGE CHANGES (FOR DEBUGGING)
// ============================================
chrome.storage.session.onChanged.addListener((changes, areaName) => {
  if (changes.currentQuery) {
    console.log('[MemoLearn] Query changed:', changes.currentQuery.newValue);
  }
});

console.log('[MemoLearn] All listeners registered');