const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const ADODB = require('node-adodb');

// --- CONFIGURATION ---
const isDev = process.env.NODE_ENV === 'development';

// Database Path
const DB_PATH = 'C:\\Users\\Public\\AudioConsole_data\\ACDB.mdb';

// Choose Provider
const connection = ADODB.open(`Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${DB_PATH};`);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs') 
    },
  });

  // --- USB / HID PERMISSION HANDLERS ---
  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    console.log('USB Request detected:', details);
    event.preventDefault();
    const deviceToReturn = details.deviceList.find(d => d.productId && d.vendorId);
    if (deviceToReturn) {
      console.log('Auto-granting USB permission to:', deviceToReturn.productName);
      callback(deviceToReturn.deviceId);
    } else {
      callback();
    }
  });

  mainWindow.webContents.session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const deviceToReturn = details.deviceList[0];
    if (deviceToReturn) {
      console.log('Auto-granting HID permission to:', deviceToReturn.productName);
      callback(deviceToReturn.deviceId);
    } else {
      callback();
    }
  });
  
  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    const port = portList.find(d => d.vendorId);
    if (port) callback(port.portId);
    else callback('');
  });

  const startURL = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startURL);
}

// --- FEATURE 1: LAUNCH EXTERNAL APP ---
ipcMain.handle('launch-software-b', async () => {
  mainWindow.hide();
  const softwareB = "notepad.exe"; 

  return new Promise((resolve, reject) => {
    const child = spawn(softwareB);
    
    child.on('close', () => {
      mainWindow.show();
      mainWindow.focus();
      resolve("Software B Closed");
    });
    
    child.on('error', (err) => {
      mainWindow.show();
      reject(err.message);
    });
  });
});

// --- FEATURE 2: LAUNCH WEB KIOSK (With Injection) ---
ipcMain.handle('launch-web-kiosk', async (event, url, userData) => {
  mainWindow.hide();
  
  const webWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: { 
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs') 
    }
  });

  // --- NETWORK SNIFFER START ---
  // Used to capture outgoing data packets
  
  // Filter: We only care about URLs sending data (usually POST/PUT methods)
  const filter = { urls: ['*://*/*'] }; // Listen to everything (safest for now)

  webWindow.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
    
    // Check if this request is an "Upload" (sending data)
    if (details.method === 'POST' && details.uploadData) {
      
      // uploadData is an array of bytes. We must decode it to text.
      // Usually, the first block contains the JSON body.
      const rawData = details.uploadData[0].bytes;
      if (rawData) {
        const dataString = rawData.toString('utf8');

        // Check if this is the specific packet we want
        // We look for a keyword from your logs, e.g., "CustomerName" or "PatientEmailBool"
        if (dataString.includes('CustomerName') && dataString.includes('Id')) {
          console.log("!!! INTERCEPTED PATIENT DATA !!!");
          
          try {
            const jsonData = JSON.parse(dataString);
            console.log("Captured Data:", jsonData);

            // --- SAVE TO YOUR DATABASE HERE ---
            // For now, we'll just save it to a JSON file to prove it works
            saveDataLocally(jsonData);

          } catch (e) {
            console.error("Could not parse intercepted data:", e);
          }
        }
      }
    }

    // IMPORTANT: Always let the request continue!
    // If you forget this, the software will freeze and fail to send the email.
    callback({ cancel: false });
  });

  webWindow.loadURL(url);

  // --- INJECTION & WATCHER LOGIC ---
  webWindow.webContents.on('did-finish-load', () => {
    
    // 1. DATA INJECTION SCRIPT
    const injectionScript = `
      (function() {
        console.log("Electron: Starting Data Injection...");
        
        // Pass the data from Electron to the browser context
        const data = ${JSON.stringify(userData || {})};

        // HELPER: Forces Blazor/React to detect value changes
        function setNativeValue(element, value) {
          const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
          const prototype = Object.getPrototypeOf(element);
          const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
          
          if (valueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
          } else {
            valueSetter.call(element, value);
          }
          
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('blur', { bubbles: true })); // Sometimes needed for validation
        }

        // HELPER: Forces Checkbox Click
        function setCheckbox(element, checked) {
           if (element.checked !== checked) {
              element.click(); // 'Click' is often safer than setting .checked for frameworks
           }
        }

        // RETRY LOOP: Wait for Blazor to render the form inputs
        let attempts = 0;
        const fillerInterval = setInterval(() => {
          attempts++;
          if (attempts > 40) { // Stop after ~20 seconds
            console.log("Electron: Injection Timed Out");
            clearInterval(fillerInterval); 
            return;
          }

          // --- SELECTORS BASED ON YOUR DESCRIPTION ---
          // Using attribute selectors [name="..."] to match your specific tags
          const fName = document.querySelector('input[name="FirstName"]');
          const lName = document.querySelector('input[name="LastName"]');
          const email = document.querySelector('input[name="Email"]');
          const dob   = document.querySelector('input[name="DateOfBirth"]');
          
          // Find the checkbox (assuming it's the first input of type checkbox in the form)
          const checkbox = document.querySelector('input[type="checkbox"]');

          // Check if we found the main fields
          if (fName && lName && email) {
            console.log("Electron: Form fields found! Injecting data...");

            if (data.firstName) setNativeValue(fName, data.firstName);
            if (data.lastName)  setNativeValue(lName, data.lastName);
            if (data.email)     setNativeValue(email, data.email);
            
            // Handle Readonly Date Of Birth
            if (dob && data.dateOfBirth) {
               // Remove readonly temporarily if needed, or just force the value
               dob.removeAttribute('readonly'); 
               setNativeValue(dob, data.dateOfBirth);
            }

            // Click the checkbox
            if (checkbox) {
               console.log("Electron: Ticking checkbox...");
               setCheckbox(checkbox, true);
            }

            // Success! Stop looking.
            clearInterval(fillerInterval);
          }
        }, 500); // Check every 500ms
      })();
    `;

    // Execute the injection script
    webWindow.webContents.executeJavaScript(injectionScript).catch(err => {
      console.error("Injection Error:", err);
    });
  });

  // --- CONSOLE LOG WATCHER (Exit Strategy) ---
  webWindow.webContents.on('console-message', (event, level, message) => {
    // Check if the log message contains your success text
    if (message.includes('Successfully sent data to API')) {
      console.log("Test Success detected! Closing window in 5 seconds...");
      
      // Optional: Wait 5 seconds to let the user see the result, then close
      setTimeout(() => {
        webWindow.close();
      }, 5000);
    }
  });

  // Safety: Allow ESC key to close
  webWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') webWindow.close();
  });

  return new Promise((resolve) => {
    webWindow.on('closed', () => {
      mainWindow.show();
      mainWindow.focus();
      resolve("Web Session Finished");
    });
  });
});

// Add this anywhere in the IPC section
ipcMain.on('close-kiosk-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// --- HELPER FUNCTION: SAVE DATA ---
const fs = require('fs');

function saveDataLocally(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(app.getPath('userData'), `patient_result_${timestamp}.json`);
  
  fs.writeFile(filename, JSON.stringify(data, null, 2), (err) => {
    if (err) console.error("Failed to save file:", err);
    else console.log(`Data saved successfully to: ${filename}`);
  });
}

// --- FEATURE 3: READ DATABASE ---
ipcMain.handle('read-database', async (event, tableName) => {
  try {
    const data = await connection.query(`SELECT * FROM [${tableName}]`);
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-tables', async () => {
  try {
    const schema = await connection.schema(20);
    return schema.map(t => t.TABLE_NAME).filter(n => !n.startsWith('MSys'));
  } catch (error) {
    return [];
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});