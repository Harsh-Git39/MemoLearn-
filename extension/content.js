



//gpt
// content.js - Content Script for MemoLearn (runs on ALL pages) - FIXED VERSION
const API_BASE = 'http://localhost:3000';

console.log('[MemoLearn] Content script loaded on:', window.location.href);

// ============================================
// CHECK IF CURRENT PAGE IS A SEARCH PAGE
// ============================================
function isSearchPage() {
  const url = window.location.href;
  return url.includes('google.com/search') || url.includes('bing.com/search');
}

// ============================================
// EXTRACT CURRENT SEARCH QUERY FROM PAGE
// ============================================
function getCurrentQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('q') || '';
}

// ============================================
// INITIALIZE ON PAGE LOAD
// ============================================
function init() {
  if (!isSearchPage()) {
    console.log('[MemoLearn] Not a search page, skipping popup check');
    console.log('[MemoLearn] Context menu will still work for text selection');
    
    // Check if there's a stored query for context menu
    chrome.storage.session.get(['currentQuery'], (result) => {
      if (result.currentQuery) {
        console.log('[MemoLearn] Active query from session:', result.currentQuery);
      } else {
        console.log('[MemoLearn] No active query in session');
      }
    });
    
    return;
  }
  
  // This is a search page
  const query = getCurrentQuery();
  if (query) {
    console.log('[MemoLearn] Search page query found:', query);
    
    // Store query in session storage
    chrome.storage.session.set({ currentQuery: query }, () => {
      console.log('[MemoLearn] Query saved to session');
    });
    
    // Update context menu in background
    chrome.runtime.sendMessage({
      action: 'updateContextMenu',
      query: query
    });
    
    // Check for matches and show popup
    checkForMatches(query);
  }
}

// ============================================
// CHECK IF QUERY HAS MATCHES
// ============================================
function checkForMatches(query) {
  console.log('[MemoLearn] Checking matches for:', query);
  
  chrome.runtime.sendMessage({
    action: 'matchQuery',
    query: query
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[MemoLearn] Connection error:', chrome.runtime.lastError);
      return;
    }
    
    if (response && response.success && response.matches && response.matches.length > 0) {
      console.log('[MemoLearn] Found matches:', response.matches.length);
      showPopup(response.matches);
    } else {
      console.log('[MemoLearn] No matches found');
    }
  });
}

// ============================================
// INJECT POPUP INTO PAGE - FIXED VERSION
// ============================================
function showPopup(matches) {
  console.log('[MemoLearn] Showing popup with', matches.length, 'matches');
  
  // ✅ FIXED: Send message to background script instead of direct fetch
  // This avoids CSP (Content Security Policy) blocking on Google.com
  chrome.runtime.sendMessage({
    action: 'getPopupHTML',
    matches: matches
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[MemoLearn] Connection error:', chrome.runtime.lastError);
      return;
    }
    
    if (response && response.success && response.html) {
      // Remove existing popup if any
      const existing = document.getElementById('memolearn-popup');
      if (existing) {
        console.log('[MemoLearn] Removing existing popup');
        existing.remove();
      }
      
      // Create popup container
      const container = document.createElement('div');
      container.innerHTML = response.html;
      
      // Inject into page (only on search pages)
      const searchContainer = document.querySelector('#search') || 
                             document.querySelector('#b_results') || 
                             document.body;
      
      searchContainer.insertAdjacentElement('afterbegin', container.firstElementChild);
      console.log('[MemoLearn] Popup injected successfully');
      
      // Attach event listeners AFTER popup is in DOM
      attachEventListeners();
    } else {
      console.error('[MemoLearn] Failed to load popup:', response?.error || 'Unknown error');
    }
  });
}

// ============================================
// HANDLE USER ACTIONS ON POPUP
// ============================================
function attachEventListeners() {
  console.log('[MemoLearn] Attaching event listeners');
  
  // Close button
  const closeBtn = document.querySelector('.memolearn-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      console.log('[MemoLearn] Closing popup');
      const popup = document.getElementById('memolearn-popup');
      if (popup) popup.remove();
    });
  }
  
  // Pin buttons
  document.querySelectorAll('.memolearn-pin').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      
      const query = this.dataset.query;
      const answer = this.dataset.answer;
      const id = this.dataset.id;
      
      console.log('[MemoLearn] Pinning query:', query.substring(0, 50));
      
      chrome.runtime.sendMessage({
        action: 'saveQuery',
        query: query,
        answer: answer,
        id: id
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[MemoLearn] Pin error:', chrome.runtime.lastError);
          alert('Failed to pin query');
          return;
        }
        
        if (response && response.success) {
          this.textContent = '✅ Pinned';
          this.disabled = true;
          this.style.background = '#28a745';
          this.style.color = 'white';
          
          setTimeout(() => {
            this.textContent = '📌 Pin';
            this.disabled = false;
            this.style.background = '';
            this.style.color = '';
          }, 2000);
        } else {
          alert(response?.error || 'Failed to pin query');
        }
      });
    });
  });
  
  // Copy buttons
  document.querySelectorAll('.memolearn-copy').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      
      const answer = this.dataset.answer;
      
      navigator.clipboard.writeText(answer).then(() => {
        console.log('[MemoLearn] Answer copied');
        this.textContent = '✅ Copied';
        this.style.background = '#2196F3';
        this.style.color = 'white';
        
        setTimeout(() => {
          this.textContent = '📋 Copy';
          this.style.background = '';
          this.style.color = '';
        }, 1500);
      }).catch(err => {
        console.error('[MemoLearn] Copy failed:', err);
        alert('Failed to copy to clipboard');
      });
    });
  });
  
  // Delete buttons
  document.querySelectorAll('.memolearn-delete').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      
      const id = this.dataset.id;
      
      if (confirm('Delete this saved query?')) {
        console.log('[MemoLearn] Deleting query:', id);
        
        chrome.runtime.sendMessage({
          action: 'deleteQuery',
          id: id
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[MemoLearn] Delete error:', chrome.runtime.lastError);
            alert('Failed to delete query');
            return;
          }
          
          if (response && response.success) {
            const item = this.closest('.memolearn-item');
            item.style.transition = 'opacity 0.3s, transform 0.3s';
            item.style.opacity = '0';
            item.style.transform = 'translateX(100px)';
            setTimeout(() => {
              item.remove();
              
              // Check if any items left
              const remainingItems = document.querySelectorAll('.memolearn-item');
              if (remainingItems.length === 0) {
                const popup = document.getElementById('memolearn-popup');
                if (popup) popup.remove();
              }
            }, 300);
          } else {
            alert(response?.error || 'Failed to delete query');
          }
        });
      }
    });
  });
}

// ============================================
// LISTEN FOR MESSAGES FROM BACKGROUND SCRIPT
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkQuery') {
    console.log('[MemoLearn] Background requested check for:', request.query);
    
    // Only show popup if on search page
    if (isSearchPage()) {
      checkForMatches(request.query);
    } else {
      console.log('[MemoLearn] Not on search page, skipping popup');
    }
  }
  sendResponse({ received: true });
});

// ============================================
// INITIALIZE WHEN DOM IS READY
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ============================================
// DEBUG: Show current query on demand
// ============================================
// Users can check active query by opening console and typing: checkMemoLearnQuery()
window.checkMemoLearnQuery = function() {
  chrome.storage.session.get(['currentQuery'], (result) => {
    if (result.currentQuery) {
      console.log('🔍 Active MemoLearn Query:', result.currentQuery);
    } else {
      console.log('⚠️ No active query in session');
    }
  });
};

console.log('[MemoLearn] Content script ready. Type checkMemoLearnQuery() in console')