// Real-Time Chat JavaScript

// Dynamically detect the API URL
const API_URL = `${window.location.protocol}//${window.location.host}/api`;
const SOCKET_URL = `${window.location.protocol}//${window.location.host}`;

let socket = null;
let currentUser = null;
let currentChatUser = null;
let conversations = [];
let typingTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (!token || !user) {
        window.location.href = '/login';
        return;
    }
    
    currentUser = JSON.parse(user);
    
    // Initialize Socket.IO
    initializeSocket(token);
    
    // Load conversations
    loadConversations();
    
    // Setup search
    document.getElementById('searchConversations').addEventListener('input', filterConversations);
});

// Initialize Socket.IO connection
function initializeSocket(token) {
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus('connected');
        
        // Authenticate
        socket.emit('authenticate', { token: token });
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus('disconnected');
    });
    
    socket.on('authenticated', (data) => {
        console.log('Authenticated:', data);
    });
    
    socket.on('error', (data) => {
        console.error('Socket error:', data);
        showAlert(data.message || 'Connection error', 'error');
    });
    
    socket.on('new_message', (message) => {
        handleNewMessage(message);
    });
    
    socket.on('message_sent', (message) => {
        if (currentChatUser && message.receiver_id === currentChatUser.user_id) {
            appendMessage(message, true);
        }
    });
    
    socket.on('user_typing', (data) => {
        handleTypingIndicator(data);
    });
    
    socket.on('messages_read', (data) => {
        console.log('Messages read by:', data.reader_id);
        // Update read receipts for messages in current chat
        if (currentChatUser && currentChatUser.user_id === data.reader_id) {
            console.log('Updating read receipts in real-time');
            updateReadReceipts();
            // Also reload conversations to update unread count
            loadConversations();
        }
    });
    
    socket.on('user_online', (data) => {
        console.log('User online:', data.user_id);
        updateUserOnlineStatus(data.user_id, true);
    });
}

// Update connection status
function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    if (status === 'connected') {
        statusEl.className = 'connection-status connected';
        statusEl.textContent = '🟢 Connected';
    } else if (status === 'disconnected') {
        statusEl.className = 'connection-status disconnected';
        statusEl.textContent = '🔴 Disconnected - Reconnecting...';
    } else {
        statusEl.className = 'connection-status';
        statusEl.textContent = '🟡 Connecting...';
    }
}

// Load conversations
async function loadConversations() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/chat/conversations`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            conversations = data.conversations;
            renderConversations(conversations);
        } else {
            showAlert(data.error || 'Failed to load conversations', 'error');
        }
    } catch (error) {
        console.error('Load conversations error:', error);
        showAlert('Failed to load conversations', 'error');
    }
}

// Render conversations list
function renderConversations(convList) {
    const container = document.getElementById('conversationsList');
    
    if (convList.length === 0) {
        container.innerHTML = `
            <div class="empty-conversations">
                <div class="empty-conversations-icon">💬</div>
                <div>No conversations yet</div>
                <div style="font-size: 12px; margin-top: 5px;">Click "New Chat" to start messaging</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = convList.map(conv => `
        <div class="conversation-item" data-user-id="${conv.other_user_id}" onclick="openChat(${conv.other_user_id})">
            <div class="conversation-header">
                <div class="conversation-name-section">
                    <span class="conversation-name">${escapeHtml(conv.other_user_name)}</span>
                </div>
                <div class="conversation-time-section">
                    ${conv.unread_count > 0 ? `<span class="conversation-badge">${conv.unread_count}</span>` : ''}
                    <span class="conversation-time">${formatTime(conv.last_message_time)}</span>
                </div>
            </div>
            <div class="conversation-roles">
                <span class="role-badge">${escapeHtml(conv.other_user_role)}</span>
            </div>
            <div class="conversation-preview">${escapeHtml(conv.last_message || 'No messages yet')}</div>
        </div>
    `).join('');
}

// Filter conversations
function filterConversations(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = conversations.filter(conv => 
        conv.other_user_name.toLowerCase().includes(searchTerm) ||
        conv.other_user_email.toLowerCase().includes(searchTerm)
    );
    renderConversations(filtered);
}

// Open chat with user
async function openChat(userId) {
    try {
        const token = localStorage.getItem('token');
        
        // Get user details
        const convUser = conversations.find(c => c.other_user_id === userId);
        if (!convUser) return;
        
        // Check if this is SuperAdmin viewing mode (participant_ids exist)
        // SuperAdmin is in monitoring mode UNLESS they are part of the conversation
        const isSuperAdminMonitoring = convUser.participant_ids && 
                                       convUser.participant_ids.length === 2 &&
                                       !convUser.participant_ids.includes(currentUser.user_id);
        
        if (isSuperAdminMonitoring) {
            // SuperAdmin monitoring conversation between two other users (read-only)
            currentChatUser = {
                user_id: userId,
                full_name: convUser.other_user_name,
                email: convUser.other_user_email,
                role_name: convUser.other_user_role,
                is_admin_view: true,
                is_monitoring: true,
                participant_ids: convUser.participant_ids
            };
        } else {
            // Regular conversation (SuperAdmin is participant OR regular user)
            currentChatUser = {
                user_id: userId,
                full_name: convUser.other_user_name,
                email: convUser.other_user_email,
                role_name: convUser.other_user_role,
                is_admin_view: false,
                is_monitoring: false
            };
        }
        
        // Highlight active conversation
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('active');
        
        // Load messages
        let url = `${API_URL}/chat/messages/${userId}`;
        if (isSuperAdminMonitoring && convUser.participant_ids) {
            // For SuperAdmin monitoring, specify both users in the conversation
            const otherUserId = convUser.participant_ids.find(id => id !== userId);
            url = `${API_URL}/chat/messages/${userId}?with=${otherUserId}`;
        }
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            renderChatArea(data.messages, isSuperAdminMonitoring);
            
            // Mark messages as read (only for non-monitoring mode)
            if (!isSuperAdminMonitoring) {
                socket.emit('mark_read', {
                    sender_id: userId,
                    receiver_id: currentUser.user_id
                });
            }
            
            // Reload conversations to update unread count
            loadConversations();
        } else {
            showAlert(data.error || 'Failed to load messages', 'error');
        }
    } catch (error) {
        console.error('Open chat error:', error);
        showAlert('Failed to open chat', 'error');
    }
}

// Render chat area
function renderChatArea(messages, isMonitoringMode = false) {
    const chatContent = document.getElementById('chatContent');
    
    // Check if SuperAdmin is monitoring (not a participant)
    const adminWarning = isMonitoringMode ? 
        '<div style="background: #fff3cd; padding: 10px; text-align: center; color: #856404; border-bottom: 1px solid #ffc107;">👁️ <strong>Admin Monitoring Mode</strong> - You are viewing this conversation (Read-Only)</div>' : '';
    
    // Show empty state if no messages
    const messagesHTML = messages.length === 0 ? 
        '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #92400e; text-align: center; flex-direction: column; padding: 40px;"><div style="font-size: 48px; margin-bottom: 15px;">💬</div><div style="font-size: 16px; margin-bottom: 5px;">No messages yet</div><div style="font-size: 14px;">Start the conversation by sending a message below</div></div>' :
        messages.map(msg => createMessageHTML(msg, isMonitoringMode)).join('');
    
    // Disable input ONLY when in monitoring mode (SuperAdmin viewing others' chat)
    const inputSection = isMonitoringMode ? 
        '<div style="padding: 20px; text-align: center; color: #92400e; background: #fffbeb;">Message sending disabled in monitoring mode</div>' :
        `<div class="chat-input">
            <div class="input-container">
                <textarea 
                    id="messageInput" 
                    class="message-input" 
                    placeholder="Type a message..." 
                    rows="1"
                    onkeypress="handleKeyPress(event)"
                    oninput="handleTyping()"
                ></textarea>
                <button class="send-button" onclick="sendMessage()">Send</button>
            </div>
        </div>`;
    
    chatContent.innerHTML = `
        ${adminWarning}
        <div class="chat-header">
            <div class="chat-user-info">
                <h3>${escapeHtml(currentChatUser.full_name)} <span class="role-badge">${escapeHtml(currentChatUser.role_name)}</span></h3>
                <div class="chat-user-status">
                    <span class="online-indicator"></span> ${escapeHtml(currentChatUser.email)}
                </div>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages">
            ${messagesHTML}
        </div>
        ${!isMonitoringMode ? `<div id="typingIndicator" class="typing-indicator" style="display: none;">
            ${escapeHtml(currentChatUser.full_name)} is typing...
        </div>` : ''}
        ${inputSection}
    `;
    
    // Scroll to bottom
    scrollToBottom();
    
    // Focus input only if not in monitoring mode
    if (!isMonitoringMode) {
        document.getElementById('messageInput')?.focus();
    }
}

// Create message HTML
function createMessageHTML(message, isMonitoringMode = false) {
    // For SuperAdmin monitoring view, show sender names
    if (isMonitoringMode) {
        return `
            <div class="message received" style="max-width: 80%;">
                <div class="message-bubble">
                    <div style="font-weight: bold; color: #2c3e50; margin-bottom: 5px;">
                        ${escapeHtml(message.sender_name)}
                    </div>
                    <div>${escapeHtml(message.body)}</div>
                    <div class="message-time">${formatTime(message.created_at)}</div>
                </div>
            </div>
        `;
    }
    
    // Normal view - SuperAdmin chatting normally OR other users
    const isSent = message.sender_id === currentUser.user_id;
    const messageClass = isSent ? 'sent' : 'received';
    
    // Add read receipt for sent messages
    const readReceipt = isSent ? 
        (message.is_read ? 
            '<span style="margin-left: 5px; color: #81D4FA;" title="Read">✓✓</span>' : 
            '<span style="margin-left: 5px; color: #FFFFFF;" title="Delivered">✓</span>') : 
        '';
    
    return `
        <div class="message ${messageClass}" data-message-id="${message.message_id}">
            <div class="message-bubble">
                <div>${escapeHtml(message.body)}</div>
                <div class="message-time">${formatTime(message.created_at)}${readReceipt}</div>
            </div>
        </div>
    `;
}

// Append message to chat
function appendMessage(message, isSent) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    const messageClass = isSent ? 'sent' : 'received';
    
    // Add read receipt for sent messages (initially shows single white checkmark)
    const readReceipt = isSent ? 
        '<span style="margin-left: 5px; color: #FFFFFF;" title="Delivered">✓</span>' : 
        '';
    
    const messageHTML = `
        <div class="message ${messageClass}" data-message-id="${message.message_id}">
            <div class="message-bubble">
                <div>${escapeHtml(message.body)}</div>
                <div class="message-time">${formatTime(message.created_at)}${readReceipt}</div>
            </div>
        </div>
    `;
    
    messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
    scrollToBottom();
}

// Send message
function sendMessage() {
    const input = document.getElementById('messageInput');
    const body = input.value.trim();
    
    if (!body || !currentChatUser) return;
    
    // Emit message via Socket.IO
    socket.emit('send_message', {
        sender_id: currentUser.user_id,
        receiver_id: currentChatUser.user_id,
        body: body
    });
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    
    // Update conversation list
    setTimeout(() => loadConversations(), 500);
}

// Handle typing
function handleTyping() {
    if (!currentChatUser) return;
    
    // Emit typing event
    socket.emit('typing', {
        sender_id: currentUser.user_id,
        receiver_id: currentChatUser.user_id,
        is_typing: true
    });
    
    // Clear previous timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Set timeout to stop typing
    typingTimeout = setTimeout(() => {
        socket.emit('typing', {
            sender_id: currentUser.user_id,
            receiver_id: currentChatUser.user_id,
            is_typing: false
        });
    }, 1000);
    
    // Auto-expand textarea
    const input = document.getElementById('messageInput');
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
}

// Handle typing indicator
function handleTypingIndicator(data) {
    if (!currentChatUser || data.user_id !== currentChatUser.user_id) return;
    
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.style.display = data.is_typing ? 'block' : 'none';
        if (data.is_typing) {
            scrollToBottom();
        }
    }
}

// Update read receipts to show double checkmark
function updateReadReceipts() {
    console.log('updateReadReceipts called');
    // Find all sent messages and update their read status
    const sentMessages = document.querySelectorAll('.message.sent');
    console.log('Found', sentMessages.length, 'sent messages');
    
    let updatedCount = 0;
    sentMessages.forEach(messageEl => {
        const timeEl = messageEl.querySelector('.message-time');
        if (timeEl) {
            // Replace single white checkmark with double light blue checkmark
            const currentHTML = timeEl.innerHTML;
            if (currentHTML.includes('title="Delivered"')) {
                timeEl.innerHTML = currentHTML.replace(
                    /<span[^>]*title="Delivered"[^>]*>✓<\/span>/,
                    '<span style="margin-left: 5px; color: #81D4FA;" title="Read">✓✓</span>'
                );
                updatedCount++;
            }
        }
    });
    console.log('Updated', updatedCount, 'messages to read status');
}

// Handle new message
function handleNewMessage(message) {
    // If chat is open with sender, append message
    if (currentChatUser && message.sender_id === currentChatUser.user_id) {
        appendMessage(message, false);
        
        // Mark as read
        socket.emit('mark_read', {
            sender_id: message.sender_id,
            receiver_id: currentUser.user_id
        });
    }
    
    // Update conversations list
    loadConversations();
    
    // Show notification if chat is not open
    if (!currentChatUser || message.sender_id !== currentChatUser.user_id) {
        showAlert(`New message from ${message.sender_name}`, 'info');
    }
}

// Handle key press
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Update user online status
function updateUserOnlineStatus(userId, isOnline) {
    // Update in conversations if needed
    console.log(`User ${userId} is ${isOnline ? 'online' : 'offline'}`);
}

// Scroll to bottom
function scrollToBottom() {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Format time
function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // Get hours and minutes
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}`;
    
    // Today - show time only
    if (date.toDateString() === now.toDateString()) {
        return timeString;
    }
    
    // Yesterday - show "Yesterday" with time
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday ${timeString}`;
    }
    
    // Less than 7 days - show day name with time
    if (diff < 7 * 86400000) {
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        return `${dayName} ${timeString}`;
    }
    
    // Same year - show date with time
    if (date.getFullYear() === now.getFullYear()) {
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${dateStr} ${timeString}`;
    }
    
    // Different year - show full date with time
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${dateStr} ${timeString}`;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show alert
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alert-container');
    const alertClass = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
    
    alertContainer.innerHTML = `
        <div class="alert ${alertClass}">
            ${message}
        </div>
    `;
    
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 5000);
}

// ==================== NEW CHAT MODAL ====================

let availableUsers = [];

// Show new chat modal
async function showNewChatModal() {
    const modal = document.getElementById('newChatModal');
    modal.style.display = 'flex';
    
    // Load available users
    await loadAvailableUsers();
}

// Close new chat modal
function closeNewChatModal() {
    const modal = document.getElementById('newChatModal');
    modal.style.display = 'none';
    document.getElementById('searchUsers').value = '';
}

// Load available users from API
async function loadAvailableUsers() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/chat/users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            availableUsers = data.users || [];
            renderAvailableUsers(availableUsers);
            
            // Setup search
            document.getElementById('searchUsers').addEventListener('input', filterAvailableUsers);
        } else {
            document.getElementById('availableUsersList').innerHTML = 
                '<div style="text-align: center; padding: 20px; color: #e74c3c;">Failed to load users</div>';
        }
    } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('availableUsersList').innerHTML = 
            '<div style="text-align: center; padding: 20px; color: #e74c3c;">Failed to load users</div>';
    }
}

// Render available users
function renderAvailableUsers(users) {
    const container = document.getElementById('availableUsersList');
    
    if (users.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #7f8c8d;">No users available</div>';
        return;
    }
    
    // Group by role
    const grouped = {};
    users.forEach(user => {
        const role = user.role_name || 'Other';
        if (!grouped[role]) {
            grouped[role] = [];
        }
        grouped[role].push(user);
    });
    
    let html = '';
    Object.keys(grouped).sort().forEach(role => {
        html += `<div style="margin-bottom: 15px;">
            <div style="font-weight: bold; color: #2c3e50; padding: 8px 0; border-bottom: 2px solid #3498db; margin-bottom: 8px;">
                ${escapeHtml(role)}
            </div>`;
        
        grouped[role].forEach(user => {
            html += `
                <div onclick="startChatWithUser(${user.user_id})" style="padding: 12px; border: 1px solid #e0e0e0; border-radius: 5px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <div style="font-weight: 500; color: #2c3e50; margin-bottom: 3px;">${escapeHtml(user.full_name)}</div>
                    <div style="font-size: 0.9rem; color: #7f8c8d;">${escapeHtml(user.email)}</div>
                </div>
            `;
        });
        
        html += '</div>';
    });
    
    container.innerHTML = html;
}

// Filter available users
function filterAvailableUsers(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = availableUsers.filter(user => 
        user.full_name.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm) ||
        user.role_name.toLowerCase().includes(searchTerm)
    );
    renderAvailableUsers(filtered);
}

// Start chat with selected user
async function startChatWithUser(userId) {
    closeNewChatModal();
    
    // Check if conversation already exists
    const existingConv = conversations.find(c => c.other_user_id === userId);
    if (existingConv) {
        // Open existing conversation
        openChat(userId);
    } else {
        // Create new conversation by opening empty chat
        const user = availableUsers.find(u => u.user_id === userId);
        if (!user) return;
        
        currentChatUser = {
            user_id: userId,
            full_name: user.full_name,
            email: user.email,
            role_name: user.role_name
        };
        
        // Render empty chat area
        renderChatArea([], false);
        
        // Highlight would-be conversation (if exists)
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
    }
}
