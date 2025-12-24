// Dashboard JavaScript

// Dynamically detect the API URL based on current host
const API_URL = `${window.location.protocol}//${window.location.host}/api`;
let currentUser = null;
let notifications = [];

// Get token from localStorage
function getToken() {
    return localStorage.getItem('token');
}

// Get current user from localStorage
function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// Get current user's role name
function getUserRole() {
    const user = getCurrentUser();
    return user ? user.role_name : null;
}

// Check if user is authenticated
function checkAuth() {
    const token = getToken();
    const user = getCurrentUser();
    
    if (!token || !user) {
        window.location.href = '/login';
        return false;
    }
    
    currentUser = user;
    return true;
}

// Format time to 12-hour format with AM/PM
function formatTime12Hour(time24) {
    if (!time24) return 'N/A';
    
    const [hours, minutes] = time24.split(':');
    let hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    
    hour = hour % 12;
    hour = hour ? hour : 12; // 0 should be 12
    
    return `${hour}:${minutes} ${ampm}`;
}

// Logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

// API request helper
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
    };
    
    const fullURL = `${API_URL}${endpoint}`;
    console.log(`[API] ${options.method || 'GET'} ${fullURL}`);
    
    try {
        const response = await fetch(fullURL, {
            ...options,
            headers,
        });
        
        if (response.status === 401) {
            // Token expired or invalid
            logout();
            return null;
        }
        
        const data = await response.json();
        console.log(`[API Response] ${response.status}:`, data);
        
        if (!response.ok) {
            const errorMsg = data.error || `HTTP ${response.status}`;
            console.error(`[API Error] ${errorMsg}`);
            throw new Error(errorMsg);
        }
        
        return data;
    } catch (error) {
        console.error('API request error:', error);
        showAlert(error.message);
        return null;
    }
}

// Show/hide loading overlay
function showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

// Show alert
function showAlert(message, type = 'error') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    const mainContent = document.querySelector('.main-content');
    mainContent.insertBefore(alert, mainContent.firstChild);
    
    setTimeout(() => {
        alert.style.animation = 'slideInDown 0.3s ease-out reverse';
        setTimeout(() => alert.remove(), 300);
    }, 5000);
}

// Confirmation Dialog
function showConfirmDialog(message, onConfirm, title = 'Confirm Action') {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog active';
        dialog.innerHTML = `
            <div class="confirm-content">
                <div class="confirm-header">${title}</div>
                <div class="confirm-body">${message}</div>
                <div class="confirm-actions">
                    <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
                    <button class="btn btn-primary" id="confirmOk">Confirm</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        document.getElementById('confirmCancel').addEventListener('click', () => {
            dialog.remove();
            resolve(false);
        });
        
        document.getElementById('confirmOk').addEventListener('click', () => {
            dialog.remove();
            resolve(true);
            if (onConfirm) onConfirm();
        });
        
        // Close on background click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
                resolve(false);
            }
        });
    });
}

// Open/close modal
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Initialize dashboard
async function initDashboard() {
    if (!checkAuth()) return;
    
    // Set user name
    document.getElementById('userName').textContent = currentUser.full_name;
    
    // Set welcome message with role
    updateWelcomeMessage();
    
    // Set up navigation based on role
    setupNavigation();
    
    // Load notifications
    await loadNotifications();
    
    // Load dashboard content based on role
    await loadDashboardContent();
    
    // Set up event listeners
    setupEventListeners();
}

// Update welcome message with user role
function updateWelcomeMessage() {
    const roleNameMap = {
        1: 'Manager',
        2: 'Admin',
        3: 'Counsellor',
        4: 'University Staff',
        5: 'Logistics Staff',
        6: 'Student'
    };
    
    const roleName = roleNameMap[currentUser.role_id] || 'User';
    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl) {
        welcomeEl.textContent = `Welcome ${roleName}`;
    }
}

// Setup navigation based on user role
function setupNavigation() {
    const roleId = currentUser.role_id;
    
    // Role IDs: 1=Manager, 2=Admin, 3=Counsellor, 4=University, 5=Logistics, 6=Student
    
    // Show/hide menu items based on role
    if (roleId === 6) { // Student
        show(['applicationsLink', 'documentsLink', 'messagesLink']);
    } else if (roleId === 3) { // Counsellor
        show(['studentsLink', 'applicationsLink', 'documentsLink', 'messagesLink', 'logisticsLink']);
    } else if (roleId === 4) { // University Staff
        show(['applicationsLink', 'documentsLink', 'messagesLink']);
    } else if (roleId === 5) { // Logistics Staff
        show(['logisticsLink', 'messagesLink']);
    } else if (roleId === 1 || roleId === 2) { // Admin/Manager
        show(['studentsLink', 'applicationsLink', 'documentsLink', 'messagesLink', 'usersLink', 'universitiesLink', 'logisticsLink', 'auditLink']);
    }
}

function show(elementIds) {
    elementIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    });
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('dashboardLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadDashboardContent();
    });
    
    document.getElementById('applicationsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadApplicationsPage();
    });
    
    document.getElementById('documentsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadDocumentsPage();
    });
    
    document.getElementById('messagesLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadMessagesPage();
    });
    
    document.getElementById('studentsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadStudentsPage();
    });
    
    document.getElementById('usersLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadUsersPage();
    });
    
    document.getElementById('universitiesLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadUniversitiesPage();
    });
    
    document.getElementById('logisticsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadLogisticsPage();
    });
    
    document.getElementById('auditLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadAuditLogsPage();
    });
    
    document.getElementById('notificationBell')?.addEventListener('click', () => {
        showNotificationsModal();
    });
}

// Load notifications
async function loadNotifications() {
    const data = await apiRequest('/notifications');
    if (data) {
        notifications = data.notifications;
        const unreadCount = notifications.filter(n => n.status === 'unread').length;
        
        const badge = document.getElementById('notificationCount');
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

// Show notifications modal
function showNotificationsModal() {
    const list = document.getElementById('notificationsList');
    const unreadNotifications = notifications.filter(n => n.status === 'unread');
    
    if (notifications.length === 0) {
        list.innerHTML = '<p class="text-center">No notifications</p>';
    } else {
        // Add "Mark all as read" button at the top if there are unread notifications
        let headerButtons = '';
        if (unreadNotifications.length > 0) {
            headerButtons = `
                <div style="margin-bottom: 15px; text-align: right;">
                    <button class="btn btn-sm btn-primary" onclick="markAllNotificationsRead()">
                        Mark All as Read (${unreadNotifications.length})
                    </button>
                </div>
            `;
        }
        
        list.innerHTML = headerButtons + notifications.map(n => `
            <div class="card mb-2" style="padding: 15px; ${n.status === 'unread' ? 'background-color: #f0f8ff; border-left: 3px solid #3498db;' : ''}">
                <div class="flex-between">
                    <div>
                        <strong>${n.title}</strong>
                        <p style="margin: 5px 0; color: #7f8c8d;">${n.message}</p>
                        <small style="color: #95a5a6;">${new Date(n.created_at).toLocaleString()}</small>
                    </div>
                    ${n.status === 'unread' ? `
                        <button class="btn btn-sm btn-primary" onclick="markNotificationRead(${n.notification_id})">
                            Mark Read
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }
    
    openModal('notificationsModal');
}

// Mark notification as read
async function markNotificationRead(notificationId) {
    await apiRequest(`/notifications/${notificationId}/read`, { method: 'PUT' });
    await loadNotifications();
    showNotificationsModal();
}

// Mark all notifications as read
async function markAllNotificationsRead() {
    showLoading();
    try {
        const response = await apiRequest('/notifications/mark-all-read', { method: 'PUT' });
        if (response) {
            await loadNotifications();
            showNotificationsModal();
            showAlert('All notifications marked as read', 'success');
        }
    } catch (error) {
        showAlert('Failed to mark all notifications as read', 'error');
    }
    showLoading(false);
}

// ==================== DASHBOARD CONTENT ====================

async function loadDashboardContent() {
    // Map role IDs to dashboard titles
    const roleDashboardTitles = {
        1: 'Manager Dashboard',
        2: 'Admin Dashboard',
        3: 'Counsellor Dashboard',
        4: 'University Staff Dashboard',
        5: 'Logistics Dashboard',
        6: 'Student Dashboard'
    };
    
    const roleId = currentUser.role_id;
    const dashboardTitle = roleDashboardTitles[roleId] || 'Dashboard';
    
    document.getElementById('pageTitle').textContent = dashboardTitle;
    document.getElementById('pageSubtitle').textContent = `Welcome back, ${currentUser.full_name}!`;
    
    showLoading();
    
    if (roleId === 6) {
        await loadStudentDashboard();
    } else if (roleId === 3) {
        await loadCounsellorDashboard();
    } else if (roleId === 4) {
        await loadUniversityDashboard();
    } else if (roleId === 5) {
        await loadLogisticsDashboard();
    } else {
        await loadAdminDashboard();
    }
    
    showLoading(false);
}

// Student Dashboard
async function loadStudentDashboard() {
    const [profileData, applicationsData, documentsData, logisticsData] = await Promise.all([
        apiRequest('/students/me'),
        apiRequest('/applications'),
        apiRequest('/documents'),
        apiRequest('/students/me/logistics')
    ]);
    
    const profile = profileData?.student;
    const applications = applicationsData?.applications || [];
    const documents = documentsData?.documents || [];
    const logistics = logisticsData?.logistics;
    
    // Group documents by application
    const docsByApp = {};
    documents.forEach(doc => {
        const appId = doc.application_id || 'unassigned';
        if (!docsByApp[appId]) {
            docsByApp[appId] = [];
        }
        docsByApp[appId].push(doc);
    });
    
    // Stats
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card">
            <h3>Profile Status</h3>
            <div class="stat-value">${profile ? profile.application_status : 'Incomplete'}</div>
        </div>
        <div class="stat-card">
            <h3>Applications</h3>
            <div class="stat-value">${applications.length}</div>
        </div>
        <div class="stat-card">
            <h3>Documents</h3>
            <div class="stat-value">${documents.length}</div>
        </div>
    `;
    
    // Main content
    let content = '';
    
    if (!profile) {
        content += `
            <div class="card">
                <div class="card-header">
                    <h2>Complete Your Profile</h2>
                </div>
                <p>Please complete your student profile to start applying to universities.</p>
                <button class="btn btn-primary" onclick="showProfileForm()">Complete Profile</button>
            </div>
        `;
    } else {
        content += `
            <div class="card">
                <div class="card-header flex-between">
                    <h2>My Profile</h2>
                    <button class="btn btn-sm btn-secondary" onclick="showProfileForm()">Edit</button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                    <div><strong>Date of Birth:</strong> ${profile.dob ? new Date(profile.dob).toLocaleDateString('en-GB') : 'N/A'}</div>
                    <div><strong>Nationality:</strong> ${profile.nationality || 'N/A'}</div>
                    <div><strong>Phone:</strong> ${profile.phone || 'N/A'}</div>
                    <div><strong>Program Interest:</strong> ${profile.program_interest || 'N/A'}</div>
                    <div><strong>Preferred Country:</strong> ${profile.preferred_country || 'N/A'}</div>
                    <div><strong>Counsellor:</strong> ${profile.counsellor_name || 'Not assigned'}</div>
                </div>
            </div>
        `;
    }
    
    // Logistics Status Card
    if (logistics) {
        const statusColor = 
            logistics.arrival_status === 'Completed' ? 'badge-success' :
            logistics.arrival_status === 'Arrived' ? 'badge-info' :
            logistics.arrival_status === 'Accommodation' ? 'badge-primary' :
            logistics.arrival_status === 'Medical Check Process' ? 'badge-warning' :
            'badge-secondary';
        
        content += `
            <div class="card" style="border-left: 4px solid #10b981;">
                <div class="card-header flex-between" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white;">
                    <h2 style="margin: 0; color: white;">My Arrival Logistics</h2>
                    ${logistics.arrival_status === 'Pending' ? `
                        <button class="btn btn-sm btn-secondary" onclick="showEditStudentLogisticsForm(${logistics.logistics_id})" style="background: white; color: #f59e0b; border: none;">
                            Edit Information
                        </button>
                    ` : ''}
                </div>
                <div style="padding: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                        <div style="padding: 15px; background: #fffbeb; border-radius: 8px;">
                            <strong style="color: #f59e0b;">Pickup Date:</strong>
                            <div style="font-size: 1.1em; margin-top: 5px;">${logistics.pickup_date || 'N/A'}</div>
                        </div>
                        <div style="padding: 15px; background: #fffbeb; border-radius: 8px;">
                            <strong style="color: #f59e0b;">Pickup Time:</strong>
                            <div style="font-size: 1.1em; margin-top: 5px;">${formatTime12Hour(logistics.pickup_time)}</div>
                        </div>
                        <div style="padding: 15px; background: #fffbeb; border-radius: 8px;">
                            <strong style="color: #f59e0b;">Pickup Location:</strong>
                            <div style="font-size: 1.1em; margin-top: 5px;">${logistics.pickup_location || 'N/A'}</div>
                        </div>
                        <div style="padding: 15px; background: #fffbeb; border-radius: 8px;">
                            <strong style="color: #f59e0b;">Medical Check Date:</strong>
                            <div style="font-size: 1.1em; margin-top: 5px;">${logistics.medical_check_date || 'N/A'}</div>
                        </div>
                        <div style="padding: 15px; background: #fffbeb; border-radius: 8px;">
                            <strong style="color: #f59e0b;">Accommodation:</strong>
                            <div style="font-size: 0.95em; margin-top: 5px;">${logistics.accommodation || 'N/A'}</div>
                        </div>
                        <div style="padding: 15px; background: #fffbeb; border-radius: 8px;">
                            <strong style="color: #f59e0b;">Arrival Date:</strong>
                            <div style="font-size: 1.1em; margin-top: 5px;">${logistics.arrival_date || 'N/A'}</div>
                        </div>
                    </div>
                    ${logistics.flight_details ? `
                        <div style="padding: 15px; background: #fef3c7; border-radius: 8px; margin-top: 20px;">
                            <strong style="color: #d97706;">Flight Details:</strong>
                            <div style="margin-top: 5px;">${logistics.flight_details}</div>
                        </div>
                    ` : ''}
                    <div style="padding: 15px; background: #fef3c7; border-radius: 8px; margin-top: 20px; text-align: center;">
                        <strong style="color: #d97706;">Current Status:</strong>
                        <div style="margin-top: 10px;">
                            <span class="badge ${statusColor}" style="font-size: 1.1em; padding: 8px 16px;">${logistics.arrival_status || 'Pending'}</span>
                        </div>
                        ${logistics.arrival_status !== 'Pending' ? `
                            <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
                                <em>⚠️ You cannot edit logistics information once the process has started.</em>
                            </div>
                        ` : ''}
                    </div>
                    ${logistics.counsellor_name || logistics.logistics_staff_name ? `
                        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                            <strong>📞 Contact Information:</strong>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px;">
                                ${logistics.counsellor_name ? `<div>Counsellor: <strong>${logistics.counsellor_name}</strong></div>` : ''}
                                ${logistics.logistics_staff_name ? `<div>Logistics Staff: <strong>${logistics.logistics_staff_name}</strong></div>` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // Applications
    content += `
        <div class="card">
            <div class="card-header flex-between">
                <h2>My Applications & Documents</h2>
                ${profile ? `<button class="btn btn-sm btn-primary" onclick="showApplicationForm()">New Application</button>` : ''}
            </div>
            ${applications.length === 0 ? '<p>No applications yet.</p>' : 
                applications.map(app => {
                    const appDocs = docsByApp[app.application_id] || [];
                    const requiredDocs = ['Passport', 'Transcript', 'English Test', 'Personal Photo'];
                    const uploadedTypes = appDocs.map(d => d.doc_type);
                    const missingDocs = requiredDocs.filter(type => !uploadedTypes.includes(type));
                    
                    return `
                        <div class="card" style="margin: 15px; background: #f8f9fa;">
                            <div class="card-header" style="background: white;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <h3>${app.university_name} - ${app.program_name}</h3>
                                        <small>Status: <span class="badge badge-info">${app.status}</span></small>
                                        <small style="margin-left: 10px;">Submitted: ${app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 'N/A'}</small>
                                        ${app.decision_type ? `<br><small>Decision: <span class="badge ${
                                            app.decision_type === 'Accepted' ? 'badge-success' : 
                                            app.decision_type === 'Rejected' ? 'badge-danger' : 
                                            app.decision_type === 'Missing Documents' ? 'badge-warning' : 
                                            'badge-info'
                                        }">${app.decision_type}</span></small>` : ''}
                                    </div>
                                    <div style="display: flex; gap: 10px;">
                                        <button class="btn btn-sm btn-success" onclick="showDocumentUploadFormForApplication(${app.application_id}, '${app.university_name}')">
                                            Upload Document
                                        </button>
                                        ${app.status === 'In Review' ? `
                                            <button class="btn btn-sm btn-danger" onclick="deleteStudentApplication(${app.application_id})">
                                                Delete Application
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                            <div style="padding: 15px;">
                                ${app.decision_notes ? `
                                    <div class="alert alert-info" style="background: #d1ecf1; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                                        <strong>📝 University Decision Notes:</strong><br>
                                        ${app.decision_notes}
                                    </div>
                                ` : ''}
                                
                                ${missingDocs.length > 0 ? `
                                    <div class="alert alert-warning" style="background: #fff3cd; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                                        <strong>⚠️ Missing Required Documents:</strong> ${missingDocs.join(', ')}
                                    </div>
                                ` : `
                                    <div class="alert alert-success" style="background: #d4edda; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                                        <strong>✓ All required documents uploaded!</strong>
                                    </div>
                                `}
                                
                                <strong>Documents (${appDocs.length}/4 required):</strong>
                                ${appDocs.length === 0 ? '<p>No documents uploaded yet.</p>' : `
                                    <div class="table-container" style="margin-top: 10px;">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Type</th>
                                                    <th>Uploaded</th>
                                                    <th>Status</th>
                                                    <th>Notes</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${appDocs.map(d => `
                                                    <tr>
                                                        <td>${d.doc_type}</td>
                                                        <td>${d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : 'N/A'}</td>
                                                        <td>${d.verified === true ? '<span class="badge badge-success">✓ Verified</span>' : 
                                                               d.verified === null ? '<span class="badge badge-warning">⏳ Pending Review</span>' : 
                                                               '<span class="badge badge-danger">✗ Rejected</span>'}</td>
                                                        <td>${d.verification_notes || ''}</td>
                                                        <td>
                                                            <button class="btn btn-xs btn-primary" onclick="downloadDocument(${d.document_id}, '${d.doc_type}')">Download</button>
                                                            ${d.verified !== true ? `<button class="btn btn-xs btn-danger" onclick="deleteDocument(${d.document_id}, ${app.application_id})">Delete</button>` : ''}
                                                        </td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
                }).join('')
            }
        </div>
    `;
    
    document.getElementById('mainContentArea').innerHTML = content;
}

// Counsellor Dashboard
async function loadCounsellorDashboard() {
    try {
        const [studentsData, applicationsData, analyticsData] = await Promise.all([
            apiRequest('/students'),
            apiRequest('/applications'),
            apiRequest('/analytics/counsellor')
        ]);
        
        const students = studentsData?.students || [];
        const applications = applicationsData?.applications || [];
        const analytics = analyticsData || {};
        
        document.getElementById('statsGrid').innerHTML = `
            <div class="stat-card">
                <h3>Assigned Students</h3>
                <div class="stat-value">${analytics.total_students || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Total Applications</h3>
                <div class="stat-value">${applications.length}</div>
            </div>
            <div class="stat-card">
                <h3>Students Without Apps</h3>
                <div class="stat-value">${analytics.students_no_apps || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Recent Applications (7d)</h3>
                <div class="stat-value">${analytics.recent_applications || 0}</div>
            </div>
        `;
        
        let content = `
            <!-- Analytics Charts -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                <div class="card">
                    <div class="card-header">
                        <h2>Students by Status</h2>
                    </div>
                    <canvas id="studentStatusChart" style="max-height: 300px;"></canvas>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h2>Applications Breakdown</h2>
                    </div>
                    <canvas id="applicationsChart" style="max-height: 300px;"></canvas>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h2>Document Verification Status</h2>
                    </div>
                    <canvas id="documentChart" style="max-height: 300px;"></canvas>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h2>Students Needing Attention</h2>
                    </div>
                    <div style="padding: 20px; text-align: center;">
                        <div style="font-size: 48px; font-weight: bold; color: #e74c3c;">${analytics.students_no_apps || 0}</div>
                        <p style="color: #7f8c8d;">Students without applications yet</p>
                        <button class="btn btn-primary" onclick="navigateTo('students')">View Students</button>
                    </div>
                </div>
            </div>
            
            <!-- Students Table -->
            <div class="card">
                <div class="card-header">
                    <h2>My Students</h2>
                </div>
                ${students.length === 0 ? '<p>No students assigned.</p>' : `
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Nationality</th>
                                    <th>Preferred Country</th>
                                    <th>Program Interest</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${students.map(student => `
                                    <tr>
                                        <td>${student.full_name}</td>
                                        <td>${student.email}</td>
                                        <td>${student.nationality || 'N/A'}</td>
                                        <td>${student.preferred_country || 'N/A'}</td>
                                        <td>${student.program_interest || 'N/A'}</td>
                                        <td><span class="badge badge-info">${student.application_status}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
        
        document.getElementById('mainContentArea').innerHTML = content;
        
        // Render Charts with delay to ensure DOM is ready
        setTimeout(() => {
            try {
                renderCounsellorCharts(analytics);
            } catch (error) {
                console.error('Error rendering counsellor charts:', error);
            }
        }, 100);
    } catch (error) {
        console.error('Error loading counsellor dashboard:', error);
        showAlert('Error loading dashboard data');
    }
}

// University Dashboard
async function loadUniversityDashboard() {
    const [applicationsData, documentsData] = await Promise.all([
        apiRequest('/applications'),
        apiRequest('/documents')
    ]);
    
    const applications = applicationsData?.applications || [];
    const documents = documentsData?.documents || [];
    
    // Calculate document verification stats
    const verifiedDocs = documents.filter(d => d.uni_verified === true).length;
    const rejectedDocs = documents.filter(d => d.uni_verified === false).length;
    const pendingDocs = documents.filter(d => d.uni_verified === null).length;
    
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card">
            <h3>Total Applications</h3>
            <div class="stat-value">${applications.length}</div>
        </div>
        <div class="stat-card">
            <h3>Forwarded</h3>
            <div class="stat-value">${applications.filter(a => a.status === 'Forwarded to University').length}</div>
        </div>
        <div class="stat-card">
            <h3>Docs Verified</h3>
            <div class="stat-value">${verifiedDocs}</div>
        </div>
        <div class="stat-card">
            <h3>Docs Rejected</h3>
            <div class="stat-value">${rejectedDocs}</div>
        </div>
    `;
    
    let content = `
        <!-- Document Verification Summary Card -->
        <div class="card" style="margin-bottom: 20px;">
            <div class="card-header">
                <h2>My Document Verifications</h2>
            </div>
            <div style="padding: 20px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                    <div style="text-align: center; padding: 15px; background: #d4edda; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #155724;">${verifiedDocs}</div>
                        <div style="color: #155724; font-weight: 600;">Verified</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f8d7da; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #721c24;">${rejectedDocs}</div>
                        <div style="color: #721c24; font-weight: 600;">Rejected</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #fff3cd; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #856404;">${pendingDocs}</div>
                        <div style="color: #856404; font-weight: 600;">Pending Review</div>
                    </div>
                </div>
                
                ${documents.length === 0 ? `
                    <div class="alert alert-info">
                        No documents to review yet. Documents will appear here once applications are forwarded to your university.
                    </div>
                ` : `
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Document Type</th>
                                    <th>Uploaded</th>
                                    <th>My Status</th>
                                    <th>My Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${documents.map(doc => {
                                    const statusBadge = doc.uni_verified === null ? 
                                        '<span class="badge badge-warning">Pending</span>' : 
                                        (doc.uni_verified ? 
                                            '<span class="badge badge-success">Verified</span>' : 
                                            '<span class="badge badge-danger">Rejected</span>'
                                        );
                                    
                                    return `
                                    <tr>
                                        <td>${doc.student_name || 'N/A'}</td>
                                        <td><strong>${doc.doc_type}</strong></td>
                                        <td>${new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</td>
                                        <td>${statusBadge}</td>
                                        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                            ${doc.uni_verification_notes || '-'}
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>
        
        <!-- Applications Card -->
        <div class="card">
            <div class="card-header">
                <h2>Applications</h2>
            </div>
            ${applications.length === 0 ? '<p>No applications.</p>' : `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Program</th>
                                <th>Counsellor</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${applications.map(app => `
                                <tr>
                                    <td>${app.student_name}</td>
                                    <td>${app.program_name}</td>
                                    <td>${app.counsellor_name || 'N/A'}</td>
                                    <td><span class="badge badge-info">${app.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('mainContentArea').innerHTML = content;
}

// Logistics Dashboard
async function loadLogisticsDashboard() {
    const logisticsData = await apiRequest('/logistics');
    const logistics = logisticsData?.logistics || [];
    
    // Calculate statistics
    const totalRecords = logistics.length;
    const pendingCount = logistics.filter(l => l.arrival_status === 'Pending').length;
    const inProgressCount = logistics.filter(l => ['Arrived', 'Accommodation', 'Medical Check Process'].includes(l.arrival_status)).length;
    const completedCount = logistics.filter(l => l.arrival_status === 'Completed').length;
    
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card">
            <h3>Total Records</h3>
            <div class="stat-value">${totalRecords}</div>
        </div>
        <div class="stat-card">
            <h3>Pending</h3>
            <div class="stat-value">${pendingCount}</div>
        </div>
        <div class="stat-card">
            <h3>In Progress</h3>
            <div class="stat-value">${inProgressCount}</div>
        </div>
        <div class="stat-card">
            <h3>Completed</h3>
            <div class="stat-value">${completedCount}</div>
        </div>
    `;
    
    // Status breakdown for chart
    const statusData = {
        'Pending': pendingCount,
        'Arrived': logistics.filter(l => l.arrival_status === 'Arrived').length,
        'Accommodation': logistics.filter(l => l.arrival_status === 'Accommodation').length,
        'Medical Check': logistics.filter(l => l.arrival_status === 'Medical Check Process').length,
        'Completed': completedCount
    };
    
    let content = `
        <div class="card">
            <div class="card-header">
                <h2>Logistics Status Overview</h2>
            </div>
            <div style="padding: 20px;">
                <canvas id="logisticsChart" style="max-height: 300px;"></canvas>
            </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h2>My Assigned Records</h2>
            </div>
            ${logistics.length === 0 ? '<p style="padding: 20px;">No logistics records assigned to you.</p>' : `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Pickup Date</th>
                                <th>Location</th>
                                <th>Accommodation</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logistics.map(log => {
                                // Determine badge color based on status
                                let badgeClass = 'badge-warning';
                                if (log.arrival_status === 'Completed') badgeClass = 'badge-success';
                                else if (log.arrival_status === 'Arrived') badgeClass = 'badge-info';
                                else if (log.arrival_status === 'Accommodation') badgeClass = 'badge-primary';
                                else if (log.arrival_status === 'Medical Check Process') badgeClass = 'badge-secondary';
                                
                                return `
                                <tr>
                                    <td>${log.student_name}</td>
                                    <td>${log.pickup_date || 'N/A'}</td>
                                    <td>${log.pickup_location || 'N/A'}</td>
                                    <td>${log.accommodation || 'N/A'}</td>
                                    <td><span class="badge ${badgeClass}">${log.arrival_status}</span></td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('mainContentArea').innerHTML = content;
    
    // Create chart if Chart.js is available and there's data
    if (typeof Chart !== 'undefined' && totalRecords > 0) {
        const ctx = document.getElementById('logisticsChart');
        if (ctx) {
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statusData),
                    datasets: [{
                        data: Object.values(statusData),
                        backgroundColor: [
                            '#f39c12', // Pending - Orange
                            '#3498db', // Arrived - Blue
                            '#9b59b6', // Accommodation - Purple
                            '#e67e22', // Medical Check - Dark Orange
                            '#27ae60'  // Completed - Green
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        },
                        title: {
                            display: true,
                            text: 'Records by Status'
                        }
                    }
                }
            });
        }
    }
}

// Admin Dashboard
async function loadAdminDashboard() {
    try {
        const [usersData, studentsData, applicationsData, analyticsData] = await Promise.all([
            apiRequest('/users'),
            apiRequest('/students'),
            apiRequest('/applications'),
            apiRequest('/analytics/admin')
        ]);
        
        const users = usersData?.users || [];
        const students = studentsData?.students || [];
        const applications = applicationsData?.applications || [];
        const analytics = analyticsData || {};
        
        document.getElementById('statsGrid').innerHTML = `
            <div class="stat-card">
                <h3>Total Users</h3>
                <div class="stat-value">${analytics.total_users || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Total Students</h3>
                <div class="stat-value">${analytics.total_students || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Applications</h3>
                <div class="stat-value">${analytics.total_applications || 0}</div>
            </div>
        `;
        
        let content = `
            <!-- Analytics Charts Grid - Main 4 Diagrams -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                <div class="card">
                    <div class="card-header">
                        <h2>System Audit Activity (30 Days)</h2>
                    </div>
                    <canvas id="auditActivityChart" style="max-height: 300px;"></canvas>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h2>Users by Role</h2>
                    </div>
                    <canvas id="usersByRoleChart" style="max-height: 300px;"></canvas>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h2>Top Active Users (7 Days)</h2>
                    </div>
                    <canvas id="topActiveUsersChart" style="max-height: 300px;"></canvas>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h2>User Status Overview</h2>
                    </div>
                    <canvas id="userStatusChart" style="max-height: 300px;"></canvas>
                </div>
            </div>
            
            <!-- Additional System Insights -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                <div class="card">
                    <div class="card-header">
                        <h2>Students Needing Assignment</h2>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div style="text-align: center; padding: 20px; background: #fff3cd; border-radius: 8px;">
                                <div style="font-size: 36px; font-weight: bold; color: #856404;">${analytics.students_no_counsellor || 0}</div>
                                <p style="margin: 5px 0 0 0; color: #856404;">No Counsellor</p>
                            </div>
                            <div style="text-align: center; padding: 20px; background: #f8d7da; border-radius: 8px;">
                                <div style="font-size: 36px; font-weight: bold; color: #721c24;">${analytics.students_no_logistics || 0}</div>
                                <p style="margin: 5px 0 0 0; color: #721c24;">No Logistics</p>
                            </div>
                        </div>
                        <button class="btn btn-primary" style="width: 100%; margin-top: 15px;" onclick="loadStudentsPage()">
                            Manage Assignments
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h2>Application Decisions</h2>
                    </div>
                    <canvas id="decisionChart" style="max-height: 300px;"></canvas>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h2>Application Status Overview</h2>
                    </div>
                    <canvas id="appStatusChart" style="max-height: 300px;"></canvas>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h2>Top Universities (Applications)</h2>
                    </div>
                    <canvas id="universityChart" style="max-height: 300px;"></canvas>
                </div>
            </div>
            
            <!-- System Health Summary -->
            <div class="card">
                <div class="card-header">
                    <h2>System Overview</h2>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; padding: 20px;">
                    <div style="text-align: center;">
                        <h3 style="color: #3498db; margin: 0;">${analytics.total_users || 0}</h3>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d;">Total Users</p>
                    </div>
                    <div style="text-align: center;">
                        <h3 style="color: #2ecc71; margin: 0;">${analytics.total_students || 0}</h3>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d;">Total Students</p>
                    </div>
                    <div style="text-align: center;">
                        <h3 style="color: #9b59b6; margin: 0;">${analytics.total_applications || 0}</h3>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d;">Applications</p>
                    </div>
                    <div style="text-align: center;">
                        <h3 style="color: #e67e22; margin: 0;">${analytics.recent_registrations || 0}</h3>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d;">New This Week</p>
                    </div>
                    <div style="text-align: center;">
                        <h3 style="color: #1abc9c; margin: 0;">${analytics.total_counsellors || 0}</h3>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d;">Active Counsellors</p>
                    </div>
                    <div style="text-align: center;">
                        <h3 style="color: #e74c3c; margin: 0;">${analytics.students_no_counsellor || 0}</h3>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d;">Unassigned Students</p>
                    </div>
                    <div style="text-align: center;">
                        <h3 style="color: #f39c12; margin: 0;">${(analytics.document_status || []).reduce((sum, d) => sum + d.count, 0)}</h3>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d;">Total Documents</p>
                    </div>
                    <div style="text-align: center;">
                        <h3 style="color: #95a5a6; margin: 0;">${(analytics.audit_activity || []).reduce((sum, a) => sum + a.count, 0)}</h3>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d;">Actions (30 Days)</p>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('mainContentArea').innerHTML = content;
        
        // Render Charts with delay to ensure DOM is ready
        setTimeout(() => {
            try {
                renderAdminCharts(analytics);
            } catch (error) {
                console.error('Error rendering admin charts:', error);
            }
        }, 100);
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        showAlert('Error loading dashboard data');
    }
}

// ==================== PAGE LOADERS ====================

async function loadApplicationsPage() {
    document.getElementById('pageTitle').textContent = 'Applications';
    showLoading();
    
    const data = await apiRequest('/applications');
    const applications = data?.applications || [];
    
    let content = `
        <div class="card">
            <div class="card-header flex-between">
                <h2>Applications</h2>
                ${currentUser.role_id === 6 ? `
                    <button class="btn btn-primary" onclick="showApplicationForm()">New Application</button>
                ` : ''}
            </div>
            
            <!-- Search and Filter Bar -->
            <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto auto; gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Search</label>
                        <input type="text" id="applicationSearch" class="form-control" 
                               placeholder="Search by student, university, or program..." 
                               onkeyup="filterApplications()">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Status</label>
                        <select id="applicationStatusFilter" class="form-control" onchange="filterApplications()">
                            <option value="">All Statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Pending Submission">Pending Submission</option>
                            <option value="Forwarded to University">Forwarded to University</option>
                            <option value="Missing Documents - In Review">Missing Documents</option>
                            <option value="Decision: Accepted">Accepted</option>
                            <option value="Decision: Rejected">Rejected</option>
                            <option value="Decision: Conditional">Conditional</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>University</label>
                        <select id="applicationUniversityFilter" class="form-control" onchange="filterApplications()">
                            <option value="">All Universities</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Date Range</label>
                        <select id="applicationDateFilter" class="form-control" onchange="filterApplications()">
                            <option value="">All Dates</option>
                            <option value="this-week">This Week</option>
                            <option value="this-month">This Month</option>
                            <option value="this-year">This Year</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" onclick="clearApplicationFilters()" style="height: 42px;">
                        Clear
                    </button>
                    ${[1, 2, 3].includes(currentUser.role_id) ? `
                        <button class="btn btn-primary" onclick="showApplicationsExportDialog()" style="height: 42px;" title="Export applications with optional filters">
                            Export
                        </button>
                    ` : ''}
                </div>
            </div>
            
            ${applications.length === 0 ? '<p>No applications found.</p>' : `
                <div class="table-container">
                    <table id="applicationsTable">
                        <thead>
                            <tr>
                                ${currentUser.role_id !== 6 ? '<th onclick="sortApplications(\'student_name\')" style="cursor: pointer;">Student <span class="sort-indicator">⇅</span></th>' : ''}
                                <th onclick="sortApplications('university_name')" style="cursor: pointer;">
                                    University <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortApplications('program')" style="cursor: pointer;">
                                    Program <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortApplications('intake')" style="cursor: pointer;">
                                    Intake <span class="sort-indicator">⇅</span>
                                </th>
                                ${currentUser.role_id === 4 ? '<th onclick="sortApplications(\'counsellor_name\')" style="cursor: pointer;">Counsellor <span class="sort-indicator">⇅</span></th>' : ''}
                                <th onclick="sortApplications('status')" style="cursor: pointer;">
                                    Status <span class="sort-indicator">⇅</span>
                                </th>
                                ${[1, 2, 3].includes(currentUser.role_id) ? '<th>Decision Notes</th>' : ''}
                                <th onclick="sortApplications('submitted_at')" style="cursor: pointer;">
                                    Submitted <span class="sort-indicator">⇅</span>
                                </th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="applicationsTableBody">
                            ${applications.map(app => {
                                // Admin/Counsellor can forward if:
                                // - Not already forwarded, OR
                                // - Status is "Missing Documents - In Review" (re-forward)
                                const canForward = [1, 2, 3].includes(currentUser.role_id) && 
                                                  (app.status === 'Missing Documents - In Review' ||
                                                   app.status === 'Decision: Conditional' ||
                                                   (app.status !== 'Forwarded to University' && 
                                                    app.status !== 'Decision: Accepted' && 
                                                    app.status !== 'Decision: Rejected'));
                                
                                return `
                                <tr class="application-row"
                                    data-student="${currentUser.role_id !== 6 ? (app.student_name || '').toLowerCase() : ''}"
                                    data-university="${(app.university_name || '').toLowerCase()}"
                                    data-program="${(app.program_name || '').toLowerCase()}"
                                    data-counsellor="${(app.counsellor_name || '').toLowerCase()}"
                                    data-status="${app.status || ''}"
                                    data-date="${app.submitted_at || ''}">
                                    ${currentUser.role_id !== 6 ? `<td>${app.student_name || 'N/A'}</td>` : ''}
                                    <td>${app.university_name}</td>
                                    <td>${app.program_name}</td>
                                    <td>${app.intake || 'N/A'}</td>
                                    ${currentUser.role_id === 4 ? `<td>${app.counsellor_name || 'N/A'}</td>` : ''}
                                    <td><span class="badge badge-info">${app.status}</span></td>
                                    ${[1, 2, 3].includes(currentUser.role_id) ? `
                                        <td style="max-width: 300px; white-space: pre-wrap;">${app.decision_notes ? app.decision_notes : '-'}</td>
                                    ` : ''}
                                    <td>${app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 'N/A'}</td>
                                    ${currentUser.role_id === 4 ? `
                                        <td>
                                            <button class="btn btn-xs btn-info" onclick="showApplicationDocuments(${app.application_id}, '${app.student_name}', '${app.university_name}')">
                                                View Docs
                                            </button>
                                            ${app.status === 'Forwarded to University' ? `
                                                <button class="btn btn-xs btn-primary" onclick="showDecisionForm(${app.application_id})">
                                                    Decision
                                                </button>
                                            ` : `
                                                <button class="btn btn-xs btn-secondary" disabled title="Application must be forwarded first">
                                                    Decision
                                                </button>
                                            `}
                                            ${app.status === 'Decision: Conditional' && app.has_conditional_offer ? `
                                                <button class="btn btn-xs btn-warning" style="min-width: 110px;" onclick="downloadConditionalOffer(${app.application_id})">
                                                    Offer Letter
                                                </button>
                                            ` : ''}
                                            ${app.status === 'Decision: Accepted' && app.has_conditional_offer ? `
                                                <button class="btn btn-xs btn-success" style="min-width: 110px;" onclick="downloadConditionalOffer(${app.application_id})">
                                                    Offer Letter
                                                </button>
                                            ` : ''}
                                        </td>
                                    ` : ''}
                                    ${[1, 2, 3].includes(currentUser.role_id) ? `
                                        <td>
                                            <button class="btn btn-xs btn-info" onclick="showApplicationDocuments(${app.application_id}, '${app.student_name}', '${app.university_name}')">
                                                View Docs
                                            </button>
                                            ${canForward ? `
                                                <button class="btn btn-xs btn-success" style="${(app.status === 'Missing Documents - In Review' || app.status === 'Decision: Conditional') ? 'min-width: 85px;' : ''}" onclick="forwardApplication(${app.application_id})">
                                                    ${(app.status === 'Missing Documents - In Review' || app.status === 'Decision: Conditional') ? 'Re-Forward' : 'Forward'}
                                                </button>
                                            ` : ''}
                                            ${app.status === 'Decision: Conditional' && app.has_conditional_offer ? `
                                                <button class="btn btn-xs btn-warning" style="min-width: 110px;" onclick="downloadConditionalOffer(${app.application_id})">
                                                    Offer Letter
                                                </button>
                                            ` : ''}
                                            ${app.status === 'Decision: Accepted' && app.has_conditional_offer ? `
                                                <button class="btn btn-xs btn-success" style="min-width: 110px;" onclick="downloadConditionalOffer(${app.application_id})">
                                                    Offer Letter
                                                </button>
                                            ` : ''}
                                            ${[1, 2].includes(currentUser.role_id) ? `
                                                <button class="btn btn-xs btn-danger" onclick="deleteApplicationFromPage(${app.application_id})">
                                                    Delete
                                                </button>
                                            ` : ''}
                                        </td>
                                    ` : ''}
                                    ${currentUser.role_id === 6 ? `
                                        <td>
                                            ${app.status === 'In Review' ? `
                                                <button class="btn btn-xs btn-danger" onclick="deleteStudentApplication(${app.application_id})">
                                                    Delete
                                                </button>
                                            ` : ''}
                                            ${app.status === 'Decision: Conditional' && app.has_conditional_offer ? `
                                                <button class="btn btn-xs btn-warning" style="min-width: 110px;" onclick="downloadConditionalOffer(${app.application_id})">
                                                    Offer Letter
                                                </button>
                                            ` : ''}
                                            ${app.status === 'Decision: Accepted' && app.has_conditional_offer ? `
                                                <button class="btn btn-xs btn-success" style="min-width: 110px;" onclick="downloadConditionalOffer(${app.application_id})">
                                                    Offer Letter
                                                </button>
                                            ` : ''}
                                            ${!app.status.startsWith('Decision:') && app.status !== 'In Review' ? '-' : ''}
                                        </td>
                                    ` : ''}
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding: 15px; background: #f8f9fa; border-top: 1px solid #dee2e6;">
                    <div id="applicationCount" style="color: #6c757d;">
                        Showing ${applications.length} application${applications.length !== 1 ? 's' : ''}
                    </div>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('statsGrid').innerHTML = '';
    document.getElementById('mainContentArea').innerHTML = content;
    
    // Populate university filter
    if (applications.length > 0) {
        const universities = [...new Set(applications.map(a => a.university_name).filter(Boolean))];
        const universityFilter = document.getElementById('applicationUniversityFilter');
        universities.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            universityFilter.appendChild(option);
        });
    }
    
    showLoading(false);
}

async function loadDocumentsPage() {
    document.getElementById('pageTitle').textContent = 'Documents';
    showLoading();
    
    const data = await apiRequest('/documents');
    const documents = data?.documents || [];
    
    let content = `
        <div class="card">
            <div class="card-header flex-between">
                <h2>Documents</h2>
                ${currentUser.role_id === 6 ? `
                    <button class="btn btn-primary" onclick="showDocumentUploadForm()">Upload Document</button>
                ` : ''}
            </div>
            
            <!-- Search and Filter Bar -->
            <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Search</label>
                        <input type="text" id="documentSearch" class="form-control" 
                               placeholder="Search by student or document type..." 
                               onkeyup="filterDocuments()">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Document Type</label>
                        <select id="documentTypeFilter" class="form-control" onchange="filterDocuments()">
                            <option value="">All Types</option>
                            <option value="Passport">Passport</option>
                            <option value="Transcript">Transcript</option>
                            <option value="English Test">English Test</option>
                            <option value="Personal Photo">Personal Photo</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Status</label>
                        <select id="documentStatusFilter" class="form-control" onchange="filterDocuments()">
                            <option value="">All Statuses</option>
                            <option value="verified">Verified</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" onclick="clearDocumentFilters()" style="height: 42px;">
                        Clear
                    </button>
                </div>
            </div>
            
            ${documents.length === 0 ? '<p>No documents found.</p>' : `
                <div class="table-container">
                    <table id="documentsTable">
                        <thead>
                            <tr>
                                ${currentUser.role_id !== 6 ? '<th onclick="sortDocuments(\'student_name\')" style="cursor: pointer;">Student <span class="sort-indicator">⇅</span></th>' : ''}
                                <th onclick="sortDocuments('doc_type')" style="cursor: pointer;">
                                    Document Type <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortDocuments('uploaded_at')" style="cursor: pointer;">
                                    Uploaded <span class="sort-indicator">⇅</span>
                                </th>
                                <th>Counsellor Verify</th>
                                <th>University Verify</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="documentsTableBody">
                            ${documents.map(doc => {
                                // Counsellor verification status
                                const counsellorStatus = doc.verified === null ? 
                                    '<span class="badge badge-warning">Pending</span>' : 
                                    (doc.verified ? 
                                        '<span class="badge badge-success">Verified</span>' : 
                                        '<span class="badge badge-danger">Rejected</span>'
                                    );
                                
                                // University verification status
                                const uniStatus = doc.uni_verified === null ? 
                                    '<span class="badge badge-warning">Pending</span>' : 
                                    (doc.uni_verified ? 
                                        '<span class="badge badge-success">Verified</span>' : 
                                        '<span class="badge badge-danger">Rejected</span>'
                                    );
                                
                                // Show verify button based on role and verification status
                                let verifyButton = '';
                                if (currentUser.role_id === 1 || currentUser.role_id === 2 || currentUser.role_id === 3) {
                                    // Counsellor/Admin can verify if counsellor verification is pending
                                    if (doc.verified === null) {
                                        verifyButton = `<button class="btn btn-xs btn-success" onclick="showVerifyDocumentModal(${doc.document_id})">Verify</button>`;
                                    }
                                } else if (currentUser.role_id === 4) {
                                    // University staff can verify if counsellor verified AND uni verification is pending
                                    if (doc.verified === true && doc.uni_verified === null) {
                                        verifyButton = `<button class="btn btn-xs btn-success" onclick="showVerifyDocumentModal(${doc.document_id})">Verify</button>`;
                                    }
                                }
                                
                                // Student can delete if:
                                // 1. Not yet verified by counsellor (verified = null)
                                // 2. Rejected by counsellor (verified = false)
                                // 3. Rejected by university (uni_verified = false)
                                let studentDeleteButton = '';
                                if (currentUser.role_id === 6) {
                                    const canDelete = doc.verified === null || doc.verified === false || doc.uni_verified === false;
                                    if (canDelete) {
                                        studentDeleteButton = `<button class="btn btn-xs btn-danger" onclick="deleteDocumentFromPage(${doc.document_id})">Delete</button>`;
                                    }
                                }
                                
                                return `
                                <tr class="document-row"
                                    data-student="${currentUser.role_id !== 6 ? (doc.student_name || '').toLowerCase() : ''}"
                                    data-type="${doc.doc_type}"
                                    data-status="${doc.verified ? 'verified' : 'pending'}"
                                    data-date="${doc.uploaded_at}">
                                    ${currentUser.role_id !== 6 ? `<td>${doc.student_name || 'N/A'}</td>` : ''}
                                    <td>${doc.doc_type}</td>
                                    <td>${new Date(doc.uploaded_at).toLocaleDateString()}</td>
                                    <td>${counsellorStatus}</td>
                                    <td>${uniStatus}</td>
                                    <td>
                                        <button class="btn btn-xs btn-primary" onclick="downloadDocument(${doc.document_id}, '${doc.doc_type}')">
                                            Download
                                        </button>
                                        ${verifyButton}
                                        ${(currentUser.role_id === 1 || currentUser.role_id === 2 || currentUser.role_id === 3) ? `
                                            <button class="btn btn-xs btn-danger" onclick="deleteDocumentFromPage(${doc.document_id})">
                                                Delete
                                            </button>
                                        ` : ''}
                                        ${studentDeleteButton}
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding: 15px; background: #f8f9fa; border-top: 1px solid #dee2e6;">
                    <div id="documentCount" style="color: #6c757d;">
                        Showing ${documents.length} document${documents.length !== 1 ? 's' : ''}
                    </div>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('statsGrid').innerHTML = '';
    document.getElementById('mainContentArea').innerHTML = content;
    showLoading(false);
}

async function loadMessagesPage() {
    // Redirect to the new real-time chat page
    window.location.href = '/chat';
}

async function loadStudentsPage() {
    document.getElementById('pageTitle').textContent = 'Students';
    showLoading();
    
    const data = await apiRequest('/students');
    const students = data?.students || [];
    
    let content = `
        <div class="card">
            <div class="card-header flex-between">
                <h2>Students Management</h2>
                ${currentUser.role_id <= 2 ? `
                    <button class="btn btn-primary" onclick="showCreateStudentForm()">
                        + Add Student
                    </button>
                ` : ''}
            </div>
            
            <!-- Search and Filter Bar -->
            <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto auto; gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Search Students</label>
                        <input type="text" id="studentSearch" class="form-control" 
                               placeholder="Search by name or email..." 
                               onkeyup="filterStudents()">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Status</label>
                        <select id="statusFilter" class="form-control" onchange="filterStudents()">
                            <option value="">All Statuses</option>
                            <option value="Incomplete Profile">Incomplete Profile</option>
                            <option value="Assigned to Counsellor">Assigned to Counsellor</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Submitted">Submitted</option>
                            <option value="Accepted">Accepted</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Counsellor</label>
                        <select id="counsellorFilter" class="form-control" onchange="filterStudents()">
                            <option value="">All Counsellors</option>
                            <option value="unassigned">Unassigned</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Country</label>
                        <select id="countryFilter" class="form-control" onchange="filterStudents()">
                            <option value="">All Countries</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" onclick="clearStudentFilters()" style="height: 42px;">
                        Clear
                    </button>
                    ${currentUser.role_id <= 2 ? `
                        <button class="btn btn-primary" onclick="showStudentsExportDialog()" style="height: 42px;" title="Export students with optional filters">
                            Export
                        </button>
                    ` : ''}
                </div>
            </div>
            
            ${students.length === 0 ? '<p style="padding: 20px;">No students found.</p>' : `
                <div class="table-container">
                    <table id="studentsTable">
                        <thead>
                            <tr>
                                <th onclick="sortStudents('full_name')" style="cursor: pointer;">
                                    Name <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortStudents('email')" style="cursor: pointer;">
                                    Email <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortStudents('nationality')" style="cursor: pointer;">
                                    Nationality <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortStudents('preferred_country')" style="cursor: pointer;">
                                    Preferred University Country <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortStudents('program')" style="cursor: pointer;">
                                    Program Interest <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortStudents('application_status')" style="cursor: pointer; min-width: 180px;">
                                    Status <span class="sort-indicator">⇅</span>
                                </th>
                                ${currentUser.role_id <= 2 ? '<th onclick="sortStudents(\'counsellor\')" style="cursor: pointer;">Counsellor <span class="sort-indicator">⇅</span></th>' : ''}
                                ${currentUser.role_id <= 2 ? '<th onclick="sortStudents(\'logistics\')" style="cursor: pointer;">Logistics <span class="sort-indicator">⇅</span></th>' : ''}
                                ${currentUser.role_id <= 2 || currentUser.role_id === 3 ? '<th>Actions</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="studentsTableBody">
                            ${students.map(student => `
                                <tr class="student-row" 
                                    data-name="${(student.full_name || '').toLowerCase()}"
                                    data-email="${(student.email || '').toLowerCase()}"
                                    data-nationality="${(student.nationality || '').toLowerCase()}"
                                    data-program="${(student.program_interest || '').toLowerCase()}"
                                    data-status="${student.application_status || ''}"
                                    data-counsellor="${(student.counsellor_name || 'unassigned').toLowerCase()}"
                                    data-logistics="${(student.logistics_name || 'unassigned').toLowerCase()}"
                                    data-country="${student.preferred_country || ''}">
                                    <td>${student.full_name}</td>
                                    <td>${student.email}</td>
                                    <td>${student.nationality || 'N/A'}</td>
                                    <td>${student.preferred_country || 'N/A'}</td>
                                    <td>${student.program_interest || 'N/A'}</td>
                                    <td style="white-space: nowrap;"><span class="badge badge-info">${student.application_status}</span></td>
                                    ${currentUser.role_id <= 2 ? `
                                        <td>${student.counsellor_name || '<span class="badge badge-warning">Unassigned</span>'}</td>
                                    ` : ''}
                                    ${currentUser.role_id <= 2 ? `
                                        <td>${student.logistics_name || '<span class="badge badge-warning">Unassigned</span>'}</td>
                                    ` : ''}
                                    ${currentUser.role_id <= 2 || currentUser.role_id === 3 ? `
                                        <td style="text-align: center;">
                                            <div style="display: flex; flex-direction: column; gap: 5px; align-items: center;">
                                                <button class="btn btn-sm btn-primary" style="width: 120px;" onclick="showStudentDetail(${student.student_id})">
                                                    View
                                                </button>
                                                ${currentUser.role_id <= 2 ? `
                                                    <button class="btn btn-sm btn-secondary" style="width: 120px;" onclick="showReassignCounsellor(${student.student_id}, ${student.assigned_counsellor_id || 'null'})">
                                                        Counsellor
                                                    </button>
                                                    <button class="btn btn-sm btn-success" style="width: 120px;" onclick="showReassignLogistics(${student.student_id}, ${student.assigned_logistics_id || 'null'})">
                                                        Logistics
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    ` : ''}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding: 15px; background: #f8f9fa; border-top: 1px solid #dee2e6;">
                    <div id="studentCount" style="color: #6c757d;">
                        Showing ${students.length} student${students.length !== 1 ? 's' : ''}
                    </div>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('statsGrid').innerHTML = '';
    document.getElementById('mainContentArea').innerHTML = content;
    
    // Populate filter dropdowns
    if (students.length > 0) {
        // Populate counsellor filter
        const counsellors = [...new Set(students.map(s => s.counsellor_name).filter(Boolean))];
        const counsellorFilter = document.getElementById('counsellorFilter');
        counsellors.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            counsellorFilter.appendChild(option);
        });
        
        // Populate country filter
        const countries = [...new Set(students.map(s => s.preferred_country).filter(Boolean))];
        const countryFilter = document.getElementById('countryFilter');
        countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            countryFilter.appendChild(option);
        });
    }
    
    showLoading(false);
}

// Show detailed student modal (profile, documents, applications) for counsellors/admin
async function showStudentDetail(studentId) {
    showLoading();
    try {
        console.log('Fetching student details for ID:', studentId);
        const data = await apiRequest(`/students/${studentId}`);
        showLoading(false);

        console.log('API Response:', data);

        if (!data) {
            console.error('No data returned from API - likely an error occurred');
            // Don't show another alert, apiRequest already showed one
            return;
        }

        if (!data.student) {
            console.error('Student property missing in response:', data);
            showAlert('Failed to load student details: Invalid data structure', 'error');
            return;
        }

        const student = data.student;
        const documents = data.documents || [];
        const applications = data.applications || [];

    // Check if current user is admin/manager
    const userRole = getUserRole();
    const canReassign = userRole === 'Manager' || userRole === 'Admin';

    document.getElementById('modalTitle').textContent = `Student: ${student.full_name}`;
    
    // Group documents by application
    const docsByApp = {};
    documents.forEach(doc => {
        const appId = doc.application_id || 'unassigned';
        if (!docsByApp[appId]) {
            docsByApp[appId] = [];
        }
        docsByApp[appId].push(doc);
    });

    // Build applications HTML with documents
    const appsHtml = applications.length === 0 ? '<p>No applications yet.</p>' : applications.map(a => {
        const appDocs = docsByApp[a.application_id] || [];
        const requiredDocs = ['Passport', 'Transcript', 'English Test', 'Personal Photo'];
        const uploadedTypes = appDocs.map(d => d.doc_type);
        const missingDocs = requiredDocs.filter(type => !uploadedTypes.includes(type));
        
        return `
            <div class="card" style="margin-bottom: 15px;">
                <div class="card-header">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4>${a.university_name} - ${a.program_name}</h4>
                            <small>Status: <span class="badge badge-info">${a.status}</span></small>
                        </div>
                        <button class="btn btn-sm btn-success" onclick="showDocumentUploadFormForApplication(${a.application_id}, '${a.university_name}')">
                            Upload Required Documents
                        </button>
                    </div>
                </div>
                <div style="padding: 10px;">
                    <p><strong>Submitted:</strong> ${a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : 'N/A'}</p>
                    
                    ${missingDocs.length > 0 ? `
                        <div class="alert alert-warning" style="background: #fff3cd; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                            <strong>Missing Required Documents:</strong> ${missingDocs.join(', ')}
                        </div>
                    ` : ''}
                    
                    <strong>Documents (${appDocs.length}/4 required):</strong>
                    ${appDocs.length === 0 ? '<p>No documents uploaded yet.</p>' : `
                        <div class="table-container" style="margin-top: 10px;">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Type</th>
                                        <th>Uploaded</th>
                                        <th>Verified</th>
                                        <th>Notes</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${appDocs.map(d => `
                                        <tr>
                                            <td>${d.doc_type}</td>
                                            <td>${d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : 'N/A'}</td>
                                            <td>${d.verified === true ? '<span class="badge badge-success">Verified</span>' : 
                                                   d.verified === null ? '<span class="badge badge-warning">Pending Review</span>' : 
                                                   '<span class="badge badge-danger">Rejected</span>'}</td>
                                            <td>${d.verification_notes || ''}</td>
                                            <td>
                                                <button class="btn btn-xs btn-primary" onclick="downloadDocument(${d.document_id}, '${d.doc_type}')">Download</button>
                                                ${d.verified === null ? `<button class="btn btn-xs btn-success" onclick="showVerifyDocumentModal(${d.document_id}, ${studentId})">Verify</button>` : ''}
                                                <button class="btn btn-xs btn-danger" onclick="deleteDocumentAsStaff(${d.document_id}, ${studentId})">Delete</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');

    const docsHtml = documents.length === 0 ? '<p>No documents uploaded.</p>' : `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Uploaded</th>
                        <th>Verified</th>
                        <th>Notes</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${documents.map(d => `
                        <tr>
                            <td>${d.doc_type}</td>
                            <td>${d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : 'N/A'}</td>
                            <td>${d.verified ? '<span class="badge badge-success">Verified</span>' : '<span class="badge badge-warning">Pending</span>'}</td>
                            <td>${d.verification_notes || ''}</td>
                            <td>
                                <button class="btn btn-sm btn-primary" onclick="downloadDocument(${d.document_id}, '${d.doc_type}')">Download</button>
                                ${!d.verified ? `<button class="btn btn-sm btn-success" onclick="showVerifyDocumentModal(${d.document_id})">Verify</button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('modalBody').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr;gap:12px;">
            <div class="card">
                <div class="card-header"><h3>Profile</h3></div>
                <div style="padding:10px;">
                    <div><strong>Name:</strong> ${student.full_name}</div>
                    <div><strong>Email:</strong> ${student.email}</div>
                    <div><strong>DOB:</strong> ${student.dob || 'N/A'}</div>
                    <div><strong>Nationality:</strong> ${student.nationality || 'N/A'}</div>
                    <div><strong>Phone:</strong> ${student.phone || 'N/A'}</div>
                    <div><strong>Program Interest:</strong> ${student.program_interest || 'N/A'}</div>
                    <div><strong>Education Level:</strong> ${student.education_level || 'N/A'}</div>
                    <div><strong>Notes:</strong> ${student.notes || ''}</div>
                </div>
            </div>
            ${canReassign ? `
            <div class="card">
                <div class="card-header"><h3>Assignments</h3></div>
                <div style="padding:10px;">
                    <div class="form-group">
                        <label><strong>Assigned Counsellor:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <span id="currentCounsellor">${student.counsellor_name || 'Not assigned'}</span>
                            <button class="btn btn-sm btn-primary" onclick="showReassignCounsellor(${student.student_id}, ${student.assigned_counsellor_id || 'null'})">
                                ${student.assigned_counsellor_id ? 'Reassign' : 'Assign'} Counsellor
                            </button>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top: 15px;">
                        <label><strong>Assigned Logistics:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <span id="currentLogistics">${student.logistics_name || 'Not assigned'}</span>
                            <button class="btn btn-sm btn-primary" onclick="showReassignLogistics(${student.student_id}, ${student.assigned_logistics_id || 'null'})">
                                ${student.assigned_logistics_id ? 'Reassign' : 'Assign'} Logistics
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
            <div class="card">
                <div class="card-header flex-between">
                    <h3>Applications & Documents</h3>
                    <button class="btn btn-sm btn-primary" onclick="showCreateApplicationForStudent(${student.student_id})">New Application</button>
                </div>
                <div style="padding:10px;">${appsHtml}</div>
            </div>
        </div>
    `;

    // mark current student id for potential refresh
    document.getElementById('modalBody').setAttribute('data-current-student-id', student.student_id);

    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>
    `;
    openModal('genericModal');
    } catch (error) {
        showLoading(false);
        console.error('Error loading student details:', error);
        showAlert('Failed to get student details', 'error');
    }
}

// Show create application form for a specific student (counsellor action)
function showCreateApplicationForStudent(studentId) {
    document.getElementById('modalTitle').textContent = 'Create Application for Student';
    document.getElementById('modalBody').innerHTML = `
        <form id="applicationForStudentForm">
            <input type="hidden" name="student_id" value="${studentId}">
            <div class="form-group">
                <label>University</label>
                <select name="university_id" class="form-control" required id="appUniversitySelect">
                    <option value="">Loading universities...</option>
                </select>
            </div>
            <div class="form-group">
                <label>Program Name</label>
                <input type="text" name="program_name" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Intake</label>
                <input type="text" name="intake" class="form-control" placeholder="e.g., Fall 2025" required>
            </div>
            <div class="form-group">
                <label>Application Fee</label>
                <input type="number" step="0.01" name="application_fee" class="form-control">
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitApplicationForStudentForm()">Create</button>
    `;
    openModal('genericModal');

    // Load universities into select
    loadUniversitiesForSelect('appUniversitySelect');
}

async function loadUniversitiesForSelect(selectId) {
    const data = await apiRequest('/universities');
    const universities = data?.universities || [];
    const select = document.getElementById(selectId);
    if (select) {
        select.innerHTML = '<option value="">Select university...</option>' +
            universities.map(u => `<option value="${u.university_id}">${u.name} (${u.country})</option>`).join('');
    }
}

async function submitApplicationForStudentForm() {
    const form = document.getElementById('applicationForStudentForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    showLoading();
    const result = await apiRequest('/applications', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    showLoading(false);

    if (result) {
        closeModal('genericModal');
        showAlert('Application created successfully!', 'success');
        // refresh student detail if open
        const sid = document.getElementById('modalBody').getAttribute('data-current-student-id');
        if (sid) await showStudentDetail(parseInt(sid, 10));
        await loadApplicationsPage();
    }
}

async function loadUsersPage() {
    document.getElementById('pageTitle').textContent = 'User Management';
    showLoading();
    
    const data = await apiRequest('/users');
    const users = data?.users || [];
    
    let content = `
        <div class="card">
            <div class="card-header flex-between">
                <h2>Users</h2>
                <button class="btn btn-primary" onclick="showCreateUserForm()">Create User</button>
            </div>
            
            <!-- Search and Filter Bar -->
            <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto auto; gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Search Users</label>
                        <input type="text" id="userSearch" class="form-control" 
                               placeholder="Search by name or email..." 
                               onkeyup="filterUsers()">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Role</label>
                        <select id="roleFilter" class="form-control" onchange="filterUsers()">
                            <option value="">All Roles</option>
                            <option value="Manager">Manager</option>
                            <option value="Admin">Admin</option>
                            <option value="Counsellor">Counsellor</option>
                            <option value="University Staff">University Staff</option>
                            <option value="Logistics Staff">Logistics Staff</option>
                            <option value="Student">Student</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Status</label>
                        <select id="userStatusFilter" class="form-control" onchange="filterUsers()">
                            <option value="">All Statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" onclick="clearUserFilters()" style="height: 42px;">
                        Clear
                    </button>
                    ${(data.current_user.role_id === 1 || data.current_user.role_id === 2) ? `
                        <button class="btn btn-primary" onclick="showUsersExportDialog()" style="height: 42px;" title="Export users with optional filters">
                            Export
                        </button>
                    ` : ''}
                </div>
            </div>
            
            ${users.length === 0 ? '<p>No users found.</p>' : `
                <div class="table-container">
                    <table id="usersTable">
                        <thead>
                            <tr>
                                <th onclick="sortUsers('full_name')" style="cursor: pointer;">
                                    Name <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortUsers('email')" style="cursor: pointer;">
                                    Email <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortUsers('role')" style="cursor: pointer;">
                                    Role <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortUsers('status')" style="cursor: pointer;">
                                    Status <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortUsers('created_at')" style="cursor: pointer;">
                                    Created <span class="sort-indicator">⇅</span>
                                </th>
                                ${(data.current_user.role_id === 1 || data.current_user.role_id === 2) ? '<th>Actions</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            ${users.map(user => {
                                // Only SuperAdmin and Admin can toggle user status
                                const canToggle = (data.current_user.role_id === 1 || data.current_user.role_id === 2) &&
                                                 user.user_id !== data.current_user.user_id && // Can't toggle own account
                                                 (data.current_user.role_id === 1 || user.role_id !== 1); // Admin can't toggle SuperAdmin
                                
                                // Only SuperAdmin can delete users
                                const canDelete = data.current_user.role_id === 1 && // Must be SuperAdmin
                                                 user.user_id !== data.current_user.user_id && // Can't delete self
                                                 user.role_id !== 1; // Can't delete other SuperAdmins
                                
                                return `
                                <tr class="user-row"
                                    data-name="${(user.full_name || '').toLowerCase()}"
                                    data-email="${(user.email || '').toLowerCase()}"
                                    data-role="${user.role_name}"
                                    data-status="${user.is_active ? 'active' : 'inactive'}">
                                    <td>${user.full_name}</td>
                                    <td>${user.email}</td>
                                    <td><span class="badge badge-primary">${user.role_name}</span></td>
                                    <td>
                                        ${user.is_active ? 
                                            '<span class="badge badge-success">Active</span>' : 
                                            '<span class="badge badge-danger">Inactive</span>'}
                                    </td>
                                    <td>${new Date(user.created_at).toLocaleDateString()}</td>
                                    ${(data.current_user.role_id === 1 || data.current_user.role_id === 2) ? `
                                        <td>
                                            <div style="display: flex; gap: 5px;">
                                                ${(data.current_user.role_id === 1 || data.current_user.role_id === 2) ? `
                                                    <button class="btn btn-xs btn-primary" 
                                                            onclick="showEditUserForm(${user.user_id})">
                                                        Edit
                                                    </button>
                                                ` : ''}
                                                ${canToggle ? `
                                                    <button class="btn btn-xs ${user.is_active ? 'btn-warning' : 'btn-success'}" 
                                                            onclick="toggleUserStatus(${user.user_id}, ${user.is_active})">
                                                        ${user.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                ` : ''}
                                                ${canDelete ? `
                                                    <button class="btn btn-xs btn-danger" 
                                                            onclick="deleteUser(${user.user_id}, '${user.full_name}')">
                                                        Delete
                                                    </button>
                                                ` : ''}
                                                ${!canToggle && !canDelete ? '<span class="text-muted">-</span>' : ''}
                                            </div>
                                        </td>
                                    ` : ''}
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding: 15px; background: #f8f9fa; border-top: 1px solid #dee2e6;">
                    <div id="userCount" style="color: #6c757d;">
                        Showing ${users.length} user${users.length !== 1 ? 's' : ''}
                    </div>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('statsGrid').innerHTML = '';
    document.getElementById('mainContentArea').innerHTML = content;
    showLoading(false);
}

async function loadUniversitiesPage() {
    document.getElementById('pageTitle').textContent = 'Universities Management';
    showLoading();
    
    const data = await apiRequest('/universities');
    const universities = data?.universities || [];
    
    let content = `
        <div class="card">
            <div class="card-header flex-between">
                <h2>Universities</h2>
                <button class="btn btn-primary" onclick="showCreateUniversityForm()">Add University</button>
            </div>
            
            <!-- Search and Filter Bar -->
            <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <div style="display: grid; grid-template-columns: 2fr 1fr auto auto; gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Search Universities</label>
                        <input type="text" id="universitySearch" class="form-control" 
                               placeholder="Search by name, country, or email..." 
                               onkeyup="filterUniversities()">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Country</label>
                        <select id="universityCountryFilter" class="form-control" onchange="filterUniversities()">
                            <option value="">All Countries</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" onclick="clearUniversityFilters()" style="height: 42px;">
                        Clear
                    </button>
                    <button class="btn btn-primary" onclick="executeUniversitiesExport()" style="height: 42px;" title="Export all universities">
                        Export
                    </button>
                </div>
            </div>
            
            ${universities.length === 0 ? '<p>No universities found.</p>' : `
                <div class="table-container">
                    <table id="universitiesTable">
                        <thead>
                            <tr>
                                <th onclick="sortUniversities('name')" style="cursor: pointer;">
                                    University Name <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortUniversities('country')" style="cursor: pointer;">
                                    Country <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortUniversities('email')" style="cursor: pointer;">
                                    Contact Email <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortUniversities('created_at')" style="cursor: pointer;">
                                    Created <span class="sort-indicator">⇅</span>
                                </th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="universitiesTableBody">
                            ${universities.map(uni => `
                                <tr class="university-row"
                                    data-name="${(uni.name || '').toLowerCase()}"
                                    data-country="${(uni.country || '').toLowerCase()}"
                                    data-email="${(uni.contact_email || '').toLowerCase()}">
                                    <td>${uni.name}</td>
                                    <td>${uni.country || 'N/A'}</td>
                                    <td>${uni.contact_email || 'N/A'}</td>
                                    <td>${new Date(uni.created_at).toLocaleDateString()}</td>
                                    <td style="white-space: nowrap;">
                                        <button class="btn btn-info btn-xs" onclick="showUniversityIntakes(${uni.university_id}, '${uni.name.replace(/'/g, "\\'")}')">Intakes</button>
                                        <button class="btn btn-primary btn-xs" onclick="showEditUniversityForm(${uni.university_id})">Edit</button>
                                        <button class="btn btn-danger btn-xs" onclick="deleteUniversity(${uni.university_id}, '${uni.name.replace(/'/g, "\\'")}')">Delete</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding: 15px; background: #f8f9fa; border-top: 1px solid #dee2e6;">
                    <div id="universityCount" style="color: #6c757d;">
                        Showing ${universities.length} universit${universities.length !== 1 ? 'ies' : 'y'}
                    </div>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('statsGrid').innerHTML = '';
    document.getElementById('mainContentArea').innerHTML = content;
    
    // Populate country filter
    if (universities.length > 0) {
        const countries = [...new Set(universities.map(u => u.country).filter(Boolean))];
        const countryFilter = document.getElementById('universityCountryFilter');
        countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            countryFilter.appendChild(option);
        });
    }
    
    showLoading(false);
}

async function loadLogisticsPage() {
    document.getElementById('pageTitle').textContent = 'Logistics Management';
    showLoading();
    
    const data = await apiRequest('/logistics');
    const logistics = data?.logistics || [];
    
    let content = `
        <div class="card">
            <div class="card-header flex-between">
                <h2>Logistics Records</h2>
                ${[1, 2].includes(currentUser.role_id) ? `
                    <button class="btn btn-primary" onclick="showLogisticsForm()">New Record</button>
                ` : ''}
            </div>
            
            <!-- Search and Filter Bar -->
            <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto auto; gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Search</label>
                        <input type="text" id="logisticsSearch" class="form-control" 
                               placeholder="Search by student name or location..." 
                               onkeyup="filterLogistics()">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Status</label>
                        <select id="logisticsStatusFilter" class="form-control" onchange="filterLogistics()">
                            <option value="">All Statuses</option>
                            <option value="Pending">Pending</option>
                            <option value="Arrived">Arrived</option>
                            <option value="Accommodation">Accommodation</option>
                            <option value="Medical Check Process">Medical Check Process</option>
                            <option value="Completed">Completed</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Date Range</label>
                        <select id="logisticsDateFilter" class="form-control" onchange="filterLogistics()">
                            <option value="">All Dates</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="past">Past</option>
                            <option value="this-week">This Week</option>
                            <option value="this-month">This Month</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" onclick="clearLogisticsFilters()" style="height: 42px;">
                        Clear
                    </button>
                    ${[1, 2].includes(currentUser.role_id) ? `
                        <button class="btn btn-primary" onclick="showLogisticsExportDialog()" style="height: 42px;" title="Export logistics records with optional filters">
                            Export
                        </button>
                    ` : ''}
                </div>
            </div>
            
            ${logistics.length === 0 ? '<p>No logistics records.</p>' : `
                <div class="table-container">
                    <table id="logisticsTable">
                        <thead>
                            <tr>
                                <th onclick="sortLogistics('student_name')" style="cursor: pointer;">
                                    Student <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortLogistics('pickup_date')" style="cursor: pointer;">
                                    Pickup Date <span class="sort-indicator">⇅</span>
                                </th>
                                <th>Pickup Time</th>
                                <th onclick="sortLogistics('location')" style="cursor: pointer;">
                                    Pickup Location <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortLogistics('accommodation')" style="cursor: pointer;">
                                    Accommodation <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortLogistics('medical')" style="cursor: pointer;">
                                    Medical Check <span class="sort-indicator">⇅</span>
                                </th>
                                <th>Arrival Date</th>
                                <th>Flight Details</th>
                                <th onclick="sortLogistics('status')" style="cursor: pointer;">
                                    Status <span class="sort-indicator">⇅</span>
                                </th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="logisticsTableBody">
                            ${logistics.map(log => `
                                <tr class="logistics-row"
                                    data-student="${(log.student_name || '').toLowerCase()}"
                                    data-location="${(log.pickup_location || '').toLowerCase()}"
                                    data-accommodation="${(log.accommodation || '').toLowerCase()}"
                                    data-medical="${log.medical_check_date || ''}"
                                    data-status="${log.arrival_status || ''}"
                                    data-date="${log.pickup_date || ''}">
                                    <td>${log.student_name}</td>
                                    <td>${log.pickup_date || 'N/A'}</td>
                                    <td>${formatTime12Hour(log.pickup_time)}</td>
                                    <td>${log.pickup_location || 'N/A'}</td>
                                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.accommodation || 'N/A'}">${log.accommodation || 'N/A'}</td>
                                    <td>${log.medical_check_date || 'N/A'}</td>
                                    <td>${log.arrival_date || 'N/A'}</td>
                                    <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.flight_details || 'N/A'}">${log.flight_details || 'N/A'}</td>
                                    <td><span class="badge badge-warning">${log.arrival_status}</span></td>
                                    <td>
                                        ${currentUser.role_id === 3 ? `
                                            <button class="btn btn-xs btn-info" onclick="viewLogisticsDetails(${log.logistics_id})">
                                                View Details
                                            </button>
                                        ` : ''}
                                        ${[1, 2].includes(currentUser.role_id) ? `
                                            <button class="btn btn-xs btn-primary" onclick="showEditLogisticsForm(${log.logistics_id})">
                                                Edit
                                            </button>
                                        ` : ''}
                                        ${[1, 2, 5].includes(currentUser.role_id) ? `
                                        <button class="btn btn-xs btn-success" onclick="updateArrivalStatus(${log.logistics_id})">
                                            Update
                                        </button>
                                        ` : ''}
                                        ${[1, 2].includes(currentUser.role_id) ? `
                                            <button class="btn btn-xs btn-danger" onclick="deleteLogisticsRecord(${log.logistics_id})">
                                                Delete
                                            </button>
                                        ` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding: 15px; background: #f8f9fa; border-top: 1px solid #dee2e6;">
                    <div id="logisticsCount" style="color: #6c757d;">
                        Showing ${logistics.length} record${logistics.length !== 1 ? 's' : ''}
                    </div>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('statsGrid').innerHTML = '';
    document.getElementById('mainContentArea').innerHTML = content;
    showLoading(false);
}

async function loadAuditLogsPage() {
    document.getElementById('pageTitle').textContent = 'Audit Logs';
    showLoading();
    
    const data = await apiRequest('/audit-logs?limit=200');
    const logs = data?.logs || [];
    
    let content = `
        <div class="card">
            <div class="card-header">
                <h2>System Audit Logs</h2>
                <p style="color: #666; font-size: 0.9em; margin-top: 5px;">Comprehensive audit trail of all administrative actions</p>
            </div>
            
            <!-- Search and Filter Bar -->
            <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto auto; gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Search</label>
                        <input type="text" id="auditSearch" class="form-control" 
                               placeholder="Search by user, action, or details..." 
                               onkeyup="filterAuditLogs()">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Action</label>
                        <select id="auditActionFilter" class="form-control" onchange="filterAuditLogs()">
                            <option value="">All Actions</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>User</label>
                        <select id="auditUserFilter" class="form-control" onchange="filterAuditLogs()">
                            <option value="">All Users</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Date Range</label>
                        <select id="auditDateFilter" class="form-control" onchange="filterAuditLogs()">
                            <option value="">All Dates</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="this-week">This Week</option>
                            <option value="this-month">This Month</option>
                            <option value="last-month">Last Month</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" onclick="clearAuditFilters()" style="height: 42px;">
                        Clear
                    </button>
                    <button class="btn btn-primary" onclick="showAuditExportDialog()" style="height: 42px;" title="Export audit logs with optional filters">
                        Export
                    </button>
                </div>
            </div>
            
            ${logs.length === 0 ? '<p>No logs found.</p>' : `
                <div class="table-container">
                    <table id="auditLogsTable">
                        <thead>
                            <tr>
                                <th onclick="sortAuditLogs('timestamp')" style="cursor: pointer;">
                                    Timestamp <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortAuditLogs('user')" style="cursor: pointer;">
                                    User <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortAuditLogs('action')" style="cursor: pointer;">
                                    Action <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortAuditLogs('details')" style="cursor: pointer;">
                                    Details <span class="sort-indicator">⇅</span>
                                </th>
                                <th onclick="sortAuditLogs('ip')" style="cursor: pointer;">
                                    IP Address <span class="sort-indicator">⇅</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody id="auditLogsTableBody">
                            ${logs.map(log => `
                                <tr class="audit-row"
                                    data-user="${(log.full_name || 'System').toLowerCase()}"
                                    data-action="${(log.action || '').toLowerCase()}"
                                    data-details="${(log.details || '').toLowerCase()}"
                                    data-timestamp="${log.timestamp || ''}"
                                    data-ip="${log.ip_address || ''}">
                                    <td style="white-space: nowrap;">${new Date(log.timestamp).toLocaleString()}</td>
                                    <td>${log.full_name || 'System'}</td>
                                    <td><span class="badge badge-info">${log.action}</span></td>
                                    <td style="max-width: 500px; word-wrap: break-word;">
                                        ${log.details || `Target: ${log.target_table || 'N/A'} (ID: ${log.target_id || 'N/A'})`}
                                    </td>
                                    <td>${log.ip_address || 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding: 15px; background: #f8f9fa; border-top: 1px solid #dee2e6;">
                    <div id="auditCount" style="color: #6c757d;">
                        Showing ${logs.length} log entr${logs.length !== 1 ? 'ies' : 'y'}
                    </div>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('statsGrid').innerHTML = '';
    document.getElementById('mainContentArea').innerHTML = content;
    
    // Populate filter dropdowns
    if (logs.length > 0) {
        // Populate action filter
        const actions = [...new Set(logs.map(l => l.action).filter(Boolean))];
        const actionFilter = document.getElementById('auditActionFilter');
        actions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action;
            actionFilter.appendChild(option);
        });
        
        // Populate user filter
        const users = [...new Set(logs.map(l => l.full_name || 'System').filter(Boolean))];
        const userFilter = document.getElementById('auditUserFilter');
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user;
            option.textContent = user;
            userFilter.appendChild(option);
        });
    }
    
    showLoading(false);
}

// ==================== FORM HANDLERS ====================

// Student Profile Form
async function showProfileForm() {
    showLoading();
    
    // Get current profile data
    const response = await apiRequest('/students/me');
    const profile = response?.student || {};
    
    showLoading(false);
    
    document.getElementById('modalTitle').textContent = profile ? 'Edit Profile' : 'Complete Profile';
    document.getElementById('modalBody').innerHTML = `
        <form id="profileForm" class="profile-form">
            <div class="form-row">
                <div class="form-group">
                    <label for="dob">Date of Birth ${profile.dob ? '' : '<span class="required">*</span>'}</label>
                    <input type="date" id="dob" name="dob" class="form-control" 
                           value="${profile.dob || ''}" ${profile.dob ? '' : 'required'}
                           max="${new Date().toISOString().split('T')[0]}">
                    <small class="form-text">Must be at least 16 years old</small>
                </div>
                
                <div class="form-group">
                    <label for="nationality">Nationality <span class="required">*</span></label>
                    <select id="nationality" name="nationality" class="form-control" required>
                        <option value="">Select nationality...</option>
                        ${getCountryOptions(profile.nationality)}
                    </select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="phone">Phone Number <span class="required">*</span></label>
                    <input type="tel" id="phone" name="phone" class="form-control" 
                           value="${profile.phone || ''}" required
                           placeholder="+60123456789"
                           pattern="\\+?[0-9]{10,15}">
                    <small class="form-text">Include country code (e.g., +60123456789)</small>
                </div>
                
                <div class="form-group">
                    <label for="preferred_country">Preferred Study Destination <span class="required">*</span></label>
                    <input type="text" id="preferred_country" name="preferred_country" class="form-control" 
                           value="Malaysia" readonly>
                </div>
            </div>
            
            <div class="form-group">
                <label for="program_interest">Program of Interest <span class="required">*</span></label>
                <select id="program_interest" name="program_interest" class="form-control" required>
                    <option value="">Select program...</option>
                    ${getProgramOptions(profile.program_interest)}
                </select>
            </div>
            
            <div class="form-group">
                <label for="education_level">Current Education Level</label>
                <select id="education_level" name="education_level" class="form-control">
                    <option value="">Select level...</option>
                    <option value="High School" ${profile.education_level === 'High School' ? 'selected' : ''}>High School</option>
                    <option value="Foundation" ${profile.education_level === 'Foundation' ? 'selected' : ''}>Foundation</option>
                    <option value="Diploma" ${profile.education_level === 'Diploma' ? 'selected' : ''}>Diploma</option>
                    <option value="Bachelor" ${profile.education_level === 'Bachelor' ? 'selected' : ''}>Bachelor's Degree</option>
                    <option value="Master" ${profile.education_level === 'Master' ? 'selected' : ''}>Master's Degree</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="notes">Additional Information</label>
                <textarea id="notes" name="notes" class="form-control" rows="3" 
                          placeholder="Any special requirements or information...">${profile.notes || ''}</textarea>
            </div>
        </form>
        
        <style>
            .profile-form .form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
                margin-bottom: 15px;
            }
            .form-group {
                margin-bottom: 15px;
            }
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
                color: #2c3e50;
            }
            .required {
                color: #e74c3c;
            }
            .form-control {
                width: 100%;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 5px;
                font-size: 14px;
            }
            .form-control:focus {
                outline: none;
                border-color: #1565C0;
                box-shadow: 0 0 0 3px rgba(21, 101, 192, 0.1);
            }
            .form-text {
                display: block;
                margin-top: 5px;
                color: #7f8c8d;
                font-size: 12px;
            }
        </style>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitProfileForm()">
            <span id="saveButtonText">${profile ? 'Update Profile' : 'Save Profile'}</span>
        </button>
    `;
    openModal('genericModal');
}

// Helper function for country options
function getCountryOptions(selected = '') {
    const countries = [
        'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 
        'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 
        'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 
        'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 
        'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 
        'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 
        'Dominican Republic', 'East Timor', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 
        'Eritrea', 'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 
        'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 
        'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 
        'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'North Korea', 
        'South Korea', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 
        'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macedonia', 'Madagascar', 'Malawi', 
        'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 
        'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 
        'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 
        'Nigeria', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 
        'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 
        'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 
        'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 
        'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Sudan', 
        'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Swaziland', 'Sweden', 'Switzerland', 'Syria', 
        'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 
        'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 
        'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 
        'Yemen', 'Zambia', 'Zimbabwe'
    ];
    
    return countries.map(country => 
        `<option value="${country}" ${selected === country ? 'selected' : ''}>${country}</option>`
    ).join('');
}

// Helper function for study destination options
function getStudyCountryOptions(selected = '') {
    const studyCountries = [
        'United Kingdom', 'United States', 'Canada', 'Australia', 'New Zealand', 
        'Malaysia', 'Singapore', 'Germany', 'France', 'Netherlands', 'Ireland', 
        'Switzerland', 'Sweden', 'Denmark', 'Finland', 'Norway', 'Japan', 
        'South Korea', 'China', 'Hong Kong', 'Taiwan', 'UAE', 'Spain', 'Italy'
    ];
    
    return studyCountries.map(country => 
        `<option value="${country}" ${selected === country ? 'selected' : ''}>${country}</option>`
    ).join('');
}

// Helper function for program options
function getProgramOptions(selected = '') {
    const programs = [
        'Business Administration', 'Computer Science', 'Engineering', 'Medicine', 
        'Law', 'Accounting & Finance', 'Marketing', 'Information Technology', 
        'Data Science', 'Artificial Intelligence', 'Cyber Security', 
        'Biotechnology', 'Pharmacy', 'Nursing', 'Psychology', 'Economics', 
        'International Relations', 'Hospitality Management', 'Architecture', 
        'Graphic Design', 'Mass Communication', 'Education', 'Environmental Science'
    ];
    
    return programs.map(program => 
        `<option value="${program}" ${selected === program ? 'selected' : ''}>${program}</option>`
    ).join('');
}

async function submitProfileForm() {
    const form = document.getElementById('profileForm');
    
    // Validate form
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Additional validation for age (only if DOB is provided)
    if (form.dob.value) {
        const dob = new Date(form.dob.value);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        
        if (age < 16) {
            showAlert('You must be at least 16 years old to register', 'error');
            return;
        }
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Remove empty DOB field if not provided
    if (!data.dob) {
        delete data.dob;
    }
    
    // Update button state
    const saveButton = document.getElementById('saveButtonText');
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Saving...';
    saveButton.parentElement.disabled = true;
    
    showLoading();
    const result = await apiRequest('/students/me', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    saveButton.textContent = originalText;
    saveButton.parentElement.disabled = false;
    
    if (result) {
        closeModal('genericModal');
        showAlert('Profile saved successfully!', 'success');
        await loadDashboardContent();
    }
}

// Document Upload
async function showDocumentUploadForm() {
    // First, fetch student's applications
    showLoading();
    const data = await apiRequest('/applications');
    showLoading(false);
    
    const applications = data?.applications || [];
    
    if (applications.length === 0) {
        showAlert('Please create an application first before uploading documents.', 'warning');
        return;
    }
    
    document.getElementById('modalTitle').textContent = 'Upload Document';
    document.getElementById('modalBody').innerHTML = `
        <form id="documentForm" enctype="multipart/form-data">
            <div class="form-group">
                <label>Application <span style="color: red;">*</span></label>
                <select name="application_id" class="form-control" required>
                    <option value="">Select application...</option>
                    ${applications.map(app => `
                        <option value="${app.application_id}">
                            ${app.university_name} - ${app.program_name}
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Document Type</label>
                <select name="doc_type" class="form-control" required>
                    <option value="">Select type...</option>
                    <option value="Passport">Passport</option>
                    <option value="Transcript">Academic Transcript</option>
                    <option value="English Test">English Test Results</option>
                    <option value="Personal Photo">Personal Photo</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>File</label>
                <input type="file" name="file" class="form-control" multiple required>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitDocumentForm()">Upload</button>
    `;
    openModal('genericModal');
}

async function submitDocumentForm() {
    const form = document.getElementById('documentForm');
    const formData = new FormData(form);
    
    showLoading();
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/documents/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closeModal('genericModal');
            showAlert('Document uploaded successfully!', 'success');
            await loadDocumentsPage();
        } else {
            showAlert(data.error || 'Upload failed');
        }
    } catch (error) {
        showAlert('Upload failed');
    }
    
    showLoading(false);
}

// Document Upload for Specific Application
function showDocumentUploadFormForApplication(applicationId, universityName) {
    document.getElementById('modalTitle').textContent = `Upload Document for ${universityName}`;
    document.getElementById('modalBody').innerHTML = `
        <form id="documentFormApp" enctype="multipart/form-data">
            <input type="hidden" name="application_id" value="${applicationId}">
            <div class="alert alert-info" style="background: #d1ecf1; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                Required documents: Passport, Academic Transcript, English Test Results, Personal Photo
            </div>
            <div class="form-group">
                <label>Document Type</label>
                <select name="doc_type" class="form-control" required>
                    <option value="">Select type...</option>
                    <option value="Passport">Passport</option>
                    <option value="Transcript">Academic Transcript</option>
                    <option value="English Test">English Test Results</option>
                    <option value="Personal Photo">Personal Photo</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>File</label>
                <input type="file" name="file" class="form-control" required>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitDocumentFormForApplication()">Upload</button>
    `;
    openModal('genericModal');
}

async function submitDocumentFormForApplication() {
    const form = document.getElementById('documentFormApp');
    const formData = new FormData(form);
    
    showLoading();
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/documents/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closeModal('genericModal');
            showAlert('Document uploaded successfully!', 'success');
            // Reload the student detail to show updated documents
            const studentId = document.getElementById('modalBody').getAttribute('data-current-student-id');
            if (studentId) {
                await showStudentDetail(parseInt(studentId));
            }
        } else {
            showAlert(data.error || 'Upload failed');
        }
    } catch (error) {
        showAlert('Upload failed');
    }
    
    showLoading(false);
}

// Verify document
async function verifyDocument(documentId) {
    // Open modal to approve/reject with notes
    showVerifyDocumentModal(documentId);
}

// Open verify modal (approve/reject with notes)
// Show documents for a specific application
async function showApplicationDocuments(applicationId, studentName, universityName) {
    showLoading();
    
    // Fetch both documents and application details
    const [documentsData, applicationsData] = await Promise.all([
        apiRequest('/documents'),
        apiRequest('/applications')
    ]);
    
    showLoading(false);

    if (!documentsData || !documentsData.documents) {
        showAlert('Failed to load documents');
        return;
    }

    // Filter documents for this specific application
    const appDocuments = documentsData.documents.filter(doc => doc.application_id === applicationId);
    
    // Find the application to check its status
    const application = applicationsData?.applications?.find(app => app.application_id === applicationId);
    const isForwarded = application && (application.status === 'Forwarded to University' || 
                                        application.status?.startsWith('Decision:'));
    
    document.getElementById('modalTitle').textContent = `Documents for Application`;
    
    let bodyContent = `
        <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
            <strong>Student:</strong> ${studentName}<br>
            <strong>University:</strong> ${universityName}
        </div>
    `;
    
    // Check if university staff is viewing but application is not forwarded
    if (currentUser.role_id === 4 && !isForwarded) {
        bodyContent += `
            <div class="alert alert-warning" style="padding: 20px; text-align: center;">
                <h4 style="margin-top: 0;">⚠️ Application Not Forwarded Yet</h4>
                <p style="margin-bottom: 0;">
                    This application has not been forwarded by the counsellor yet. 
                    Once the counsellor forwards the application to your university, 
                    you will be able to view the documents and make a decision.
                </p>
            </div>
        `;
    } else if (appDocuments.length === 0) {
        bodyContent += `
            <div class="alert alert-info">
                No documents uploaded for this application yet.
            </div>
        `;
    } else {
        bodyContent += `
            <table class="table">
                <thead>
                    <tr>
                        <th>Document Type</th>
                        <th>Uploaded</th>
                        <th>Counsellor Status</th>
                        <th>University Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${appDocuments.map(doc => {
                        // Counsellor verification status
                        const counsellorStatus = doc.verified === null ? 
                            '<span class="badge badge-warning">Pending</span>' : 
                            (doc.verified ? 
                                '<span class="badge badge-success">Verified</span>' : 
                                '<span class="badge badge-danger">Rejected</span>'
                            );
                        
                        // University verification status
                        const uniStatus = doc.uni_verified === null ? 
                            '<span class="badge badge-warning">Pending</span>' : 
                            (doc.uni_verified ? 
                                '<span class="badge badge-success">Verified</span>' : 
                                '<span class="badge badge-danger">Rejected</span>'
                            );
                        
                        // Show verify button based on role and verification status
                        let verifyButton = '';
                        if (currentUser.role_id === 1 || currentUser.role_id === 2 || currentUser.role_id === 3) {
                            // Counsellor/Admin can verify if counsellor verification is pending
                            if (doc.verified === null) {
                                verifyButton = `<button class="btn btn-xs btn-success" onclick="showVerifyDocumentModal(${doc.document_id})">Verify (Stage 1)</button>`;
                            }
                        } else if (currentUser.role_id === 4) {
                            // University staff can verify if counsellor verified AND uni verification is pending
                            if (doc.verified === true && doc.uni_verified === null) {
                                verifyButton = `<button class="btn btn-xs btn-success" onclick="showVerifyDocumentModal(${doc.document_id})">Verify (Stage 2)</button>`;
                            }
                        }
                        
                        return `
                        <tr>
                            <td>${doc.doc_type}</td>
                            <td>${new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</td>
                            <td>
                                ${counsellorStatus}
                                ${doc.verification_notes ? `<br><small class="text-muted">${doc.verification_notes}</small>` : ''}
                            </td>
                            <td>
                                ${uniStatus}
                                ${doc.uni_verification_notes ? `<br><small class="text-muted">${doc.uni_verification_notes}</small>` : ''}
                            </td>
                            <td>
                                <button class="btn btn-xs btn-primary" onclick="downloadDocument(${doc.document_id}, '${doc.doc_type}')">
                                    Download
                                </button>
                                ${verifyButton}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('modalBody').innerHTML = bodyContent;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>
    `;
    openModal('genericModal');
}

function showVerifyDocumentModal(documentId, studentId) {
    document.getElementById('modalTitle').textContent = 'Verify Document';
    document.getElementById('modalBody').innerHTML = `
        <form id="verifyForm">
            <input type="hidden" name="document_id" value="${documentId}">
            <input type="hidden" name="student_id" value="${studentId || ''}">
            <div class="form-group">
                <label>Action</label>
                <select name="action" class="form-control" required>
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                </select>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea name="notes" class="form-control" rows="3" placeholder="Optional notes for the student (reason for rejection, comments)"></textarea>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitVerifyDocumentForm()">Submit</button>
    `;
    openModal('genericModal');
}

async function submitVerifyDocumentForm() {
    const form = document.getElementById('verifyForm');
    const formData = new FormData(form);
    const documentId = formData.get('document_id');
    const studentId = formData.get('student_id');
    const payload = {
        action: formData.get('action'),
        notes: formData.get('notes') || ''
    };

    showLoading();
    const result = await apiRequest(`/documents/${documentId}/verify`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });

    showLoading(false);
    if (result) {
        closeModal('genericModal');
        showAlert('Document verification updated!', 'success');
        
        // Refresh student detail modal if studentId is provided
        if (studentId) {
            await showStudentDetail(parseInt(studentId, 10));
        } else {
            // Otherwise try to reload documents page if on that page
            await loadDocumentsPage();
        }
    }
}

// ==================== MISSING FORM HANDLERS ====================

// Multi-step Application Form
let applicationFormData = { step: 1 };

async function showApplicationForm() {
    applicationFormData = { step: 1 };
    await renderApplicationFormStep(1);
}

async function renderApplicationFormStep(step) {
    applicationFormData.step = step;
    
    if (step === 1) {
        // Step 1: Select University
        document.getElementById('modalTitle').textContent = 'New Application - Select University';
        document.getElementById('modalBody').innerHTML = `
            <div style="margin-bottom: 20px;">
                <div class="progress-bar">
                    <div class="progress-step active">1. University</div>
                    <div class="progress-step">2. Program</div>
                    <div class="progress-step">3. Review</div>
                </div>
            </div>
            <form id="applicationFormStep1">
                <div class="form-group">
                    <label>Select University <span class="required">*</span></label>
                    <select id="universitySelect" name="university_id" class="form-control" required>
                        <option value="">Loading universities...</option>
                    </select>
                </div>
                <div id="universityDetails" style="display:none; margin-top:15px; padding:15px; background:#f8f9fa; border-radius:5px;">
                    <strong>University Details:</strong>
                    <div id="universityInfo"></div>
                </div>
            </form>
            <style>
                .progress-bar { display: flex; justify-content: space-between; margin-bottom: 25px; }
                .progress-step { flex: 1; text-align: center; padding: 10px; background: #e0e0e0; margin: 0 5px; border-radius: 5px; font-size: 14px; }
                .progress-step.active { background: #1565C0; color: white; font-weight: 600; }
                .progress-step.completed { background: #4CAF50; color: white; }
            </style>
        `;
        document.getElementById('modalFooter').innerHTML = `
            <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
            <button class="btn btn-primary" onclick="nextApplicationStep(2)" disabled id="nextBtn1">Next</button>
        `;
        openModal('genericModal');
        
        // Load universities
        const data = await apiRequest('/universities');
        const universities = data?.universities || [];
        const select = document.getElementById('universitySelect');
        select.innerHTML = '<option value="">Select university...</option>' +
            universities.map(u => `<option value="${u.university_id}">${u.name} (${u.country})</option>`).join('');
        
        select.addEventListener('change', function() {
            const selectedId = this.value;
            const btn = document.getElementById('nextBtn1');
            if (selectedId) {
                btn.disabled = false;
                applicationFormData.university_id = selectedId;
                const university = universities.find(u => u.university_id == selectedId);
                if (university) {
                    document.getElementById('universityDetails').style.display = 'block';
                    document.getElementById('universityInfo').innerHTML = `
                        <div><strong>Name:</strong> ${university.name}</div>
                        <div><strong>Country:</strong> ${university.country}</div>
                        <div><strong>Contact:</strong> ${university.contact_email || 'N/A'}</div>
                    `;
                }
            } else {
                btn.disabled = true;
            }
        });
        
    } else if (step === 2) {
        // Step 2: Program Details and Intake Selection
        document.getElementById('modalTitle').textContent = 'New Application - Program & Intake';
        document.getElementById('modalBody').innerHTML = `
            <div style="margin-bottom: 20px;">
                <div class="progress-bar">
                    <div class="progress-step completed">1. University</div>
                    <div class="progress-step active">2. Program</div>
                    <div class="progress-step">3. Review</div>
                </div>
            </div>
            <form id="applicationFormStep2">
                <div class="form-group">
                    <label>Program Name <span class="required">*</span></label>
                    <input type="text" name="program_name" class="form-control" required 
                           placeholder="e.g., Bachelor of Computer Science"
                           value="${applicationFormData.program_name || ''}">
                </div>
                <div class="form-group">
                    <label>Intake <span class="required">*</span></label>
                    <select name="intake_id" id="intakeSelect" class="form-control" required>
                        <option value="">Loading intakes...</option>
                    </select>
                    <small class="form-text" id="intakeHelpText" style="display: none; color: #dc3545;">
                        No intakes available for this university. Please contact the university or administrator.
                    </small>
                </div>
                <div class="form-group">
                    <label>Additional Notes (Optional)</label>
                    <textarea name="notes" class="form-control" rows="3" 
                              placeholder="Any special requirements or information...">${applicationFormData.notes || ''}</textarea>
                </div>
            </form>
        `;
        document.getElementById('modalFooter').innerHTML = `
            <button class="btn btn-secondary" onclick="nextApplicationStep(1)">Back</button>
            <button class="btn btn-primary" onclick="nextApplicationStep(3)">Next</button>
        `;
        
        // Load intakes for the selected university
        const intakesData = await apiRequest(`/universities/${applicationFormData.university_id}/intakes`);
        const intakes = intakesData?.intakes || [];
        const intakeSelect = document.getElementById('intakeSelect');
        const intakeHelpText = document.getElementById('intakeHelpText');
        
        if (intakes.length === 0) {
            intakeSelect.innerHTML = '<option value="">No intakes available</option>';
            intakeSelect.disabled = true;
            intakeHelpText.style.display = 'block';
        } else {
            intakeSelect.innerHTML = '<option value="">Select intake...</option>' +
                intakes
                    .filter(i => i.is_active)
                    .map(i => {
                        const intakeName = i.intake_year 
                            ? `${i.intake_name} (${i.intake_year})`
                            : i.intake_name;
                        return `<option value="${i.intake_id}" 
                                data-name="${i.intake_name}"
                                ${applicationFormData.intake_id == i.intake_id ? 'selected' : ''}>
                                ${intakeName}
                        </option>`;
                    }).join('');
        }
        
    
    } else if (step === 3) {
        // Step 3: Review & Submit
        // Get university name
        const univData = await apiRequest('/universities');
        const universities = univData?.universities || [];
        const selectedUniv = universities.find(u => u.university_id == applicationFormData.university_id);
        
        document.getElementById('modalTitle').textContent = 'New Application - Review & Submit';
        document.getElementById('modalBody').innerHTML = `
            <div style="margin-bottom: 20px;">
                <div class="progress-bar">
                    <div class="progress-step completed">1. University</div>
                    <div class="progress-step completed">2. Program</div>
                    <div class="progress-step active">3. Review</div>
                </div>
            </div>
            <div class="review-card">
                <h3>Application Summary</h3>
                <table class="review-table">
                    <tr>
                        <td><strong>University:</strong></td>
                        <td>${selectedUniv ? selectedUniv.name : 'N/A'}</td>
                    </tr>
                    <tr>
                        <td><strong>Country:</strong></td>
                        <td>${selectedUniv ? selectedUniv.country : 'N/A'}</td>
                    </tr>
                    <tr>
                        <td><strong>Program:</strong></td>
                        <td>${applicationFormData.program_name || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td><strong>Intake:</strong></td>
                        <td>${applicationFormData.intake_name || 'N/A'}</td>
                    </tr>
                    ${applicationFormData.notes ? `
                    <tr>
                        <td><strong>Notes:</strong></td>
                        <td>${applicationFormData.notes}</td>
                    </tr>
                    ` : ''}
                </table>
                <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 5px;">
                    <strong>⚠️ Important:</strong> Once submitted, your application will be reviewed by your counsellor 
                    and forwarded to the university. Make sure all information is correct.
                </div>
            </div>
            <style>
                .review-card { background: #f8f9fa; padding: 20px; border-radius: 8px; }
                .review-table { width: 100%; margin-top: 15px; }
                .review-table td { padding: 10px 0; }
                .review-table td:first-child { width: 150px; color: #666; }
            </style>
        `;
        document.getElementById('modalFooter').innerHTML = `
            <button class="btn btn-secondary" onclick="nextApplicationStep(2)">Back</button>
            <button class="btn btn-primary" onclick="submitApplicationForm()">
                <span id="submitBtnText">Submit Application</span>
            </button>
        `;
    }
}

function nextApplicationStep(step) {
    if (step === 2) {
        // Validate step 1
        if (!applicationFormData.university_id) {
            showAlert('Please select a university');
            return;
        }
        renderApplicationFormStep(2);
    } else if (step === 3) {
        // Validate and save step 2
        const form = document.getElementById('applicationFormStep2');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        const formData = new FormData(form);
        applicationFormData.program_name = formData.get('program_name');
        applicationFormData.intake_id = formData.get('intake_id');
        
        // Get intake name from selected option for display
        const intakeSelect = document.getElementById('intakeSelect');
        const selectedOption = intakeSelect.options[intakeSelect.selectedIndex];
        applicationFormData.intake_name = selectedOption.getAttribute('data-name') || selectedOption.text;
        
        applicationFormData.notes = formData.get('notes');
        renderApplicationFormStep(3);
    } else if (step === 1) {
        renderApplicationFormStep(1);
    }
}

async function submitApplicationForm() {
    const submitBtn = document.getElementById('submitBtnText');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.parentElement.disabled = true;
    
    showLoading();
    const result = await apiRequest('/applications', {
        method: 'POST',
        body: JSON.stringify({
            university_id: applicationFormData.university_id,
            program_name: applicationFormData.program_name,
            intake_id: applicationFormData.intake_id
        })
    });
    
    showLoading(false);
    submitBtn.textContent = originalText;
    submitBtn.parentElement.disabled = false;
    
    if (result) {
        closeModal('genericModal');
        showAlert('Application submitted successfully! Your counsellor will review it.', 'success');
        await loadDashboardContent();
        if (typeof loadApplicationsPage === 'function') {
            await loadApplicationsPage();
        }
    }
}

// Show Decision Form
function showDecisionForm(applicationId) {
    document.getElementById('modalTitle').textContent = 'Application Decision';
    document.getElementById('modalBody').innerHTML = `
        <form id="decisionForm" enctype="multipart/form-data">
            <input type="hidden" name="application_id" value="${applicationId}">
            <div class="form-group">
                <label>Decision Type</label>
                <select name="decision_type" class="form-control" required onchange="toggleOfferLetterUpload()">
                    <option value="">Select decision...</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Conditional">Conditional Offer</option>
                    <option value="Missing Documents">Missing Documents (Return to Admin)</option>
                    <option value="Rejected">Rejected</option>
                </select>
            </div>
            <div class="form-group" id="offerLetterFileGroup" style="display: none;">
                <label>Offer Letter (PDF) <span style="color: red;">*</span></label>
                <input type="file" name="offer_letter_file" id="offerLetterFile" class="form-control" accept=".pdf">
                <small class="text-muted" id="offerLetterHelpText">Required for acceptance and conditional offers. Upload the official offer letter PDF.</small>
            </div>
            <div class="form-group">
                <label>Decision Notes (Required)</label>
                <textarea name="decision_notes" class="form-control" rows="4" placeholder="Enter decision details, conditions, or list missing documents..." required></textarea>
                <small class="text-muted">These notes will be visible to the student and their counsellor.</small>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitDecisionForm()">Submit Decision</button>
    `;
    openModal('genericModal');
}

function toggleOfferLetterUpload() {
    const decisionType = document.querySelector('[name="decision_type"]').value;
    const fileGroup = document.getElementById('offerLetterFileGroup');
    const fileInput = document.getElementById('offerLetterFile');
    const helpText = document.getElementById('offerLetterHelpText');
    
    if (decisionType === 'Accepted' || decisionType === 'Conditional') {
        fileGroup.style.display = 'block';
        fileInput.required = true;
        
        // Update help text based on decision type
        if (decisionType === 'Accepted') {
            helpText.textContent = 'Required for acceptance. Upload the official acceptance offer letter PDF.';
        } else {
            helpText.textContent = 'Required for conditional offers. Upload the official conditional offer letter PDF.';
        }
    } else {
        fileGroup.style.display = 'none';
        fileInput.required = false;
        fileInput.value = '';
    }
}

async function submitDecisionForm() {
    const form = document.getElementById('decisionForm');
    const formData = new FormData(form);
    const applicationId = formData.get('application_id');
    const decisionType = formData.get('decision_type');
    const decisionNotes = formData.get('decision_notes');
    
    if (!decisionType) {
        showAlert('Please select a decision type', 'error');
        return;
    }
    
    if (!decisionNotes || decisionNotes.trim() === '') {
        showAlert('Please provide decision notes. This helps the student and counsellor understand the decision.', 'error');
        return;
    }
    
    // Validate file upload for Accepted and Conditional decisions
    if (decisionType === 'Accepted' || decisionType === 'Conditional') {
        const fileInput = document.getElementById('offerLetterFile');
        if (!fileInput.files || fileInput.files.length === 0) {
            const offerType = decisionType === 'Accepted' ? 'Acceptance' : 'Conditional Offer';
            showAlert(`Please upload the ${offerType} Letter PDF.`, 'error');
            return;
        }
    }
    
    showLoading();
    const response = await fetch(`${API_URL}/applications/${applicationId}/decision`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${getToken()}`
        },
        body: formData
    });
    
    const result = await response.json();
    showLoading(false);
    
    if (response.ok) {
        closeModal('genericModal');
        showAlert('Decision submitted successfully!', 'success');
        await loadApplicationsPage();
    } else {
        // Handle validation errors for missing/unverified/pending documents
        if (result.missing_documents || result.unverified_documents || result.pending_documents) {
            let errorMsg = result.error + '\n';
            if (result.missing_documents) {
                errorMsg += '\nMissing: ' + result.missing_documents.join(', ');
            }
            if (result.unverified_documents) {
                errorMsg += '\nNeed to be verified: ' + result.unverified_documents.join(', ');
            }
            if (result.pending_documents) {
                errorMsg += '\nPending review: ' + result.pending_documents.join(', ');
            }
            showAlert(errorMsg, 'error');
        } else {
            showAlert(result.error || 'Failed to submit decision', 'error');
        }
    }
}

// Show Logistics Form
function showLogisticsForm() {
    document.getElementById('modalTitle').textContent = 'New Logistics Record';
    document.getElementById('modalBody').innerHTML = `
        <form id="logisticsForm">
            <div class="form-group">
                <label>Student *</label>
                <select name="student_id" class="form-control" required id="studentSelect">
                    <option value="">Loading students...</option>
                </select>
            </div>
            <div class="form-group">
                <label>Pickup Date *</label>
                <input type="date" name="pickup_date" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Pickup Time *</label>
                <input type="time" name="pickup_time" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Pickup Location *</label>
                <input type="text" name="pickup_location" class="form-control" required placeholder="e.g., Airport Terminal 1">
            </div>
            <div class="form-group">
                <label>Accommodation Address *</label>
                <textarea name="accommodation" class="form-control" rows="2" required placeholder="Full accommodation address"></textarea>
            </div>
            <div class="form-group">
                <label>Medical Check Date *</label>
                <input type="date" name="medical_check_date" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Arrival Date *</label>
                <input type="date" name="arrival_date" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Flight Details</label>
                <textarea name="flight_details" class="form-control" rows="2" placeholder="Flight number, airline, departure time, etc."></textarea>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitLogisticsForm()">Save</button>
    `;
    openModal('genericModal');
    
    // Load students for dropdown
    loadStudentsForSelect();
}

async function loadStudentsForSelect() {
    const data = await apiRequest('/students');
    const students = data?.students || [];
    const select = document.getElementById('studentSelect');
    if (select) {
        select.innerHTML = '<option value="">Select student...</option>' +
            students.map(s => `<option value="${s.student_id}">${s.full_name} (${s.email})</option>`).join('');
    }
}

async function submitLogisticsForm() {
    const form = document.getElementById('logisticsForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    showLoading();
    const result = await apiRequest('/logistics', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    
    if (result) {
        closeModal('genericModal');
        showAlert('Logistics record created successfully!', 'success');
        await loadLogisticsPage();
    }
    showLoading(false);
}

// Update Arrival Status
async function updateArrivalStatus(logisticsId) {
    // Show modal to select new status
    document.getElementById('modalTitle').textContent = 'Update Logistics Status';
    document.getElementById('modalBody').innerHTML = `
        <form id="updateStatusForm">
            <div class="form-group">
                <label>Select Status</label>
                <select name="arrival_status" class="form-control" required>
                    <option value="">Select status...</option>
                    <option value="Pending">Pending</option>
                    <option value="Arrived">Arrived</option>
                    <option value="Accommodation">Accommodation</option>
                    <option value="Medical Check Process">Medical Check Process</option>
                    <option value="Completed">Completed</option>
                </select>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitStatusUpdate(${logisticsId})">Update Status</button>
    `;
    openModal('genericModal');
}

async function submitStatusUpdate(logisticsId) {
    const form = document.getElementById('updateStatusForm');
    const formData = new FormData(form);
    const status = formData.get('arrival_status');
    
    if (!status) {
        showAlert('Please select a status');
        return;
    }
    
    showLoading();
    const result = await apiRequest(`/logistics/${logisticsId}`, {
        method: 'PUT',
        body: JSON.stringify({ arrival_status: status })
    });
    showLoading(false);
    
    if (result) {
        showAlert('Status updated successfully!', 'success');
        closeModal('genericModal');
        await loadLogisticsPage();
    }
}

// Show Assign Counsellor Form
function showAssignCounsellorForm(studentId) {
    document.getElementById('modalTitle').textContent = 'Assign Counsellor';
    document.getElementById('modalBody').innerHTML = `
        <form id="assignForm">
            <input type="hidden" name="student_id" value="${studentId}">
            <div class="form-group">
                <label>Select Counsellor</label>
                <select name="counsellor_id" class="form-control" required id="counsellorSelect">
                    <option value="">Loading counsellors...</option>
                </select>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitAssignCounsellorForm()">Assign</button>
    `;
    openModal('genericModal');
    
    // Load counsellors
    loadCounsellorsForSelect();
}

async function loadCounsellorsForSelect() {
    const data = await apiRequest('/users?role=Counsellor');
    const counsellors = data?.users || [];
    const select = document.getElementById('counsellorSelect');
    if (select) {
        select.innerHTML = '<option value="">Select counsellor...</option>' +
            counsellors.map(c => `<option value="${c.user_id}">${c.full_name} (${c.email})</option>`).join('');
    }
}

async function submitAssignCounsellorForm() {
    const form = document.getElementById('assignForm');
    const formData = new FormData(form);
    const studentId = formData.get('student_id');
    const counsellorId = formData.get('counsellor_id');
    
    showLoading();
    const result = await apiRequest(`/students/${studentId}/assign-counsellor`, {
        method: 'PUT',
        body: JSON.stringify({ counsellor_id: counsellorId })
    });
    
    if (result) {
        closeModal('genericModal');
        showAlert('Counsellor assigned successfully!', 'success');
        await loadStudentsPage();
    }
    showLoading(false);
}

// Show Create User Form
function showCreateUserForm() {
    document.getElementById('modalTitle').textContent = 'Create New User';
    document.getElementById('modalBody').innerHTML = `
        <form id="createUserForm">
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" name="full_name" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" name="email" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <div style="position: relative;">
                    <input type="password" name="password" id="createUserPassword" class="form-control" required minlength="8" style="padding-right: 45px;" oninput="checkCreateUserPasswordStrength()">
                    <button type="button" onclick="toggleCreateUserPassword()" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 5px; color: #92400e;">
                        <span id="createUserToggleIcon">👁️</span>
                    </button>
                </div>
                <div id="createUserPasswordStrength" style="margin-top: 8px; display: none;">
                    <div style="display: flex; gap: 4px; margin-bottom: 5px;">
                        <div id="create-strength-bar-1" style="height: 4px; flex: 1; background: #e5e7eb; border-radius: 2px; transition: all 0.3s;"></div>
                        <div id="create-strength-bar-2" style="height: 4px; flex: 1; background: #e5e7eb; border-radius: 2px; transition: all 0.3s;"></div>
                        <div id="create-strength-bar-3" style="height: 4px; flex: 1; background: #e5e7eb; border-radius: 2px; transition: all 0.3s;"></div>
                        <div id="create-strength-bar-4" style="height: 4px; flex: 1; background: #e5e7eb; border-radius: 2px; transition: all 0.3s;"></div>
                    </div>
                    <div id="create-strength-text" style="font-size: 12px; font-weight: 600;"></div>
                </div>
            </div>
            <div class="form-group">
                <label>Role</label>
                <select name="role_id" class="form-control" required id="userRoleSelect" onchange="toggleUniversityField()">
                    <option value="">Select role...</option>
                    <option value="2">Admin</option>
                    <option value="3">Counsellor</option>
                    <option value="4">University Staff</option>
                    <option value="5">Logistics Staff</option>
                    <option value="6">Student</option>
                </select>
            </div>
            <div class="form-group" id="universityFieldGroup" style="display: none;">
                <label>University <span style="color: red;">*</span></label>
                <select name="university_id" class="form-control" id="universitySelect">
                    <option value="">Select university...</option>
                </select>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitCreateUserForm()">Create</button>
    `;
    openModal('genericModal');
    
    // Load universities for the dropdown
    loadUniversitiesForUserForm();
}

async function loadUniversitiesForUserForm() {
    try {
        const data = await apiRequest('/universities');
        const universities = data?.universities || [];
        const select = document.getElementById('universitySelect');
        if (select) {
            universities.forEach(uni => {
                const option = document.createElement('option');
                option.value = uni.university_id;
                option.textContent = uni.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load universities:', error);
    }
}

function toggleUniversityField() {
    const roleSelect = document.getElementById('userRoleSelect');
    const universityField = document.getElementById('universityFieldGroup');
    const universitySelect = document.getElementById('universitySelect');
    
    if (roleSelect.value === '4') { // University Staff
        universityField.style.display = 'block';
        universitySelect.required = true;
    } else {
        universityField.style.display = 'none';
        universitySelect.required = false;
        universitySelect.value = '';
    }
}

async function submitCreateUserForm() {
    const form = document.getElementById('createUserForm');
    
    // Check form validity first
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Validate university selection for University Staff
    if (data.role_id === '4') {
        if (!data.university_id || data.university_id === '') {
            showAlert('Please select a university for University Staff');
            return;
        }
        // Ensure university_id is sent as integer
        data.university_id = parseInt(data.university_id);
    } else {
        // Remove university_id if not University Staff
        delete data.university_id;
    }
    
    showLoading();
    const result = await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('User created successfully!', 'success');
        await loadUsersPage();
    }
}

function showCreateUniversityForm() {
    document.getElementById('modalTitle').textContent = 'Create New University';
    document.getElementById('modalBody').innerHTML = `
        <form id="createUniversityForm">
            <div class="form-group">
                <label>University Name <span style="color: red;">*</span></label>
                <input type="text" name="name" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Country</label>
                <input type="text" name="country" class="form-control">
            </div>
            <div class="form-group">
                <label>Contact Email</label>
                <input type="email" name="contact_email" class="form-control">
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitCreateUniversityForm()">Create</button>
    `;
    openModal('genericModal');
}

async function submitCreateUniversityForm() {
    const form = document.getElementById('createUniversityForm');
    
    // Check form validity
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Remove empty optional fields
    if (!data.country) delete data.country;
    if (!data.contact_email) delete data.contact_email;
    
    showLoading();
    const result = await apiRequest('/universities', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('University created successfully!', 'success');
        await loadUniversitiesPage();
    }
}

// Show Create Student Form
function showCreateStudentForm() {
    document.getElementById('modalTitle').textContent = 'Create New Student';
    document.getElementById('modalBody').innerHTML = `
        <form id="createStudentForm">
            <div class="form-group">
                <label>Full Name <span style="color: red;">*</span></label>
                <input type="text" name="full_name" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Email <span style="color: red;">*</span></label>
                <input type="email" name="email" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Password <span style="color: red;">*</span></label>
                <div style="position: relative;">
                    <input type="password" name="password" id="createStudentPassword" class="form-control" required minlength="6" style="padding-right: 45px;" oninput="checkCreateStudentPasswordStrength()">
                    <button type="button" onclick="toggleCreateStudentPassword()" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 5px; color: #92400e;">
                        <span id="createStudentToggleIcon">👁️</span>
                    </button>
                </div>
                <div id="createStudentPasswordStrength" style="margin-top: 8px; display: none;">
                    <div style="display: flex; gap: 4px; margin-bottom: 5px;">
                        <div id="student-strength-bar-1" style="height: 4px; flex: 1; background: #e5e7eb; border-radius: 2px; transition: all 0.3s;"></div>
                        <div id="student-strength-bar-2" style="height: 4px; flex: 1; background: #e5e7eb; border-radius: 2px; transition: all 0.3s;"></div>
                        <div id="student-strength-bar-3" style="height: 4px; flex: 1; background: #e5e7eb; border-radius: 2px; transition: all 0.3s;"></div>
                        <div id="student-strength-bar-4" style="height: 4px; flex: 1; background: #e5e7eb; border-radius: 2px; transition: all 0.3s;"></div>
                    </div>
                    <div id="student-strength-text" style="font-size: 12px; font-weight: 600;"></div>
                </div>
            </div>
            <div class="form-group">
                <label>Date of Birth</label>
                <input type="date" name="dob" class="form-control" max="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Nationality</label>
                <select name="nationality" class="form-control">
                    <option value="">Select nationality...</option>
                    ${getCountryOptions()}
                </select>
            </div>
            <div class="form-group">
                <label>Phone Number</label>
                <input type="tel" name="phone" class="form-control" placeholder="+60123456789" pattern="\\+?[0-9]{10,15}">
            </div>
            <div class="form-group">
                <label>Preferred Study Destination</label>
                <input type="text" name="preferred_country" class="form-control" value="Malaysia" readonly>
            </div>
            <div class="form-group">
                <label>Program of Interest</label>
                <select name="program_interest" class="form-control">
                    <option value="">Select program...</option>
                    ${getProgramOptions()}
                </select>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitCreateStudentForm()">Create</button>
    `;
    openModal('genericModal');
}

async function submitCreateStudentForm() {
    const form = document.getElementById('createStudentForm');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Set role_id to 6 (Student)
    data.role_id = 6;
    
    // Ensure preferred_country is always Malaysia
    data.preferred_country = 'Malaysia';
    
    showLoading();
    const result = await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('Student created successfully!', 'success');
        await loadStudentsPage();
    }
}

async function showEditUserForm(userId) {
    showLoading();
    const data = await apiRequest('/users');
    const user = data?.users?.find(u => u.user_id === userId);
    showLoading(false);
    
    if (!user) {
        showAlert('User not found');
        return;
    }
    
    document.getElementById('modalTitle').textContent = 'Edit User';
    document.getElementById('modalBody').innerHTML = `
        <form id="editUserForm">
            <input type="hidden" name="user_id" value="${user.user_id}">
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" name="full_name" class="form-control" value="${user.full_name}" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" name="email" class="form-control" value="${user.email}" required>
            </div>
            <div class="form-group">
                <label>Role</label>
                <select name="role_id" class="form-control" required id="editUserRoleSelect" onchange="toggleEditUniversityField()">
                    <option value="">Select role...</option>
                    <option value="2" ${user.role_id === 2 ? 'selected' : ''}>Admin</option>
                    <option value="3" ${user.role_id === 3 ? 'selected' : ''}>Counsellor</option>
                    <option value="4" ${user.role_id === 4 ? 'selected' : ''}>University Staff</option>
                    <option value="5" ${user.role_id === 5 ? 'selected' : ''}>Logistics Staff</option>
                    <option value="6" ${user.role_id === 6 ? 'selected' : ''}>Student</option>
                </select>
            </div>
            <div class="form-group" id="editUniversityFieldGroup" style="display: ${user.role_id === 4 ? 'block' : 'none'};">
                <label>University <span style="color: red;">*</span></label>
                <select name="university_id" class="form-control" id="editUniversitySelect">
                    <option value="">Select university...</option>
                </select>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitEditUserForm()">Update</button>
    `;
    openModal('genericModal');
    
    // Load universities and set current if user is university staff
    await loadUniversitiesForEditUserForm(userId, user.role_id);
}

async function loadUniversitiesForEditUserForm(userId, roleId) {
    try {
        const data = await apiRequest('/universities');
        const universities = data?.universities || [];
        const select = document.getElementById('editUniversitySelect');
        
        if (select) {
            // Clear existing options except first one
            select.innerHTML = '<option value="">Select university...</option>';
            
            // Get current university assignment if user is university staff
            let currentUniversityId = null;
            if (roleId === 4) {
                // Find which university has this user assigned as portal_user_id
                const assignedUni = universities.find(u => u.portal_user_id === userId);
                if (assignedUni) {
                    currentUniversityId = assignedUni.university_id;
                    console.log('Found assigned university:', assignedUni.name, 'ID:', currentUniversityId);
                } else {
                    console.log('No university assigned to user ID:', userId);
                }
            }
            
            universities.forEach(uni => {
                const option = document.createElement('option');
                option.value = uni.university_id;
                option.textContent = uni.name;
                if (uni.university_id === currentUniversityId) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load universities:', error);
    }
}

function toggleEditUniversityField() {
    const roleSelect = document.getElementById('editUserRoleSelect');
    const universityField = document.getElementById('editUniversityFieldGroup');
    const universitySelect = document.getElementById('editUniversitySelect');
    
    if (roleSelect.value === '4') {
        universityField.style.display = 'block';
        universitySelect.required = true;
    } else {
        universityField.style.display = 'none';
        universitySelect.required = false;
        universitySelect.value = '';
    }
}

async function submitEditUserForm() {
    const form = document.getElementById('editUserForm');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const userId = data.user_id;
    delete data.user_id;
    
    // Validate university selection for University Staff
    if (data.role_id === '4') {
        if (!data.university_id || data.university_id === '') {
            showAlert('Please select a university for University Staff');
            return;
        }
        // Ensure university_id is sent as integer
        data.university_id = parseInt(data.university_id);
    } else {
        delete data.university_id;
    }
    
    showLoading();
    const result = await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('User updated successfully!', 'success');
        await loadUsersPage();
    }
}

async function showEditUniversityForm(universityId) {
    showLoading();
    const data = await apiRequest('/universities');
    const university = data?.universities?.find(u => u.university_id === universityId);
    showLoading(false);
    
    if (!university) {
        showAlert('University not found');
        return;
    }
    
    document.getElementById('modalTitle').textContent = 'Edit University';
    document.getElementById('modalBody').innerHTML = `
        <form id="editUniversityForm">
            <input type="hidden" name="university_id" value="${university.university_id}">
            <div class="form-group">
                <label>University Name <span style="color: red;">*</span></label>
                <input type="text" name="name" class="form-control" value="${university.name}" required>
            </div>
            <div class="form-group">
                <label>Country</label>
                <input type="text" name="country" class="form-control" value="${university.country || ''}">
            </div>
            <div class="form-group">
                <label>Contact Email</label>
                <input type="email" name="contact_email" class="form-control" value="${university.contact_email || ''}">
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitEditUniversityForm()">Update</button>
    `;
    openModal('genericModal');
}

async function submitEditUniversityForm() {
    const form = document.getElementById('editUniversityForm');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const universityId = data.university_id;
    delete data.university_id;
    
    showLoading();
    const result = await apiRequest(`/universities/${universityId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('University updated successfully!', 'success');
        await loadUniversitiesPage();
    }
}

// ==================== UNIVERSITY INTAKES MANAGEMENT ====================

// Show intakes management page for a university
async function showUniversityIntakes(universityId, universityName) {
    showLoading();
    
    const data = await apiRequest(`/universities/${universityId}/intakes`);
    showLoading(false);
    
    const intakes = data?.intakes || [];
    
    let content = `
        <div class="card">
            <div class="card-header flex-between">
                <div>
                    <h2>Intakes for ${universityName}</h2>
                    <p style="color: #666; margin-top: 5px; font-size: 0.9em;">Manage intake schedules for this university</p>
                </div>
                <button class="btn btn-primary" onclick="showCreateIntakeForm(${universityId})">Add Intake</button>
            </div>
            
            ${intakes.length === 0 ? `
                <div style="padding: 40px; text-align: center; color: #7f8c8d;">
                    <p>No intakes added yet for this university.</p>
                    <p style="font-size: 0.9em; margin-top: 10px;">Click "Add Intake" to create a new intake schedule.</p>
                </div>
            ` : `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Intake Name</th>
                                <th>Year</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${intakes.map(intake => `
                                <tr>
                                    <td>${intake.intake_name}</td>
                                    <td>${intake.intake_year || 'N/A'}</td>
                                    <td>${intake.start_date || 'N/A'}</td>
                                    <td>${intake.end_date || 'N/A'}</td>
                                    <td>
                                        <span class="badge ${intake.is_active ? 'badge-success' : 'badge-danger'}">
                                            ${intake.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>${new Date(intake.created_at).toLocaleDateString()}</td>
                                    <td style="white-space: nowrap;">
                                        <button class="btn btn-xs btn-primary" onclick="showEditIntakeForm(${intake.intake_id}, ${JSON.stringify(intake).replace(/"/g, '&quot;')})">Edit</button>
                                        <button class="btn btn-xs btn-danger" onclick="deleteIntake(${intake.intake_id}, '${intake.intake_name}')">Delete</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('statsGrid').innerHTML = '';
    document.getElementById('mainContentArea').innerHTML = content;
}

// Show create intake form
function showCreateIntakeForm(universityId) {
    const currentYear = new Date().getFullYear();
    
    document.getElementById('modalTitle').textContent = 'Add New Intake';
    document.getElementById('modalBody').innerHTML = `
        <form id="createIntakeForm">
            <input type="hidden" name="university_id" value="${universityId}">
            <div class="form-group">
                <label>Intake Name <span style="color: red;">*</span></label>
                <input type="text" name="intake_name" class="form-control" required 
                       placeholder="e.g., January 2026, Fall 2026, etc.">
                <small class="form-text">Enter a descriptive name for this intake</small>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Year</label>
                    <input type="number" name="intake_year" class="form-control" 
                           placeholder="${currentYear}"
                           min="2025" max="2035">
                </div>
                <div class="form-group">
                    <label>Start Date</label>
                    <input type="date" name="start_date" class="form-control">
                </div>
            </div>
            <div class="form-group">
                <label>End Date</label>
                <input type="date" name="end_date" class="form-control">
            </div>
        </form>
        <style>
            .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
        </style>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitCreateIntakeForm()">Create Intake</button>
    `;
    openModal('genericModal');
}

// Submit create intake form
async function submitCreateIntakeForm() {
    const form = document.getElementById('createIntakeForm');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const universityId = data.university_id;
    delete data.university_id;
    
    showLoading();
    const result = await apiRequest(`/universities/${universityId}/intakes`, {
        method: 'POST',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('Intake created successfully!', 'success');
        await showUniversityIntakes(universityId, document.querySelector('.card-header h2').textContent.split(' for ')[1]);
    }
}

// Show edit intake form
async function showEditIntakeForm(intakeId, intakeData) {
    document.getElementById('modalTitle').textContent = 'Edit Intake';
    
    // Parse the intake data if it's a string
    const intake = typeof intakeData === 'string' ? JSON.parse(intakeData) : intakeData;
    
    // Format dates for input fields (YYYY-MM-DD format)
    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    };
    
    document.getElementById('modalBody').innerHTML = `
        <form id="editIntakeForm">
            <input type="hidden" name="intake_id" value="${intakeId}">
            <div class="form-group">
                <label>Intake Name <span style="color: red;">*</span></label>
                <input type="text" name="intake_name" class="form-control" required value="${intake.intake_name || ''}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Year</label>
                    <input type="number" name="intake_year" class="form-control" min="2025" max="2035" value="${intake.intake_year || ''}">
                </div>
                <div class="form-group">
                    <label>Start Date</label>
                    <input type="date" name="start_date" class="form-control" value="${formatDateForInput(intake.start_date)}">
                </div>
            </div>
            <div class="form-group">
                <label>End Date</label>
                <input type="date" name="end_date" class="form-control" value="${formatDateForInput(intake.end_date)}">
            </div>
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" name="is_active" style="width: 18px; height: 18px;" ${intake.is_active ? 'checked' : ''}>
                    <span>Active</span>
                </label>
            </div>
        </form>
        <style>
            .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
        </style>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitEditIntakeForm()">Update Intake</button>
    `;
    openModal('genericModal');
}

// Submit edit intake form
async function submitEditIntakeForm() {
    const form = document.getElementById('editIntakeForm');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const intakeId = data.intake_id;
    delete data.intake_id;
    
    // Convert checkbox to boolean
    data.is_active = data.is_active === 'on' ? true : false;
    
    showLoading();
    const result = await apiRequest(`/intakes/${intakeId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('Intake updated successfully!', 'success');
        // Reload the intakes for current university
        const universityId = new URLSearchParams(window.location.search).get('university_id');
        if (universityId) {
            await showUniversityIntakes(universityId, document.querySelector('.card-header h2').textContent.split(' for ')[1]);
        }
    }
}

// Delete intake
async function deleteIntake(intakeId, intakeName) {
    if (!confirm(`Are you sure you want to delete the intake "${intakeName}"?`)) {
        return;
    }
    
    showLoading();
    const result = await apiRequest(`/intakes/${intakeId}`, {
        method: 'DELETE'
    });
    
    showLoading(false);
    
    if (result) {
        showAlert('Intake deleted successfully!', 'success');
        // Reload current intakes view
        const currentContent = document.getElementById('mainContentArea').innerHTML;
        location.reload();
    } else if (result && result.error && result.error.includes('associated with')) {
        showAlert(result.error, 'error');
    }
}

async function showEditLogisticsForm(logisticsId) {
    showLoading();
    const data = await apiRequest('/logistics');
    const logistics = data?.logistics?.find(l => l.logistics_id === logisticsId);
    showLoading(false);
    
    if (!logistics) {
        showAlert('Logistics record not found');
        return;
    }
    
    document.getElementById('modalTitle').textContent = 'Edit Logistics Record';
    document.getElementById('modalBody').innerHTML = `
        <form id="editLogisticsForm">
            <input type="hidden" name="logistics_id" value="${logistics.logistics_id}">
            <div class="form-group">
                <label>Student</label>
                <input type="text" class="form-control" value="${logistics.student_name}" disabled>
            </div>
            <div class="form-group">
                <label>Pickup Date</label>
                <input type="date" name="pickup_date" class="form-control" value="${logistics.pickup_date || ''}">
            </div>
            <div class="form-group">
                <label>Pickup Location</label>
                <input type="text" name="pickup_location" class="form-control" value="${logistics.pickup_location || ''}">
            </div>
            <div class="form-group">
                <label>Accommodation</label>
                <textarea name="accommodation" class="form-control" rows="2">${logistics.accommodation || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Medical Check Date</label>
                <input type="date" name="medical_check_date" class="form-control" value="${logistics.medical_check_date || ''}">
            </div>
            <div class="form-group">
                <label>Status</label>
                <select name="arrival_status" class="form-control" required>
                    <option value="Pending" ${logistics.arrival_status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Arrived" ${logistics.arrival_status === 'Arrived' ? 'selected' : ''}>Arrived</option>
                    <option value="Accommodation" ${logistics.arrival_status === 'Accommodation' ? 'selected' : ''}>Accommodation</option>
                    <option value="Medical Check Process" ${logistics.arrival_status === 'Medical Check Process' ? 'selected' : ''}>Medical Check Process</option>
                    <option value="Completed" ${logistics.arrival_status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitEditLogisticsForm()">Update</button>
    `;
    openModal('genericModal');
}

async function submitEditLogisticsForm() {
    const form = document.getElementById('editLogisticsForm');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const logisticsId = data.logistics_id;
    delete data.logistics_id;
    
    // Remove empty fields
    Object.keys(data).forEach(key => {
        if (data[key] === '') {
            data[key] = null;
        }
    });
    
    showLoading();
    const result = await apiRequest(`/logistics/${logisticsId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('Logistics record updated successfully!', 'success');
        await loadLogisticsPage();
    }
}

// View Logistics Details (Read-only for Counsellors)
async function viewLogisticsDetails(logisticsId) {
    showLoading();
    const data = await apiRequest('/logistics');
    const logistics = data?.logistics?.find(l => l.logistics_id === logisticsId);
    showLoading(false);
    
    if (!logistics) {
        showAlert('Logistics record not found');
        return;
    }
    
    document.getElementById('modalTitle').textContent = 'Logistics Details';
    document.getElementById('modalBody').innerHTML = `
        <div style="padding: 10px;">
            <div class="form-group">
                <label><strong>Student:</strong></label>
                <p>${logistics.student_name}</p>
            </div>
            <div class="form-group">
                <label><strong>Pickup Date:</strong></label>
                <p>${logistics.pickup_date || 'N/A'}</p>
            </div>
            <div class="form-group">
                <label><strong>Pickup Time:</strong></label>
                <p>${formatTime12Hour(logistics.pickup_time)}</p>
            </div>
            <div class="form-group">
                <label><strong>Pickup Location:</strong></label>
                <p>${logistics.pickup_location || 'N/A'}</p>
            </div>
            <div class="form-group">
                <label><strong>Accommodation Address:</strong></label>
                <p>${logistics.accommodation || 'N/A'}</p>
            </div>
            <div class="form-group">
                <label><strong>Medical Check Date:</strong></label>
                <p>${logistics.medical_check_date || 'N/A'}</p>
            </div>
            <div class="form-group">
                <label><strong>Arrival Date:</strong></label>
                <p>${logistics.arrival_date || 'N/A'}</p>
            </div>
            <div class="form-group">
                <label><strong>Flight Details:</strong></label>
                <p>${logistics.flight_details || 'N/A'}</p>
            </div>
            <div class="form-group">
                <label><strong>Current Status:</strong></label>
                <p><span class="badge badge-warning">${logistics.arrival_status || 'Pending'}</span></p>
            </div>
        </div>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>
    `;
    openModal('genericModal');
}

// Edit Student's Own Logistics (For Students)
async function showEditStudentLogisticsForm(logisticsId) {
    showLoading();
    const data = await apiRequest('/students/me/logistics');
    const logistics = data?.logistics;
    showLoading(false);
    
    if (!logistics || logistics.logistics_id !== logisticsId) {
        showAlert('Logistics record not found');
        return;
    }
    
    document.getElementById('modalTitle').textContent = 'Edit My Logistics Information';
    document.getElementById('modalBody').innerHTML = `
        <form id="editStudentLogisticsForm">
            <input type="hidden" name="logistics_id" value="${logistics.logistics_id}">
            <div class="form-group">
                <label>Pickup Date</label>
                <input type="date" name="pickup_date" class="form-control" value="${logistics.pickup_date || ''}">
            </div>
            <div class="form-group">
                <label>Pickup Time</label>
                <input type="time" name="pickup_time" class="form-control" value="${logistics.pickup_time || ''}">
            </div>
            <div class="form-group">
                <label>Pickup Location</label>
                <input type="text" name="pickup_location" class="form-control" value="${logistics.pickup_location || ''}" placeholder="e.g., Airport Terminal 1">
            </div>
            <div class="form-group">
                <label>Accommodation Address</label>
                <textarea name="accommodation" class="form-control" rows="2" placeholder="Full accommodation address">${logistics.accommodation || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Medical Check Date</label>
                <input type="date" name="medical_check_date" class="form-control" value="${logistics.medical_check_date || ''}">
            </div>
            <div class="form-group">
                <label>Arrival Date</label>
                <input type="date" name="arrival_date" class="form-control" value="${logistics.arrival_date || ''}">
            </div>
            <div class="form-group">
                <label>Flight Details</label>
                <textarea name="flight_details" class="form-control" rows="2" placeholder="Flight number, airline, departure time, etc.">${logistics.flight_details || ''}</textarea>
            </div>
            <div class="alert alert-info" style="background: #d1ecf1; padding: 10px; border-radius: 4px; margin-top: 10px;">
                <strong>Note:</strong> You can update your logistics information. The arrival status can only be updated by logistics staff.
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitEditStudentLogisticsForm()">Update</button>
    `;
    openModal('genericModal');
}

async function submitEditStudentLogisticsForm() {
    const form = document.getElementById('editStudentLogisticsForm');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const logisticsId = data.logistics_id;
    delete data.logistics_id;
    
    // Remove empty fields
    Object.keys(data).forEach(key => {
        if (data[key] === '') {
            data[key] = null;
        }
    });
    
    showLoading();
    const result = await apiRequest(`/logistics/${logisticsId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
    
    showLoading(false);
    
    if (result) {
        closeModal('genericModal');
        showAlert('Your logistics information has been updated successfully!', 'success');
        await loadDashboardContent();
    }
}

// Mark Notification as Read
async function markNotificationRead(notificationId) {
    const result = await apiRequest(`/notifications/${notificationId}/read`, {
        method: 'PUT'
    });
    
    if (result) {
        loadNotifications();
    }
}

// Download Document
async function downloadDocument(documentId, docType) {
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/documents/${documentId}/download`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            showAlert(error.error || 'Download failed');
            return;
        }
        
        // Create blob from response
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docType}_${documentId}.pdf`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showAlert('Document downloaded successfully!', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showAlert('Failed to download document');
    }
}

async function downloadConditionalOffer(applicationId) {
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/applications/${applicationId}/conditional-offer`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            showAlert(error.error || 'Download failed');
            return;
        }
        
        // Create blob from response
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conditional_offer_${applicationId}.pdf`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showAlert('Conditional offer letter downloaded successfully!', 'success');
    } catch (error) {
        console.error('Download conditional offer error:', error);
        showAlert('Failed to download conditional offer letter');
    }
}

async function deleteDocument(documentId, applicationId) {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await apiRequest(`/documents/${documentId}/delete`, {
            method: 'DELETE'
        });
        
        if (response && response.message) {
            showAlert(response.message, 'success');
            // Reload student dashboard to refresh the document list
            await loadStudentDashboard();
        }
    } catch (error) {
        console.error('Delete document error:', error);
        showAlert('Failed to delete document');
    }
}

async function deleteDocumentAsStaff(documentId, studentId) {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await apiRequest(`/documents/${documentId}/delete`, {
            method: 'DELETE'
        });
        
        if (response && response.message) {
            showAlert(response.message, 'success');
            // Refresh student detail modal
            await showStudentDetail(studentId);
        }
    } catch (error) {
        console.error('Delete document error:', error);
        showAlert('Failed to delete document');
    }
}

async function deleteDocumentFromPage(documentId) {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await apiRequest(`/documents/${documentId}/delete`, {
            method: 'DELETE'
        });
        
        if (response && response.message) {
            showAlert(response.message, 'success');
            // Reload documents page
            await loadDocumentsPage();
        }
    } catch (error) {
        console.error('Delete document error:', error);
        showAlert('Failed to delete document');
    }
}

async function deleteApplicationFromPage(applicationId) {
    if (!confirm('Are you sure you want to delete this application? This will also delete all associated documents. This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await apiRequest(`/applications/${applicationId}/delete`, {
            method: 'DELETE'
        });
        
        if (response && response.message) {
            showAlert(response.message, 'success');
            // Reload applications page
            await loadApplicationsPage();
        }
    } catch (error) {
        console.error('Delete application error:', error);
        showAlert('Failed to delete application');
    }
}

async function deleteStudentApplication(applicationId) {
    if (!confirm('Are you sure you want to delete this application? This will also delete all associated documents. This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await apiRequest(`/applications/${applicationId}/delete`, {
            method: 'DELETE'
        });
        
        if (response && response.message) {
            showAlert(response.message, 'success');
            // Reload student dashboard to reflect changes
            await loadStudentDashboard();
        }
    } catch (error) {
        console.error('Delete application error:', error);
        showAlert(error.message || 'Failed to delete application. You can only delete applications with "In Review" status.');
    }
}

async function deleteUniversity(universityId, universityName) {
    if (!confirm(`Are you sure you want to delete "${universityName}"?\n\nWARNING: All university staff accounts associated with this university will be deactivated. This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await apiRequest(`/universities/${universityId}/delete`, {
            method: 'DELETE'
        });
        
        if (response && response.message) {
            showAlert(response.message, 'success');
            // Reload universities page
            await loadUniversitiesPage();
        }
    } catch (error) {
        console.error('Delete university error:', error);
        showAlert('Failed to delete university');
    }
}

async function deleteLogisticsRecord(logisticsId) {
    if (!confirm('Are you sure you want to delete this logistics record? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await apiRequest(`/logistics/${logisticsId}/delete`, {
            method: 'DELETE'
        });
        
        if (response && response.message) {
            showAlert(response.message, 'success');
            // Reload logistics page
            await loadLogisticsPage();
        }
    } catch (error) {
        console.error('Delete logistics error:', error);
        showAlert('Failed to delete logistics record');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initDashboard);

// Student filtering and sorting functions
function filterStudents() {
    const searchTerm = document.getElementById('studentSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const counsellorFilter = document.getElementById('counsellorFilter')?.value || '';
    const countryFilter = document.getElementById('countryFilter')?.value || '';
    
    const rows = document.querySelectorAll('.student-row');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const name = row.dataset.name || '';
        const email = row.dataset.email || '';
        const status = row.dataset.status || '';
        const counsellor = row.dataset.counsellor || '';
        const country = row.dataset.country || '';
        
        const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
        const matchesStatus = !statusFilter || status === statusFilter;
        const matchesCounsellor = !counsellorFilter || counsellor === counsellorFilter;
        const matchesCountry = !countryFilter || country === countryFilter;
        
        if (matchesSearch && matchesStatus && matchesCounsellor && matchesCountry) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('studentCount');
    if (countEl) {
        countEl.textContent = `Showing ${visibleCount} student${visibleCount !== 1 ? 's' : ''}`;
    }
}

function clearStudentFilters() {
    document.getElementById('studentSearch').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('counsellorFilter').value = '';
    document.getElementById('countryFilter').value = '';
    filterStudents();
}

let studentSortOrder = {};
function sortStudents(column) {
    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('.student-row'));
    
    // Toggle sort order
    studentSortOrder[column] = studentSortOrder[column] === 'asc' ? 'desc' : 'asc';
    const order = studentSortOrder[column];
    
    rows.sort((a, b) => {
        let aVal, bVal;
        
        if (column === 'full_name') {
            aVal = a.dataset.name;
            bVal = b.dataset.name;
        } else if (column === 'email') {
            aVal = a.dataset.email;
            bVal = b.dataset.email;
        } else if (column === 'nationality') {
            aVal = a.dataset.nationality;
            bVal = b.dataset.nationality;
        } else if (column === 'preferred_country') {
            aVal = a.dataset.country || '';
            bVal = b.dataset.country || '';
        } else if (column === 'program') {
            aVal = a.dataset.program;
            bVal = b.dataset.program;
        } else if (column === 'application_status') {
            aVal = a.dataset.status;
            bVal = b.dataset.status;
        } else if (column === 'counsellor') {
            aVal = a.dataset.counsellor;
            bVal = b.dataset.counsellor;
        } else if (column === 'logistics') {
            aVal = a.dataset.logistics;
            bVal = b.dataset.logistics;
        }
        
        if (order === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Export Audit Logs - Show dialog with filter options
function showAuditExportDialog() {
    document.getElementById('modalTitle').textContent = 'Export Audit Logs';
    document.getElementById('modalBody').innerHTML = `
        <div style="padding: 10px;">
            <p style="margin-bottom: 20px; color: #555;">Select which fields you want to filter on before export. Leave unchecked to export all records.</p>
            
            <form id="auditExportFilterForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_timestamp" id="filter_timestamp" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Timestamp</span>
                        </label>
                        <div id="timestamp_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="timestamp_range" class="form-control" style="margin-bottom: 10px;">
                                <option value="">Select time range...</option>
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                                <option value="this-week">This Week</option>
                                <option value="this-month">This Month</option>
                                <option value="last-month">Last Month</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_user" id="filter_user" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">User</span>
                        </label>
                        <div id="user_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="user_name" class="form-control" id="export_user_select">
                                <option value="">Select user...</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_action" id="filter_action" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Action</span>
                        </label>
                        <div id="action_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="action_name" class="form-control" id="export_action_select">
                                <option value="">Select action...</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_ip" id="filter_ip" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">IP Address</span>
                        </label>
                        <div id="ip_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <input type="text" name="ip_address" class="form-control" placeholder="Enter IP address..." id="export_ip_input">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_details" id="filter_details" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Details/Name</span>
                        </label>
                        <div id="details_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <input type="text" name="details_search" class="form-control" placeholder="Search in details..." id="export_details_input">
                        </div>
                    </div>
                </div>
            </form>
        </div>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="executeAuditExport()">Export to CSV</button>
    `;
    
    openModal('genericModal');
    
    // Set up checkbox toggle handlers
    setupAuditExportCheckboxes();
    
    // Populate filter dropdowns with available values from visible table
    populateAuditExportOptions();
}

// Setup checkbox toggle for showing/hiding filter options
function setupAuditExportCheckboxes() {
    const checkboxes = ['filter_timestamp', 'filter_user', 'filter_action', 'filter_ip', 'filter_details'];
    
    checkboxes.forEach(checkboxId => {
        const checkbox = document.getElementById(checkboxId);
        const optionsDiv = document.getElementById(checkboxId.replace('filter_', '') + '_filter_options');
        
        if (checkbox && optionsDiv) {
            checkbox.addEventListener('change', function() {
                optionsDiv.style.display = this.checked ? 'block' : 'none';
            });
        }
    });
}

// Populate export filter dropdowns with available options
function populateAuditExportOptions() {
    // Get all visible rows from the current table
    const rows = document.querySelectorAll('.audit-row');
    
    // Extract unique users
    const users = new Set();
    const actions = new Set();
    
    rows.forEach(row => {
        const user = row.dataset.user;
        const action = row.dataset.action;
        if (user) users.add(user);
        if (action) actions.add(action);
    });
    
    // Populate user select
    const userSelect = document.getElementById('export_user_select');
    Array.from(users).sort().forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user.charAt(0).toUpperCase() + user.slice(1);
        userSelect.appendChild(option);
    });
    
    // Populate action select
    const actionSelect = document.getElementById('export_action_select');
    Array.from(actions).sort().forEach(action => {
        const option = document.createElement('option');
        option.value = action;
        option.textContent = action.charAt(0).toUpperCase() + action.slice(1);
        actionSelect.appendChild(option);
    });
}

// Execute the audit export with selected filters
async function executeAuditExport() {
    const form = document.getElementById('auditExportFilterForm');
    const formData = new FormData(form);
    
    // Build filter query
    const filters = {};
    
    if (formData.get('filter_timestamp')) {
        filters.timestamp_range = formData.get('timestamp_range');
    }
    if (formData.get('filter_user')) {
        filters.user_name = formData.get('user_name');
    }
    if (formData.get('filter_action')) {
        filters.action_name = formData.get('action_name');
    }
    if (formData.get('filter_ip')) {
        filters.ip_address = formData.get('ip_address');
    }
    if (formData.get('filter_details')) {
        filters.details_search = formData.get('details_search');
    }
    
    // Check if at least one filter is selected with a value
    const hasFilters = Object.values(filters).some(val => val);
    
    showLoading();
    
    try {
        // Fetch all audit logs without limit
        let endpoint = '/audit-logs?limit=10000';
        
        const data = await apiRequest(endpoint);
        showLoading(false);
        
        if (!data || !data.logs) {
            showAlert('Failed to fetch audit logs');
            return;
        }
        
        let logs = data.logs;
        
        // Apply filters if any are selected
        if (hasFilters) {
            logs = logs.filter(log => {
                let matches = true;
                
                // Filter by timestamp range
                if (filters.timestamp_range) {
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                    
                    const logDate = new Date(log.timestamp);
                    
                    if (filters.timestamp_range === 'today') {
                        matches = matches && logDate >= today;
                    } else if (filters.timestamp_range === 'yesterday') {
                        matches = matches && logDate >= yesterday && logDate < today;
                    } else if (filters.timestamp_range === 'this-week') {
                        matches = matches && logDate >= weekAgo;
                    } else if (filters.timestamp_range === 'this-month') {
                        matches = matches && logDate >= monthStart;
                    } else if (filters.timestamp_range === 'last-month') {
                        matches = matches && logDate >= lastMonthStart && logDate <= lastMonthEnd;
                    }
                }
                
                // Filter by user
                if (filters.user_name && matches) {
                    const logUser = (log.full_name || 'System').toLowerCase();
                    matches = matches && logUser === filters.user_name.toLowerCase();
                }
                
                // Filter by action
                if (filters.action_name && matches) {
                    const logAction = (log.action || '').toLowerCase();
                    matches = matches && logAction === filters.action_name.toLowerCase();
                }
                
                // Filter by IP address
                if (filters.ip_address && matches) {
                    const logIp = (log.ip_address || '').toLowerCase();
                    matches = matches && logIp === filters.ip_address.toLowerCase();
                }
                
                // Filter by details
                if (filters.details_search && matches) {
                    const logDetails = (log.details || '').toLowerCase();
                    matches = matches && logDetails.includes(filters.details_search.toLowerCase());
                }
                
                return matches;
            });
        }
        
        // Check if we have any records to export
        if (logs.length === 0) {
            showAlert('No audit logs found matching the selected filters');
            return;
        }
        
        // Generate CSV from filtered logs
        let csv = 'Timestamp,User,Action,Details,IP Address\n';
        
        logs.forEach(log => {
            const timestamp = new Date(log.timestamp).toLocaleString();
            const user = log.full_name || 'System';
            const action = log.action || '';
            const details = log.details || `Target: ${log.target_table || 'N/A'} (ID: ${log.target_id || 'N/A'})`;
            const ipAddress = log.ip_address || 'N/A';
            
            const data = [timestamp, user, action, details, ipAddress];
            csv += data.map(d => `"${d.replace(/"/g, '""')}"`).join(',') + '\n';
        });
        
        // Download CSV file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        
        closeModal('genericModal');
        showAlert(`Audit logs exported successfully! (${logs.length} records)`, 'success');
        
    } catch (error) {
        showLoading(false);
        console.error('Export error:', error);
        showAlert('Failed to export audit logs');
    }
}

// Old CSV export function - kept for backward compatibility but updated
function exportAuditLogsCSV() {
    const rows = Array.from(document.querySelectorAll('.audit-row')).filter(row => row.style.display !== 'none');
    
    if (rows.length === 0) {
        showAlert('No audit logs to export. Please adjust your filters.');
        return;
    }
    
    // Prepare CSV header
    let csv = 'Timestamp,User,Action,Details,IP Address\n';
    
    // Extract data from each visible row
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        
        // Get the data from table cells
        const timestamp = cells[0].textContent.trim();
        const user = cells[1].textContent.trim();
        const action = cells[2].textContent.trim(); // This includes the badge styling, so we extract text
        const details = cells[3].textContent.trim();
        const ipAddress = cells[4].textContent.trim();
        
        // Create CSV row with proper escaping for commas and quotes
        const data = [timestamp, user, action, details, ipAddress];
        csv += data.map(d => `"${d.replace(/"/g, '""')}"`).join(',') + '\n';
    });
    
    // Create and download the CSV file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
    
    showAlert(`Audit logs exported to CSV! (${rows.length} records)`, 'success');
}

// Show reassign counsellor dialog
async function showReassignCounsellor(studentId, currentCounsellorId) {
    showLoading();
    const data = await apiRequest('/users?role=Counsellor');
    showLoading(false);
    
    if (!data || !data.users) {
        showAlert('Failed to load counsellors');
        return;
    }
    
    const counsellors = data.users;
    
    document.getElementById('modalTitle').textContent = 'Assign/Reassign Counsellor';
    document.getElementById('modalBody').innerHTML = `
        <form id="reassignCounsellorForm">
            <div class="form-group">
                <label>Select Counsellor</label>
                <select name="counsellor_id" class="form-control" required>
                    <option value="">Select counsellor...</option>
                    <option value="unassign" ${!currentCounsellorId ? 'selected' : ''}>-- Unassigned --</option>
                    ${counsellors.map(c => `
                        <option value="${c.user_id}" ${c.user_id === currentCounsellorId ? 'selected' : ''}>
                            ${c.full_name} (${c.email})
                        </option>
                    `).join('')}
                </select>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="showStudentDetail(${studentId})">Back</button>
        <button class="btn btn-primary" onclick="submitReassignCounsellor(${studentId})">Assign</button>
    `;
    openModal('genericModal');
}

async function submitReassignCounsellor(studentId) {
    const form = document.getElementById('reassignCounsellorForm');
    const formData = new FormData(form);
    const counsellorId = formData.get('counsellor_id');
    
    if (!counsellorId) {
        showAlert('Please select a counsellor or choose unassigned');
        return;
    }
    
    showLoading();
    const result = await apiRequest(`/students/${studentId}/assign-counsellor`, {
        method: 'PUT',
        body: JSON.stringify({ 
            counsellor_id: counsellorId === 'unassign' ? null : parseInt(counsellorId)
        })
    });
    showLoading(false);
    
    if (result) {
        showAlert(counsellorId === 'unassign' ? 'Counsellor unassigned successfully!' : 'Counsellor assigned successfully!', 'success');
        await showStudentDetail(studentId);
    }
}

// Show reassign logistics dialog
async function showReassignLogistics(studentId, currentLogisticsId) {
    showLoading();
    const data = await apiRequest('/users?role=Logistics Staff');
    showLoading(false);
    
    if (!data || !data.users) {
        showAlert('Failed to load logistics staff');
        return;
    }
    
    const logistics = data.users;
    
    document.getElementById('modalTitle').textContent = 'Assign/Reassign Logistics Staff';
    document.getElementById('modalBody').innerHTML = `
        <form id="reassignLogisticsForm">
            <div class="form-group">
                <label>Select Logistics Staff</label>
                <select name="logistics_id" class="form-control" required>
                    <option value="">Select logistics staff...</option>
                    <option value="unassign" ${!currentLogisticsId ? 'selected' : ''}>-- Unassigned --</option>
                    ${logistics.map(l => `
                        <option value="${l.user_id}" ${l.user_id === currentLogisticsId ? 'selected' : ''}>
                            ${l.full_name} (${l.email})
                        </option>
                    `).join('')}
                </select>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="showStudentDetail(${studentId})">Back</button>
        <button class="btn btn-primary" onclick="submitReassignLogistics(${studentId})">Assign</button>
    `;
    openModal('genericModal');
}

async function submitReassignLogistics(studentId) {
    const form = document.getElementById('reassignLogisticsForm');
    const formData = new FormData(form);
    const logisticsId = formData.get('logistics_id');
    
    if (!logisticsId) {
        showAlert('Please select logistics staff or choose unassigned');
        return;
    }
    
    showLoading();
    const result = await apiRequest(`/students/${studentId}/assign-logistics`, {
        method: 'PUT',
        body: JSON.stringify({ 
            logistics_id: logisticsId === 'unassign' ? null : parseInt(logisticsId)
        })
    });
    showLoading(false);
    
    if (result) {
        showAlert(logisticsId === 'unassign' ? 'Logistics staff unassigned successfully!' : 'Logistics staff assigned successfully!', 'success');
        await showStudentDetail(studentId);
    }
}


// Forward application to university
async function forwardApplication(applicationId) {
    const confirmed = await showConfirmDialog(
        'Forward Application',
        'Are you sure you want to forward this application to the university for review?'
    );
    
    if (!confirmed) return;
    
    showLoading();
    const response = await fetch(`${API_URL}/applications/${applicationId}/forward`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        }
    });
    
    const result = await response.json();
    showLoading(false);
    
    if (response.ok) {
        showAlert('Application forwarded to university successfully!', 'success');
        await loadApplicationsPage();
    } else {
        // Handle validation errors for missing/unverified documents
        if (result.missing_documents || result.unverified_documents) {
            let errorMsg = result.error + '\n';
            if (result.missing_documents) {
                errorMsg += '\nMissing: ' + result.missing_documents.join(', ');
            }
            if (result.unverified_documents) {
                errorMsg += '\nUnverified: ' + result.unverified_documents.join(', ');
            }
            showAlert(errorMsg, 'error');
        } else {
            showAlert(result.error || 'Failed to forward application', 'error');
        }
    }
}

// Toggle user account status (activate/deactivate)
async function toggleUserStatus(userId, currentStatus) {
    const action = currentStatus ? 'deactivate' : 'activate';
    const confirmed = await showConfirmDialog(
        `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
        `Are you sure you want to ${action} this user account?`
    );
    
    if (!confirmed) return;
    
    showLoading();
    const result = await apiRequest(`/users/${userId}/toggle-status`, {
        method: 'PUT'
    });
    showLoading(false);
    
    if (result) {
        showAlert(result.message || `User ${action}d successfully!`, 'success');
        await loadUsersPage();
    }
}

// Delete user (SuperAdmin only)
async function deleteUser(userId, userName) {
    const confirmed = await showConfirmDialog(
        'Delete User',
        `Are you sure you want to permanently delete user "${userName}"? This action cannot be undone and will remove all associated data.`
    );
    
    if (!confirmed) return;
    
    // Double confirmation for delete action
    const doubleConfirm = await showConfirmDialog(
        'Final Confirmation',
        `This will permanently delete "${userName}" and all their data. Are you absolutely sure?`
    );
    
    if (!doubleConfirm) return;
    
    showLoading();
    const response = await fetch(`${API_URL}/users/${userId}/delete`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        }
    });
    
    const result = await response.json();
    showLoading(false);
    
    if (response.ok) {
        showAlert(result.message || 'User deleted successfully!', 'success');
        await loadUsersPage();
    } else {
        showAlert(result.error || 'Failed to delete user', 'error');
    }
}

// ==================== CHART RENDERING ====================

// Render Admin Dashboard Charts
function renderAdminCharts(analytics) {
    // Audit Activity Chart (Top actions in last 30 days)
    if (analytics.audit_activity && analytics.audit_activity.length > 0) {
        const ctx = document.getElementById('auditActivityChart');
        if (ctx) {
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: analytics.audit_activity.map(a => a.action || 'Unknown'),
                    datasets: [{
                        label: 'Actions',
                        data: analytics.audit_activity.map(a => a.count),
                        backgroundColor: '#3498db'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }
    }
    
    // Users by Role Chart
    if (analytics.users_by_role && analytics.users_by_role.length > 0) {
        const ctx = document.getElementById('usersByRoleChart');
        if (ctx) {
            new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: analytics.users_by_role.map(u => u.role_name || 'Unknown'),
                    datasets: [{
                        data: analytics.users_by_role.map(u => u.count),
                        backgroundColor: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    }
    
    // Top Active Users Chart
    if (analytics.top_active_users && analytics.top_active_users.length > 0) {
        const ctx = document.getElementById('topActiveUsersChart');
        if (ctx) {
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: analytics.top_active_users.map(u => `${u.full_name} (${u.role_name})`),
                    datasets: [{
                        label: 'Actions',
                        data: analytics.top_active_users.map(u => u.action_count),
                        backgroundColor: '#9b59b6'
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { beginAtZero: true }
                    }
                }
            });
        }
    }
    
    // User Status Chart (Active vs Inactive)
    if (analytics.user_status && analytics.user_status.length > 0) {
        const ctx = document.getElementById('userStatusChart');
        if (ctx) {
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: analytics.user_status.map(s => s.status || 'Unknown'),
                    datasets: [{
                        data: analytics.user_status.map(s => s.count),
                        backgroundColor: ['#2ecc71', '#e74c3c']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    } else {
        // If no data, show placeholder
        const ctx = document.getElementById('userStatusChart');
        if (ctx) {
            const parent = ctx.parentElement;
            parent.innerHTML = '<p style="text-align: center; padding: 40px; color: #7f8c8d;">No user status data available</p>';
        }
    }
    
    // Application Decisions Chart
    if (analytics.decision_breakdown && analytics.decision_breakdown.length > 0) {
        const ctx = document.getElementById('decisionChart');
        if (ctx) {
            new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: analytics.decision_breakdown.map(d => d.decision_type || 'Pending'),
                    datasets: [{
                        data: analytics.decision_breakdown.map(d => d.count),
                        backgroundColor: ['#2ecc71', '#e74c3c', '#f39c12']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    } else {
        // If no data, show placeholder
        const ctx = document.getElementById('decisionChart');
        if (ctx) {
            const parent = ctx.parentElement;
            parent.innerHTML = '<p style="text-align: center; padding: 40px; color: #7f8c8d;">No decision data available yet</p>';
        }
    }
    
    // Application Status Chart
    if (analytics.application_status && analytics.application_status.length > 0) {
        const ctx1 = document.getElementById('appStatusChart');
        if (ctx1) {
            new Chart(ctx1, {
                type: 'doughnut',
                data: {
                    labels: analytics.application_status.map(s => s.status || 'Unknown'),
                    datasets: [{
                        data: analytics.application_status.map(s => s.count),
                        backgroundColor: [
                            '#3498db', '#2ecc71', '#f39c12', '#e74c3c', 
                            '#9b59b6', '#1abc9c', '#34495e', '#e67e22'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    } else {
        // If no data, show placeholder
        const ctx1 = document.getElementById('appStatusChart');
        if (ctx1) {
            const parent = ctx1.parentElement;
            parent.innerHTML = '<p style="text-align: center; padding: 40px; color: #7f8c8d;">No application data available</p>';
        }
    }
    
    // Top Universities Chart
    if (analytics.apps_by_university && analytics.apps_by_university.length > 0) {
        const ctx2 = document.getElementById('universityChart');
        if (ctx2) {
            new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: analytics.apps_by_university.map(u => u.university_name || 'Unknown'),
                    datasets: [{
                        label: 'Applications',
                        data: analytics.apps_by_university.map(u => u.count),
                        backgroundColor: '#3498db'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }
    } else {
        // If no data, show placeholder
        const ctx2 = document.getElementById('universityChart');
        if (ctx2) {
            const parent = ctx2.parentElement;
            parent.innerHTML = '<p style="text-align: center; padding: 40px; color: #7f8c8d;">No university data available</p>';
        }
    }
}

// Render Counsellor Dashboard Charts
function renderCounsellorCharts(analytics) {
    // Students by Status Chart
    if (analytics.students_by_status && analytics.students_by_status.length > 0) {
        const ctx1 = document.getElementById('studentStatusChart');
        if (ctx1) {
            new Chart(ctx1, {
                type: 'pie',
                data: {
                    labels: analytics.students_by_status.map(s => s.application_status || 'Unknown'),
                    datasets: [{
                        data: analytics.students_by_status.map(s => s.count),
                        backgroundColor: ['#3498db', '#2ecc71', '#f39c12', '#e74c3c', '#9b59b6']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    }
    
    // Applications by Status Chart
    if (analytics.applications_by_status && analytics.applications_by_status.length > 0) {
        const ctx2 = document.getElementById('applicationsChart');
        if (ctx2) {
            new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: analytics.applications_by_status.map(a => a.status || 'Unknown'),
                    datasets: [{
                        data: analytics.applications_by_status.map(a => a.count),
                        backgroundColor: ['#3498db', '#2ecc71', '#f39c12', '#e74c3c', '#9b59b6', '#1abc9c']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    }
    
    // Document Verification Progress Chart
    if (analytics.document_progress && analytics.document_progress.length > 0) {
        const ctx3 = document.getElementById('documentChart');
        if (ctx3) {
            new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: analytics.document_progress.map(d => d.status || 'Unknown'),
                    datasets: [{
                        label: 'Documents',
                        data: analytics.document_progress.map(d => d.count),
                        backgroundColor: ['#95a5a6', '#2ecc71', '#e74c3c']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }
    }
}

// ==================== FILTER AND SORT FUNCTIONS ====================

// Users Page Filters
const userSortOrder = {};

function filterUsers() {
    const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('roleFilter')?.value || '';
    const statusFilter = document.getElementById('userStatusFilter')?.value || '';
    
    const rows = document.querySelectorAll('.user-row');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const name = row.dataset.name || '';
        const email = row.dataset.email || '';
        const role = row.dataset.role || '';
        const status = row.dataset.status || '';
        
        const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
        const matchesRole = !roleFilter || role === roleFilter;
        const matchesStatus = !statusFilter || status === statusFilter;
        
        if (matchesSearch && matchesRole && matchesStatus) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('userCount');
    if (countEl) {
        countEl.textContent = `Showing ${visibleCount} user${visibleCount !== 1 ? 's' : ''}`;
    }
}

function clearUserFilters() {
    document.getElementById('userSearch').value = '';
    document.getElementById('roleFilter').value = '';
    document.getElementById('userStatusFilter').value = '';
    filterUsers();
}

function sortUsers(column) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('.user-row'));
    userSortOrder[column] = userSortOrder[column] === 'asc' ? 'desc' : 'asc';
    const order = userSortOrder[column];
    
    rows.sort((a, b) => {
        let aVal, bVal;
        if (column === 'full_name') {
            aVal = a.dataset.name;
            bVal = b.dataset.name;
        } else if (column === 'email') {
            aVal = a.dataset.email;
            bVal = b.dataset.email;
        } else if (column === 'role') {
            aVal = a.dataset.role;
            bVal = b.dataset.role;
        } else if (column === 'status') {
            aVal = a.dataset.status;
            bVal = b.dataset.status;
        } else if (column === 'created_at') {
            aVal = a.children[4].textContent.trim();
            bVal = b.children[4].textContent.trim();
        }
        
        if (order === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Universities Page Filters
const universitySortOrder = {};

function filterUniversities() {
    const searchTerm = document.getElementById('universitySearch')?.value.toLowerCase() || '';
    const countryFilter = document.getElementById('universityCountryFilter')?.value || '';
    
    const rows = document.querySelectorAll('.university-row');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const name = row.dataset.name || '';
        const country = row.dataset.country || '';
        const email = row.dataset.email || '';
        
        const matchesSearch = name.includes(searchTerm) || country.includes(searchTerm) || email.includes(searchTerm);
        const matchesCountry = !countryFilter || country === countryFilter.toLowerCase();
        
        if (matchesSearch && matchesCountry) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('universityCount');
    if (countEl) {
        countEl.textContent = `Showing ${visibleCount} universit${visibleCount !== 1 ? 'ies' : 'y'}`;
    }
}

function clearUniversityFilters() {
    document.getElementById('universitySearch').value = '';
    document.getElementById('universityCountryFilter').value = '';
    filterUniversities();
}

function sortUniversities(column) {
    const tbody = document.getElementById('universitiesTableBody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('.university-row'));
    universitySortOrder[column] = universitySortOrder[column] === 'asc' ? 'desc' : 'asc';
    const order = universitySortOrder[column];
    
    rows.sort((a, b) => {
        let aVal, bVal;
        if (column === 'name') {
            aVal = a.dataset.name;
            bVal = b.dataset.name;
        } else if (column === 'country') {
            aVal = a.dataset.country;
            bVal = b.dataset.country;
        } else if (column === 'email') {
            aVal = a.dataset.email;
            bVal = b.dataset.email;
        } else if (column === 'created_at') {
            aVal = a.children[3].textContent.trim();
            bVal = b.children[3].textContent.trim();
        }
        
        if (order === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Logistics Page Filters
const logisticsSortOrder = {};

function filterLogistics() {
    const searchTerm = document.getElementById('logisticsSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('logisticsStatusFilter')?.value || '';
    const dateFilter = document.getElementById('logisticsDateFilter')?.value || '';
    
    const rows = document.querySelectorAll('.logistics-row');
    let visibleCount = 0;
    
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    rows.forEach(row => {
        const student = row.dataset.student || '';
        const location = row.dataset.location || '';
        const status = row.dataset.status || '';
        const dateStr = row.dataset.date || '';
        
        const matchesSearch = student.includes(searchTerm) || location.includes(searchTerm);
        const matchesStatus = !statusFilter || status === statusFilter;
        
        let matchesDate = true;
        if (dateFilter && dateStr) {
            const date = new Date(dateStr);
            if (dateFilter === 'upcoming') {
                matchesDate = date >= now;
            } else if (dateFilter === 'past') {
                matchesDate = date < now;
            } else if (dateFilter === 'this-week') {
                matchesDate = date >= weekAgo && date <= now;
            } else if (dateFilter === 'this-month') {
                matchesDate = date >= monthStart;
            }
        }
        
        if (matchesSearch && matchesStatus && matchesDate) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('logisticsCount');
    if (countEl) {
        countEl.textContent = `Showing ${visibleCount} record${visibleCount !== 1 ? 's' : ''}`;
    }
}

function clearLogisticsFilters() {
    document.getElementById('logisticsSearch').value = '';
    document.getElementById('logisticsStatusFilter').value = '';
    document.getElementById('logisticsDateFilter').value = '';
    filterLogistics();
}

function sortLogistics(column) {
    const tbody = document.getElementById('logisticsTableBody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('.logistics-row'));
    logisticsSortOrder[column] = logisticsSortOrder[column] === 'asc' ? 'desc' : 'asc';
    const order = logisticsSortOrder[column];
    
    rows.sort((a, b) => {
        let aVal, bVal;
        if (column === 'student_name') {
            aVal = a.dataset.student;
            bVal = b.dataset.student;
        } else if (column === 'pickup_date') {
            aVal = a.dataset.date || '9999-12-31';
            bVal = b.dataset.date || '9999-12-31';
        } else if (column === 'location') {
            aVal = a.dataset.location;
            bVal = b.dataset.location;
        } else if (column === 'accommodation') {
            aVal = a.dataset.accommodation;
            bVal = b.dataset.accommodation;
        } else if (column === 'medical') {
            aVal = a.dataset.medical || '9999-12-31';
            bVal = b.dataset.medical || '9999-12-31';
        } else if (column === 'status') {
            aVal = a.dataset.status;
            bVal = b.dataset.status;
        }
        
        if (order === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Applications Page Filters
const applicationSortOrder = {};

function filterApplications() {
    const searchTerm = document.getElementById('applicationSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('applicationStatusFilter')?.value || '';
    const universityFilter = document.getElementById('applicationUniversityFilter')?.value || '';
    const dateFilter = document.getElementById('applicationDateFilter')?.value || '';
    
    const rows = document.querySelectorAll('.application-row');
    let visibleCount = 0;
    
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    
    rows.forEach(row => {
        const student = row.dataset.student || '';
        const university = row.dataset.university || '';
        const program = row.dataset.program || '';
        const status = row.dataset.status || '';
        const dateStr = row.dataset.date || '';
        
        const matchesSearch = student.includes(searchTerm) || university.includes(searchTerm) || program.includes(searchTerm);
        const matchesStatus = !statusFilter || status === statusFilter;
        const matchesUniversity = !universityFilter || university === universityFilter.toLowerCase();
        
        let matchesDate = true;
        if (dateFilter && dateStr) {
            const date = new Date(dateStr);
            if (dateFilter === 'this-week') {
                matchesDate = date >= weekAgo;
            } else if (dateFilter === 'this-month') {
                matchesDate = date >= monthStart;
            } else if (dateFilter === 'this-year') {
                matchesDate = date >= yearStart;
            }
        }
        
        if (matchesSearch && matchesStatus && matchesUniversity && matchesDate) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('applicationCount');
    if (countEl) {
        countEl.textContent = `Showing ${visibleCount} application${visibleCount !== 1 ? 's' : ''}`;
    }
}

function clearApplicationFilters() {
    document.getElementById('applicationSearch').value = '';
    document.getElementById('applicationStatusFilter').value = '';
    document.getElementById('applicationUniversityFilter').value = '';
    document.getElementById('applicationDateFilter').value = '';
    filterApplications();
}

function sortApplications(column) {
    const tbody = document.getElementById('applicationsTableBody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('.application-row'));
    applicationSortOrder[column] = applicationSortOrder[column] === 'asc' ? 'desc' : 'asc';
    const order = applicationSortOrder[column];
    
    rows.sort((a, b) => {
        let aVal, bVal;
        if (column === 'student_name') {
            aVal = a.dataset.student;
            bVal = b.dataset.student;
        } else if (column === 'university_name') {
            aVal = a.dataset.university;
            bVal = b.dataset.university;
        } else if (column === 'program') {
            aVal = a.dataset.program;
            bVal = b.dataset.program;
        } else if (column === 'counsellor_name') {
            aVal = a.dataset.counsellor || '';
            bVal = b.dataset.counsellor || '';
        } else if (column === 'status') {
            aVal = a.dataset.status;
            bVal = b.dataset.status;
        } else if (column === 'submitted_at') {
            aVal = a.dataset.date || '9999-12-31';
            bVal = b.dataset.date || '9999-12-31';
        }
        
        if (order === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Documents Page Filters
const documentSortOrder = {};

function filterDocuments() {
    const searchTerm = document.getElementById('documentSearch')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('documentTypeFilter')?.value || '';
    const statusFilter = document.getElementById('documentStatusFilter')?.value || '';
    
    const rows = document.querySelectorAll('.document-row');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const student = row.dataset.student || '';
        const type = row.dataset.type || '';
        const status = row.dataset.status || '';
        
        const matchesSearch = student.includes(searchTerm) || type.toLowerCase().includes(searchTerm);
        const matchesType = !typeFilter || type === typeFilter;
        const matchesStatus = !statusFilter || status === statusFilter;
        
        if (matchesSearch && matchesType && matchesStatus) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('documentCount');
    if (countEl) {
        countEl.textContent = `Showing ${visibleCount} document${visibleCount !== 1 ? 's' : ''}`;
    }
}

function clearDocumentFilters() {
    document.getElementById('documentSearch').value = '';
    document.getElementById('documentTypeFilter').value = '';
    document.getElementById('documentStatusFilter').value = '';
    filterDocuments();
}

function sortDocuments(column) {
    const tbody = document.getElementById('documentsTableBody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('.document-row'));
    documentSortOrder[column] = documentSortOrder[column] === 'asc' ? 'desc' : 'asc';
    const order = documentSortOrder[column];
    
    rows.sort((a, b) => {
        let aVal, bVal;
        if (column === 'student_name') {
            aVal = a.dataset.student;
            bVal = b.dataset.student;
        } else if (column === 'doc_type') {
            aVal = a.dataset.type;
            bVal = b.dataset.type;
        } else if (column === 'uploaded_at') {
            aVal = a.dataset.date || '9999-12-31';
            bVal = b.dataset.date || '9999-12-31';
        } else if (column === 'verified') {
            aVal = a.dataset.status;
            bVal = b.dataset.status;
        }
        
        if (order === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Audit Logs Page Filters
const auditSortOrder = {};

function filterAuditLogs() {
    const searchTerm = document.getElementById('auditSearch')?.value.toLowerCase() || '';
    const actionFilter = document.getElementById('auditActionFilter')?.value || '';
    const userFilter = document.getElementById('auditUserFilter')?.value || '';
    const dateFilter = document.getElementById('auditDateFilter')?.value || '';
    
    const rows = document.querySelectorAll('.audit-row');
    let visibleCount = 0;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    rows.forEach(row => {
        const user = row.dataset.user || '';
        const action = row.dataset.action || '';
        const details = row.dataset.details || '';
        const timestampStr = row.dataset.timestamp || '';
        
        const matchesSearch = user.includes(searchTerm) || action.includes(searchTerm) || details.includes(searchTerm);
        const matchesAction = !actionFilter || action === actionFilter.toLowerCase();
        const matchesUser = !userFilter || user === userFilter.toLowerCase();
        
        let matchesDate = true;
        if (dateFilter && timestampStr) {
            const timestamp = new Date(timestampStr);
            if (dateFilter === 'today') {
                matchesDate = timestamp >= today;
            } else if (dateFilter === 'yesterday') {
                matchesDate = timestamp >= yesterday && timestamp < today;
            } else if (dateFilter === 'this-week') {
                matchesDate = timestamp >= weekAgo;
            } else if (dateFilter === 'this-month') {
                matchesDate = timestamp >= monthStart;
            } else if (dateFilter === 'last-month') {
                matchesDate = timestamp >= lastMonthStart && timestamp <= lastMonthEnd;
            }
        }
        
        if (matchesSearch && matchesAction && matchesUser && matchesDate) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('auditCount');
    if (countEl) {
        countEl.textContent = `Showing ${visibleCount} log entr${visibleCount !== 1 ? 'ies' : 'y'}`;
    }
}

function clearAuditFilters() {
    document.getElementById('auditSearch').value = '';
    document.getElementById('auditActionFilter').value = '';
    document.getElementById('auditUserFilter').value = '';
    document.getElementById('auditDateFilter').value = '';
    filterAuditLogs();
}

function sortAuditLogs(column) {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('.audit-row'));
    auditSortOrder[column] = auditSortOrder[column] === 'asc' ? 'desc' : 'asc';
    const order = auditSortOrder[column];
    
    rows.sort((a, b) => {
        let aVal, bVal;
        if (column === 'timestamp') {
            aVal = a.dataset.timestamp || '9999-12-31';
            bVal = b.dataset.timestamp || '9999-12-31';
        } else if (column === 'user') {
            aVal = a.dataset.user;
            bVal = b.dataset.user;
        } else if (column === 'action') {
            aVal = a.dataset.action;
            bVal = b.dataset.action;
        } else if (column === 'details') {
            aVal = a.dataset.details;
            bVal = b.dataset.details;
        } else if (column === 'ip') {
            aVal = a.dataset.ip;
            bVal = b.dataset.ip;
        }
        
        if (order === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Password strength functions for admin user creation
function toggleCreateUserPassword() {
    const passwordInput = document.getElementById('createUserPassword');
    const toggleIcon = document.getElementById('createUserToggleIcon');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.textContent = '🙈';
    } else {
        passwordInput.type = 'password';
        toggleIcon.textContent = '👁️';
    }
}

function checkCreateUserPasswordStrength() {
    checkPasswordStrengthGeneric('createUserPassword', 'createUserPasswordStrength', 'create-strength-bar', 'create-strength-text');
}

function toggleCreateStudentPassword() {
    const passwordInput = document.getElementById('createStudentPassword');
    const toggleIcon = document.getElementById('createStudentToggleIcon');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.textContent = '🙈';
    } else {
        passwordInput.type = 'password';
        toggleIcon.textContent = '👁️';
    }
}

function checkCreateStudentPasswordStrength() {
    checkPasswordStrengthGeneric('createStudentPassword', 'createStudentPasswordStrength', 'student-strength-bar', 'student-strength-text');
}

function checkPasswordStrengthGeneric(inputId, containerId, barPrefix, textId) {
    const password = document.getElementById(inputId).value;
    const strengthContainer = document.getElementById(containerId);
    const strengthText = document.getElementById(textId);
    const bars = [
        document.getElementById(barPrefix + '-1'),
        document.getElementById(barPrefix + '-2'),
        document.getElementById(barPrefix + '-3'),
        document.getElementById(barPrefix + '-4')
    ];

    if (password.length === 0) {
        strengthContainer.style.display = 'none';
        return;
    }

    strengthContainer.style.display = 'block';

    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    
    // Complexity checks
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    // Cap at 4
    strength = Math.min(strength, 4);

    // Reset all bars
    bars.forEach(bar => bar.style.background = '#e5e7eb');

    // Update bars and text based on strength
    if (strength === 1) {
        bars[0].style.background = '#ef4444';
        strengthText.textContent = 'Weak';
        strengthText.style.color = '#ef4444';
    } else if (strength === 2) {
        bars[0].style.background = '#f59e0b';
        bars[1].style.background = '#f59e0b';
        strengthText.textContent = 'Fair';
        strengthText.style.color = '#f59e0b';
    } else if (strength === 3) {
        bars[0].style.background = '#fbbf24';
        bars[1].style.background = '#fbbf24';
        bars[2].style.background = '#fbbf24';
        strengthText.textContent = 'Good';
        strengthText.style.color = '#fbbf24';
    } else if (strength === 4) {
        bars[0].style.background = '#10b981';
        bars[1].style.background = '#10b981';
        bars[2].style.background = '#10b981';
        bars[3].style.background = '#10b981';
        strengthText.textContent = 'Strong';
        strengthText.style.color = '#10b981';
    }
}

// ================= USERS EXPORT =================
function showUsersExportDialog() {
    document.getElementById('modalTitle').textContent = 'Export Users';
    document.getElementById('modalBody').innerHTML = `
        <div style="padding: 10px;">
            <p style="margin-bottom: 20px; color: #555;">Select which fields you want to filter on before export. Leave unchecked to export all records.</p>
            
            <form id="usersExportFilterForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_name_email" id="filter_name_email" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Name/Email</span>
                        </label>
                        <div id="name_email_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <input type="text" name="name_email_search" class="form-control" placeholder="Search name or email..." id="export_name_email_input">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_role" id="filter_role" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Role</span>
                        </label>
                        <div id="role_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="role" class="form-control" id="export_role_select">
                                <option value="">Select role...</option>
                                <option value="Manager">Manager</option>
                                <option value="Admin">Admin</option>
                                <option value="Counsellor">Counsellor</option>
                                <option value="University Staff">University Staff</option>
                                <option value="Logistics Staff">Logistics Staff</option>
                                <option value="Student">Student</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_status" id="filter_status" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Status</span>
                        </label>
                        <div id="status_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="status" class="form-control" id="export_status_select">
                                <option value="">Select status...</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="executeUsersExport()">Export to CSV</button>
    `;
    
    openModal('genericModal');
    
    // Set up checkbox toggle handlers
    setupUsersExportCheckboxes();
}

function setupUsersExportCheckboxes() {
    const checkboxes = ['filter_name_email', 'filter_role', 'filter_status'];
    
    checkboxes.forEach(checkboxId => {
        const checkbox = document.getElementById(checkboxId);
        const optionsDiv = document.getElementById(checkboxId.replace('filter_', '') + '_filter_options');
        
        if (checkbox && optionsDiv) {
            checkbox.addEventListener('change', function() {
                optionsDiv.style.display = this.checked ? 'block' : 'none';
            });
        }
    });
}

async function executeUsersExport() {
    const form = document.getElementById('usersExportFilterForm');
    const formData = new FormData(form);
    
    // Build filter query
    const filters = {};
    
    if (formData.get('filter_name_email')) {
        filters.name_email_search = formData.get('name_email_search');
    }
    if (formData.get('filter_role')) {
        filters.role = formData.get('role');
    }
    if (formData.get('filter_status')) {
        filters.status = formData.get('status');
    }
    
    // Check if at least one filter is selected with a value
    const hasFilters = Object.values(filters).some(val => val);
    
    showLoading();
    
    try {
        // Fetch all users
        let endpoint = '/users';
        
        const data = await apiRequest(endpoint);
        showLoading(false);
        
        if (!data || !data.users) {
            showAlert('Failed to fetch users');
            return;
        }
        
        let users = data.users;
        
        // Apply filters if any are selected
        if (hasFilters) {
            users = users.filter(user => {
                let matches = true;
                
                // Filter by name/email
                if (filters.name_email_search && matches) {
                    const search = filters.name_email_search.toLowerCase();
                    const userName = (user.full_name || '').toLowerCase();
                    const userEmail = (user.email || '').toLowerCase();
                    matches = matches && (userName.includes(search) || userEmail.includes(search));
                }
                
                // Filter by role
                if (filters.role && matches) {
                    matches = matches && (user.role_name || '') === filters.role;
                }
                
                // Filter by status
                if (filters.status && matches) {
                    const userStatus = user.is_active ? 'active' : 'inactive';
                    matches = matches && userStatus === filters.status.toLowerCase();
                }
                
                return matches;
            });
        }
        
        // Check if we have any records to export
        if (users.length === 0) {
            showAlert('No users found matching the selected filters');
            return;
        }
        
        // Generate CSV from filtered users
        let csv = 'Name,Email,Role,Status,Created Date\n';
        
        users.forEach(user => {
            const name = user.full_name || 'N/A';
            const email = user.email || 'N/A';
            const role = user.role_name || 'N/A';
            const status = user.is_active ? 'Active' : 'Inactive';
            const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A';
            
            const data = [name, email, role, status, createdDate];
            csv += data.map(d => `"${d.replace(/"/g, '""')}"`).join(',') + '\n';
        });
        
        // Download CSV file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        
        closeModal('genericModal');
        showAlert(`Users exported successfully! (${users.length} records)`, 'success');
        
    } catch (error) {
        showLoading(false);
        console.error('Export error:', error);
        showAlert('Failed to export users');
    }
}

// ================= LOGISTICS EXPORT =================
function showLogisticsExportDialog() {
    document.getElementById('modalTitle').textContent = 'Export Logistics Records';
    document.getElementById('modalBody').innerHTML = `
        <div style="padding: 10px;">
            <p style="margin-bottom: 20px; color: #555;">Select which fields you want to filter on before export. Leave unchecked to export all records.</p>
            
            <form id="logisticsExportFilterForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_student" id="filter_student" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Student</span>
                        </label>
                        <div id="student_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <input type="text" name="student_name" class="form-control" placeholder="Search student name..." id="export_student_input">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_location" id="filter_location" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Location</span>
                        </label>
                        <div id="location_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <input type="text" name="location" class="form-control" placeholder="Search location..." id="export_location_input">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_accommodation" id="filter_accommodation" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Accommodation</span>
                        </label>
                        <div id="accommodation_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <input type="text" name="accommodation" class="form-control" placeholder="Search accommodation..." id="export_accommodation_input">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_log_status" id="filter_log_status" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Status</span>
                        </label>
                        <div id="log_status_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="log_status" class="form-control" id="export_log_status_select">
                                <option value="">Select status...</option>
                                <option value="Pending">Pending</option>
                                <option value="Arrived">Arrived</option>
                                <option value="Accommodation">Accommodation</option>
                                <option value="Medical Check Process">Medical Check Process</option>
                                <option value="Completed">Completed</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_log_date" id="filter_log_date" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Date Range</span>
                        </label>
                        <div id="log_date_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="log_date_range" class="form-control" id="export_log_date_select">
                                <option value="">Select date range...</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="past">Past</option>
                                <option value="this-week">This Week</option>
                                <option value="this-month">This Month</option>
                            </select>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="executeLogisticsExport()">Export to CSV</button>
    `;
    
    openModal('genericModal');
    
    // Set up checkbox toggle handlers
    setupLogisticsExportCheckboxes();
}

function setupLogisticsExportCheckboxes() {
    const checkboxes = ['filter_student', 'filter_location', 'filter_accommodation', 'filter_log_status', 'filter_log_date'];
    
    checkboxes.forEach(checkboxId => {
        const checkbox = document.getElementById(checkboxId);
        const optionsDiv = document.getElementById(checkboxId.replace('filter_', '') + '_filter_options');
        
        if (checkbox && optionsDiv) {
            checkbox.addEventListener('change', function() {
                optionsDiv.style.display = this.checked ? 'block' : 'none';
            });
        }
    });
}

async function executeLogisticsExport() {
    const form = document.getElementById('logisticsExportFilterForm');
    const formData = new FormData(form);
    
    // Build filter query
    const filters = {};
    
    if (formData.get('filter_student')) {
        filters.student_name = formData.get('student_name');
    }
    if (formData.get('filter_location')) {
        filters.location = formData.get('location');
    }
    if (formData.get('filter_accommodation')) {
        filters.accommodation = formData.get('accommodation');
    }
    if (formData.get('filter_log_status')) {
        filters.log_status = formData.get('log_status');
    }
    if (formData.get('filter_log_date')) {
        filters.log_date_range = formData.get('log_date_range');
    }
    
    // Check if at least one filter is selected with a value
    const hasFilters = Object.values(filters).some(val => val);
    
    showLoading();
    
    try {
        // Fetch all logistics records
        let endpoint = '/logistics?limit=10000';
        
        const data = await apiRequest(endpoint);
        showLoading(false);
        
        if (!data || !data.logistics) {
            showAlert('Failed to fetch logistics records');
            return;
        }
        
        let logistics = data.logistics;
        
        // Apply filters if any are selected
        if (hasFilters) {
            logistics = logistics.filter(log => {
                let matches = true;
                
                // Filter by student
                if (filters.student_name && matches) {
                    const search = filters.student_name.toLowerCase();
                    const studentName = (log.student_name || '').toLowerCase();
                    matches = matches && studentName.includes(search);
                }
                
                // Filter by location
                if (filters.location && matches) {
                    const search = filters.location.toLowerCase();
                    const location = (log.pickup_location || '').toLowerCase();
                    matches = matches && location.includes(search);
                }
                
                // Filter by accommodation
                if (filters.accommodation && matches) {
                    const search = filters.accommodation.toLowerCase();
                    const accommodation = (log.accommodation || '').toLowerCase();
                    matches = matches && accommodation.includes(search);
                }
                
                // Filter by status
                if (filters.log_status && matches) {
                    matches = matches && (log.arrival_status || '') === filters.log_status;
                }
                
                // Filter by date range
                if (filters.log_date_range && matches) {
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    
                    const arrivalDate = new Date(log.arrival_date);
                    
                    if (filters.log_date_range === 'upcoming') {
                        matches = matches && arrivalDate >= today;
                    } else if (filters.log_date_range === 'past') {
                        matches = matches && arrivalDate < today;
                    } else if (filters.log_date_range === 'this-week') {
                        matches = matches && arrivalDate >= weekAgo;
                    } else if (filters.log_date_range === 'this-month') {
                        matches = matches && arrivalDate >= monthStart;
                    }
                }
                
                return matches;
            });
        }
        
        // Check if we have any records to export
        if (logistics.length === 0) {
            showAlert('No logistics records found matching the selected filters');
            return;
        }
        
        // Generate CSV from filtered logistics
        let csv = 'Student Name,Pickup Location,Accommodation,Status,Arrival Date,Notes\n';
        
        logistics.forEach(log => {
            const studentName = log.student_name || 'N/A';
            const location = log.pickup_location || 'N/A';
            const accommodation = log.accommodation || 'N/A';
            const status = log.arrival_status || 'N/A';
            const arrivalDate = log.arrival_date ? new Date(log.arrival_date).toLocaleDateString() : 'N/A';
            const notes = log.flight_details || '';
            
            const data = [studentName, location, accommodation, status, arrivalDate, notes];
            csv += data.map(d => `"${d.replace(/"/g, '""')}"`).join(',') + '\n';
        });
        
        // Download CSV file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `logistics_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        
        closeModal('genericModal');
        showAlert(`Logistics records exported successfully! (${logistics.length} records)`, 'success');
        
    } catch (error) {
        showLoading(false);
        console.error('Export error:', error);
        showAlert('Failed to export logistics records');
    }
}

// ================= UNIVERSITIES EXPORT =================
async function executeUniversitiesExport() {
    showLoading();
    
    try {
        // Fetch all universities
        const data = await apiRequest('/universities?limit=10000');
        showLoading(false);
        
        if (!data || !data.universities) {
            showAlert('Failed to fetch universities');
            return;
        }
        
        const universities = data.universities;
        
        // Check if we have any records to export
        if (universities.length === 0) {
            showAlert('No universities found');
            return;
        }
        
        // Generate CSV from universities
        let csv = 'University Name,Country,Contact Email,Created Date\n';
        
        universities.forEach(uni => {
            const name = uni.name || 'N/A';
            const country = uni.country || 'N/A';
            const email = uni.contact_email || 'N/A';
            const createdDate = uni.created_at ? new Date(uni.created_at).toLocaleDateString() : 'N/A';
            
            const data = [name, country, email, createdDate];
            csv += data.map(d => `"${d.replace(/"/g, '""')}"`).join(',') + '\n';
        });
        
        // Download CSV file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `universities_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        
        showAlert(`Universities exported successfully! (${universities.length} records)`, 'success');
        
    } catch (error) {
        showLoading(false);
        console.error('Export error:', error);
        showAlert('Failed to export universities');
    }
}

// ================= APPLICATIONS EXPORT =================
function showApplicationsExportDialog() {
    document.getElementById('modalTitle').textContent = 'Export Applications';
    document.getElementById('modalBody').innerHTML = `
        <div style="padding: 10px;">
            <p style="margin-bottom: 20px; color: #555;">Select which fields you want to filter on before export. Leave unchecked to export all records.</p>
            
            <form id="applicationsExportFilterForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_app_student" id="filter_app_student" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Student</span>
                        </label>
                        <div id="app_student_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <input type="text" name="app_student_name" class="form-control" placeholder="Search student name..." id="export_app_student_input">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_app_university" id="filter_app_university" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">University</span>
                        </label>
                        <div id="app_university_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="app_university" class="form-control" id="export_app_university_select">
                                <option value="">Select university...</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_app_status" id="filter_app_status" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Status</span>
                        </label>
                        <div id="app_status_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="app_status" class="form-control" id="export_app_status_select">
                                <option value="">Select status...</option>
                                <option value="Draft">Draft</option>
                                <option value="Pending Submission">Pending Submission</option>
                                <option value="Forwarded to University">Forwarded to University</option>
                                <option value="Missing Documents - In Review">Missing Documents</option>
                                <option value="Decision: Accepted">Accepted</option>
                                <option value="Decision: Rejected">Rejected</option>
                                <option value="Decision: Conditional">Conditional</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_app_date" id="filter_app_date" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Date Range</span>
                        </label>
                        <div id="app_date_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="app_date_range" class="form-control" id="export_app_date_select">
                                <option value="">Select date range...</option>
                                <option value="this-week">This Week</option>
                                <option value="this-month">This Month</option>
                                <option value="this-year">This Year</option>
                            </select>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="executeApplicationsExport()">Export to CSV</button>
    `;
    
    openModal('genericModal');
    
    // Set up checkbox toggle handlers
    setupApplicationsExportCheckboxes();
    
    // Populate university dropdown
    populateApplicationsExportOptions();
}

function setupApplicationsExportCheckboxes() {
    const checkboxes = ['filter_app_student', 'filter_app_university', 'filter_app_status', 'filter_app_date'];
    
    checkboxes.forEach(checkboxId => {
        const checkbox = document.getElementById(checkboxId);
        const optionsDiv = document.getElementById(checkboxId.replace('filter_', '') + '_filter_options');
        
        if (checkbox && optionsDiv) {
            checkbox.addEventListener('change', function() {
                optionsDiv.style.display = this.checked ? 'block' : 'none';
            });
        }
    });
}

function populateApplicationsExportOptions() {
    // Get all visible rows from the current table
    const rows = document.querySelectorAll('.application-row');
    
    // Extract unique universities
    const universities = new Set();
    
    rows.forEach(row => {
        const university = row.dataset.university;
        if (university) universities.add(university);
    });
    
    // Populate university select
    const universitySelect = document.getElementById('export_app_university_select');
    Array.from(universities).sort().forEach(university => {
        const option = document.createElement('option');
        option.value = university;
        option.textContent = university;
        universitySelect.appendChild(option);
    });
}

async function executeApplicationsExport() {
    const form = document.getElementById('applicationsExportFilterForm');
    const formData = new FormData(form);
    
    // Build filter query
    const filters = {};
    
    if (formData.get('filter_app_student')) {
        filters.app_student_name = formData.get('app_student_name');
    }
    if (formData.get('filter_app_university')) {
        filters.app_university = formData.get('app_university');
    }
    if (formData.get('filter_app_status')) {
        filters.app_status = formData.get('app_status');
    }
    if (formData.get('filter_app_date')) {
        filters.app_date_range = formData.get('app_date_range');
    }
    
    // Check if at least one filter is selected with a value
    const hasFilters = Object.values(filters).some(val => val);
    
    showLoading();
    
    try {
        // Fetch all applications
        let endpoint = '/applications?limit=10000';
        
        const data = await apiRequest(endpoint);
        showLoading(false);
        
        if (!data || !data.applications) {
            showAlert('Failed to fetch applications');
            return;
        }
        
        let applications = data.applications;
        
        // Apply filters if any are selected
        if (hasFilters) {
            applications = applications.filter(app => {
                let matches = true;
                
                // Filter by student
                if (filters.app_student_name && matches) {
                    const search = filters.app_student_name.toLowerCase();
                    const studentName = (app.student_name || '').toLowerCase();
                    matches = matches && studentName.includes(search);
                }
                
                // Filter by university
                if (filters.app_university && matches) {
                    matches = matches && (app.university_name || '') === filters.app_university;
                }
                
                // Filter by status
                if (filters.app_status && matches) {
                    matches = matches && (app.status || '') === filters.app_status;
                }
                
                // Filter by date range
                if (filters.app_date_range && matches) {
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    const yearStart = new Date(now.getFullYear(), 0, 1);
                    
                    const submittedDate = new Date(app.submitted_at);
                    
                    if (filters.app_date_range === 'this-week') {
                        matches = matches && submittedDate >= weekAgo;
                    } else if (filters.app_date_range === 'this-month') {
                        matches = matches && submittedDate >= monthStart;
                    } else if (filters.app_date_range === 'this-year') {
                        matches = matches && submittedDate >= yearStart;
                    }
                }
                
                return matches;
            });
        }
        
        // Check if we have any records to export
        if (applications.length === 0) {
            showAlert('No applications found matching the selected filters');
            return;
        }
        
        // Generate CSV from filtered applications
        let csv = 'Student Name,University,Program,Status,Submitted Date,Decision Notes\n';
        
        applications.forEach(app => {
            const studentName = app.student_name || 'N/A';
            const university = app.university_name || 'N/A';
            const program = app.program_name || 'N/A';
            const status = app.status || 'N/A';
            const submittedDate = app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 'N/A';
            const decisionNotes = app.decision_notes || '';
            
            const data = [studentName, university, program, status, submittedDate, decisionNotes];
            csv += data.map(d => `"${d.replace(/"/g, '""')}"`).join(',') + '\n';
        });
        
        // Download CSV file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `applications_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        
        closeModal('genericModal');
        showAlert(`Applications exported successfully! (${applications.length} records)`, 'success');
        
    } catch (error) {
        showLoading(false);
        console.error('Export error:', error);
        showAlert('Failed to export applications');
    }
}

// ================= STUDENTS EXPORT =================
function showStudentsExportDialog() {
    document.getElementById('modalTitle').textContent = 'Export Students';
    document.getElementById('modalBody').innerHTML = `
        <div style="padding: 10px;">
            <p style="margin-bottom: 20px; color: #555;">Select which fields you want to filter on before export. Leave unchecked to export all records.</p>
            
            <form id="studentsExportFilterForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_student_name" id="filter_student_name" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Name/Email</span>
                        </label>
                        <div id="student_name_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <input type="text" name="student_name_search" class="form-control" placeholder="Search name or email..." id="export_student_name_input">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_student_status" id="filter_student_status" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Status</span>
                        </label>
                        <div id="student_status_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="student_status" class="form-control" id="export_student_status_select">
                                <option value="">Select status...</option>
                                <option value="Incomplete Profile">Incomplete Profile</option>
                                <option value="Assigned to Counsellor">Assigned to Counsellor</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Submitted">Submitted</option>
                                <option value="Accepted">Accepted</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_student_country" id="filter_student_country" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Country</span>
                        </label>
                        <div id="student_country_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="student_country" class="form-control" id="export_student_country_select">
                                <option value="">Select country...</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" name="filter_student_counsellor" id="filter_student_counsellor" style="cursor: pointer; width: 18px; height: 18px;">
                            <span style="font-weight: 600;">Counsellor</span>
                        </label>
                        <div id="student_counsellor_filter_options" style="display: none; margin-top: 10px; padding-left: 28px;">
                            <select name="student_counsellor" class="form-control" id="export_student_counsellor_select">
                                <option value="">Select counsellor...</option>
                                <option value="unassigned">Unassigned</option>
                            </select>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
        <button class="btn btn-primary" onclick="executeStudentsExport()">Export to CSV</button>
    `;
    
    openModal('genericModal');
    
    // Set up checkbox toggle handlers
    setupStudentsExportCheckboxes();
    
    // Populate filter dropdowns with available values
    populateStudentsExportOptions();
}

function setupStudentsExportCheckboxes() {
    const checkboxes = ['filter_student_name', 'filter_student_status', 'filter_student_country', 'filter_student_counsellor'];
    
    checkboxes.forEach(checkboxId => {
        const checkbox = document.getElementById(checkboxId);
        const optionsDiv = document.getElementById(checkboxId.replace('filter_', '') + '_filter_options');
        
        if (checkbox && optionsDiv) {
            checkbox.addEventListener('change', function() {
                optionsDiv.style.display = this.checked ? 'block' : 'none';
            });
        }
    });
}

function populateStudentsExportOptions() {
    // Get all visible rows from the current table
    const rows = document.querySelectorAll('.student-row');
    
    // Extract unique countries and counsellors
    const countries = new Set();
    const counsellors = new Set();
    
    rows.forEach(row => {
        const country = row.dataset.country;
        const counsellor = row.dataset.counsellor;
        if (country) countries.add(country);
        if (counsellor) counsellors.add(counsellor);
    });
    
    // Populate country select
    const countrySelect = document.getElementById('export_student_country_select');
    Array.from(countries).sort().forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        countrySelect.appendChild(option);
    });
    
    // Populate counsellor select
    const counsellorSelect = document.getElementById('export_student_counsellor_select');
    Array.from(counsellors).sort().forEach(counsellor => {
        const option = document.createElement('option');
        option.value = counsellor;
        option.textContent = counsellor === 'unassigned' ? 'Unassigned' : counsellor;
        counsellorSelect.appendChild(option);
    });
}

async function executeStudentsExport() {
    const form = document.getElementById('studentsExportFilterForm');
    const formData = new FormData(form);
    
    // Build filter query
    const filters = {};
    
    if (formData.get('filter_student_name')) {
        filters.student_name_search = formData.get('student_name_search');
    }
    if (formData.get('filter_student_status')) {
        filters.student_status = formData.get('student_status');
    }
    if (formData.get('filter_student_country')) {
        filters.student_country = formData.get('student_country');
    }
    if (formData.get('filter_student_counsellor')) {
        filters.student_counsellor = formData.get('student_counsellor');
    }
    
    // Check if at least one filter is selected with a value
    const hasFilters = Object.values(filters).some(val => val);
    
    showLoading();
    
    try {
        // Fetch all students
        const data = await apiRequest('/students');
        showLoading(false);
        
        if (!data || !data.students) {
            showAlert('Failed to fetch students');
            return;
        }
        
        let students = data.students;
        
        // Apply filters if any are selected
        if (hasFilters) {
            students = students.filter(student => {
                let matches = true;
                
                // Filter by name/email
                if (filters.student_name_search && matches) {
                    const search = filters.student_name_search.toLowerCase();
                    const studentName = (student.full_name || '').toLowerCase();
                    const studentEmail = (student.email || '').toLowerCase();
                    matches = matches && (studentName.includes(search) || studentEmail.includes(search));
                }
                
                // Filter by status
                if (filters.student_status && matches) {
                    matches = matches && (student.application_status || '') === filters.student_status;
                }
                
                // Filter by country
                if (filters.student_country && matches) {
                    matches = matches && (student.preferred_country || '') === filters.student_country;
                }
                
                // Filter by counsellor
                if (filters.student_counsellor && matches) {
                    const studentCounsellor = (student.counsellor_name || 'unassigned').toLowerCase();
                    matches = matches && studentCounsellor === filters.student_counsellor.toLowerCase();
                }
                
                return matches;
            });
        }
        
        // Check if we have any records to export
        if (students.length === 0) {
            showAlert('No students found matching the selected filters');
            return;
        }
        
        // Generate CSV from filtered students
        let csv = 'Name,Email,Nationality,Preferred Country,Program Interest,Status,Counsellor,Logistics Staff\n';
        
        students.forEach(student => {
            const name = student.full_name || 'N/A';
            const email = student.email || 'N/A';
            const nationality = student.nationality || 'N/A';
            const country = student.preferred_country || 'N/A';
            const program = student.program_interest || 'N/A';
            const status = student.application_status || 'N/A';
            const counsellor = student.counsellor_name || 'Unassigned';
            const logistics = student.logistics_name || 'Unassigned';
            
            const data = [name, email, nationality, country, program, status, counsellor, logistics];
            csv += data.map(d => `"${d.replace(/"/g, '""')}"`).join(',') + '\n';
        });
        
        // Download CSV file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `students_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        
        closeModal('genericModal');
        showAlert(`Students exported successfully! (${students.length} records)`, 'success');
        
    } catch (error) {
        showLoading(false);
        console.error('Export error:', error);
        showAlert('Failed to export students');
    }
}

