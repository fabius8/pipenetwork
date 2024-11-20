// Create an alarm to trigger tests periodically (e.g., every 30 minutes)
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("nodeTestAlarm", { periodInMinutes: 30 });
});

// Listen for the alarm and run node tests when triggered
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "nodeTestAlarm") {
    console.log("Running node tests in the background...");
    await runNodeTests();
  }
});

// Function to perform node testing
async function runNodeTests() {
  try {
    const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/nodes");
    const nodes = await response.json();

    for (const node of nodes) {
      const latency = await testNodeLatency(node);
      console.log(`Node ${node.node_id} (${node.ip}) latency: ${latency}ms`);

      // Report the test result to the backend
      await reportTestResult(node, latency);
    }
    console.log("All node tests completed.");
    showNotification("Node testing completed! Results sent to backend.");
  } catch (error) {
    console.error("Error running node tests:", error);
  }
}

// Function to test the latency of a single node
async function testNodeLatency(node) {
  const start = Date.now();
  const timeout = 5000;

  try {
    const response = await Promise.race([
      fetch(`http://${node.ip}`, { mode: 'no-cors' }), // Disable CORS for a simple connectivity check
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);

    // With no-cors, you can't check response.ok, so assume success if no error
    return Date.now() - start;
  } catch (error) {
    await reportTestResult(node, -1);
    return -1;
  }
}

// Function to report a node's test result to the backend
async function reportTestResult(node, latency) {
  const { token } = await chrome.storage.local.get("token");
  if (!token) {
    console.warn("No token found. Skipping result reporting.");
    return;
  }

  try {
    const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        node_id: node.node_id,
        ip: node.ip,
        latency: latency,
        status: latency > 0 ? "online" : "offline"
      })
    });

    if (response.ok) {
      console.log(`Reported result for node ${node.node_id}.`);
    } else {
      console.error(`Failed to report result for node ${node.node_id}.`);
    }
  } catch (error) {
    console.error(`Error reporting result for node ${node.node_id}:`, error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPoints") {
    getPoints().then(points => {
      sendResponse({ points });
    }).catch(error => {
      console.error('Error fetching points:', error);
      sendResponse({ error: 'Failed to fetch points' });
    });
    return true; // Indicates that the response will be sent asynchronously
  }
});

async function getPoints() {
  const token = await chrome.storage.local.get("token");
  const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/points", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await response.json();
  return data.points;
}


// Function to show notifications
function showNotification(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: "Pipe Network Tester",
    message: message
  });
}
const backendUrl = 'https://pipe-network-backend.pipecanary.workers.dev/api/heartbeat';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Initialize heartbeat logic when the extension starts
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started. Setting up heartbeat...');
  startHeartbeat();
});

// Start heartbeats when the extension is installed or reloaded
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed. Setting up heartbeat...');
  startHeartbeat();
});

// Function to start the heartbeat logic
async function startHeartbeat() {
  // Retrieve the token from storage
  const { token } = await new Promise((resolve) => {
    chrome.storage.local.get("token", (result) => {
      resolve(result);
    });
  });

  // Check if the token is present
  if (!token) {
    console.warn("No token found. User may not be logged in. Skipping heartbeat.");
    return;
  }

  // Start the heartbeat with the specified interval
  setInterval(async () => {
    try {
      // Get geo-location information
      const geoInfo = await getGeoLocation();

      // Send the heartbeat request to the backend
      const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/heartbeat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ip: geoInfo.ip,
          location: geoInfo.location,
          timestamp: Date.now(),
        }),
      });

      // Check the response
      if (response.ok) {
        console.log("Heartbeat sent successfully.");
      } else {
        console.error("Heartbeat failed:", await response.text());
      }
    } catch (error) {
      console.error("Error during heartbeat:", error);
    }
  }, HEARTBEAT_INTERVAL);
}


// Retrieve the user's JWT token from localStorage
function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], (result) => {
      resolve(result.token);
    });
  });
}

// Fetch IP and Geo-location data
async function getGeoLocation() {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('Failed to fetch Geo-location data');
    const data = await response.json();
    return {
      ip: data.ip,
      location: `${data.city}, ${data.region}, ${data.country_name}`,
    };
  } catch (error) {
    console.error('Geo-location error:', error);
    return { ip: 'unknown', location: 'unknown' };
  }
}
