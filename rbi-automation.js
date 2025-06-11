/**
 * RBI Server Automation Script
 * 
 * This script automates the API calls to the RBI Server as described in the README.md.
 * It allows you to create a session, start a stream, navigate to URLs, and stop the session.
 * 
 * Usage:
 *   node rbi-automation.js [options]
 * 
 * Options:
 *   --server-url <url>     RBI Server URL (default: http://localhost:3000)
 *   --start-url <url>      Initial URL to navigate to (default: https://example.com)
 *   --width <width>        Viewport width (default: 1280)
 *   --height <height>      Viewport height (default: 720)
 *   --quality <quality>    Stream quality (low, medium, high, ultra) (default: high)
 *   --frame-rate <rate>    Frame rate (default: 30)
 *   --navigate <url>       Navigate to URL after session creation
 *   --auto-stop <seconds>  Automatically stop the session after specified seconds
 *   --help                 Show help
 */

const fetch = require('node-fetch');
const readline = require('readline');

// Default options
const DEFAULT_OPTIONS = {
  serverUrl: 'http://localhost:3000',
  startUrl: 'https://example.com',
  width: 1280,
  height: 720,
  quality: 'high',
  frameRate: 30,
  bitrate: null, // Will be calculated based on resolution and frame rate
  navigate: null,
  autoStop: null
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (arg === '--server-url' && i + 1 < args.length) {
      options.serverUrl = args[++i];
    } else if (arg === '--start-url' && i + 1 < args.length) {
      options.startUrl = args[++i];
    } else if (arg === '--width' && i + 1 < args.length) {
      options.width = parseInt(args[++i]);
    } else if (arg === '--height' && i + 1 < args.length) {
      options.height = parseInt(args[++i]);
    } else if (arg === '--quality' && i + 1 < args.length) {
      options.quality = args[++i];
    } else if (arg === '--frame-rate' && i + 1 < args.length) {
      options.frameRate = parseInt(args[++i]);
    } else if (arg === '--navigate' && i + 1 < args.length) {
      options.navigate = args[++i];
    } else if (arg === '--auto-stop' && i + 1 < args.length) {
      options.autoStop = parseInt(args[++i]);
    }
  }

  // Calculate bitrate based on resolution and frame rate if not specified
  if (!options.bitrate) {
    // Simple heuristic: width * height * frameRate * 0.1 bits per pixel
    options.bitrate = Math.floor(options.width * options.height * options.frameRate * 0.1);
  }

  return options;
}

// Show help
function showHelp() {
  console.log(`
RBI Server Automation Script

Usage:
  node rbi-automation.js [options]

Options:
  --server-url <url>     RBI Server URL (default: ${DEFAULT_OPTIONS.serverUrl})
  --start-url <url>      Initial URL to navigate to (default: ${DEFAULT_OPTIONS.startUrl})
  --width <width>        Viewport width (default: ${DEFAULT_OPTIONS.width})
  --height <height>      Viewport height (default: ${DEFAULT_OPTIONS.height})
  --quality <quality>    Stream quality (low, medium, high, ultra) (default: ${DEFAULT_OPTIONS.quality})
  --frame-rate <rate>    Frame rate (default: ${DEFAULT_OPTIONS.frameRate})
  --navigate <url>       Navigate to URL after session creation
  --auto-stop <seconds>  Automatically stop the session after specified seconds
  --help                 Show this help message

Examples:
  node rbi-automation.js --start-url https://google.com
  node rbi-automation.js --width 1920 --height 1080 --quality ultra
  node rbi-automation.js --navigate https://github.com --auto-stop 60
  `);
}

// Create readline interface for user input
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Create session
async function createSession(options) {
  console.log(`Creating session with start URL: ${options.startUrl}`);

  try {
    const response = await fetch(`${options.serverUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startUrl: options.startUrl,
        viewport: {
          width: options.width,
          height: options.height
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Failed to create session: ${data.error?.message || 'Unknown error'}`);
    }

    console.log(`Session created with ID: ${data.data.sessionId}`);
    console.log(`Session expires at: ${new Date(data.data.expiresAt).toLocaleString()}`);
    return data.data.sessionId;
  } catch (error) {
    console.error(`Error creating session: ${error.message}`);
    throw error;
  }
}

// Start stream
async function startStream(sessionId, options) {
  console.log(`Starting stream for session ${sessionId}`);

  try {
    const response = await fetch(`${options.serverUrl}/api/streams/${sessionId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quality: options.quality,
        maxWidth: options.width,
        maxHeight: options.height,
        frameRate: options.frameRate,
        bitrate: options.bitrate
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to start stream: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Failed to start stream: ${data.error?.message || 'Unknown error'}`);
    }

    console.log(`Stream started with quality: ${data.data.quality}`);
    console.log(`Resolution: ${data.data.resolution}`);
    console.log(`Frame rate: ${data.data.frameRate}`);
    console.log(`Bitrate: ${data.data.bitrate}`);
    
    return data.data;
  } catch (error) {
    console.error(`Error starting stream: ${error.message}`);
    throw error;
  }
}

// Navigate to URL
async function navigateToUrl(sessionId, url, options) {
  console.log(`Navigating session ${sessionId} to ${url}`);

  try {
    const response = await fetch(`${options.serverUrl}/api/sessions/${sessionId}/navigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: url
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to navigate: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Failed to navigate: ${data.error?.message || 'Unknown error'}`);
    }

    console.log(`Successfully navigated to ${url}`);
    return data.data;
  } catch (error) {
    console.error(`Error navigating to URL: ${error.message}`);
    throw error;
  }
}

// Stop stream
async function stopStream(sessionId, options) {
  console.log(`Stopping stream for session ${sessionId}`);

  try {
    const response = await fetch(`${options.serverUrl}/api/streams/${sessionId}/stop`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Failed to stop stream: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Failed to stop stream: ${data.error?.message || 'Unknown error'}`);
    }

    console.log(`Stream stopped for session ${sessionId}`);
    return true;
  } catch (error) {
    console.error(`Error stopping stream: ${error.message}`);
    return false;
  }
}

// Destroy session
async function destroySession(sessionId, options) {
  console.log(`Destroying session ${sessionId}`);

  try {
    const response = await fetch(`${options.serverUrl}/api/sessions/${sessionId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to destroy session: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Failed to destroy session: ${data.error?.message || 'Unknown error'}`);
    }

    console.log(`Session ${sessionId} destroyed`);
    return true;
  } catch (error) {
    console.error(`Error destroying session: ${error.message}`);
    return false;
  }
}

// Get stream stats
async function getStreamStats(sessionId, options) {
  console.log(`Getting stream stats for session ${sessionId}`);

  try {
    const response = await fetch(`${options.serverUrl}/api/streams/${sessionId}/stats`);

    if (!response.ok) {
      throw new Error(`Failed to get stream stats: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Failed to get stream stats: ${data.error?.message || 'Unknown error'}`);
    }

    console.log('Stream stats:');
    console.log(JSON.stringify(data.data, null, 2));
    return data.data;
  } catch (error) {
    console.error(`Error getting stream stats: ${error.message}`);
    return null;
  }
}

// Interactive mode
async function interactiveMode(sessionId, options) {
  const rl = createReadlineInterface();

  console.log('\n=== Interactive Mode ===');
  console.log('Enter commands to interact with the RBI Server.');
  console.log('Available commands:');
  console.log('  navigate <url>  - Navigate to URL');
  console.log('  stats           - Get stream stats');
  console.log('  stop            - Stop session and exit');
  console.log('  help            - Show this help message');
  console.log('');

  rl.setPrompt('rbi> ');
  rl.prompt();

  rl.on('line', async (line) => {
    const args = line.trim().split(' ');
    const command = args[0].toLowerCase();

    try {
      if (command === 'navigate' && args.length > 1) {
        const url = args.slice(1).join(' ');
        await navigateToUrl(sessionId, url, options);
      } else if (command === 'stats') {
        await getStreamStats(sessionId, options);
      } else if (command === 'stop') {
        await stopStream(sessionId, options);
        await destroySession(sessionId, options);
        console.log('Session stopped and destroyed. Exiting...');
        rl.close();
        return;
      } else if (command === 'help') {
        console.log('Available commands:');
        console.log('  navigate <url>  - Navigate to URL');
        console.log('  stats           - Get stream stats');
        console.log('  stop            - Stop session and exit');
        console.log('  help            - Show this help message');
      } else {
        console.log(`Unknown command: ${command}`);
        console.log('Type "help" for available commands');
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    try {
      // Try to clean up if the user just presses Ctrl+C
      await stopStream(sessionId, options);
      await destroySession(sessionId, options);
    } catch (error) {
      // Ignore errors during cleanup
    }
    console.log('Exiting...');
    process.exit(0);
  });

  // Auto-stop if specified
  if (options.autoStop) {
    console.log(`Session will automatically stop after ${options.autoStop} seconds`);
    setTimeout(async () => {
      console.log(`Auto-stop triggered after ${options.autoStop} seconds`);
      await stopStream(sessionId, options);
      await destroySession(sessionId, options);
      console.log('Session stopped and destroyed. Exiting...');
      rl.close();
    }, options.autoStop * 1000);
  }
}

// Main function
async function main() {
  try {
    // Parse command line arguments
    const options = parseArgs();

    // Create session
    const sessionId = await createSession(options);

    // Start stream
    await startStream(sessionId, options);

    // Navigate to URL if specified
    if (options.navigate) {
      await navigateToUrl(sessionId, options.navigate, options);
    }

    // Enter interactive mode
    await interactiveMode(sessionId, options);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run main function
main();
