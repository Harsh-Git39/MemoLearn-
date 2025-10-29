const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();

// ============================================
// CRITICAL: CORS Configuration BEFORE other middleware
// ============================================
app.use((req, res, next) => {
  // Allow requests from Chrome extension
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Body parser AFTER CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const DATA_FILE = path.join(__dirname, 'pinned-memolearn.json');

// ============================================
// HELPER FUNCTIONS
// ============================================

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }
  return [];
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving data:', err);
    return false;
  }
}

// ============================================
// ROUTES
// ============================================

// Route 1: HOME
app.get('/', (req, res) => {
  res.render('index', {
    content: '<p>✅ MemoLearn API is running successfully!</p>'
  });
});

// ============================================
// Route 2: /match - Match similar queries
// ============================================
app.post('/match', (req, res) => {
  const { query } = req.body;

  console.log(`[/match] Received query: "${query}"`);

  if (!query) {
    return res.json({ 
      success: false,
      error: 'Query is required', 
      matches: [] 
    });
  }

  // Determine Python command
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, 'match.py');

  console.log(`[/match] Running: ${pythonCmd} ${scriptPath}`);

  // Call Python script
  const pythonProcess = spawn(pythonCmd, [scriptPath, query]);

  let output = '';
  let errorOutput = '';

  pythonProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  pythonProcess.on('close', (code) => {
    if (code === 0 && output) {
      try {
        const matches = JSON.parse(output);
        console.log(`[/match] Found ${matches.length} matches`);
        res.json({ 
          success: true,
          query: query,
          matches: matches 
        });
      } catch (err) {
        console.error('[/match] Error parsing matches:', err);
        console.error('[/match] Raw output:', output);
        res.json({ 
          success: false,
          error: 'Error parsing matches', 
          matches: [] 
        });
      }
    } else {
      console.error('[/match] Python error (code ' + code + '):', errorOutput);
      res.json({ 
        success: false,
        error: 'Error matching query: ' + errorOutput, 
        matches: [] 
      });
    }
  });

  pythonProcess.on('error', (err) => {
    console.error('[/match] Failed to start Python:', err);
    res.json({ 
      success: false,
      error: 'Failed to start Python. Ensure Python is installed.', 
      matches: [] 
    });
  });
});

// ============================================
// Route 3: /popup - Render popup with matches
// ============================================
app.post('/popup', (req, res) => {
  const { matches } = req.body;

  console.log(`[/popup] Rendering popup with ${matches ? matches.length : 0} matches`);

  try {
    res.render('popup', { 
      matches: matches || [] 
    });
  } catch (err) {
    console.error('[/popup] Error rendering:', err);
    res.status(500).json({ 
      success: false,
      error: 'Error rendering popup: ' + err.message
    });
  }
});

// ============================================
// Route 4: /save - Save query
// ============================================
app.post('/save', (req, res) => {
  const { query, answer, id } = req.body;

  console.log(`[/save] Saving query: "${query ? query.substring(0, 50) : 'undefined'}..."`);

  if (!query || !answer) {
    return res.json({ 
      success: false, 
      error: 'Query and answer are required' 
    });
  }

  try {
    const data = loadData();

    // Check if already exists
    const exists = data.find(
      item => item.query.toLowerCase().trim() === query.toLowerCase().trim()
    );

    if (exists) {
      return res.json({ 
        success: false, 
        error: 'Query already pinned',
        id: exists.id
      });
    }

    // Add new query
    const newItem = {
      id: id || Date.now().toString(),
      query: query,
      answer: answer,
      pinnedAt: new Date().toISOString()
    };

    data.push(newItem);
    
    if (saveData(data)) {
      console.log(`[/save] Successfully saved. Total items: ${data.length}`);
      res.json({ 
        success: true, 
        message: 'Query pinned successfully!',
        item: newItem
      });
    } else {
      res.json({ 
        success: false, 
        error: 'Failed to save data'
      });
    }

  } catch (err) {
    console.error('[/save] Error saving:', err);
    res.json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ============================================
// Route 5: /get - Get all saved queries
// ============================================
app.get('/get', (req, res) => {
  console.log(`[/get] Fetching all saved queries`);

  try {
    const data = loadData();
    console.log(`[/get] Found ${data.length} queries`);

    res.json({ 
      success: true,
      total: data.length,
      queries: data 
    });

  } catch (err) {
    console.error('[/get] Error fetching:', err);
    res.json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ============================================
// Route 6: /delete - Delete query
// ============================================
app.post('/delete', (req, res) => {
  const { id } = req.body;

  console.log(`[/delete] Deleting query with id: ${id}`);

  if (!id) {
    return res.json({ 
      success: false, 
      error: 'ID is required' 
    });
  }

  try {
    let data = loadData();
    const initialLength = data.length;

    const itemToDelete = data.find(item => item.id === id);
    data = data.filter(item => item.id !== id);

    if (data.length === initialLength) {
      return res.json({ 
        success: false, 
        error: 'Query not found',
        id: id
      });
    }

    if (saveData(data)) {
      console.log(`[/delete] Successfully deleted. Remaining: ${data.length}`);
      res.json({ 
        success: true, 
        message: 'Query deleted successfully!',
        deletedItem: itemToDelete,
        remaining: data.length
      });
    } else {
      res.json({ 
        success: false, 
        error: 'Failed to save data after deletion'
      });
    }

  } catch (err) {
    console.error('[/delete] Error deleting:', err);
    res.json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ============================================
// Route 7: /clear - Clear all data
// ============================================
app.post('/clear', (req, res) => {
  console.log(`[/clear] Clearing all data`);

  try {
    if (saveData([])) {
      res.json({ 
        success: true, 
        message: 'All queries cleared!' 
      });
    } else {
      res.json({ 
        success: false, 
        error: 'Failed to clear data'
      });
    }
  } catch (err) {
    res.json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ============================================
// Route 8: /status - Check API status
// ============================================
app.get('/status', (req, res) => {
  try {
    const data = loadData();
    res.json({ 
      success: true,
      status: 'MemoLearn API Running',
      totalSavedQueries: data.length,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ADD THIS NEW ROUTE to your existing server.js
// Place it AFTER the /status route and BEFORE the error handling section

// ============================================
// Route 9: /all - Full page view of all queries
// ============================================
app.get('/all', (req, res) => {
  console.log(`[/all] Rendering full page view`);

  try {
    const data = loadData();
    
    res.render('all', { 
      queries: data || [],
      total: data.length
    });
    
  } catch (err) {
    console.error('[/all] Error rendering:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ALSO UPDATE the availableRoutes array in the 404 handler and startup message:
// Add this line to the array:
// 'GET /all'

// ============================================
// ERROR HANDLING
// ============================================

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    requestedPath: req.path,
    availableRoutes: [
      'GET /',
      'POST /match',
      'POST /popup',
      'POST /save',
      'GET /get',
      'POST /delete',
      'POST /clear',
      'GET /status'
    ]
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🚀 MemoLearn Server Running        ║
║   Port: ${PORT}                           ║
║   API: http://localhost:${PORT}          ║
║   CORS: Enabled for all origins      ║
╚═══════════════════════════════════════╝
  `);
  console.log('Available Routes:');
  console.log('  GET  /         - Home page');
  console.log('  POST /match    - Match similar queries');
  console.log('  POST /popup    - Render popup HTML');
  console.log('  POST /save     - Save a query');
  console.log('  GET  /get      - Get all saved queries');
  console.log('  POST /delete   - Delete a query');
  console.log('  POST /clear    - Clear all data');
  console.log('  GET  /status   - API status');
  console.log('');
  console.log('Data file:', DATA_FILE);
  console.log('Views directory:', path.join(__dirname, 'views'));
  console.log('');
});

module.exports = app;