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


console.log("UserData path:", app.getPath('userData'));

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

  if (isDev) {
    webWindow.webContents.openDevTools({ mode: 'detach' });
  }



  // --- NETWORK SNIFFER START ---
  // Used to capture outgoing data packets
  
  // Filter: We only care about URLs sending data (usually POST/PUT methods)
  const filter = { urls: ['*://*/*'] }; // Listen to everything (safest for now)

 // webWindow.webContents.session.webRequest.removeAllListeners('onBeforeRequest');

  webWindow.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
  try {
    if (details.method === 'POST' && details.uploadData) {
      const rawData = details.uploadData[0]?.bytes;
      if (rawData && details.url.includes('/api/oscilla/sendresult')) {
        const dataString = rawData.toString('utf8');
        const jsonData = JSON.parse(dataString);

        console.log("✅ FINAL RESULT PAYLOAD CAPTURED");
        saveDataLocally(jsonData);
      }
    }
  } catch (e) {
    console.error("Interceptor error:", e);
  } finally {
    callback({ cancel: false });
  }
  });



  webWindow.loadURL(url);

  // --- INJECTION & WATCHER LOGIC ---
  webWindow.webContents.on('did-finish-load', () => {
    
    // 1. DATA INJECTION SCRIPT
    const injectionScript = `
  (function() {
    console.log("Electron: Starting Data Injection...");

    const data = ${JSON.stringify(userData || {})};

    let injected = false; // ✅ must be here

    function setNativeValue(element, value) {
      try {
        element.focus();
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      } catch (e) {
        console.error("setNativeValue failed:", e);
      }
    }

    function setCheckbox(element, checked) {
      if (element.checked !== checked) {
        element.click();
      }
    }

    let attempts = 0;
    const fillerInterval = setInterval(() => {
      attempts++;
      if (attempts > 40) {
        console.log("Electron: Injection Timed Out");
        clearInterval(fillerInterval);
        return;
      }

      const fName = document.querySelector('input[name="FirstName"]');
      const lName = document.querySelector('input[name="LastName"]');
      const email = document.querySelector('input[name="Email"]');
      const dob   = document.querySelector('input[name="DateOfBirth"]');
      const checkbox = document.querySelector('input[type="checkbox"]');

      if (fName && lName && email && !injected) {
        injected = true;
        console.log("Electron: Injecting data once...");

        if (data.firstName) setNativeValue(fName, data.firstName);
        if (data.lastName)  setNativeValue(lName, data.lastName);
        if (data.email)     setNativeValue(email, data.email);

        if (dob && data.dateOfBirth) {
          dob.removeAttribute('readonly');
          setNativeValue(dob, data.dateOfBirth);
        }

        if (checkbox) {
          setCheckbox(checkbox, true);
        }

        clearInterval(fillerInterval);
        }
      }, 500);
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
      //setTimeout(() => {
      //  webWindow.close();
      //}, 5000);
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