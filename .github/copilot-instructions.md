# Kiosk Master App - AI Agent Instructions

## Architecture Overview
This is an Electron desktop application with a React frontend, designed as a kiosk master control system. The app manages external software launches, web kiosk sessions, and database interactions with an Access database.

**Key Components:**
- `electron/main.cjs`: Main process handling windows, IPC, database queries, and device permissions
- `electron/preload.cjs`: Secure IPC bridge exposing `window.electronAPI` to renderer
- `src/App.jsx`: React UI with buttons for launching features and displaying database results
- Database: Access DB (`ACDB.mdb`) at `C:\Users\Public\AudioConsole_data\` using `node-adodb` with Jet OLEDB provider

## Development Workflow
- **Dev Mode**: Run `npm run dev` - concurrently starts Vite dev server (port 5173) and Electron app
- **Build**: `npm run build` - Vite builds to `dist/`, Electron loads `dist/index.html` in production
- **Debugging**: Use Electron DevTools for renderer, console logs for main process

## IPC Communication Pattern
All main process features are accessed via IPC through the preload bridge:
```javascript
// In renderer (App.jsx)
await window.electronAPI.openSoftwareB();  // Launches external app
await window.electronAPI.openWebKiosk(url);  // Creates fullscreen kiosk window
const data = await window.electronAPI.readDB(tableName);  // Queries database
```

**Main Process Handlers** (in `main.cjs`):
- `launch-software-b`: Spawns external process, hides main window until completion
- `launch-web-kiosk`: Creates new BrowserWindow in kiosk mode, monitors for success logs
- `read-database`: Executes `SELECT * FROM [tableName]` using ADODB connection
- `list-tables`: Returns schema table names (excluding MSys*)

## Database Integration
- **Library**: `node-adodb` for OLEDB connections
- **Connection**: `Provider=Microsoft.Jet.OLEDB.4.0;Data Source=C:\\Users\\Public\\AudioConsole_data\\ACDB.mdb;`
- **Queries**: Use bracketed table names `[TableName]` for Access compatibility
- **Error Handling**: IPC handlers return `{success: boolean, data/error}` objects

## Device Permissions
Main process automatically grants USB/HID/Serial device access:
- `select-usb-device`: Auto-selects first device with vendorId/productId
- `select-hid-device`: Auto-selects first HID device
- `select-serial-port`: Auto-selects first port with vendorId

## File Structure Conventions
- Electron files use `.cjs` extension (CommonJS)
- React components in `src/` use `.jsx`
- Vite config sets `base: './'` for Electron compatibility
- Package.json main points to `electron/main.cjs`

## Key Patterns
- **Window Management**: Main window hides during external launches, shows/focuses on completion
- **Kiosk Windows**: Fullscreen, frameless, ESC key closes, monitor console logs for success detection
- **Error Recovery**: Always show main window on child process errors
- **State Updates**: Use React state for status messages and database results display</content>
<parameter name="filePath">c:\Users\tuoma\GitHub\KioskMain\.github\copilot-instructions.md