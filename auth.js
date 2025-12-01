// Authentication JavaScript

// Dynamically detect the API URL based on current host
const API_URL = `${window.location.protocol}//${window.location.host}/api`;

console.log('API URL:', API_URL); // For debugging

// Show alert message
function showAlert(message, type = 'error') {
    const alertContainer = document.getElementById('alert-container');
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    
    alertContainer.innerHTML = `
        <div class="alert ${alertClass}">
            ${message}
        </div>
    `;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 5000);
}

// Set button loading state
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

// Handle Login
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        setButtonLoading(true);
        
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Store token and user info
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                showAlert('Login successful! Redirecting...', 'success');
                
                // Redirect to dashboard after 1 second
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                showAlert(data.error || 'Login failed');
                setButtonLoading(false);
            }
        } catch (error) {
            console.error('Login error:', error);
            showAlert('An error occurred. Please try again.');
            setButtonLoading(false);
        }
    });
}

// Handle Registration
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const full_name = document.getElementById('full_name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirm_password = document.getElementById('confirm_password').value;
        
        // Validate passwords match
        if (password !== confirm_password) {
            showAlert('Passwords do not match');
            return;
        }
        
        setButtonLoading(true);
        
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ full_name, email, password }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showAlert('Registration successful! Redirecting to login...', 'success');
                
                // Redirect to login after 2 seconds
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                showAlert(data.error || 'Registration failed');
                setButtonLoading(false);
            }
        } catch (error) {
            console.error('Registration error:', error);
            showAlert('An error occurred. Please try again.');
            setButtonLoading(false);
        }
    });
}
