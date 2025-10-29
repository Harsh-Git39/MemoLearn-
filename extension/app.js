const API_BASE = 'http://localhost:3000';

// BACKGROUND LOGIC (Service Worker)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // Match query with backend
    if (request.action === 'matchQuery') {
      fetch(`${API_BASE}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: request.query })
      })
      .then(res => res.json())
      .then(data => sendResponse({ matches: data.matches || [] }))
      .catch(err => sendResponse({ error: err.message }));
      
      return true; // Keep channel open for async response
    }
    
    // Save query to backend
    if (request.action === 'saveQuery') {
      fetch(`${API_BASE}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: request.query,
          answer: request.answer,
          id: request.id
        })
      })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ error: err.message }));
      
      return true;
    }
    
    // Delete query
    if (request.action === 'deleteQuery') {
      fetch(`${API_BASE}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: request.id })
      })
      .then(res => res.json())
      .then(data => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
      
      return true;
    }
  });

  // Listen for tab updates (new searches)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      const isSearchPage = tab.url.includes('google.com/search') || 
                          tab.url.includes('bing.com/search');
      
      if (isSearchPage) {
        const url = new URL(tab.url);
        const query = url.searchParams.get('q');
        
        if (query) {
          chrome.tabs.sendMessage(tabId, {
            action: 'checkQuery',
            query: query
          }).catch(err => console.log('Tab not ready:', err));
        }
      }
    }
  });
}

// CONTENT SCRIPT LOGIC (runs in page context)
if (typeof window !== 'undefined' && window.location) {
  
  // Extract current search query from page
  function getCurrentQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  }
  
  // Initialize on page load
  function init() {
    const query = getCurrentQuery();
    if (query) {
      checkForMatches(query);
    }
  }
  
  // Check if query has matches
  function checkForMatches(query) {
    chrome.runtime.sendMessage({
      action: 'matchQuery',
      query: query
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('MemoLearn: Connection error', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.matches && response.matches.length > 0) {
        showPopup(response.matches);
      }
    });
  }
  
  // Inject popup into page
  function showPopup(matches) {
    fetch(`${API_BASE}/popup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches: matches })
    })
    .then(res => res.text())
    .then(html => {
      // Remove existing popup if any
      const existing = document.getElementById('memolearn-popup');
      if (existing) existing.remove();
      
      // Create popup container
      const container = document.createElement('div');
      container.innerHTML = html;
      
      // Inject into page
      const searchContainer = document.querySelector('#search') || 
                             document.querySelector('#b_results') || 
                             document.body;
      
      searchContainer.insertAdjacentElement('afterbegin', container.firstElementChild);
      
      // Attach event listeners
      attachEventListeners();
    })
    .catch(err => console.error('MemoLearn: Failed to load popup', err));
  }
  
  // Handle user actions
  function attachEventListeners() {
    
    // Close button
    const closeBtn = document.querySelector('.memolearn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const popup = document.getElementById('memolearn-popup');
        if (popup) popup.remove();
      });
    }
    
    // Pin buttons
    document.querySelectorAll('.memolearn-pin').forEach(btn => {
      btn.addEventListener('click', function() {
        const query = this.dataset.query;
        const answer = this.dataset.answer;
        const id = this.dataset.id;
        
        chrome.runtime.sendMessage({
          action: 'saveQuery',
          query: query,
          answer: answer,
          id: id
        }, (response) => {
          if (response && response.success) {
            this.textContent = '✓ Pinned';
            this.disabled = true;
            setTimeout(() => {
              this.textContent = '📌 Pin';
              this.disabled = false;
            }, 2000);
          }
        });
      });
    });
    
    // Copy buttons
    document.querySelectorAll('.memolearn-copy').forEach(btn => {
      btn.addEventListener('click', function() {
        const answer = this.dataset.answer;
        navigator.clipboard.writeText(answer).then(() => {
          this.textContent = '✓ Copied';
          setTimeout(() => {
            this.textContent = '📋 Copy';
          }, 1500);
        });
      });
    });
    
    // Delete buttons
    document.querySelectorAll('.memolearn-delete').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.dataset.id;
        
        if (confirm('Delete this saved query?')) {
          chrome.runtime.sendMessage({
            action: 'deleteQuery',
            id: id
          }, (response) => {
            if (response && response.success) {
              const item = this.closest('.memolearn-item');
              item.style.transition = 'opacity 0.3s';
              item.style.opacity = '0';
              setTimeout(() => item.remove(), 300);
            }
          });
        }
      });
    });
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkQuery') {
      checkForMatches(request.query);
    }
  });
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}