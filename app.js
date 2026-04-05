// 🌐 Global Variables
let currentUser = null;
let currentSheetName = null;
let selectedDate = null;
let selectedADNo = null;

// =============================
// 📊 Google Sheets API Configuration
// =============================
class GoogleSheetsAPI {
    constructor() {
        // IMPORTANT: Replace this URL with your Google Apps Script Web App URL
        this.apiUrl = "https://script.google.com/macros/s/AKfycbyzsR21XdEx9X-6nIz6oQqMBrHvNCe4pE78NsNTBIaUwaw-X42_7zDXJ_lqoppAoexTXg/exec";
        this.cache = new Map();
        this.cacheTimeout = 60000; // 60 seconds
    }

    async getSheet(sheetName, useCache = true) {
        const cacheKey = sheetName;
        const now = Date.now();
        
        if (useCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (now - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const url = `${this.apiUrl}?sheet=${encodeURIComponent(sheetName)}&t=${now}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            if (useCache) {
                this.cache.set(cacheKey, { data, timestamp: now });
            }
            
            return data;
        } catch (error) {
            console.error(`Error fetching ${sheetName}:`, error);
            return { error: error.message };
        }
    }

    async addRow(sheetName, rowData) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    sheet: sheetName,
                    data: JSON.stringify(rowData)
                })
            });
            
            const result = await response.json();
            
            // Clear cache for this sheet
            this.cache.delete(sheetName);
            
            return result;
        } catch (error) {
            console.error('Error adding row:', error);
            return { error: error.message };
        }
    }

    async ensureSheetExists(sheetName, headers) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    action: "ensureSheet",
                    sheet: sheetName,
                    headers: JSON.stringify(headers)
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error ensuring sheet exists:', error);
            return { error: error.message };
        }
    }

    clearCache() {
        this.cache.clear();
    }
}

const api = new GoogleSheetsAPI();

// =============================
// 🔑 Login Functions
// =============================

// Load AD numbers on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadADNumbers();
    
    // Set max date to today
    const dateInput = document.getElementById('date');
    const today = new Date().toISOString().split('T')[0];
    dateInput.max = today;
    
    // Add event listeners for select options
    initializeSelectOptions();
    
    // Add login form submit listener
    document.getElementById('loginForm').addEventListener('submit', login);
    
    // Add worship form submit listener
    document.getElementById('worshipForm').addEventListener('submit', submitWorshipForm);
});

async function loadADNumbers() {
    try {
        const users = await api.getSheet("user_credentials");
        const adNoSelect = document.getElementById('adNo');
        
        adNoSelect.innerHTML = '<option value="" disabled selected>-- Select AD Number --</option>';
        
        if (users && Array.isArray(users) && users.length > 0) {
            // Sort AD numbers numerically
            const sortedUsers = users.sort((a, b) => {
                const numA = parseInt(a['ad:no']) || 0;
                const numB = parseInt(b['ad:no']) || 0;
                return numA - numB;
            });
            
            sortedUsers.forEach(user => {
                const adNo = user['ad:no'] || user.ad_no;
                const name = user.name || '';
                if (adNo) {
                    const option = document.createElement('option');
                    option.value = adNo;
                    option.textContent = `${adNo} - ${name}`;
                    adNoSelect.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('Error loading AD numbers:', error);
    }
}

async function login(event) {
    event.preventDefault();
    
    const adNo = document.getElementById('adNo').value;
    const date = document.getElementById('date').value;
    const password = document.getElementById('password').value;
    
    // Hide previous error
    hideLoginError();
    
    if (!adNo || !date || !password) {
        showLoginError('Please fill in all fields');
        return;
    }
    
    // Show loading state
    const submitBtn = document.querySelector('#loginForm .submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
    submitBtn.disabled = true;
    
    try {
        const users = await api.getSheet("user_credentials", false);
        
        if (!users || users.error || !Array.isArray(users)) {
            showLoginError('Failed to connect to server');
            return;
        }
        
        // Find user with matching AD number and password
        const user = users.find(u => {
            const userAdNo = String(u['ad:no'] || u.ad_no || '').trim();
            const userPassword = String(u.pswd || u.password || '').trim();
            return userAdNo === String(adNo).trim() && userPassword === String(password).trim();
        });
        
        if (user) {
            // Login successful
            currentUser = {
                adNo: adNo,
                name: user.name || user.full_name || `User ${adNo}`,
                rawData: user
            };
            
            selectedDate = date;
            selectedADNo = adNo;
            
            // Format date for sheet name (DD-MM-YYYY)
            const dateObj = new Date(date);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            const formattedDate = `${day}-${month}-${year}`;
            
            currentSheetName = `${adNo}-${formattedDate}`;
            
            // Complete headers array with all 20 worship practices
            const headers = [
                // Fardh Prayers (5)
                'zuhr', 'asr', 'magrib', 'isha', 'subh',
                // Nafl Prayers (4)
                'thahajjud', 'zuha', 'swalath_count', 'ravathib',
                // Quran & Dhikr (4)
                'qirath_pages', 'surah_mulk', 'surah_vaqia', 'isthigfar_count',
                // Purification & Hygiene (4)
                'misvak_count', 'dua_after_vuzu', 'all_time_vuzu', 'haddad',
                // Sunnah Practices (2)
                'halal_haircut', 'amama',
                // Timestamp
                'submission_date'
            ];
            
            await api.ensureSheetExists(currentSheetName, headers);
            
            // Show dashboard
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('dashboardPage').classList.remove('hidden');
            
            // Update UI
            document.getElementById('userInfo').innerHTML = `<strong>${currentUser.name}</strong> (AD: ${adNo})`;
            
            const formattedDateDisplay = dateObj.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            document.querySelector('#selectedDateDisplay span').textContent = formattedDateDisplay;
            
            // Clear form and reset password field
            document.getElementById('password').value = '';
            
            // Check if already submitted for this date
            await checkExistingSubmission();
        } else {
            showLoginError('Invalid AD Number or Password');
        }
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
    currentSheetName = null;
    selectedDate = null;
    selectedADNo = null;
    
    // Reset forms
    document.getElementById('loginForm').reset();
    resetWorshipForm();
    
    // Hide success/error messages
    document.getElementById('formSuccess').classList.add('hidden');
    document.getElementById('formError').classList.add('hidden');
    
    // Show login page
    document.getElementById('dashboardPage').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
}

// =============================
// 🕌 Worship Form Functions
// =============================

function initializeSelectOptions() {
    // Delegate event listener for select options
    document.addEventListener('click', function(e) {
        const option = e.target.closest('.select-option');
        if (!option) return;
        
        const selectGroup = option.closest('.select-group');
        if (!selectGroup) return;
        
        // Get all options in this group
        const options = selectGroup.querySelectorAll('.select-option');
        const prayerName = selectGroup.dataset.prayer;
        
        // Remove selected class from all options in this group
        options.forEach(opt => {
            opt.classList.remove('selected');
            opt.style.background = '';
            opt.style.color = '';
            opt.style.borderColor = '';
        });
        
        // Add selected class to clicked option
        option.classList.add('selected');
        
        // Style for selected state
        if (option.dataset.value === 'yes') {
            option.style.background = '#059669';
            option.style.color = 'white';
            option.style.borderColor = '#059669';
        } else {
            option.style.background = '#dc2626';
            option.style.color = 'white';
            option.style.borderColor = '#dc2626';
        }
        
        // Update hidden input value
        if (prayerName) {
            const hiddenInput = document.getElementById(prayerName);
            if (hiddenInput) {
                hiddenInput.value = option.dataset.value;
            }
        }
    });
}

function resetWorshipForm() {
    // Reset all select options
    document.querySelectorAll('.select-group').forEach(group => {
        const options = group.querySelectorAll('.select-option');
        const prayerName = group.dataset.prayer;
        
        options.forEach(opt => {
            opt.classList.remove('selected');
            opt.style.background = '';
            opt.style.color = '';
            opt.style.borderColor = '';
        });
        
        // Clear hidden input
        if (prayerName) {
            const hiddenInput = document.getElementById(prayerName);
            if (hiddenInput) hiddenInput.value = '';
        }
    });
    
    // Reset all number inputs
    const numberInputs = ['swalath_count', 'qirath_pages', 'isthigfar_count', 'misvak_count'];
    numberInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    
    // Enable submit button
    const submitBtn = document.getElementById('submitWorshipBtn');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-check-double"></i> Submit Today\'s Worship';
}

async function checkExistingSubmission() {
    try {
        const data = await api.getSheet(currentSheetName);
        
        if (data && Array.isArray(data) && data.length > 0) {
            // Sort by submission date to get the latest
            const sorted = data.sort((a, b) => {
                const dateA = a.submission_date || '';
                const dateB = b.submission_date || '';
                return dateB.localeCompare(dateA);
            });
            
            const latest = sorted[0];
            
            // Load Fardh Prayers
            if (latest.zuhr) {
                const selectGroup = document.querySelector('[data-prayer="zuhr"]');
                if (latest.zuhr === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.zuhr === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.asr) {
                const selectGroup = document.querySelector('[data-prayer="asr"]');
                if (latest.asr === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.asr === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.magrib) {
                const selectGroup = document.querySelector('[data-prayer="magrib"]');
                if (latest.magrib === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.magrib === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.isha) {
                const selectGroup = document.querySelector('[data-prayer="isha"]');
                if (latest.isha === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.isha === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.subh) {
                const selectGroup = document.querySelector('[data-prayer="subh"]');
                if (latest.subh === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.subh === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            // Load Nafl Prayers
            if (latest.thahajjud) {
                const selectGroup = document.querySelector('[data-prayer="thahajjud"]');
                if (latest.thahajjud === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.thahajjud === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.zuha) {
                const selectGroup = document.querySelector('[data-prayer="zuha"]');
                if (latest.zuha === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.zuha === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.swalath_count) {
                document.getElementById('swalath_count').value = latest.swalath_count;
            }
            
            if (latest.ravathib) {
                const selectGroup = document.querySelector('[data-prayer="ravathib"]');
                if (latest.ravathib === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.ravathib === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            // Load Quran & Dhikr
            if (latest.qirath_pages) {
                document.getElementById('qirath_pages').value = latest.qirath_pages;
            }
            
            if (latest.surah_mulk) {
                const selectGroup = document.querySelector('[data-prayer="surah_mulk"]');
                if (latest.surah_mulk === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.surah_mulk === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.surah_vaqia) {
                const selectGroup = document.querySelector('[data-prayer="surah_vaqia"]');
                if (latest.surah_vaqia === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.surah_vaqia === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.isthigfar_count) {
                document.getElementById('isthigfar_count').value = latest.isthigfar_count;
            }
            
            // Load Purification & Hygiene
            if (latest.misvak_count) {
                document.getElementById('misvak_count').value = latest.misvak_count;
            }
            
            if (latest.dua_after_vuzu) {
                const selectGroup = document.querySelector('[data-prayer="dua_after_vuzu"]');
                if (latest.dua_after_vuzu === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.dua_after_vuzu === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.all_time_vuzu) {
                const selectGroup = document.querySelector('[data-prayer="all_time_vuzu"]');
                if (latest.all_time_vuzu === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.all_time_vuzu === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.haddad) {
                const selectGroup = document.querySelector('[data-prayer="haddad"]');
                if (latest.haddad === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.haddad === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            // Load Sunnah Practices
            if (latest.halal_haircut) {
                const selectGroup = document.querySelector('[data-prayer="halal_haircut"]');
                if (latest.halal_haircut === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.halal_haircut === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            if (latest.amama) {
                const selectGroup = document.querySelector('[data-prayer="amama"]');
                if (latest.amama === 'yes') selectGroup?.querySelector('[data-value="yes"]')?.click();
                else if (latest.amama === 'no') selectGroup?.querySelector('[data-value="no"]')?.click();
            }
            
            // Show success message
            showFormSuccess('Your previous submission has been loaded. You can update it below.');
        }
    } catch (error) {
        console.error('Error checking existing submission:', error);
    }
}

async function submitWorshipForm(event) {
    event.preventDefault();
    
    // Hide previous messages
    hideFormMessages();
    
    // Get all form values
    // Fardh Prayers
    const zuhr = document.getElementById('zuhr').value;
    const asr = document.getElementById('asr').value;
    const magrib = document.getElementById('magrib').value;
    const isha = document.getElementById('isha').value;
    const subh = document.getElementById('subh').value;
    
    // Nafl Prayers
    const thahajjud = document.getElementById('thahajjud').value;
    const zuha = document.getElementById('zuha').value;
    const swalath_count = document.getElementById('swalath_count').value;
    const ravathib = document.getElementById('ravathib').value;
    
    // Quran & Dhikr
    const qirath_pages = document.getElementById('qirath_pages').value;
    const surah_mulk = document.getElementById('surah_mulk').value;
    const surah_vaqia = document.getElementById('surah_vaqia').value;
    const isthigfar_count = document.getElementById('isthigfar_count').value;
    
    // Purification & Hygiene
    const misvak_count = document.getElementById('misvak_count').value;
    const dua_after_vuzu = document.getElementById('dua_after_vuzu').value;
    const all_time_vuzu = document.getElementById('all_time_vuzu').value;
    const haddad = document.getElementById('haddad').value;
    
    // Sunnah Practices
    const halal_haircut = document.getElementById('halal_haircut').value;
    const amama = document.getElementById('amama').value;
    
    // Validate all required fields (20 total)
    if (!zuhr || !asr || !magrib || !isha || !subh ||
        !thahajjud || !zuha || !swalath_count || !ravathib ||
        !qirath_pages || !surah_mulk || !surah_vaqia || !isthigfar_count ||
        !misvak_count || !dua_after_vuzu || !all_time_vuzu || !haddad ||
        !halal_haircut || !amama) {
        showFormError('Please fill in all fields');
        return;
    }
    
    // Show loading state
    const submitBtn = document.getElementById('submitWorshipBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;
    
    try {
        // Prepare row data with all 20 fields + timestamp
        const now = new Date();
        const formattedNow = `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB')}`;
        
        const rowData = [
            // Fardh Prayers (5)
            zuhr, asr, magrib, isha, subh,
            // Nafl Prayers (4)
            thahajjud, zuha, swalath_count, ravathib,
            // Quran & Dhikr (4)
            qirath_pages, surah_mulk, surah_vaqia, isthigfar_count,
            // Purification & Hygiene (4)
            misvak_count, dua_after_vuzu, all_time_vuzu, haddad,
            // Sunnah Practices (2)
            halal_haircut, amama,
            // Timestamp (1)
            formattedNow
        ];
        
        // Add row to sheet
        const result = await api.addRow(currentSheetName, rowData);
        
        if (result && result.success) {
            showFormSuccess('Your worship data has been submitted successfully!');
            
            // Reload the form with new data
            await checkExistingSubmission();
        } else {
            throw new Error(result?.error || 'Failed to submit data');
        }
    } catch (error) {
        console.error('Error submitting form:', error);
        showFormError('Submission failed. Please try again.');
    } finally {
        // Restore button state
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showFormSuccess(message) {
    const successDiv = document.getElementById('formSuccess');
    successDiv.querySelector('span').textContent = message;
    successDiv.classList.remove('hidden');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        successDiv.classList.add('hidden');
    }, 5000);
}

function showFormError(message) {
    const errorDiv = document.getElementById('formError');
    errorDiv.querySelector('span').textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideFormMessages() {
    document.getElementById('formSuccess').classList.add('hidden');
    document.getElementById('formError').classList.add('hidden');
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
console.log('%c🌙 Tharbiyya - Complete Daily Worship Tracker 🌙', 'color: #059669; font-size: 16px; font-weight: bold;');
console.log('%c20 Worship Practices Loaded Successfully', 'color: #1f2937; font-size: 12px;');
