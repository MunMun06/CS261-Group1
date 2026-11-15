document.addEventListener('DOMContentLoaded', () => {
    console.log("Login script loaded");

    // 1. Tab Switching Logic
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove 'active' class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add 'active' class to the clicked tab
            this.classList.add('active');
        });
    });

    // 2. Password Visibility Toggle Logic
    const togglePasswordIcons = document.querySelectorAll('.toggle-password');
    
    togglePasswordIcons.forEach(icon => {
        icon.addEventListener('click', function() {
            // Find the associated password input field.
            // Assuming the icon and input are siblings within the same container.
            const passwordInput = this.parentElement.querySelector('input');
            
            if (passwordInput && passwordInput.tagName === 'INPUT') {
                // Toggle input type between 'password' and 'text'
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    // Update icon to eye-slash (assuming FontAwesome classes)
                    this.classList.remove('fa-eye');
                    this.classList.add('fa-eye-slash'); 
                } else {
                    passwordInput.type = 'password';
                    // Update icon back to eye (assuming FontAwesome classes)
                    this.classList.remove('fa-eye-slash');
                    this.classList.add('fa-eye'); 
                }
            }
        });
    });
});