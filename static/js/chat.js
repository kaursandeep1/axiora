// Global variables
var ws = null;
var currentRoom = "";
var currentUser = "";
var isOwner = false;
var roomOwner = "";
var members = {};

// Get data from HTML data attributes
function getRoomData() {
    var dataDiv = document.getElementById("room-data");
    if (dataDiv) {
        currentRoom = dataDiv.getAttribute("data-room-code");
        currentUser = dataDiv.getAttribute("data-username");
        var isOwnerStr = dataDiv.getAttribute("data-is-owner");
        roomOwner = dataDiv.getAttribute("data-room-owner");
        
        // Convert string to boolean
        isOwner = (isOwnerStr === "True" || isOwnerStr === "true");
        
        // Debug logs
        console.log("=== Room Data ===");
        console.log("Room Code:", currentRoom);
        console.log("Username:", currentUser);
        console.log("Is Owner (string):", isOwnerStr);
        console.log("Is Owner (boolean):", isOwner);
        console.log("Room Owner:", roomOwner);
        console.log("=================");
        
        // Validate data
        if (!currentUser || currentUser === "None") {
            console.error("No username found!");
            alert("Error: No username found. Please go back and try again.");
            window.location.href = "/";
            return false;
        }
        
        return true;
    } else {
        console.error("Room data div not found!");
        return false;
    }
}

// Connect to WebSocket
function connect() {
    var dataValid = getRoomData();
    if (!dataValid) {
        return;
    }
    
    var wsUrl = "ws://" + window.location.host + "/ws/" + currentRoom + "/" + currentUser;
    console.log("Connecting to WebSocket:", wsUrl);
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log("✅ WebSocket connected!");
        document.getElementById("status").innerHTML = "🟢 Connected";
        document.getElementById("status").style.color = "green";
    };
    
    ws.onmessage = function(event) {
        console.log("📨 Received message:", event.data);
        var data = JSON.parse(event.data);
        
        if (data.type === "message") {
            addMessage(data.username, data.message, data.timestamp);
        } else if (data.type === "system") {
            addSystemMessage(data.message);
        } else if (data.type === "members_update") {
            updateMembers(data.members, data.muted);
        } else if (data.type === "error") {
            showWarning(data.message);
        }
    };
    
    ws.onclose = function() {
        console.log("❌ WebSocket disconnected");
        document.getElementById("status").innerHTML = "🔴 Disconnected - Refresh to reconnect";
        document.getElementById("status").style.color = "red";
    };
    
    ws.onerror = function(error) {
        console.error("WebSocket error:", error);
        document.getElementById("status").innerHTML = "⚠️ Connection error";
        document.getElementById("status").style.color = "orange";
    };
}

// Add a regular message
function addMessage(username, message, timestamp) {
    var messagesDiv = document.getElementById("messages");
    var messageElement = document.createElement("div");
    var isSent = (username === currentUser);
    messageElement.className = "message " + (isSent ? 'sent' : 'received');
    
    var time = new Date(timestamp).toLocaleTimeString();
    
    var content = '<div class="message-content">' +
        '<span class="message-username">' + (isSent ? 'You' : username) + '</span>' +
        '<div class="message-text">' + escapeHtml(message) + '</div>' +
        '<span class="message-time">' + time + '</span>' +
        '</div>';
    
    messageElement.innerHTML = content;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Add a system message
function addSystemMessage(message) {
    var messagesDiv = document.getElementById("messages");
    var messageElement = document.createElement("div");
    messageElement.className = "message system";
    messageElement.innerHTML = '<div class="message-content">' + message + '</div>';
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Show warning message
function showWarning(message) {
    var warning = document.getElementById("warning");
    warning.innerHTML = message;
    setTimeout(function() {
        warning.innerHTML = "";
    }, 3000);
}

// Update members list
function updateMembers(membersList, mutedList) {
    var membersDiv = document.getElementById("members-list");
    membersDiv.innerHTML = "";
    members = membersList;
    var memberCount = Object.keys(membersList).length;
    document.getElementById("member-count").innerHTML = memberCount;
    
    for (var username in membersList) {
        if (membersList.hasOwnProperty(username)) {
            var memberDiv = document.createElement("div");
            memberDiv.className = "member";
            if (username === roomOwner) {
                memberDiv.classList.add("member-owner");
            }
            if (mutedList.indexOf(username) !== -1) {
                memberDiv.classList.add("member-muted");
            }
            
            var nameSpan = document.createElement("span");
            nameSpan.innerHTML = username;
            if (username === roomOwner) nameSpan.innerHTML += " 👑";
            if (mutedList.indexOf(username) !== -1) nameSpan.innerHTML += " 🔇";
            memberDiv.appendChild(nameSpan);
            
            if (isOwner && username !== currentUser && username !== roomOwner) {
                var actions = document.createElement("div");
                actions.className = "mod-actions";
                
                var muteBtn = document.createElement("button");
                muteBtn.className = "mod-btn mute";
                var isMuted = mutedList.indexOf(username) !== -1;
                muteBtn.innerHTML = isMuted ? "🔊 Unmute" : "🔇 Mute";
                muteBtn.onclick = (function(u) {
                    return function() {
                        toggleMute(u, mutedList.indexOf(u) === -1);
                    };
                })(username);
                actions.appendChild(muteBtn);
                
                var removeBtn = document.createElement("button");
                removeBtn.className = "mod-btn remove";
                removeBtn.innerHTML = "❌ Remove";
                removeBtn.onclick = (function(u) {
                    return function() {
                        removeUser(u);
                    };
                })(username);
                actions.appendChild(removeBtn);
                
                memberDiv.appendChild(actions);
            }
            
            membersDiv.appendChild(memberDiv);
        }
    }
}

// Send a message
function sendMessage() {
    var input = document.getElementById("message-input");
    var message = input.value.trim();
    if (message && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            "type": "message",
            "content": message
        }));
        input.value = "";
    } else if (!ws || ws.readyState !== WebSocket.OPEN) {
        showWarning("Not connected to server!");
    }
}

// Toggle mute for a user
function toggleMute(username, mute) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            "type": "mute",
            "username": username,
            "mute": mute
        }));
    }
}

// Remove a user
function removeUser(username) {
    if (ws && ws.readyState === WebSocket.OPEN && confirm("Remove " + username + " from room?")) {
        ws.send(JSON.stringify({
            "type": "remove",
            "username": username
        }));
    }
}

// Show invite token
function showInvite(inviteToken, roomCode) {
    var inviteLink = window.location.protocol + "//" + window.location.host + "/room/" + roomCode + "?username=&token=" + inviteToken;
    prompt("Share this invite link with others:", inviteLink);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start the connection when page loads
document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM loaded, starting connection...");
    connect();
    
    var messageInput = document.getElementById("message-input");
    if (messageInput) {
        messageInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") sendMessage();
        });
    }
});