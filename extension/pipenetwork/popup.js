document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("logout-btn").addEventListener("click", logout);
document.addEventListener("DOMContentLoaded", getPoints);
// document.getElementById("start-test-btn").addEventListener("click", startTesting);
// document.addEventListener('DOMContentLoaded', () => {
//   const loginButton = document.getElementById('login-btn');
//   const pointsElement = document.getElementById('points');
//   const uptimeElement = document.getElementById('uptime');
  
//   let isLoggedIn = false; // Simulated login state

//   // Example: Simulate points and uptime fetching upon login
//   loginButton.addEventListener('click', () => {
//     if (!isLoggedIn) {
//       isLoggedIn = true;
//       pointsElement.textContent = 100; // Replace with actual points logic
//       uptimeElement.textContent = '05:10'; // Replace with real uptime
//       alert('Login successful!');
//     } else {
//       alert('Already logged in.');
//     }
//   });
// });

function showAuthSection() {
  document.getElementById("login-container").style.display = "block";
  document.getElementById("test-container").style.display = "none";
}

function showDashboard() {
  document.getElementById("login-container").style.display = "none";
  document.getElementById("test-container").style.display = "flex";
}

async function logout(e) {
  if(e) {
    e.preventDefault();
  }
  await chrome.storage.local.clear(function(){
    var error = chrome.runtime.lastError;
    if (error) {
        console.error(error);
    }
    showAuthSection();
  });
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        await chrome.storage.local.set({ token: data.token }, function() {
          if (chrome.runtime.lastError) {
            console.error("Error saving token:", chrome.runtime.lastError);
          } else {
            console.log("Token saved successfully.");
          }
        });
        showDashboard();
        fetchPoints();
      } else {
        alert("Login failed! Please try again.");
      }
    } else if (response.status === 401) {
      alert("Invalid credentials. Please check your email and password.");
    } else {
      const errorText = await response.text();
      console.error("Login error:", errorText);
      alert("An unexpected error occurred. Please try again later.");
    }
  } catch (error) {
    console.error("Error logging in:", error);
    alert("Network error. Please check your connection and try again.");
  }
}


async function fetchPoints() {
  const { token } = await chrome.storage.local.get("token");
  const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/points", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if(response.ok) {
    const data = await response.json();
    document.getElementById("points").innerText = data.points;
  } else if(response.status === 401) {
    logout();
  }
}

async function startTesting() {
  document.getElementById("status").innerText = "Testing nodes...";
  const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/nodes");
  const nodes = await response.json();

  for (const node of nodes) {
    await testNode(node);
  }

  document.getElementById("status").innerText = "Testing complete!";
  fetchPoints();
}

async function testNode(node) {
  try {
    const start = Date.now();
    await fetch(`http://${node.ip}`);
    const latency = Date.now() - start;

    const { token } = await chrome.storage.local.get("token");
    await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ node_id: node.node_id, latency, status: "online" })
    });

    console.log(`Node ${node.ip} tested with latency ${latency}ms`);
  } catch (error) {
    console.error(`Error testing node ${node.ip}:`, error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["token", "username"], (result) => {
    if (result.token) {
      showDashboard();
      fetchPoints();
      // Todo: endpoint was throwing 400, so temporarily commenting.
      // sendHeartbeat(result.token, result.username);
      // setInterval(() => sendHeartbeat(result.token, result.username), 5 * 60 * 1000); // Every 5 minutes
    }
  });
});

async function sendHeartbeat(token, username) {
  try {
    const ip = await fetchIpAddress(); // Optional: Get the user's IP address
    const geo = await fetchGeoLocation(ip); // Optional: Fetch geo-location from IP

    const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/heartbeat", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, ip, geo }),
    });

    if (response.ok) {
      console.log("Heartbeat sent successfully");
    } else {
      console.error("Failed to send heartbeat:", response.status);
    }
  } catch (error) {
    console.error("Error sending heartbeat:", error);
  }
}

async function fetchIpAddress() {
  const response = await fetch("https://api64.ipify.org?format=json");
  const { ip } = await response.json();
  return ip;
}

async function fetchGeoLocation(ip) {
  const response = await fetch(`https://ipapi.co/${ip}/json/`);
  if (response.ok) {
    return await response.json();
  }
  return null;
}

async function getPoints() {
  // const { token } = await chrome.storage.local.get("token");
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.storage.local.get("token", function (data) {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(data.token);
      });
    });
    console.log("Retrieved token:", result);
    if(result){
      console.log("show dashboard:", result);
      showDashboard();
    }
  } catch (error) {
    console.error("Error retrieving token:", error);
  }
}
