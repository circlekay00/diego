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
  
  // Login & Admin State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState("yesno");
  const [qOptions, setQOptions] = useState("");
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

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setView("core");
    } catch (err) { alert("Access Denied: " + err.message); }
  };

  const handleAdminAction = async () => {
    if (!qText) return;
    const payload = { 
        text: qText, 
        type: qType, 
        options: qType === "radio" ? qOptions.split(",").map(o => o.trim()) : [], 
        createdAt: serverTimestamp() 
    };
    editingId ? await updateDoc(doc(db, "questions", editingId), payload) : await addDoc(collection(db, "questions"), payload);
    setQText(""); setQOptions(""); setEditingId(null);
  };

  const downloadQR = () => {
    const svg = qrRef.current.querySelector("svg");
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a"); a.download = "Diego_QR.png"; a.href = canvas.toDataURL(); a.click();
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
        {/* MAIN VIEW: STICKY FORM - NO LOGIN ALLOWED HERE */}
        {view === "main" && (
          <div className="card">
            {!isAuthorized ? (
              <div style={{textAlign: 'center', padding: '40px'}}>
                <div style={{fontSize: '3rem', marginBottom: '10px'}}>🔒</div>
                <h2 style={{color: 'var(--danger)', marginBottom: '10px'}}>ACCESS RESTRICTED</h2>
                <p style={{color: 'var(--text-secondary)'}}>Scan the current protocol QR code to unlock this form.</p>
              </div>
            ) : (
              <>
                <div style={{marginBottom: '30px'}}>
                   <span className="input-label">Trainee Identity</span>
                   <input className="input-field" placeholder="Full Name..." value={traineeName} onChange={(e) => setTraineeName(e.target.value)} />
                </div>
                {questions.map((q) => (
                  <div key={q.id} style={{marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '20px'}}>
                    <p style={{marginBottom: '12px', fontWeight: '600'}}>{q.text}</p>
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
                    {q.type === "input" && <input className="input-field" placeholder="Entry notes..." value={answers[q.id] || ""} onChange={(e) => setAnswers({...answers, [q.id]: e.target.value})} />}
                  </div>
                ))}
                <button className="nav-btn primary" style={{width: '100%', padding: '16px'}} onClick={async () => {
                  if(!traineeName) return alert("Identify Trainee First");
                  await addDoc(collection(db, "logs"), { trainee: traineeName, answers, time: serverTimestamp() });
                  alert("Protocol Recorded."); setAnswers({}); setTraineeName("");
                }}>SUBMIT DATA</button>
              </>
            )}
          </div>
        )}

        {/* LOGIN GATE: ONLY APPEARS FOR PROTECTED TABS */}
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

        {/* PROTECTED LOGS VIEW */}
        {user && view === "reports" && (
          <div className="card">
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '12px'}}>
              <input className="input-field" style={{maxWidth: '300px'}} placeholder="Filter by Name..." onChange={e => setSearchTerm(e.target.value)} />
              <button className="nav-btn success" onClick={exportPDF}>Export Master PDF</button>
            </div>
            <div style={{overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '16px'}}>
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem'}}>
                <thead>
                  <tr style={{textAlign: 'left', color: 'var(--accent-cyan)', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                    <th style={{padding: '15px'}}>TRAINEE</th>
                    <th style={{padding: '15px'}}>TIMESTAMP</th>
                    {questions.map(q => <th key={q.id} style={{padding: '15px'}}>{q.text.toUpperCase()}</th>)}
                    <th style={{padding: '15px'}}>PURGE</th>
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
                        <button className="nav-btn danger" style={{padding: '4px 8px'}} onClick={() => {if(window.confirm("Purge record?")) deleteDoc(doc(db, "logs", log.id))}}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PROTECTED ADMIN PANEL */}
        {user && view === "core" && (
          <div className="card">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Security Token</span>
                <div ref={qrRef} className="qr-box" style={{margin: '10px 0'}}><QRCodeSVG value={qrUrl} size={130} /></div>
                <div style={{display: 'flex', gap: '8px'}}>
                  <button className="nav-btn primary" onClick={downloadQR} style={{flex: 1}}>Save QR</button>
                  <button className="nav-btn danger" onClick={async () => {
                    const nt = Math.random().toString(36).substring(2, 15);
                    await setDoc(doc(db, "settings", "security"), { activeToken: nt });
                  }}>Rotate</button>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-label">Database Status</span>
                <div className="stat-value">{logs.length}</div>
                <div className="stat-label">Total Logs In System</div>
              </div>
            </div>

            <div style={{marginTop: '30px'}}>
              <span className="input-label">Protocol Field Management</span>
              <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px'}}>
                <input className="input-field" value={qText} onChange={e => setQText(e.target.value)} placeholder="Enter Question Name" />
                <div style={{display: 'flex', gap: '10px'}}>
                  <select className="input-field" value={qType} onChange={e => setQType(e.target.value)}>
                    <option value="yesno">Binary (Yes/No)</option>
                    <option value="radio">Options</option>
                    <option value="input">Text</option>
                  </select>
                  <button className="nav-btn primary" onClick={handleAdminAction}>{editingId ? "Update" : "Add Field"}</button>
                </div>
                {qType === 'radio' && <input className="input-field" placeholder="Comma separated options" value={qOptions} onChange={e => setQOptions(e.target.value)} />}
              </div>
              {questions.map(q => (
                <div key={q.id} className="stat-card" style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center'}}>
                  <span>{q.text}</span>
                  <div style={{display: 'flex', gap: '8px'}}>
                    <button className="nav-btn" style={{padding: '5px 12px'}} onClick={() => {setEditingId(q.id); setQText(q.text); setQType(q.type); setQOptions(q.options?.join(",") || "")}}>Edit</button>
                    <button className="nav-btn danger" onClick={() => deleteDoc(doc(db, "questions", q.id))}>×</button>
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