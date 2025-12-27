import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  deleteDoc, doc, serverTimestamp, updateDoc, setDoc 
} from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import "./index.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("main");
  const [questions, setQuestions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [answers, setAnswers] = useState({});
  const [traineeName, setTraineeName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Inline Message State
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "" });

  // Admin State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState("yesno");
  const [qOptions, setQOptions] = useState("");
  const [qRequired, setQRequired] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const qrRef = useRef();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    const unsubToken = onSnapshot(doc(db, "settings", "security"), (snap) => {
      if (snap.exists()) setActiveToken(snap.data().activeToken);
    });
    const unsubQ = onSnapshot(query(collection(db, "questions"), orderBy("createdAt", "asc")), (snap) =>
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubL = onSnapshot(query(collection(db, "logs"), orderBy("time", "desc")), (snap) =>
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubAuth(); unsubToken(); unsubQ(); unsubL(); };
  }, []);

  useEffect(() => {
    const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
    setIsAuthorized(activeToken && tokenFromUrl === activeToken);
  }, [activeToken]);

  const showMsg = (text, type = "success") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: "", type: "" }), 4000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setView("core");
    } catch (err) { showMsg("Access Denied: Invalid Credentials", "danger"); }
  };

  const handleAdminAction = async () => {
    if (!qText) return;
    const payload = { 
        text: qText, 
        type: qType, 
        required: qRequired,
        options: qType === "radio" ? qOptions.split(",").map(o => o.trim()) : [], 
        createdAt: serverTimestamp() 
    };
    try {
      editingId ? await updateDoc(doc(db, "questions", editingId), payload) : await addDoc(collection(db, "questions"), payload);
      setQText(""); setQOptions(""); setQRequired(false); setEditingId(null);
      showMsg("Field Configuration Saved");
    } catch (e) { showMsg("Error saving field", "danger"); }
  };

  const isFormInvalid = () => {
    if (!traineeName.trim()) return true;
    return questions.some(q => q.required && (!answers[q.id] || answers[q.id] === ""));
  };

  // Fixed downloadQR with padding to prevent clipping
  const downloadQR = () => {
    const svg = qrRef.current.querySelector("svg");
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const img = new Image();
    
    img.onload = () => {
      const padding = 40; // Internal border so QR is not cut
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding * 2;
      const ctx = canvas.getContext("2d");
      
      // Fill background white
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw QR code in the middle
      ctx.drawImage(img, padding, padding);
      
      const a = document.createElement("a");
      a.download = "Diego_CheckIn_QR.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
      showMsg("QR Image Exported");
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const exportPDF = () => {
    const doc = new jsPDF('landscape');
    const headers = [["TRAINEE", "DATE", ...questions.map(q => q.text.toUpperCase())]];
    const filtered = logs.filter(l => l.trainee.toLowerCase().includes(searchTerm.toLowerCase()));
    const data = filtered.map(log => [
      log.trainee, log.time?.toDate().toLocaleDateString(), ...questions.map(q => log.answers?.[q.id] || "-")
    ]);
    autoTable(doc, { head: headers, body: data, theme: 'grid', styles: { fontSize: 8 } });
    doc.save("DiegoOS_Export.pdf");
    showMsg("PDF Exported Successfully");
  };

  const qrUrl = `${window.location.origin}${window.location.pathname}?token=${activeToken}`;

  return (
    <div className="app-container">
      <header className="header">
        <div className="brand cursor-pointer" onClick={() => setView("main")}>
          <span className="store">DIEGO</span><span className="checklist">OS</span>
        </div>
        <div className="nav-group">
          <button className={`nav-btn ${view === "main" ? "active" : ""}`} onClick={() => setView("main")}>Check In Form</button>
          <button className={`nav-btn ${view === "reports" ? "active" : ""}`} onClick={() => setView("reports")}>Check In Logs</button>
          <button className={`nav-btn ${view === "core" ? "active" : ""}`} onClick={() => setView("core")}>Admin Panel</button>
          {user && <button className="nav-btn danger" onClick={() => signOut(auth)}>Logout</button>}
        </div>
      </header>

      <main>
        {statusMsg.text && (
          <div className={`inline-msg ${statusMsg.type === 'danger' ? 'msg-danger' : 'msg-success'}`}>
            {statusMsg.text}
          </div>
        )}

        {view === "main" && (
          <div className="card">
            {!isAuthorized ? (
              <div style={{textAlign: 'center', padding: '40px'}}>
                <div style={{fontSize: '3rem', marginBottom: '10px'}}>🔒</div>
                <h2 style={{color: 'var(--danger)', marginBottom: '10px'}}>ACCESS RESTRICTED</h2>
                <p style={{color: 'var(--text-secondary)'}}>Scan the latest protocol QR code to unlock this form.</p>
              </div>
            ) : (
              <>
                <div style={{marginBottom: '30px'}}>
                   <span className="input-label">Trainee Identity *</span>
                   <input className="input-field" placeholder="Full Name..." value={traineeName} onChange={(e) => setTraineeName(e.target.value)} />
                </div>
                {questions.map((q) => (
                  <div key={q.id} className="question-row">
                    <p style={{marginBottom: '12px', fontWeight: '600'}}>
                        {q.text} {q.required && <span style={{color: 'var(--danger)'}}>*</span>}
                    </p>
                    {(q.type === "yesno" || q.type === "radio") && (
                      <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                        {(q.type === "yesno" ? ["Yes", "No", "N/A"] : q.options).map(o => (
                          <button key={o} 
                            className={`opt-btn 
                              ${answers[q.id] === o && o === 'Yes' ? 'active-yes' : ''} 
                              ${answers[q.id] === o && o === 'No' ? 'active-no' : ''} 
                              ${answers[q.id] === o && (o === 'N/A' || q.type === 'radio') ? 'active-na' : ''}`
                            } 
                            onClick={() => setAnswers({...answers, [q.id]: o})}>{o}</button>
                        ))}
                      </div>
                    )}
                    {q.type === "input" && <input className="input-field" placeholder={q.required ? "Required notes..." : "Optional notes..."} value={answers[q.id] || ""} onChange={(e) => setAnswers({...answers, [q.id]: e.target.value})} />}
                  </div>
                ))}
                <button 
                  className="nav-btn primary" 
                  style={{width: '100%', padding: '16px'}} 
                  disabled={isFormInvalid()}
                  onClick={async () => {
                    await addDoc(collection(db, "logs"), { trainee: traineeName, answers, time: serverTimestamp() });
                    showMsg("Check-In Protocol Recorded");
                    setAnswers({}); setTraineeName("");
                }}>{isFormInvalid() ? "REQUIRED FIELDS MISSING" : "SUBMIT CHECK-IN"}</button>
              </>
            )}
          </div>
        )}

        {(view === "reports" || view === "core") && !user && (
          <div className="card" style={{maxWidth: '400px', margin: '40px auto'}}>
            <h2 style={{marginBottom: '20px', textAlign: 'center'}}>ADMIN SECURE LOGIN</h2>
            <form onSubmit={handleLogin}>
              <span className="input-label">Email Address</span>
              <input className="input-field" placeholder="admin@diego.os" onChange={e => setEmail(e.target.value)} style={{marginBottom: '10px'}} />
              <span className="input-label">Password</span>
              <input className="input-field" type="password" placeholder="••••••••" onChange={e => setPassword(e.target.value)} style={{marginBottom: '20px'}} />
              <button className="nav-btn primary" style={{width: '100%'}}>AUTHORIZE ACCESS</button>
            </form>
          </div>
        )}

        {user && view === "reports" && (
          <div className="card">
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '12px'}}>
              <input className="input-field" style={{maxWidth: '300px'}} placeholder="Filter Logs..." onChange={e => setSearchTerm(e.target.value)} />
              <button className="nav-btn success" onClick={exportPDF}>Export Master PDF</button>
            </div>
            <div className="admin-table-container">
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem'}}>
                <thead>
                  <tr style={{textAlign: 'left', color: 'var(--accent-cyan)', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                    <th style={{padding: '15px'}}>TRAINEE</th>
                    <th style={{padding: '15px'}}>TIMESTAMP</th>
                    {questions.map(q => <th key={q.id} style={{padding: '15px'}}>{q.text.toUpperCase()}</th>)}
                    <th style={{padding: '15px'}}>DEL</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.filter(l => l.trainee.toLowerCase().includes(searchTerm.toLowerCase())).map(log => (
                    <tr key={log.id} style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                      <td style={{padding: '12px 15px', fontWeight: '700', color: 'var(--accent-orange)'}}>{log.trainee}</td>
                      <td style={{padding: '12px 15px', color: 'var(--text-secondary)'}}>{log.time?.toDate().toLocaleDateString()}</td>
                      {questions.map(q => {
                        const val = log.answers?.[q.id] || "-";
                        const color = val === 'Yes' ? 'var(--success)' : val === 'No' ? 'var(--danger)' : 'white';
                        return <td key={q.id} style={{padding: '12px 15px', color}}>{val}</td>
                      })}
                      <td style={{padding: '12px 15px'}}>
                        <button className="nav-btn danger" style={{padding: '4px 8px'}} onClick={async () => {
                           if(window.confirm("Purge record?")) {
                             await deleteDoc(doc(db, "logs", log.id));
                             showMsg("Record Purged", "danger");
                           }
                        }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {user && view === "core" && (
          <div className="card">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Dynamic QR System</span>
                <div ref={qrRef} className="qr-box" style={{margin: '10px 0'}}><QRCodeSVG value={qrUrl} size={130} /></div>
                <div style={{display: 'flex', gap: '8px'}}>
                  <button className="nav-btn primary" onClick={downloadQR} style={{flex: 1}}>Download</button>
                  <button className="nav-btn danger" onClick={async () => {
                    const nt = Math.random().toString(36).substring(2, 15);
                    await setDoc(doc(db, "settings", "security"), { activeToken: nt });
                    showMsg("Security Token Rotated", "danger");
                  }}>Rotate</button>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-label">Active Database Entries</span>
                <div className="stat-value">{logs.length}</div>
              </div>
            </div>

            <div style={{marginTop: '30px'}}>
              <span className="input-label">Protocol Field Management</span>
              <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px'}}>
                <input className="input-field" value={qText} onChange={e => setQText(e.target.value)} placeholder="Field Label Name" />
                <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                  <select className="input-field" value={qType} onChange={e => setQType(e.target.value)} style={{flex: 2}}>
                    <option value="yesno">Yes/No/NA</option>
                    <option value="radio">Options</option>
                    <option value="input">Text Field</option>
                  </select>
                  <label className="checkbox-label" style={{flex: 1}}>
                    <input type="checkbox" checked={qRequired} onChange={e => setQRequired(e.target.checked)} />
                    Required
                  </label>
                  <button className="nav-btn primary" onClick={handleAdminAction} style={{flex: 1}}>{editingId ? "Update" : "Add"}</button>
                </div>
                {qType === 'radio' && <input className="input-field" placeholder="Option1, Option2, Option3..." value={qOptions} onChange={e => setQOptions(e.target.value)} />}
              </div>
              {questions.map(q => (
                <div key={q.id} className="stat-card" style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center'}}>
                  <span>{q.text} {q.required && <span style={{color: 'var(--danger)', fontSize: '0.7rem'}}> [MANDATORY]</span>}</span>
                  <div style={{display: 'flex', gap: '8px'}}>
                    <button className="nav-btn" style={{padding: '5px 12px'}} onClick={() => {
                        setEditingId(q.id); setQText(q.text); setQType(q.type); 
                        setQRequired(q.required || false); setQOptions(q.options?.join(",") || "")
                    }}>Edit</button>
                    <button className="nav-btn danger" onClick={async () => {
                      await deleteDoc(doc(db, "questions", q.id));
                      showMsg("Field Deleted", "danger");
                    }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}