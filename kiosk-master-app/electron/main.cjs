const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const ADODB = require('node-adodb');

// --- CONFIGURATION ---
const isDev = process.env.NODE_ENV === 'development';

// Database Path (Note the double backslashes for Windows)
const DB_PATH = 'C:\\Users\\Public\\AudioConsole_data\\ACDB.mdb';

// Choose Provider: 'Microsoft.Jet.OLEDB.4.0' (Old) or 'Microsoft.ACE.OLEDB.12.0' (Newer)
const connection = ADODB.open(`Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${DB_PATH};`);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs') // Point to CJS
    },
  });

  // --- ADD THIS BLOCK TO ENABLE USB/HID DEVICES ---

  // 1. Handle WebUSB requests (Most common for custom hardware)
  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    
    // Add events to details to see what devices are being requested in your terminal
    console.log('USB Request detected:', details);

    // Automate the selection:
    // This finds the first device in the list and connects to it.
    // If you need a specific device, you can filter by details.deviceList[i].vendorId
    event.preventDefault();
    
    const deviceToReturn = details.deviceList.find((device) => {
      // Return TRUE to select the device. 
      // For now, we return the first valid device found.
      return device.productId && device.vendorId;
    });

    if (deviceToReturn) {
      console.log('Auto-granting USB permission to:', deviceToReturn.productName);
      callback(deviceToReturn.deviceId);
    } else {
      console.log('No USB device found');
      callback(); // Cancel the request
    }
  });

  // 2. Handle WebHID requests (Common for keyboards, gamepads, and some medical devices)
  mainWindow.webContents.session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const deviceToReturn = details.deviceList[0]; // Auto-select the first one
    if (deviceToReturn) {
      console.log('Auto-granting HID permission to:', deviceToReturn.productName);
      callback(deviceToReturn.deviceId);
    } else {
      callback();
    }
  });
  
  // 3. Handle Serial Port requests (Less common for web apps, but possible)
  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    const port = portList.find((device) => device.vendorId); // Select first available
    if (port) {
      callback(port.portId);
    } else {
      callback('');
    }
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

// --- FEATURE 2: LAUNCH WEB KIOSK ---
// --- FEATURE 2: LAUNCH WEB KIOSK ---
ipcMain.handle('launch-web-kiosk', async (event, url) => {
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

  webWindow.loadURL(url);

  // --- OPTION B: CONSOLE LOG WATCHER (Recommended) ---
  // Since you saw "Successfully sent data to API" in your logs, this is safer!
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
  // Find the window that sent the message and close it
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.close();
  }
});

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