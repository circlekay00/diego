import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, updateDoc, setDoc } from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";
import jsPDF from "jspdf"; // Fixed lowercase import
import autoTable from 'jspdf-autotable';
import "./index.css";

export default function App() {
  const [view, setView] = useState("main");
  const [questions, setQuestions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [answers, setAnswers] = useState({});
  const [traineeName, setTraineeName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Security & Admin State
  const [activeToken, setActiveToken] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState("yesno");
  const [qOptions, setQOptions] = useState("");
  const [editingId, setEditingId] = useState(null);
  const qrRef = useRef();

  useEffect(() => {
    const unsubToken = onSnapshot(doc(db, "settings", "security"), (snap) => {
      if (snap.exists()) setActiveToken(snap.data().activeToken);
    });
    const unsubQ = onSnapshot(query(collection(db, "questions"), orderBy("createdAt", "asc")), (snap) =>
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubL = onSnapshot(query(collection(db, "logs"), orderBy("time", "desc")), (snap) =>
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubToken(); unsubQ(); unsubL(); };
  }, []);

  useEffect(() => {
    const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
    setIsAuthorized(activeToken && tokenFromUrl === activeToken);
  }, [activeToken]);

  const rotateQRCode = async () => {
    const newToken = Math.random().toString(36).substring(2, 15);
    await setDoc(doc(db, "settings", "security"), { activeToken: newToken, updatedAt: serverTimestamp() });
    alert("System rotation complete. Previous QR code is now void.");
  };

  const downloadQR = () => {
    const svg = qrRef.current.querySelector("svg");
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = "white"; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = "CheckIn_QR.png";
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const handleAdminAction = async () => {
    if (!qText) return;
    const payload = { 
      text: qText, 
      type: qType, 
      options: qType === "radio" ? qOptions.split(",").map(o => o.trim()) : [],
      createdAt: serverTimestamp() 
    };
    if (editingId) {
      await updateDoc(doc(db, "questions", editingId), payload);
    } else {
      await addDoc(collection(db, "questions"), payload);
    }
    setQText(""); setQOptions(""); setEditingId(null);
  };

  // Global Search Logic: Filters both Name and Answer Values
  const filteredLogs = logs.filter(log => {
    const searchLower = searchTerm.toLowerCase();
    const nameMatch = log.trainee.toLowerCase().includes(searchLower);
    const answerMatch = Object.values(log.answers || {}).some(val => 
      String(val).toLowerCase().includes(searchLower)
    );
    return nameMatch || answerMatch;
  });

  const exportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.text("DIEGO OS - CHECK IN LOGS", 14, 15);
    const headers = [["TRAINEE", "DATE", ...questions.map(q => q.text.toUpperCase())]];
    const data = filteredLogs.map(log => [
      log.trainee, log.time?.toDate().toLocaleDateString(), ...questions.map(q => log.answers[q.id] || "-")
    ]);
    autoTable(doc, { head: headers, body: data, startY: 20, theme: 'grid', headStyles: { fillColor: [76, 201, 240] } });
    doc.save(`CheckIn_Report_${new Date().toLocaleDateString()}.pdf`);
  };

  const qrUrl = `${window.location.origin}${window.location.pathname}?token=${activeToken}`;

  return (
    <div className="app-container">
      <header className="header">
        <div className="brand"><span className="store">DIEGO</span><span className="checklist">OS</span></div>
        <div className="nav-group">
          <button className={`nav-btn ${view === "main" ? "active" : ""}`} onClick={() => setView("main")}>Check In Form</button>
          <button className={`nav-btn ${view === "reports" ? "active" : ""}`} onClick={() => setView("reports")}>Check In Logs</button>
          <button className={`nav-btn ${view === "core" ? "active" : ""}`} onClick={() => setView("core")}>Admin Panel</button>
        </div>
      </header>

      <main>
        {view === "main" && (
          <div className="card">
            {!isAuthorized ? (
              <div style={{textAlign: 'center', padding: '40px'}}>
                <h2 style={{color: 'var(--danger)'}}>UNAUTHORIZED SESSION</h2>
                <p style={{color: 'var(--text-secondary)'}}>Invalid or expired QR code. Request a current scan.</p>
              </div>
            ) : (
              <>
                <label className="input-label">Trainee Check In</label>
                <input className="input-field" placeholder="TRAINEE NAME" value={traineeName} onChange={(e) => setTraineeName(e.target.value)} style={{marginBottom: '24px'}} />
                {questions.map((q) => (
                  <div key={q.id} style={{marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                    <p style={{marginBottom: '12px', fontWeight: '600'}}>{q.text}</p>
                    {(q.type === "yesno" || q.type === "radio") && (
                      <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                        {(q.type === "yesno" ? ["Yes", "No", "N/A"] : q.options).map(o => (
                          <button key={o} className={`opt-btn ${answers[q.id] === o ? 'active-na' : ''}`} 
                                  style={answers[q.id] === o && q.type === 'yesno' ? { backgroundColor: o === 'Yes' ? 'var(--success)' : o === 'No' ? 'var(--danger)' : 'var(--accent-cyan)', color: 'var(--bg)' } : {}}
                                  onClick={() => setAnswers({...answers, [q.id]: o})}>{o}</button>
                        ))}
                      </div>
                    )}
                    {q.type === "input" && <input className="input-field" placeholder="Entry notes..." value={answers[q.id] || ""} onChange={(e) => setAnswers({...answers, [q.id]: e.target.value})} />}
                  </div>
                ))}
                <button className="nav-btn primary" style={{width: '100%', marginTop: '20px'}} onClick={async () => {
                  if(!traineeName) return alert("Please enter a trainee name.");
                  await addDoc(collection(db, "logs"), { trainee: traineeName, answers, time: serverTimestamp() });
                  alert("Check In Logged."); setAnswers({}); setTraineeName("");
                }}>SUBMIT CHECK IN</button>
              </>
            )}
          </div>
        )}

        {view === "reports" && (
          <div className="card" style={{overflowX: 'auto'}}>
             <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '10px', flexWrap: 'wrap'}}>
                <input className="input-field" style={{maxWidth: '400px'}} placeholder="Global Filter (Name or Result)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <button className="nav-btn success" onClick={exportPDF}>Download PDF Report</button>
             </div>
             <table style={{width: '100%', borderCollapse: 'collapse', minWidth: '900px'}}>
               <thead>
                 <tr style={{textAlign: 'left', color: 'var(--accent-cyan)'}}>
                   <th style={{padding: '12px'}}>TRAINEE</th>
                   <th style={{padding: '12px'}}>DATE</th>
                   {questions.map(q => <th key={q.id} style={{padding: '12px'}}>{q.text}</th>)}
                   <th style={{padding: '12px'}}>ACTION</th>
                 </tr>
               </thead>
               <tbody>
                 {filteredLogs.map(log => (
                   <tr key={log.id} style={{borderTop: '1px solid rgba(255, 255, 255, 0.05)'}}>
                     <td style={{padding: '12px', fontWeight: '700', color: 'var(--accent-orange)'}}>{log.trainee}</td>
                     <td style={{padding: '12px', color: 'var(--text-secondary)'}}>{log.time?.toDate().toLocaleDateString()}</td>
                     {questions.map(q => (
                       <td key={q.id} style={{padding: '12px', color: log.answers?.[q.id] === 'No' ? 'var(--danger)' : log.answers?.[q.id] === 'Yes' ? 'var(--success)' : 'var(--text-primary)'}}>
                         {log.answers?.[q.id] || "—"}
                       </td>
                     ))}
                     <td style={{padding: '12px'}}><button className="nav-btn danger" style={{padding: '5px 10px'}} onClick={() => deleteDoc(doc(db, "logs", log.id))}>×</button></td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        )}

        {view === "core" && (
           <div className="card">
              <div className="stat-grid" style={{marginBottom: '30px'}}>
                <div className="stat-card" style={{alignItems: 'center'}}>
                  <span className="stat-label">Dynamic QR Entry</span>
                  <div ref={qrRef} style={{margin: '15px 0', padding: '10px', background: 'white', borderRadius: '12px'}}>
                    <QRCodeSVG value={qrUrl} size={150} />
                  </div>
                  <div style={{display: 'flex', gap: '10px'}}>
                    <button className="nav-btn primary" onClick={downloadQR}>Download PNG</button>
                    <button className="nav-btn danger" onClick={rotateQRCode}>Revoke & Rotate</button>
                  </div>
                </div>
              </div>
              
              <label className="input-label">Admin Control: Manage Check In Fields</label>
              <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px'}}>
                 <input className="input-field" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Field Label (Question)" />
                 <div style={{display: 'flex', gap: '8px'}}>
                    <select className="input-field" value={qType} onChange={(e) => setQType(e.target.value)}>
                       <option value="yesno">Binary (Yes/No/NA)</option>
                       <option value="radio">Bubble Choice (Custom)</option>
                       <option value="input">Text Input</option>
                    </select>
                    {qType === 'radio' && <input className="input-field" placeholder="Choices (comma separated)" value={qOptions} onChange={(e) => setQOptions(e.target.value)} />}
                    <button className="nav-btn primary" onClick={handleAdminAction}>{editingId ? "Update" : "Add Field"}</button>
                 </div>
              </div>
              {questions.map(q => (
                <div key={q.id} style={{display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', marginBottom: '8px'}}>
                  <span>{q.text} <small style={{color: 'var(--accent-cyan)'}}>({q.type})</small></span>
                  <div style={{display: 'flex', gap: '8px'}}>
                    <button className="nav-btn" onClick={() => { setEditingId(q.id); setQText(q.text); setQType(q.type); setQOptions(q.options?.join(",") || ""); }}>Edit</button>
                    <button className="nav-btn danger" onClick={() => deleteDoc(doc(db, "questions", q.id))}>×</button>
                  </div>
                </div>
              ))}
           </div>
        )}
      </main>
    </div>
  );
}