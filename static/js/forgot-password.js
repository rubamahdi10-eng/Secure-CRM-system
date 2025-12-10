// Forgot Password JavaScript

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

function showStep1() {
    document.getElementById('step1').classList.remove('hidden');
    document.getElementById('step2').classList.add('hidden');
}

function showStep2() {
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.remove('hidden');
}

// Handle Forgot Password Form
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        
        setButtonLoading(true);
        
        try {
            const response = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Show success step even if email doesn't exist (security)
                showStep2();
            } else {
                // Show success anyway to prevent email enumeration
                showStep2();
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            // Show success anyway to prevent email enumeration
            showStep2();
        }
        
        setButtonLoading(false);
    });
}
