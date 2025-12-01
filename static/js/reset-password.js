// Reset Password JavaScript

// Dynamically detect the API URL based on current host
const API_URL = `${window.location.protocol}//${window.location.host}/api`;

function showAlert(message, type = 'error') {
    const alertContainer = document.getElementById('alert-container');
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    
    alertContainer.innerHTML = `
        <div class="alert ${alertClass}">
            ${message}
        </div>
    `;
    
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 5000);
}

function setButtonLoading(isLoading) {
    const btnText = document.getElementById('btnText');
    const btnLoading = document.getElementById('btnLoading');
    const submitBtn = document.querySelector('button[type="submit"]');
    
    if (isLoading) {
        btnText.classList.add('hidden');
        btnLoading.classList.remove('hidden');
        submitBtn.disabled = true;
    } else {
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

// Get token from URL
function getTokenFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token');
}

// Handle Reset Password Form
const resetPasswordForm = document.getElementById('resetPasswordForm');
if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const password = document.getElementById('password').value;
        const confirm_password = document.getElementById('confirm_password').value;
        const token = getTokenFromURL();
        
        if (!token) {
            showAlert('Invalid or missing reset token');
            return;
        }
        
        if (password !== confirm_password) {
            showAlert('Passwords do not match');
            return;
        }
        
        if (password.length < 6) {
            showAlert('Password must be at least 6 characters');
            return;
        }
        
        setButtonLoading(true);
        
        try {
            const response = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, password }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showAlert('Password reset successful! Redirecting to login...', 'success');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                showAlert(data.error || 'Password reset failed');
                setButtonLoading(false);
            }
        } catch (error) {
            console.error('Reset password error:', error);
            showAlert('An error occurred. Please try again.');
            setButtonLoading(false);
        }
    });
}
