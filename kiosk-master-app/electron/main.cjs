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
ipcMain.handle('launch-web-kiosk', async (event, url) => {
  mainWindow.hide();
  
  const webWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: { 
      nodeIntegration: false,
      contextIsolation: true,
      // 1. IMPORTANT: The Kiosk needs the preload script to talk to Electron
      preload: path.join(__dirname, 'preload.cjs') 
    }
  });

  webWindow.loadURL(url);

  // 2. THE BUTTON WATCHER SCRIPT
  // This runs inside the web page once it finishes loading
  webWindow.webContents.on('did-finish-load', () => {
    const watcherScript = 
      console.log("Electron Kiosk Script Loaded: Watching for Back Button...");

      // A MutationObserver watches for changes in the HTML (like the button appearing)
      const observer = new MutationObserver(() => {
        
        // --- CONFIGURATION: HOW TO FIND YOUR BUTTON ---
        // Option A: Look for a button with specific text (Easiest)
        const allButtons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const targetBtn = allButtons.find(b => 
          b.innerText.toLowerCase().includes('back to main') || 
          b.innerText.toLowerCase().includes('SULJE') // <--- Adjust this text to match your button!
        );

        // Option B: If you know the class, use this instead:
        // const targetBtn = document.querySelector('.btn-back-home');

        // If we found the button and haven't hooked it yet...
        if (targetBtn && !targetBtn.getAttribute('data-electron-hooked')) {
          console.log("Target Button Found! Attaching Close Event.");
          
          // Mark it so we don't attach twice
          targetBtn.setAttribute('data-electron-hooked', 'true');

          // Add the click listener
          targetBtn.addEventListener('click', (e) => {
            // Optional: Prevent the default Blazor action if you want
            // e.preventDefault(); 
            
            console.log("Button Clicked. Closing Kiosk via Electron...");
            window.electronAPI.closeKiosk();
          });
        }
      });

      // Start watching the entire body for changes
      observer.observe(document.body, { childList: true, subtree: true });
    

    // Inject the script
    webWindow.webContents.executeJavaScript(watcherScript).catch(console.error);
  });

  // Safety: Allow ESC key to close it manually
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