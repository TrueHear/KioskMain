import { useState } from 'react';

function App() {
  const [status, setStatus] = useState("System Ready");
  const [dbData, setDbData] = useState([]);
  const [tables, setTables] = useState([]);

  // 1. External Software Handler
  const handleNotepad = async () => {
    setStatus("Running Notepad...");
    await window.electronAPI.openSoftwareB();
    setStatus("Notepad Finished. Welcome Back.");
  };

  // 2. Web Kiosk Handler
  const handleWeb = async () => {
    setStatus("Running Web Kiosk...");
    const patientData = {
    firstName: "Matti",
    lastName: "Meikäläinen",
    email: "matti.testi@example.com",
    dateOfBirth: "1980-01-01" // Format usually YYYY-MM-DD or DD.MM.YYYY depending on your site
  };
    await window.electronAPI.openWebKiosk("https://kiosk.oscilla.app/", patientData);
    setStatus("Web Kiosk Closed.");
  };

  // 3. Database Handler
  const handleDB = async () => {
    setStatus("Scanning Database...");
    
    // Get Tables
    const tableList = await window.electronAPI.listTables();
    setTables(tableList);

    if(tableList.length > 0) {
      // Get Data from first table
      const res = await window.electronAPI.readDB(tableList[0]);
      if(res.success) {
        setDbData(res.data);
        setStatus(`Loaded data from ${tableList[0]}`);
      } else {
        setStatus("Error reading table: " + res.error);
      }
    } else {
      setStatus("No tables found or connection failed.");
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>Kiosk Master Control</h1>
      
      <div style={{ margin: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
        <strong>Status:</strong> {status}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '40px' }}>
        <button onClick={handleNotepad} style={btnStyle}>Open Notepad</button>
        <button onClick={handleWeb} style={btnStyle}>Open Web Kiosk (ESC to close)</button>
        <button onClick={handleDB} style={btnStyle}>Read ACDB.mdb</button>
      </div>

      {/* Database Results */}
      {dbData.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid #ccc' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#eee' }}>
                {Object.keys(dbData[0]).map(k => <th key={k} style={thStyle}>{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {dbData.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((val, j) => <td key={j} style={tdStyle}>{val}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const btnStyle = { padding: '15px 25px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' };
const thStyle = { padding: '10px', borderBottom: '1px solid #ddd' };
const tdStyle = { padding: '10px', borderBottom: '1px solid #ddd' };

export default App;