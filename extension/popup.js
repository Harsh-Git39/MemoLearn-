// popup.js - Logic for extension icon popup
const API_BASE = 'http://localhost:3000';

console.log('[MemoLearn Popup] Initializing...');

// ============================================
// DOM ELEMENTS
// ============================================
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const queryList = document.getElementById('queryList');
const statsDiv = document.getElementById('stats');
const refreshBtn = document.getElementById('refreshBtn');
const viewAllBtn = document.getElementById('viewAllBtn');

// ============================================
// LOAD ALL SAVED QUERIES
// ============================================
async function loadQueries() {
  console.log('[MemoLearn Popup] Loading queries...');
  
  // Show loading state
  loadingState.style.display = 'block';
  emptyState.style.display = 'none';
  queryList.style.display = 'none';
  
  try {
    const response = await fetch(`${API_BASE}/get`);
    const data = await response.json();
    
    console.log('[MemoLearn Popup] Received data:', data);
    
    if (data.success && data.queries && data.queries.length > 0) {
      displayQueries(data.queries);
    } else {
      showEmptyState();
    }
  } catch (error) {
    console.error('[MemoLearn Popup] Error loading queries:', error);
    showError(error);
  }
}

// ============================================
// DISPLAY QUERIES IN LIST
// ============================================
function displayQueries(queries) {
  console.log('[MemoLearn Popup] Displaying', queries.length, 'queries');
  
  // Hide loading, show list
  loadingState.style.display = 'none';
  emptyState.style.display = 'none';
  queryList.style.display = 'block';
  
  // Update stats
  statsDiv.textContent = `📊 Total Saved Queries: ${queries.length}`;
  
  // Clear existing queries
  queryList.innerHTML = '';
  
  // Sort by date (newest first)
  queries.sort((a, b) => {
    const dateA = new Date(a.pinnedAt || 0);
    const dateB = new Date(b.pinnedAt || 0);
    return dateB - dateA;
  });
  
  // Create query items
  queries.forEach((item, index) => {
    const queryItem = createQueryElement(item, index);
    queryList.appendChild(queryItem);
  });
}

// ============================================
// CREATE SINGLE QUERY ELEMENT
// ============================================
function createQueryElement(item, index) {
  const div = document.createElement('div');
  div.className = 'query-item';
  div.id = `query-${item.id}`;
  
  // Format date
  const date = item.pinnedAt ? new Date(item.pinnedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'Unknown date';
  
  // Truncate answer for preview
  const answerPreview = item.answer.length > 150 
    ? item.answer.substring(0, 150) + '...' 
    : item.answer;
  
  const needsExpand = item.answer.length > 150;
  
  div.innerHTML = `
    <div class="query-text">
      <span class="query-icon">🔍</span>
      <span>${escapeHtml(item.query)}</span>
    </div>
    
    <div class="query-date">📅 Saved: ${date}</div>
    
    <div class="answer-text" id="answer-${item.id}">
      ${escapeHtml(answerPreview)}
    </div>
    
    ${needsExpand ? `
      <button class="expand-btn" id="expand-${item.id}">
        ⬇️ Show full answer
      </button>
    ` : ''}
    
    <div class="query-actions">
      <button class="action-btn copy-btn" data-answer="${escapeHtml(item.answer)}">
        📋 Copy Answer
      </button>
      <button class="action-btn delete-btn" data-id="${item.id}">
        🗑️ Delete
      </button>
    </div>
  `;
  
  // Add event listeners after creating element
  setTimeout(() => {
    // Expand button
    if (needsExpand) {
      const expandBtn = document.getElementById(`expand-${item.id}`);
      const answerDiv = document.getElementById(`answer-${item.id}`);
      
      expandBtn?.addEventListener('click', () => {
        const isExpanded = answerDiv.classList.contains('expanded');
        
        if (isExpanded) {
          answerDiv.classList.remove('expanded');
          answerDiv.textContent = answerPreview;
          expandBtn.textContent = '⬇️ Show full answer';
        } else {
          answerDiv.classList.add('expanded');
          answerDiv.textContent = item.answer;
          expandBtn.textContent = '⬆️ Show less';
        }
      });
    }
    
    // Copy button
    const copyBtn = div.querySelector('.copy-btn');
    copyBtn?.addEventListener('click', () => {
      copyToClipboard(item.answer, copyBtn);
    });
    
    // Delete button
    const deleteBtn = div.querySelector('.delete-btn');
    deleteBtn?.addEventListener('click', () => {
      deleteQuery(item.id, item.query);
    });
  }, 0);
  
  return div;
}

// ============================================
// COPY TO CLIPBOARD
// ============================================
function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('[MemoLearn Popup] Copied to clipboard');
    
    // Visual feedback
    const originalText = button.textContent;
    button.textContent = '✅ Copied!';
    button.style.background = '#4CAF50';
    button.style.color = 'white';
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '';
      button.style.color = '';
    }, 1500);
  }).catch(err => {
    console.error('[MemoLearn Popup] Copy failed:', err);
    alert('Failed to copy to clipboard');
  });
}

// ============================================
// DELETE QUERY
// ============================================
async function deleteQuery(id, query) {
  const confirmDelete = confirm(
  `Delete this query?\n\n"${query.substring(0, 60)}${query.length > 60 ? '...' : ''}"`
);

  
  if (!confirmDelete) return;
  
  console.log('[MemoLearn Popup] Deleting query:', id);
  
  try {
    const response = await fetch(`${API_BASE}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('[MemoLearn Popup] Deleted successfully');
      
      // Animate removal
      const element = document.getElementById(`query-${id}`);
      if (element) {
        element.style.transition = 'all 0.3s ease';
        element.style.opacity = '0';
        element.style.transform = 'translateX(100px)';
        
        setTimeout(() => {
          element.remove();
          
          // Check if list is empty
          const remaining = queryList.querySelectorAll('.query-item');
          if (remaining.length === 0) {
            showEmptyState();
          } else {
            // Update stats
            statsDiv.textContent = `📊 Total Saved Queries: ${remaining.length}`;
          }
        }, 300);
      }
    } else {
      alert(data.error || 'Failed to delete query');
    }
  } catch (error) {
    console.error('[MemoLearn Popup] Delete error:', error);
    alert('Failed to delete query. Make sure the server is running.');
  }
}

// ============================================
// SHOW EMPTY STATE
// ============================================
function showEmptyState() {
  loadingState.style.display = 'none';
  queryList.style.display = 'none';
  emptyState.style.display = 'block';
  statsDiv.textContent = '📊 No saved queries yet';
}

// ============================================
// SHOW ERROR STATE
// ============================================
function showError(error) {
  loadingState.style.display = 'none';
  queryList.style.display = 'none';
  emptyState.style.display = 'block';
  
  emptyState.innerHTML = `
    <div class="icon">⚠️</div>
    <h3>Connection Error</h3>
    <p>Could not connect to MemoLearn server.<br>
    Make sure it's running on <code>localhost:3000</code></p>
    <p style="margin-top: 10px; font-size: 12px; color: #999;">
      Error: ${error.message}
    </p>
  `;
  
  statsDiv.textContent = '❌ Server not responding';
}

// ============================================
// OPEN FULL PAGE VIEW
// ============================================
function openFullPageView() {
  console.log('[MemoLearn Popup] Opening full page view...');
  chrome.tabs.create({ 
    url: `${API_BASE}/all`
  });
}

// ============================================
// ESCAPE HTML (SECURITY)
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// EVENT LISTENERS
// ============================================
refreshBtn.addEventListener('click', () => {
  console.log('[MemoLearn Popup] Refresh clicked');
  loadQueries();
});

viewAllBtn.addEventListener('click', () => {
  openFullPageView();
});

// ============================================
// INITIALIZE ON POPUP OPEN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[MemoLearn Popup] DOM loaded, loading queries...');
  loadQueries();
});

console.log('[MemoLearn Popup] Script loaded');