// ============================================
// THARBIYYA - Prayer Tracker
// 5 Daily Prayers Tracker
// Values: Adā' = 2, Qaḍā' = 1, No = 0
// Order: Subh, Zuhr, Asr, Magrib, Isha
// ============================================

// 🌐 Global Variables
let currentUser = null;
let currentClassSheet = null;
let currentDate = null;

// Google Sheets CSV URL for user credentials
const USER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSSOGrONCLJ53Hf3jKE7VA7ro-yZmlzc_lFy9CxKvL_8VBuXRQp7hZxLjUpy0wmf28TYAn2HQ-uaV5r/pub?gid=0&single=true&output=csv";

// =============================
// 📊 Google Sheets API Configuration
// =============================
class GoogleSheetsAPI {
    constructor() {
        // IMPORTANT: Replace this URL with your Google Apps Script Web App URL
        this.apiUrl = "https://script.google.com/macros/s/AKfycbxyskFl5im3KbMks256GgowmoqfsNtyA10OF5vbEZ1V2K0dZ55V4204qAxNFtunmvQx/exec";
    }

    async addPrayerRecord(sheetName, rowData) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    action: "addRecord",
                    sheet: sheetName,
                    data: JSON.stringify(rowData)
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error adding record:', error);
            return { error: error.message };
        }
    }

    async checkExistingRecord(sheetName, date, name) {
        try {
            const response = await fetch(`${this.apiUrl}?action=getRecord&sheet=${encodeURIComponent(sheetName)}&date=${encodeURIComponent(date)}&name=${encodeURIComponent(name)}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error checking existing record:', error);
            return { error: error.message };
        }
    }

    async ensureSheetExists(sheetName) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    action: "ensureSheet",
                    sheet: sheetName
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error ensuring sheet exists:', error);
            return { error: error.message };
        }
    }
}

const api = new GoogleSheetsAPI();

// =============================
// 📥 Load User Data from CSV
// =============================
async function loadUsersFromCSV() {
    try {
        const response = await fetch(USER_CSV_URL);
        const csvText = await response.text();
        
        // Parse CSV
        const rows = csvText.split('\n');
        const headers = rows[0].split(',');
        
        // Find column indices
        const nameIndex = headers.findIndex(h => h.toLowerCase().trim() === 'name');
        const pswdIndex = headers.findIndex(h => h.toLowerCase().trim() === 'pswd');
        const classIndex = headers.findIndex(h => h.toLowerCase().trim() === 'class');
        
        if (nameIndex === -1 || pswdIndex === -1 || classIndex === -1) {
            console.error('CSV headers not found. Expected: name, pswd, class');
            return [];
        }
        
        const users = [];
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i].trim() === '') continue;
            
            // Parse CSV line (handling quoted values)
            let row = rows[i];
            let values = [];
            let inQuote = false;
            let currentValue = '';
            
            for (let char of row) {
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    values.push(currentValue.trim());
                    currentValue = '';
                } else {
                    currentValue += char;
                }
            }
            values.push(currentValue.trim());
            
            // Remove quotes from values
            values = values.map(v => v.replace(/^"|"$/g, ''));
            
            const name = values[nameIndex];
            const pswd = values[pswdIndex];
            const userClass = values[classIndex];
            
            if (name && pswd && userClass) {
                users.push({
                    name: name,
                    password: pswd,
                    class: userClass
                });
            }
        }
        
        return users;
    } catch (error) {
        console.error('Error loading users from CSV:', error);
        return [];
    }
}

// =============================
// 🔑 Login Functions
// =============================

// Load student names on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadStudentNames();
    
    // Set current date
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('currentDateDisplay').textContent = formattedDate;
    currentDate = today.toISOString().split('T')[0];
    
    // Initialize prayer option buttons
    initializePrayerOptions();
    
    // Add login form submit listener
    document.getElementById('loginForm').addEventListener('submit', login);
    
    // Add prayer form submit listener
    document.getElementById('prayerForm').addEventListener('submit', submitPrayerForm);
    
    // Add class dropdown change listener to filter names
    document.getElementById('studentClass').addEventListener('change', filterNamesByClass);
});

async function loadStudentNames() {
    const users = await loadUsersFromCSV();
    window.allUsers = users; // Store globally for filtering
    
    const nameSelect = document.getElementById('studentName');
    nameSelect.innerHTML = '<option value="" disabled selected>-- First Select Class --</option>';
}

function populateNameDropdown(users) {
    const nameSelect = document.getElementById('studentName');
    const currentValue = nameSelect.value;
    
    nameSelect.innerHTML = '<option value="" disabled selected>-- Select Student Name --</option>';
    
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        option.textContent = `${user.name}`;
        option.dataset.class = user.class;
        option.dataset.password = user.password;
        nameSelect.appendChild(option);
    });
    
    if (currentValue && [...nameSelect.options].some(opt => opt.value === currentValue)) {
        nameSelect.value = currentValue;
    }
}

function filterNamesByClass() {
    const selectedClass = document.getElementById('studentClass').value;
    const nameSelect = document.getElementById('studentName');
    const passwordInput = document.getElementById('password');
    
    // Clear password field when class changes
    passwordInput.value = '';
    
    if (!selectedClass) {
        nameSelect.innerHTML = '<option value="" disabled selected>-- First Select Class --</option>';
        nameSelect.disabled = false;
        return;
    }
    
    const filteredUsers = (window.allUsers || []).filter(user => user.class === selectedClass);
    
    if (filteredUsers.length === 0) {
        nameSelect.innerHTML = '<option value="" disabled selected>-- No students found in this class --</option>';
        nameSelect.disabled = false;
    } else {
        nameSelect.innerHTML = '<option value="" disabled selected>-- Select Student Name --</option>';
        filteredUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.name;
            option.textContent = `${user.name}`;
            option.dataset.class = user.class;
            option.dataset.password = user.password;
            nameSelect.appendChild(option);
        });
        nameSelect.disabled = false;
    }
}

async function login(event) {
    event.preventDefault();
    
    const selectedOption = document.getElementById('studentName').selectedOptions[0];
    const studentName = document.getElementById('studentName').value;
    const studentClass = document.getElementById('studentClass').value;
    const password = document.getElementById('password').value;
    
    // Hide previous error
    hideLoginError();
    
    if (!studentClass) {
        showLoginError('Please select a class');
        return;
    }
    
    if (!studentName) {
        showLoginError('Please select a student name');
        return;
    }
    
    if (!password) {
        showLoginError('Please enter your password');
        return;
    }
    
    // Get the stored password from the selected option
    const storedPassword = selectedOption ? selectedOption.dataset.password : null;
    
    if (!storedPassword) {
        showLoginError('Invalid student selection');
        return;
    }
    
    if (password !== storedPassword) {
        showLoginError('Invalid password');
        return;
    }
    
    // Show loading state
    const submitBtn = document.querySelector('#loginForm .submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
    submitBtn.disabled = true;
    
    try {
        // Login successful
        currentUser = {
            name: studentName,
            class: studentClass,
            password: password
        };
        
        // Set current sheet name based on class
        currentClassSheet = `Class_${studentClass}`;
        
        // Ensure sheet exists
        await api.ensureSheetExists(currentClassSheet);
        
        // Show dashboard
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('dashboardPage').classList.remove('hidden');
        
        // Update UI
        document.getElementById('userNameDisplay').textContent = currentUser.name;
        document.getElementById('userClassDisplay').textContent = `Class ${currentUser.class}`;
        
        // Clear password field
        document.getElementById('password').value = '';
        
        // Check if already submitted for today
        await checkTodaySubmission();
        
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Login failed. Please try again.');
    } finally {
        // Restore button state
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.querySelector('span').textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideLoginError() {
    document.getElementById('loginError').classList.add('hidden');
}

function logout() {
    currentUser = null;
    currentClassSheet = null;
    
    // Reset forms
    document.getElementById('loginForm').reset();
    resetPrayerForm();
    
    // Reset name dropdown to initial state
    const nameSelect = document.getElementById('studentName');
    nameSelect.innerHTML = '<option value="" disabled selected>-- First Select Class --</option>';
    
    // Show login page
    document.getElementById('dashboardPage').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
}

// =============================
// 🕌 Prayer Form Functions
// =============================

function initializePrayerOptions() {
    // Delegate event listener for prayer options
    document.addEventListener('click', function(e) {
        const option = e.target.closest('.prayer-option');
        if (!option) return;
        
        const optionsContainer = option.closest('.prayer-options');
        if (!optionsContainer) return;
        
        // Get all options in this container
        const options = optionsContainer.querySelectorAll('.prayer-option');
        const prayerName = optionsContainer.dataset.prayer;
        
        // Remove selected class from all options
        options.forEach(opt => {
            opt.classList.remove('selected');
        });
        
        // Add selected class to clicked option
        option.classList.add('selected');
        
        // Update hidden input value with the numeric value (2, 1, or 0)
        if (prayerName) {
            const hiddenInput = document.getElementById(prayerName);
            if (hiddenInput) {
                hiddenInput.value = option.dataset.value;
                console.log(`${prayerName} set to: ${option.dataset.value} (${option.querySelector('span')?.innerText || 'Unknown'})`);
            }
        }
    });
}

function resetPrayerForm() {
    // Reset all prayer options
    document.querySelectorAll('.prayer-options').forEach(container => {
        const options = container.querySelectorAll('.prayer-option');
        const prayerName = container.dataset.prayer;
        
        options.forEach(opt => {
            opt.classList.remove('selected');
        });
        
        // Clear hidden input
        if (prayerName) {
            const hiddenInput = document.getElementById(prayerName);
            if (hiddenInput) hiddenInput.value = '';
        }
    });
    
    // Enable submit button
    const submitBtn = document.getElementById('submitPrayerBtn');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-save"></i> Submit Today\'s Prayers';
}

// Custom Alert Popup Function
function showAlertPopup(message) {
    // Remove any existing alert
    const existingAlert = document.querySelector('.custom-alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    // Create alert popup
    const alertDiv = document.createElement('div');
    alertDiv.className = 'custom-alert';
    alertDiv.innerHTML = `
        <div class="custom-alert-content">
            <div class="custom-alert-icon">
                <i class="fas fa-check-circle"></i>
            </div>
            <div class="custom-alert-title">Success!</div>
            <div class="custom-alert-message">${message}</div>
            <button class="custom-alert-btn" onclick="this.closest('.custom-alert').remove()">OK</button>
        </div>
    `;
    
    document.body.appendChild(alertDiv);
}

async function checkTodaySubmission() {
    try {
        const result = await api.checkExistingRecord(currentClassSheet, currentDate, currentUser.name);
        
        if (result && result.success && result.data) {
            // Load existing data
            const data = result.data;
            
            // Map prayer values (data from sheet should be 2, 1, or 0)
            const prayerMapping = {
                subh: data.subh,
                zuhr: data.zuhr,
                asr: data.asr,
                magrib: data.magrib,
                isha: data.isha
            };
            
            // Set prayer values
            for (const [prayer, value] of Object.entries(prayerMapping)) {
                if (value !== undefined && value !== null && value !== '') {
                    const container = document.querySelector(`[data-prayer="${prayer}"]`);
                    const option = container?.querySelector(`[data-value="${value}"]`);
                    if (option) {
                        option.click();
                        console.log(`Loaded ${prayer}: ${value}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error checking existing submission:', error);
    }
}

async function submitPrayerForm(event) {
    event.preventDefault();
    
    // Get all prayer values (these are numeric: 2, 1, or 0)
    const subh = document.getElementById('subh').value;
    const zuhr = document.getElementById('zuhr').value;
    const asr = document.getElementById('asr').value;
    const magrib = document.getElementById('magrib').value;
    const isha = document.getElementById('isha').value;
    
    // Validate all prayers are selected
    if (!subh || !zuhr || !asr || !magrib || !isha) {
        alert('Please select status for all 5 prayers');
        return;
    }
    
    // Show loading state
    const submitBtn = document.getElementById('submitPrayerBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;
    
    try {
        // Get current date and time
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('en-GB');
        
        // Prepare row data: date, time, name, class, subh, zuhr, asr, magrib, isha
        // Values are numeric: 2 = Adā', 1 = Qaḍā', 0 = No
        const rowData = [
            dateStr, 
            timeStr, 
            currentUser.name, 
            currentUser.class, 
            subh,   // This will be "2", "1", or "0"
            zuhr,   // This will be "2", "1", or "0"
            asr,    // This will be "2", "1", or "0"
            magrib, // This will be "2", "1", or "0"
            isha    // This will be "2", "1", or "0"
        ];
        
        console.log('Submitting prayer data:', {
            date: dateStr,
            time: timeStr,
            name: currentUser.name,
            class: currentUser.class,
            subh: subh,
            zuhr: zuhr,
            asr: asr,
            magrib: magrib,
            isha: isha
        });
        
        // Add record to sheet
        const result = await api.addPrayerRecord(currentClassSheet, rowData);
        
        if (result && result.success) {
            // Show custom alert popup with submission details
            const subhText = getPrayerStatusText(subh);
            const zuhrText = getPrayerStatusText(zuhr);
            const asrText = getPrayerStatusText(asr);
            const magribText = getPrayerStatusText(magrib);
            const ishaText = getPrayerStatusText(isha);
            
            showAlertPopup(`Submitted Successfully!\n\nSubh: ${subhText}\nZuhr: ${zuhrText}\nAsr: ${asrText}\nMagrib: ${magribText}\nIsha: ${ishaText}`);
            
            // Reset the form to empty state for new submission
            resetPrayerForm();
        } else {
            throw new Error(result?.error || 'Failed to submit data');
        }
    } catch (error) {
        console.error('Error submitting form:', error);
        alert('Submission failed. Please try again.');
    } finally {
        // Restore button state
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Helper function to convert numeric value to text status
function getPrayerStatusText(value) {
    switch(value) {
        case '2':
            return 'Adā\' (Prayed on time)';
        case '1':
            return 'Qaḍā\' (Made up later)';
        case '0':
            return 'Not prayed';
        default:
            return 'Unknown';
    }
}

// =============================
// 🔒 Security & Optimization
// =============================

// Disable right-click
document.addEventListener("contextmenu", function(e) {
    e.preventDefault();
});

// Disable inspect shortcuts
document.addEventListener("keydown", function(e) {
    if (e.key === "F12" || 
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey && (e.key === "u" || e.key === "U" || e.key === "s" || e.key === "S"))) {
        e.preventDefault();
    }
});

// Console welcome message
console.log('%c🌙 Tharbiyya - 5 Daily Prayers Tracker 🌙', 'color: #059669; font-size: 16px; font-weight: bold;');
console.log('%cPrayer Values: Adā\' = 2, Qaḍā\' = 1, No = 0', 'color: #1f2937; font-size: 12px;');
console.log('%cPrayer Order: Subh (Fajr) → Zuhr → Asr → Magrib → Isha', 'color: #1f2937; font-size: 12px;');
