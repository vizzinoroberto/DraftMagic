import { useState, useEffect, useRef } from "react";
import { db } from "./firebaseClient";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { MAGIC_LOGO } from "./assets/logo";

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  bg: "#0a0e1a", surface: "#111827", card: "#1a2235", border: "#2a3550",
  accent: "#c89b3c", accentDark: "#8a6a28", accentGlow: "#c89b3c33",
  blue: "#4a90d9", red: "#d94a4a", green: "#4abd7a", purple: "#9b59b6",
  text: "#e8dcc8", textDim: "#8a9ab5", white: "#ffffff",
};

const SCORE_OPTIONS = [
  { label: "2 – 0", p1: 2, p2: 0 },
  { label: "2 – 1", p1: 2, p2: 1 },
  { label: "1 – 1", p1: 1, p2: 1 },
  { label: "1 – 2", p1: 1, p2: 2 },
  { label: "0 – 2", p1: 0, p2: 2 },
];

const SCREENS = { SETUP: "setup", DRAFT: "draft", TOURNAMENT: "tournament", RESULTS: "results" };

// ============================================================
// HELPERS
// ============================================================

function generateRoundRobinSchedule(players) {
  const ids = players.map((p) => p.id);
  const list = ids.length % 2 === 0 ? [...ids] : [...ids, null];
  const m = list.length;
  const rounds = [];
  for (let r = 0; r < m - 1; r++) {
    const round = [];
    for (let i = 0; i < m / 2; i++) round.push([list[i], list[m - 1 - i]]);
    rounds.push(round);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

function swissRoundsCount(n) {
  if (n <= 8) return 3;
  if (n <= 16) return 4;
  return 5;
}

function generateSwissPairings(players, history) {
  const sorted = [...players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.omwp !== a.omwp) return b.omwp - a.omwp;
    return b.wins - a.wins;
  });
  const paired = new Set();
  const pairings = [];
  for (let i = 0; i < sorted.length; i++) {
    if (paired.has(sorted[i].id)) continue;
    let partner = null;
    // Prima prova senza rivincita
    for (let j = i + 1; j < sorted.length; j++) {
      if (paired.has(sorted[j].id)) continue;
      const key = [sorted[i].id, sorted[j].id].sort().join("-");
      if (!history.has(key)) { partner = sorted[j]; break; }
    }
    // Se necessario, ammetti rivincita
    if (!partner) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (!paired.has(sorted[j].id)) { partner = sorted[j]; break; }
      }
    }
    if (partner) {
      pairings.push({ p1: sorted[i], p2: partner, score: null });
      paired.add(sorted[i].id);
      paired.add(partner.id);
    } else {
      pairings.push({ p1: sorted[i], p2: null, score: null });
      paired.add(sorted[i].id);
    }
  }
  return pairings;
}

function scoreToPoints(p1s, p2s) {
  if (p1s > p2s) return { p1pts: 3, p2pts: 0, p1win: true, p2win: false };
  if (p2s > p1s) return { p1pts: 0, p2pts: 3, p1win: false, p2win: true };
  return { p1pts: 1, p2pts: 1, p1win: false, p2win: false };
}

function formatTime(seconds) {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getDateFromValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = getDateFromValue(value);
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function StandingsTable({ rankings }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ color: COLORS.textDim, fontSize: 11, letterSpacing: 1 }}>
          {["#", "Giocatore", "Punti", "V", "P", "S", "Partite", "OMW%"].map((h) => (
            <th key={h} style={{ textAlign: h === "Giocatore" ? "left" : "center", padding: "6px 8px", borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rankings.map((p, i) => (
          <tr key={i} style={{ background: i === 0 ? COLORS.accent + "11" : "transparent", borderBottom: `1px solid ${COLORS.border}22` }}>
            <td style={{ textAlign: "center", padding: "10px 8px" }}>
              <span style={{
                display: "inline-flex", width: 22, height: 22, borderRadius: "50%",
                alignItems: "center", justifyContent: "center",
                background: i === 0 ? COLORS.accent : i === 1 ? "#9a9a9a" : i === 2 ? "#cd7f32" : COLORS.card,
                color: i < 3 ? "#000" : COLORS.textDim, fontSize: 11, fontWeight: 700,
              }}>{i + 1}</span>
            </td>
            <td style={{ padding: "10px 8px", fontWeight: i === 0 ? 700 : 400 }}>{p.name || p.player_name}</td>
            <td style={{ textAlign: "center", padding: "10px 8px", color: COLORS.accent, fontWeight: 700 }}>{p.points}</td>
            <td style={{ textAlign: "center", padding: "10px 8px", color: COLORS.green }}>{p.wins}</td>
            <td style={{ textAlign: "center", padding: "10px 8px", color: COLORS.textDim }}>{p.draws}</td>
            <td style={{ textAlign: "center", padding: "10px 8px", color: COLORS.red }}>{p.losses}</td>
            <td style={{ textAlign: "center", padding: "10px 8px", fontSize: 11, color: COLORS.textDim }}>
              {p.games_won ?? p.gamesWon ?? 0}-{p.games_lost ?? p.gamesLost ?? 0}
            </td>
            <td style={{ textAlign: "center", padding: "10px 8px", fontSize: 11, color: COLORS.blue }}>
              {((p.omwp || 0) * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RectangularTable({ players }) {
  const n = players.length;
  const topCount = Math.ceil(n / 2);
  const topPlayers = players.slice(0, topCount);
  const bottomPlayers = [...players.slice(topCount)].reverse();

  const Seat = ({ p, index, side }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1 }}>
      {side === "bottom" && <div style={{ fontSize: 9, color: COLORS.textDim }}>▲</div>}
      <div style={{
        background: COLORS.surface, border: `2px solid ${COLORS.accent}`,
        borderRadius: 8, padding: "5px 7px", textAlign: "center", minWidth: 52,
        boxShadow: `0 0 8px ${COLORS.accentGlow}`,
      }}>
        <div style={{ fontSize: 9, color: COLORS.accent, fontWeight: 700 }}>#{index + 1}</div>
        <div style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.3 }}>
          {p.name.length > 7 ? p.name.slice(0, 7) + "…" : p.name}
        </div>
      </div>
      {side === "top" && <div style={{ fontSize: 9, color: COLORS.textDim }}>▼</div>}
    </div>
  );

  return (
    <div style={{ padding: "0 8px" }}>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 6 }}>
        {topPlayers.map((p, i) => <Seat key={p.id} p={p} index={i} side="top" />)}
      </div>
      <div style={{
        background: "linear-gradient(180deg, #1a3a1a 0%, #0d200d 100%)",
        border: `2px solid #2a5a2a`, borderRadius: 10, height: 50,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 6,
      }}>
        <span style={{ fontSize: 18 }}>🃏</span>
        <span style={{ fontSize: 10, color: "#4abd7a", letterSpacing: 3 }}>TAVOLO DRAFT</span>
        <span style={{ fontSize: 12, color: "#4abd7a66" }}>↻</span>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {bottomPlayers.map((p, i) => (
          <Seat key={p.id} p={p} index={topCount + (bottomPlayers.length - 1 - i)} side="bottom" />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CLASSIFICA GENERALE COMPONENT
// ============================================================

function ClassificaGenerale({ tournaments }) {
  const [filterMode, setFilterMode] = useState("all"); // "all" | "year" | "custom"
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Available years from tournament data
  const years = [...new Set(
    tournaments
      .map(t => getDateFromValue(t.createdAt))
      .filter(Boolean)
      .map(d => d.getFullYear())
  )].sort((a, b) => b - a);

  // Filter tournaments by selected period
  const filtered = tournaments.filter(t => {
    if (filterMode === "all") return true;
    const d = getDateFromValue(t.createdAt);
    if (!d) return false;
    if (filterMode === "year") return d.getFullYear() === filterYear;
    if (filterMode === "custom") {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }
    return true;
  });

  // Aggregate player stats across filtered tournaments
  const playerStats = {};
  filtered.forEach(t => {
    const standings = [...(t.tournament_standings || [])].sort((a, b) => a.position - b.position);
    standings.forEach(s => {
      const name = s.player_name;
      if (!playerStats[name]) {
        playerStats[name] = { name, wins: 0, second: 0, third: 0, played: 0, points: 0 };
      }
      playerStats[name].played++;
      if (s.position === 1) { playerStats[name].wins++;   playerStats[name].points += 3; }
      if (s.position === 2) { playerStats[name].second++; playerStats[name].points += 2; }
      if (s.position === 3) { playerStats[name].third++;  playerStats[name].points += 1; }
    });
  });

  const leaderboard = Object.values(playerStats).sort((a, b) => {
    if (b.wins    !== a.wins)    return b.wins    - a.wins;
    if (b.points  !== a.points)  return b.points  - a.points;
    if (b.second  !== a.second)  return b.second  - a.second;
    if (b.third   !== a.third)   return b.third   - a.third;
    return b.played - a.played;
  });

  const btnStyle = (active) => ({
    padding: "6px 14px", borderRadius: 6, cursor: "pointer",
    fontFamily: "Cinzel, serif", fontSize: 11, letterSpacing: 1,
    background: active ? COLORS.accent : COLORS.surface,
    color: active ? "#000" : COLORS.textDim,
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    fontWeight: active ? 700 : 400,
  });

  return (
    <div>
      {/* Filter bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: COLORS.textDim, letterSpacing: 2, marginBottom: 10 }}>PERIODO</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btnStyle(filterMode === "all")} onClick={() => setFilterMode("all")}>Tutti i tornei</button>
          <button style={btnStyle(filterMode === "year")} onClick={() => setFilterMode("year")}>Per anno</button>
          <button style={btnStyle(filterMode === "custom")} onClick={() => setFilterMode("custom")}>Periodo personalizzato</button>
        </div>

        {filterMode === "year" && (
          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {years.length > 0 ? years.map(y => (
              <button key={y} style={btnStyle(filterYear === y)} onClick={() => setFilterYear(y)}>{y}</button>
            )) : (
              <span style={{ fontSize: 12, color: COLORS.textDim, fontFamily: "Crimson Pro, serif" }}>Nessun anno disponibile</span>
            )}
          </div>
        )}

        {filterMode === "custom" && (
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: COLORS.textDim }}>Dal</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  color: COLORS.text, borderRadius: 6, padding: "6px 10px",
                  fontSize: 12, fontFamily: "Cinzel, serif", outline: "none",
                }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: COLORS.textDim }}>Al</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  color: COLORS.text, borderRadius: 6, padding: "6px 10px",
                  fontSize: 12, fontFamily: "Cinzel, serif", outline: "none",
                }} />
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 12, fontFamily: "Crimson Pro, serif", fontStyle: "italic" }}>
        {filtered.length} torneo{filtered.length !== 1 ? "i" : ""} nel periodo selezionato · {leaderboard.length} giocatori
      </div>

      {/* Leaderboard */}
      {leaderboard.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: COLORS.textDim, fontFamily: "Crimson Pro, serif" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          Nessun dato per il periodo selezionato
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: COLORS.textDim, fontSize: 10, letterSpacing: 1 }}>
              {["#", "Giocatore", "🥇", "🥈", "🥉", "Tornei", "Punti"].map(h => (
                <th key={h} style={{ textAlign: h === "Giocatore" ? "left" : "center", padding: "6px 8px", borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((p, i) => (
              <tr key={p.name} style={{
                background: i === 0 ? COLORS.accent + "11" : "transparent",
                borderBottom: `1px solid ${COLORS.border}22`,
              }}>
                <td style={{ textAlign: "center", padding: "10px 8px" }}>
                  <span style={{
                    display: "inline-flex", width: 22, height: 22, borderRadius: "50%",
                    alignItems: "center", justifyContent: "center",
                    background: i === 0 ? COLORS.accent : i === 1 ? "#9a9a9a" : i === 2 ? "#cd7f32" : COLORS.card,
                    color: i < 3 ? "#000" : COLORS.textDim, fontSize: 11, fontWeight: 700,
                  }}>{i + 1}</span>
                </td>
                <td style={{ padding: "10px 8px", fontWeight: i === 0 ? 700 : 400 }}>{p.name}</td>
                <td style={{ textAlign: "center", padding: "10px 8px", color: COLORS.accent, fontWeight: 700 }}>{p.wins || "—"}</td>
                <td style={{ textAlign: "center", padding: "10px 8px", color: "#9a9a9a" }}>{p.second || "—"}</td>
                <td style={{ textAlign: "center", padding: "10px 8px", color: "#cd7f32" }}>{p.third || "—"}</td>
                <td style={{ textAlign: "center", padding: "10px 8px", color: COLORS.textDim }}>{p.played}</td>
                <td style={{ textAlign: "center", padding: "10px 8px", color: COLORS.blue, fontWeight: 700 }}>{p.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {leaderboard.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 10, color: COLORS.textDim, fontFamily: "Crimson Pro, serif", fontStyle: "italic" }}>
          Punti classifica: 🥇 = 3pt · 🥈 = 2pt · 🥉 = 1pt
        </div>
      )}
    </div>
  );
}

// ============================================================
// PLAYER COMBOBOX COMPONENT
// ============================================================

function PlayerCombobox({ value, onChange, suggestions }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const containerRef = useRef(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase())
  );

  const commit = (name) => {
    const final = name !== undefined ? name : input;
    setInput(final);
    onChange(final);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input
        value={input}
        onChange={(e) => { setInput(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { commit(undefined); e.target.blur(); }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{
          background: "transparent", border: "none", outline: "none",
          color: "#e8dcc8", fontSize: 13, width: "100%", fontFamily: "Cinzel, serif",
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: -44, right: -12,
          background: "#1a2235", border: "1px solid #c89b3c",
          borderRadius: 8, zIndex: 500, maxHeight: 180, overflowY: "auto",
          boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
        }}>
          {filtered.map((s) => (
            <div
              key={s}
              onMouseDown={(e) => { e.preventDefault(); commit(s); }}
              style={{
                padding: "9px 14px", cursor: "pointer", fontSize: 13,
                color: "#e8dcc8", borderBottom: "1px solid rgba(42,53,80,0.4)",
                fontFamily: "Cinzel, serif",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#111827"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// REGISTRO COMPONENT
// ============================================================

function RegistroPanel({ isAdmin, tournaments, loading, onRefresh, onDelete, onSelect, selectedId }) {
  if (loading) return (
    <div style={{ textAlign: "center", padding: 32, color: COLORS.textDim }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
      Caricamento tornei...
    </div>
  );

  if (tournaments.length === 0) return (
    <div style={{ textAlign: "center", padding: 32, color: COLORS.textDim, fontFamily: "Crimson Pro, serif" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
      Nessun torneo registrato ancora.<br />
      <span style={{ fontSize: 12 }}>Completa il tuo primo torneo per vederlo qui!</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {tournaments.map((t) => {
        const standings = [...(t.tournament_standings || [])].sort((a, b) => a.position - b.position);
        const winner = standings[0]?.player_name || "—";
        const isExpanded = selectedId === t.id;
        return (
          <div key={t.id} style={{
            background: COLORS.surface,
            border: `1px solid ${isExpanded ? COLORS.accent : COLORS.border}`,
            borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s",
          }}>
            {/* Card header */}
            <div
              onClick={() => onSelect(isExpanded ? null : t)}
              style={{ display: "flex", alignItems: "center", padding: "12px 16px", cursor: "pointer", gap: 12 }}
            >
              <div style={{ fontSize: 22 }}>🏆</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: COLORS.accent }}>🥇</span> {winner}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                  {formatDate(t.createdAt)} · {t.player_count} giocatori · {t.total_rounds} turni
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (window.confirm("Eliminare questo torneo?")) onDelete(t.id); }}
                  style={{
                    background: COLORS.red + "22", color: COLORS.red,
                    border: `1px solid ${COLORS.red}44`, borderRadius: 6,
                    padding: "4px 10px", cursor: "pointer", fontSize: 11,
                    fontFamily: "Cinzel, serif", flexShrink: 0,
                  }}
                >🗑 Elimina</button>
              )}
              <div style={{ color: COLORS.textDim, fontSize: 11, flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</div>
            </div>

            {/* Expanded standings */}
            {isExpanded && standings.length > 0 && (
              <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 16px" }}>
                <StandingsTable rankings={standings} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// ADMIN MODAL
// ============================================================

function AdminModal({ onClose, tournaments, loading, onRefresh, onDelete, onSelect, selectedId, playerNames, onDeletePlayer }) {
  const [auth, setAuth] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [adminTab, setAdminTab] = useState("tornei"); // "tornei" | "giocatori" 

  const handleLogin = () => {
    const expected = import.meta.env.VITE_ADMIN_PASSWORD || "admin123";
    if (pwInput === expected) {
      setAuth(true);
      setPwError("");
    } else {
      setPwError("Password errata");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000b",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 2000, padding: 16,
    }}>
      <div style={{
        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
        borderRadius: 16, width: "100%", maxWidth: 720,
        maxHeight: "88vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 8px 40px #000a",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.card,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, letterSpacing: 2 }}>
            ⚙ ADMIN DASHBOARD
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: COLORS.textDim, cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {!auth ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "24px 0" }}>
              <div style={{ fontSize: 32 }}>🔒</div>
              <div style={{ fontSize: 13, color: COLORS.textDim }}>Inserisci la password admin</div>
              <input
                type="password"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Password..."
                autoFocus
                style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, padding: "10px 16px", color: COLORS.text,
                  fontSize: 14, width: "100%", maxWidth: 300, outline: "none",
                  fontFamily: "Cinzel, serif",
                }}
              />
              {pwError && <div style={{ color: COLORS.red, fontSize: 12 }}>{pwError}</div>}
              <button onClick={handleLogin} style={{
                background: `linear-gradient(135deg, ${COLORS.accentDark}, ${COLORS.accent})`,
                border: "none", borderRadius: 8, padding: "10px 28px",
                color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13,
                fontFamily: "Cinzel, serif", letterSpacing: 2,
              }}>ACCEDI</button>
            </div>
          ) : (
            <div>
              {/* Admin tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                {[["tornei", `🏆 Tornei (${tournaments.length})`], ["giocatori", `👤 Giocatori (${playerNames.length})`]].map(([tab, label]) => (
                  <button key={tab} onClick={() => setAdminTab(tab)} style={{
                    padding: "7px 16px", borderRadius: 6, cursor: "pointer",
                    fontFamily: "Cinzel, serif", fontSize: 11, letterSpacing: 1,
                    background: adminTab === tab ? COLORS.accent : COLORS.surface,
                    color: adminTab === tab ? "#000" : COLORS.textDim,
                    border: `1px solid ${adminTab === tab ? COLORS.accent : COLORS.border}`,
                    fontWeight: adminTab === tab ? 700 : 400,
                  }}>{label}</button>
                ))}
                <button onClick={onRefresh} style={{
                  marginLeft: "auto", background: "transparent", border: "none",
                  color: COLORS.textDim, cursor: "pointer", fontSize: 16,
                }} title="Aggiorna">🔄</button>
              </div>

              {/* Tab: Tornei */}
              {adminTab === "tornei" && (
                <RegistroPanel
                  isAdmin={true}
                  tournaments={tournaments}
                  loading={loading}
                  onRefresh={onRefresh}
                  onDelete={onDelete}
                  onSelect={onSelect}
                  selectedId={selectedId}
                />
              )}

              {/* Tab: Giocatori */}
              {adminTab === "giocatori" && (
                <div>
                  {playerNames.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 32, color: COLORS.textDim, fontFamily: "Crimson Pro, serif" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
                      Nessun giocatore salvato ancora.<br />
                      <span style={{ fontSize: 12 }}>I nomi vengono salvati automaticamente al termine di ogni torneo.</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {playerNames.map((p) => (
                        <div key={p.id} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                          borderRadius: 8, padding: "10px 14px",
                        }}>
                          <div style={{ fontSize: 14 }}>👤</div>
                          <div style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: COLORS.textDim, fontFamily: "Crimson Pro, serif", marginRight: 8 }}>
                            {formatDate(p.createdAt)}
                          </div>
                          <button
                            onClick={() => { if (window.confirm(`Eliminare "${p.name}" dai suggerimenti?`)) onDeletePlayer(p.id); }}
                            style={{
                              background: COLORS.red + "22", color: COLORS.red,
                              border: `1px solid ${COLORS.red}44`, borderRadius: 6,
                              padding: "4px 10px", cursor: "pointer", fontSize: 11,
                              fontFamily: "Cinzel, serif", flexShrink: 0,
                            }}
                          >🗑 Rimuovi</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  // --- Game state ---
  const [screen, setScreen] = useState(SCREENS.SETUP);
  const [setupTab, setSetupTab] = useState("players");
  const [playerCount, setPlayerCount] = useState(8);
  const [players, setPlayers] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i + 1, name: `Giocatore ${i + 1}`,
      points: 0, wins: 0, losses: 0, draws: 0, gamesWon: 0, gamesLost: 0, omwp: 0,
    }))
  );
  const [matchDuration, setMatchDuration] = useState(50);
  const [tournamentType, setTournamentType] = useState("roundrobin"); // "roundrobin" | "swiss"
  const [draftSeating, setDraftSeating] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [swissTotalRounds, setSwissTotalRounds] = useState(0);
  const [swissMatchHistory, setSwissMatchHistory] = useState(new Set());
  const [round, setRound] = useState(1);
  const [pairings, setPairings] = useState([]);
  const [allRounds, setAllRounds] = useState([]);
  const [activeTab, setActiveTab] = useState("pairings");

  // Timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [timerFullscreen, setTimerFullscreen] = useState(false);
  const timerRef = useRef(null);

  // Registro / DB
  const [registroTournaments, setRegistroTournaments] = useState([]);
  const [registroLoading, setRegistroLoading] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Player names (autocomplete)
  const [savedPlayerNames, setSavedPlayerNames] = useState([]);

  // Admin
  const [adminOpen, setAdminOpen] = useState(false);

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (timerRunning && timerSeconds > 0) {
      timerRef.current = setTimeout(() => setTimerSeconds((s) => s - 1), 1000);
    } else if (timerRunning && timerSeconds === 0) {
      setTimerRunning(false);
      setTimerExpired(true);
    }
    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timerSeconds]);

  useEffect(() => {
    fetchTournaments();
    fetchPlayerNames();
  }, []);

  // ============================================================
  // FIREBASE FUNCTIONS
  // ============================================================

  const fetchPlayerNames = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, "players"), orderBy("name", "asc")));
      setSavedPlayerNames(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Errore caricamento nomi:", err.message);
    }
  };

  const saveNewPlayerNames = async (names) => {
    try {
      // Get current names to avoid duplicates
      const snapshot = await getDocs(collection(db, "players"));
      const existing = new Set(snapshot.docs.map((d) => d.data().name?.toLowerCase()));
      const toAdd = names.filter((n) => n && n.trim() && !n.startsWith("Giocatore ") && !existing.has(n.toLowerCase().trim()));
      for (const name of toAdd) {
        await addDoc(collection(db, "players"), { name: name.trim(), createdAt: serverTimestamp() });
      }
      if (toAdd.length > 0) fetchPlayerNames();
    } catch (err) {
      console.error("Errore salvataggio nomi:", err.message);
    }
  };

  const deletePlayerName = async (id) => {
    try {
      await deleteDoc(doc(db, "players", id));
      setSavedPlayerNames((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Errore cancellazione nome:", err.message);
      alert("Errore nella cancellazione.");
    }
  };

  const fetchTournaments = async () => {
    setRegistroLoading(true);
    try {
      const q = query(collection(db, "tournaments"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRegistroTournaments(data);
    } catch (err) {
      console.error("Errore caricamento tornei:", err.message);
    } finally {
      setRegistroLoading(false);
    }
  };

  const saveTournament = async (finalPlayers, allRoundsData, totalRoundsCount) => {
    setSaving(true);
    setSaveError(null);
    try {
      const sorted = [...finalPlayers].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.omwp !== a.omwp) return b.omwp - a.omwp;
        return b.wins - a.wins;
      });

      // Tutto in un unico documento — più semplice e nessun problema di subcollections
      const tournamentDoc = {
        createdAt: serverTimestamp(),
        player_count: finalPlayers.length,
        total_rounds: totalRoundsCount,
        // Classifica finale
        tournament_standings: sorted.map((p, idx) => ({
          position: idx + 1,
          player_name: p.name,
          points: p.points,
          wins: p.wins,
          losses: p.losses,
          draws: p.draws,
          games_won: p.gamesWon,
          games_lost: p.gamesLost,
          omwp: p.omwp,
        })),
        // Tutti i turni con gli incontri
        rounds: allRoundsData.map(({ round: rNum, pairings: rPairings }) => ({
          round_number: rNum,
          matches: rPairings.map((m) => ({
            player1_name: m.p1.name,
            player2_name: m.p2?.name || null,
            score_p1: m.score?.p1 ?? null,
            score_p2: m.score?.p2 ?? null,
            is_bye: !m.p2,
          })),
        })),
      };

      await addDoc(collection(db, "tournaments"), tournamentDoc);
      fetchTournaments();
      // Save new player names for autocomplete
      saveNewPlayerNames(finalPlayers.map((p) => p.name));
    } catch (err) {
      console.error("Errore salvataggio torneo:", err.message);
      setSaveError("Errore nel salvataggio. Controlla la configurazione Firebase.");
    } finally {
      setSaving(false);
    }
  };

  const deleteTournament = async (id) => {
    try {
      await deleteDoc(doc(db, "tournaments", id));
      setRegistroTournaments((prev) => prev.filter((t) => t.id !== id));
      if (selectedTournamentId === id) setSelectedTournamentId(null);
    } catch (err) {
      console.error("Errore cancellazione:", err.message);
      alert("Errore nella cancellazione del torneo.");
    }
  };

  const handleSelectTournament = (t) => {
    setSelectedTournamentId(t ? t.id : null);
  };

  // ============================================================
  // TOURNAMENT LOGIC
  // ============================================================

  const startTimer = () => {
    setTimerSeconds(matchDuration * 60);
    setTimerRunning(true);
    setTimerExpired(false);
  };

  const handlePlayerCountChange = (n) => {
    setPlayerCount(n);
    setPlayers(Array.from({ length: n }, (_, i) => ({
      id: i + 1, name: `Giocatore ${i + 1}`,
      points: 0, wins: 0, losses: 0, draws: 0, gamesWon: 0, gamesLost: 0, omwp: 0,
    })));
  };

  const startDraft = () => {
    setDraftSeating([...players].sort(() => Math.random() - 0.5));
    setScreen(SCREENS.DRAFT);
  };

  const buildPairings = (rnd, currentPlayers, sched) =>
    sched[rnd - 1].map(([aId, bId]) => ({
      p1: currentPlayers.find((p) => p.id === aId),
      p2: bId === null ? null : currentPlayers.find((p) => p.id === bId),
      score: null,
    }));

  const startTournament = () => {
    if (tournamentType === "roundrobin") {
      const sched = generateRoundRobinSchedule(players);
      setSchedule(sched);
      setSwissTotalRounds(0);
      setSwissMatchHistory(new Set());
      setPairings(buildPairings(1, players, sched));
    } else {
      const total = swissRoundsCount(players.length);
      setSwissTotalRounds(total);
      setSchedule([]);
      setSwissMatchHistory(new Set());
      setPairings(generateSwissPairings(players, new Set()));
    }
    setRound(1);
    setScreen(SCREENS.TOURNAMENT);
    setActiveTab("pairings");
    startTimer();
  };

  const setMatchScore = (idx, score) =>
    setPairings((prev) => prev.map((p, i) => (i === idx ? { ...p, score } : p)));

  const totalRounds = tournamentType === "swiss" ? swissTotalRounds : schedule.length;
  const allResultsIn = pairings.length > 0 && pairings.every((p) => p.score !== null);

  const confirmRound = () => {
    const updated = players.map((p) => ({ ...p }));
    pairings.forEach(({ p1, p2, score }) => {
      if (!p2) {
        const pl = updated.find((p) => p.id === p1.id);
        pl.points += 3; pl.wins += 1;
        return;
      }
      const up1 = updated.find((p) => p.id === p1.id);
      const up2 = updated.find((p) => p.id === p2.id);
      const { p1pts, p2pts, p1win, p2win } = scoreToPoints(score.p1, score.p2);
      up1.points += p1pts; up2.points += p2pts;
      up1.gamesWon += score.p1; up1.gamesLost += score.p2;
      up2.gamesWon += score.p2; up2.gamesLost += score.p1;
      if (p1win) { up1.wins++; up2.losses++; }
      else if (p2win) { up2.wins++; up1.losses++; }
      else { up1.draws++; up2.draws++; }
    });

    updated.forEach((p) => {
      const oppIds = pairings
        .filter(({ p1, p2 }) => p2 && (p1.id === p.id || p2.id === p.id))
        .map(({ p1, p2 }) => (p1.id === p.id ? p2.id : p1.id));
      if (oppIds.length) {
        const rates = oppIds.map((oid) => {
          const o = updated.find((x) => x.id === oid);
          const tot = o.wins + o.losses + o.draws;
          return tot > 0 ? Math.max(o.wins / tot, 1 / 3) : 1 / 3;
        });
        p.omwp = rates.reduce((a, b) => a + b, 0) / rates.length;
      }
    });

    const newAllRounds = [...allRounds, { round, pairings: pairings.map((p) => ({ ...p })) }];
    setPlayers(updated);
    setAllRounds(newAllRounds);

    const isLast = round >= totalRounds;

    if (tournamentType === "swiss") {
      // Aggiorna storico incontri Swiss
      const newHistory = new Set(swissMatchHistory);
      pairings.forEach(({ p1, p2 }) => {
        if (p2) newHistory.add([p1.id, p2.id].sort().join("-"));
      });
      setSwissMatchHistory(newHistory);
      if (isLast) {
        setTimerRunning(false);
        saveTournament(updated, newAllRounds, swissTotalRounds);
        setScreen(SCREENS.RESULTS);
      } else {
        const next = round + 1;
        setRound(next);
        setPairings(generateSwissPairings(updated, newHistory));
        setActiveTab("pairings");
        startTimer();
      }
    } else {
      if (isLast) {
        setTimerRunning(false);
        saveTournament(updated, newAllRounds, totalRounds);
        setScreen(SCREENS.RESULTS);
      } else {
        const next = round + 1;
        setRound(next);
        setPairings(buildPairings(next, updated, schedule));
        setActiveTab("pairings");
        startTimer();
      }
    }
  };

  const rankings = [...players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.omwp !== a.omwp) return b.omwp - a.omwp;
    return b.wins - a.wins;
  });

  const timerPct = matchDuration > 0 ? timerSeconds / (matchDuration * 60) : 0;
  const timerColor = timerExpired ? COLORS.red : timerPct > 0.5 ? COLORS.green : timerPct > 0.2 ? COLORS.accent : COLORS.red;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg, color: COLORS.text,
      fontFamily: "'Cinzel', 'Georgia', serif",
      backgroundImage: `radial-gradient(ellipse at 20% 20%, #1a2a4a22 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, #2a1a3a22 0%, transparent 60%)`,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />

      {/* ===== HEADER ===== */}
      <div style={{
        borderBottom: `1px solid ${COLORS.border}`,
        background: `linear-gradient(180deg, #0d1525 0%, ${COLORS.surface} 100%)`,
        padding: "14px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: `linear-gradient(135deg, ${COLORS.accentDark}, ${COLORS.accent})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, boxShadow: `0 0 20px ${COLORS.accentGlow}`, flexShrink: 0,
          }}>⚔️</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.accent, letterSpacing: 2 }}>DRAFT TOURNAMENT</div>
            <div style={{ fontSize: 11, color: COLORS.textDim, letterSpacing: 2, fontFamily: "Crimson Pro, serif", fontStyle: "italic" }}>
              QUEI DEE CARTE DA CUEO
            </div>
          </div>
          {screen !== SCREENS.SETUP && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {screen === SCREENS.TOURNAMENT && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* Timer display — click to fullscreen */}
                  <div
                    onClick={() => setTimerFullscreen(true)}
                    style={{
                      padding: "6px 16px", borderRadius: 8,
                      background: timerExpired ? COLORS.red + "22" : COLORS.card,
                      border: `2px solid ${timerColor}`, color: timerColor,
                      fontWeight: 700, fontSize: 20, letterSpacing: 2,
                      boxShadow: timerExpired ? `0 0 16px ${COLORS.red}55` : `0 0 8px ${timerColor}33`,
                      fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "center",
                      transition: "border-color 1s, color 1s",
                      cursor: "pointer",
                    }}>
                    {timerExpired ? "⏰ TEMPO!" : formatTime(timerSeconds)}
                  </div>
                  {/* Pause / Play buttons */}
                  {!timerExpired && (
                    <>
                      <button
                        onClick={() => setTimerRunning(false)}
                        disabled={!timerRunning}
                        title="Pausa"
                        style={{
                          width: 30, height: 30, borderRadius: 6,
                          background: !timerRunning ? COLORS.border : COLORS.card,
                          border: `1px solid ${COLORS.border}`,
                          color: !timerRunning ? COLORS.textDim : COLORS.text,
                          cursor: timerRunning ? "pointer" : "default",
                          fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>⏸</button>
                      <button
                        onClick={() => setTimerRunning(true)}
                        disabled={timerRunning}
                        title="Riprendi"
                        style={{
                          width: 30, height: 30, borderRadius: 6,
                          background: timerRunning ? COLORS.border : COLORS.card,
                          border: `1px solid ${COLORS.border}`,
                          color: timerRunning ? COLORS.textDim : COLORS.green,
                          cursor: !timerRunning ? "pointer" : "default",
                          fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>▶</button>
                    </>
                  )}
                </div>
              )}
              {[SCREENS.DRAFT, SCREENS.TOURNAMENT, SCREENS.RESULTS].map((s, i) => (
                <div key={s} style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 10,
                  background: screen === s ? COLORS.accent : COLORS.card,
                  color: screen === s ? "#000" : COLORS.textDim,
                  border: `1px solid ${screen === s ? COLORS.accent : COLORS.border}`,
                  fontWeight: screen === s ? 700 : 400, letterSpacing: 1,
                }}>{["DRAFT", "TURNI", "FINALE"][i]}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 80px 16px" }}>

        {/* ===== SETUP ===== */}
        {screen === SCREENS.SETUP && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <img
                src={MAGIC_LOGO}
                alt="Magic: The Gathering"
                style={{ maxWidth: 510, width: "100%", filter: "drop-shadow(0 0 18px #c89b3c55)" }}
              />
            </div>

            <div style={{ display: "flex", gap: 3, marginBottom: 0 }}>
              {[["players", "👤 Giocatori"], ["timer", "⏱ Timer"], ["registro", "📋 Registro"], ["classifica", "🏅 Classifica Generale"]].map(([tab, label]) => (
                <button key={tab} onClick={() => setSetupTab(tab)} style={{
                  padding: "9px 14px", borderRadius: "8px 8px 0 0",
                  background: setupTab === tab ? COLORS.card : COLORS.surface,
                  color: setupTab === tab ? COLORS.accent : COLORS.textDim,
                  border: `1px solid ${setupTab === tab ? COLORS.accent : COLORS.border}`,
                  borderBottom: setupTab === tab ? `1px solid ${COLORS.card}` : `1px solid ${COLORS.border}`,
                  cursor: "pointer", fontSize: 12, fontFamily: "Cinzel, serif", letterSpacing: 1,
                }}>{label}</button>
              ))}
            </div>

            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: "0 12px 12px 12px", padding: 20, marginBottom: 20,
            }}>
              {/* TAB: GIOCATORI */}
              {setupTab === "players" && (
                <div>
                  <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12, letterSpacing: 2 }}>NUMERO GIOCATORI E FORMATO</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                    {[6, 7, 8, 9, 10].map((n) => (
                      <button key={n} onClick={() => handlePlayerCountChange(n)} style={{
                        width: 48, height: 48, borderRadius: 8,
                        background: playerCount === n ? COLORS.accent : COLORS.surface,
                        color: playerCount === n ? "#000" : COLORS.text,
                        border: `1px solid ${playerCount === n ? COLORS.accent : COLORS.border}`,
                        cursor: "pointer", fontSize: 18, fontWeight: 700, fontFamily: "Cinzel, serif",
                        boxShadow: playerCount === n ? `0 0 16px ${COLORS.accentGlow}` : "none",
                      }}>{n}</button>
                    ))}
                    <select
                      value={tournamentType}
                      onChange={(e) => setTournamentType(e.target.value)}
                      style={{
                        background: COLORS.surface, border: `1px solid ${COLORS.accent}`,
                        color: COLORS.accent, borderRadius: 8, padding: "10px 14px",
                        fontSize: 12, fontFamily: "Cinzel, serif", letterSpacing: 1,
                        cursor: "pointer", outline: "none", height: 48, flexShrink: 0,
                      }}>
                      <option value="roundrobin">🔄 All'italiana (Round Robin)</option>
                      <option value="swiss">🇨🇭 Alla Svizzera (Swiss)</option>
                    </select>
                  </div>
                  {/* Info turni */}
                  {(() => {
                    const isRR = tournamentType === "roundrobin";
                    const n = playerCount;
                    const rounds = isRR
                      ? (n % 2 === 0 ? n - 1 : n)
                      : swissRoundsCount(n);
                    const matchesPerRound = Math.floor(n / 2);
                    const totalMatches = isRR
                      ? rounds * matchesPerRound
                      : rounds * matchesPerRound;
                    return (
                      <div style={{
                        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                        borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                        display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap",
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.accent }}>{rounds}</span>
                          <span style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 1 }}>TURNI</span>
                        </div>
                        <div style={{ width: 1, height: 32, background: COLORS.border }} />
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.blue }}>{matchesPerRound}</span>
                          <span style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 1 }}>MATCH/TURNO</span>
                        </div>
                        <div style={{ width: 1, height: 32, background: COLORS.border }} />
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.green }}>{totalMatches}</span>
                          <span style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 1 }}>MATCH TOTALI</span>
                        </div>
                        <div style={{ marginLeft: "auto", fontSize: 11, color: COLORS.textDim, fontFamily: "Crimson Pro, serif", fontStyle: "italic" }}>
                          {isRR
                            ? "Tutti contro tutti — ogni coppia si affronta una volta"
                            : "Abbinamenti per punteggio — avversari simili ad ogni turno"}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 10, letterSpacing: 2 }}>NOMI GIOCATORI</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                    {players.map((p) => (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                        borderRadius: 8, padding: "8px 12px",
                      }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: `linear-gradient(135deg, ${COLORS.accentDark}, ${COLORS.accent})`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, color: "#000", flexShrink: 0,
                        }}>{p.id}</div>
                        <PlayerCombobox
                          value={p.name}
                          suggestions={savedPlayerNames.map((s) => s.name)}
                          onChange={(name) =>
                            setPlayers((prev) => prev.map((x) => x.id === p.id ? { ...x, name: name || x.name } : x))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: TIMER */}
              {setupTab === "timer" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                  <div style={{ fontSize: 12, color: COLORS.textDim, letterSpacing: 2, alignSelf: "flex-start" }}>DURATA INCONTRI</div>
                  <div style={{
                    width: 160, height: 160, borderRadius: "50%",
                    border: `3px solid ${COLORS.accent}`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    background: COLORS.surface, boxShadow: `0 0 30px ${COLORS.accentGlow}`,
                  }}>
                    <div style={{ fontSize: 11, color: COLORS.textDim, letterSpacing: 2, marginBottom: 2 }}>MINUTI</div>
                    <input type="number" min={10} max={120} value={matchDuration}
                      onChange={(e) => setMatchDuration(Math.max(1, parseInt(e.target.value) || 50))}
                      style={{
                        background: "transparent", border: "none", outline: "none",
                        color: COLORS.accent, fontSize: 48, fontWeight: 700,
                        width: 100, textAlign: "center", fontFamily: "Cinzel, serif",
                      }}
                    />
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>per turno</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    {[30, 40, 50, 60, 75, 90].map((m) => (
                      <button key={m} onClick={() => setMatchDuration(m)} style={{
                        padding: "7px 14px", borderRadius: 6,
                        background: matchDuration === m ? COLORS.accent : COLORS.surface,
                        color: matchDuration === m ? "#000" : COLORS.textDim,
                        border: `1px solid ${matchDuration === m ? COLORS.accent : COLORS.border}`,
                        cursor: "pointer", fontSize: 13, fontFamily: "Cinzel, serif",
                      }}>{m}'</button>
                    ))}
                  </div>
                  <div style={{ color: COLORS.textDim, fontSize: 12, fontFamily: "Crimson Pro, serif", textAlign: "center", lineHeight: 1.7 }}>
                    Il conto alla rovescia parte automaticamente ad ogni turno.<br />
                    Standard consigliato: <span style={{ color: COLORS.accent }}>50 minuti</span>
                  </div>
                </div>
              )}

              {/* TAB: CLASSIFICA GENERALE */}
              {setupTab === "classifica" && (
                <ClassificaGenerale tournaments={registroTournaments} />
              )}

              {/* TAB: REGISTRO */}
              {setupTab === "registro" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: COLORS.textDim, letterSpacing: 2 }}>TORNEI PASSATI</div>
                    <button onClick={fetchTournaments} style={{
                      background: "transparent", border: "none", color: COLORS.textDim,
                      cursor: "pointer", fontSize: 16,
                    }} title="Aggiorna">🔄</button>
                  </div>
                  <RegistroPanel
                    isAdmin={false}
                    tournaments={registroTournaments}
                    loading={registroLoading}
                    onRefresh={fetchTournaments}
                    onDelete={deleteTournament}
                    onSelect={handleSelectTournament}
                    selectedId={selectedTournamentId}
                  />
                </div>
              )}
            </div>

            {setupTab !== "registro" && setupTab !== "classifica" && (
              <button onClick={startDraft} style={{
                width: "100%", padding: "16px", borderRadius: 10,
                background: `linear-gradient(135deg, ${COLORS.accentDark}, ${COLORS.accent})`,
                color: "#000", border: "none", cursor: "pointer",
                fontSize: 16, fontWeight: 700, letterSpacing: 3, fontFamily: "Cinzel, serif",
                boxShadow: `0 4px 24px ${COLORS.accentGlow}`,
              }}>⚔️ INIZIA IL DRAFT</button>
            )}
          </div>
        )}

        {/* ===== DRAFT ===== */}
        {screen === SCREENS.DRAFT && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.accent, marginBottom: 4 }}>Posizionamento al Draft</div>
              <div style={{ color: COLORS.textDim, fontFamily: "Crimson Pro, serif", fontSize: 14 }}>
                I giocatori si siedono uno di fronte all'altro. I booster passano in senso orario.
              </div>
            </div>
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 14, letterSpacing: 2, textAlign: "center" }}>TAVOLO DI DRAFT</div>
              <RectangularTable players={draftSeating} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
              {draftSeating.map((p, i) => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, padding: "9px 14px",
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${COLORS.accentDark}, ${COLORS.accent})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#000",
                  }}>#{i + 1}</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <span style={{ fontSize: 10, color: COLORS.textDim, marginLeft: "auto" }}>
                    ← riceve da #{i === 0 ? draftSeating.length : i}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDraftSeating([...players].sort(() => Math.random() - 0.5))} style={{
                flex: 1, padding: "12px", borderRadius: 8,
                background: COLORS.card, color: COLORS.text,
                border: `1px solid ${COLORS.border}`, cursor: "pointer",
                fontSize: 13, fontFamily: "Cinzel, serif",
              }}>🔀 RIMESCOLA</button>
              <button onClick={startTournament} style={{
                flex: 2, padding: "12px", borderRadius: 8,
                background: `linear-gradient(135deg, ${COLORS.accentDark}, ${COLORS.accent})`,
                color: "#000", border: "none", cursor: "pointer",
                fontSize: 14, fontWeight: 700, letterSpacing: 2, fontFamily: "Cinzel, serif",
                boxShadow: `0 4px 20px ${COLORS.accentGlow}`,
              }}>⚔️ INIZIA I TURNI</button>
            </div>
          </div>
        )}

        {/* ===== TOURNAMENT ===== */}
        {screen === SCREENS.TOURNAMENT && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.accent }}>
                  Turno {round}{totalRounds > 0 ? ` di ${totalRounds}` : ""}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim, fontFamily: "Crimson Pro, serif" }}>
                  {allResultsIn ? "✓ Tutti i risultati inseriti" : "Inserisci i risultati degli incontri"}
                </div>
              </div>
              {totalRounds > 0 && (
                <div style={{ display: "flex", gap: 4 }}>
                  {Array.from({ length: totalRounds }, (_, i) => (
                    <div key={i} style={{
                      width: Math.max(14, Math.floor(180 / totalRounds)), height: 6, borderRadius: 3,
                      background: i + 1 < round ? COLORS.accent : i + 1 === round ? COLORS.blue : COLORS.border,
                      transition: "background 0.3s",
                    }} />
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 3, marginBottom: 0 }}>
              {[["pairings", "⚔️ Incontri"], ["standings", "🏆 Classifica"], ["history", "📜 Storico"]].map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: "8px 14px", borderRadius: "8px 8px 0 0",
                  background: activeTab === tab ? COLORS.card : COLORS.surface,
                  color: activeTab === tab ? COLORS.accent : COLORS.textDim,
                  border: `1px solid ${activeTab === tab ? COLORS.accent : COLORS.border}`,
                  borderBottom: activeTab === tab ? `1px solid ${COLORS.card}` : `1px solid ${COLORS.border}`,
                  cursor: "pointer", fontSize: 12, fontFamily: "Cinzel, serif",
                }}>{label}</button>
              ))}
            </div>

            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: "0 12px 12px 12px", padding: 18, marginBottom: 14,
            }}>
              {/* PAIRINGS */}
              {activeTab === "pairings" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pairings.map((match, idx) => (
                    <div key={idx} style={{
                      background: COLORS.surface,
                      border: `1px solid ${match.score ? COLORS.accent : COLORS.border}`,
                      borderRadius: 10, padding: "14px 16px",
                      boxShadow: match.score ? `0 0 10px ${COLORS.accentGlow}` : "none",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                    }}>
                      {!match.p2 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{match.p1.name}</div>
                          <div style={{
                            padding: "4px 12px", borderRadius: 6, background: "#16a34a22",
                            color: COLORS.green, border: `1px solid ${COLORS.green}44`, fontSize: 12, letterSpacing: 1,
                          }}>BYE — +3 punti</div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <div style={{
                              flex: 1, fontWeight: 600, fontSize: 15,
                              color: match.score ? (match.score.p1 > match.score.p2 ? COLORS.green : match.score.p1 < match.score.p2 ? COLORS.red : COLORS.textDim) : COLORS.text,
                            }}>{match.p1.name}</div>
                            <div style={{
                              padding: "5px 16px", borderRadius: 6,
                              background: match.score ? COLORS.accent + "22" : COLORS.card,
                              border: `1px solid ${match.score ? COLORS.accent : COLORS.border}`,
                              color: match.score ? COLORS.accent : COLORS.textDim,
                              fontSize: 17, fontWeight: 700, letterSpacing: 3, minWidth: 80, textAlign: "center",
                            }}>
                              {match.score ? `${match.score.p1} – ${match.score.p2}` : "VS"}
                            </div>
                            <div style={{
                              flex: 1, fontWeight: 600, fontSize: 15, textAlign: "right",
                              color: match.score ? (match.score.p2 > match.score.p1 ? COLORS.green : match.score.p2 < match.score.p1 ? COLORS.red : COLORS.textDim) : COLORS.text,
                            }}>{match.p2.name}</div>
                          </div>
                          <div style={{ display: "flex", gap: 5 }}>
                            {SCORE_OPTIONS.map((opt) => {
                              const selected = match.score && match.score.p1 === opt.p1 && match.score.p2 === opt.p2;
                              const col = opt.p1 > opt.p2 ? COLORS.green : opt.p2 > opt.p1 ? COLORS.red : COLORS.blue;
                              return (
                                <button key={opt.label} onClick={() => setMatchScore(idx, { p1: opt.p1, p2: opt.p2 })} style={{
                                  flex: 1, padding: "8px 4px", borderRadius: 7,
                                  background: selected ? col + "2a" : COLORS.card,
                                  color: selected ? col : COLORS.textDim,
                                  border: `1px solid ${selected ? col : COLORS.border}`,
                                  cursor: "pointer", fontSize: 13, fontWeight: selected ? 700 : 400,
                                  fontFamily: "Cinzel, serif", letterSpacing: 1, transition: "all 0.15s",
                                }}>{opt.label}</button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* STANDINGS */}
              {activeTab === "standings" && <StandingsTable rankings={rankings} />}

              {/* HISTORY */}
              {activeTab === "history" && (
                <div>
                  {allRounds.length === 0 ? (
                    <div style={{ textAlign: "center", color: COLORS.textDim, padding: 24, fontFamily: "Crimson Pro, serif" }}>
                      Nessun turno completato ancora
                    </div>
                  ) : (
                    allRounds.map(({ round: r, pairings: rp }) => (
                      <div key={r} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 12, color: COLORS.accent, letterSpacing: 2, marginBottom: 6 }}>TURNO {r}</div>
                        {rp.map((m, i) => {
                          const p1w = m.score && m.score.p1 > m.score.p2;
                          const p2w = m.score && m.score.p2 > m.score.p1;
                          return (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "7px 12px", background: COLORS.surface,
                              borderRadius: 6, marginBottom: 4, fontSize: 12,
                            }}>
                              <span style={{ flex: 1, textAlign: "right", color: p1w ? COLORS.green : COLORS.textDim, fontWeight: p1w ? 700 : 400 }}>
                                {m.p1.name}
                              </span>
                              <span style={{
                                color: COLORS.accent, fontWeight: 700, fontSize: 13,
                                background: COLORS.card, padding: "2px 10px", borderRadius: 4,
                                border: `1px solid ${COLORS.border}`,
                              }}>
                                {!m.p2 ? "BYE" : m.score ? `${m.score.p1} – ${m.score.p2}` : "—"}
                              </span>
                              <span style={{ flex: 1, color: p2w ? COLORS.green : COLORS.textDim, fontWeight: p2w ? 700 : 400 }}>
                                {m.p2?.name || ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {allResultsIn && (
              <button onClick={confirmRound} style={{
                width: "100%", padding: "14px", borderRadius: 10,
                background: `linear-gradient(135deg, ${COLORS.accentDark}, ${COLORS.accent})`,
                color: "#000", border: "none", cursor: "pointer",
                fontSize: 15, fontWeight: 700, letterSpacing: 2, fontFamily: "Cinzel, serif",
                boxShadow: `0 4px 24px ${COLORS.accentGlow}`,
              }}>
                {round >= totalRounds ? "🏆 FINALIZZA TORNEO" : `⚔️ TURNO ${round + 1} →`}
              </button>
            )}
          </div>
        )}

        {/* ===== RESULTS ===== */}
        {screen === SCREENS.RESULTS && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 34, marginBottom: 6 }}>🏆</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.accent, letterSpacing: 2 }}>TORNEO CONCLUSO</div>
              <div style={{ color: COLORS.textDim, fontFamily: "Crimson Pro, serif", marginTop: 4 }}>
                Classifica finale con tiebreaker OMW%
              </div>
              {saving && (
                <div style={{ marginTop: 8, fontSize: 12, color: COLORS.textDim }}>
                  💾 Salvataggio in corso...
                </div>
              )}
              {saveError && (
                <div style={{ marginTop: 8, fontSize: 12, color: COLORS.red }}>
                  ⚠️ {saveError}
                </div>
              )}
              {!saving && !saveError && (
                <div style={{ marginTop: 8, fontSize: 12, color: COLORS.green }}>
                  ✓ Torneo salvato nel registro
                </div>
              )}
            </div>

            {/* Podium */}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 22, alignItems: "flex-end" }}>
              {[1, 0, 2].map((pos) => {
                const p = rankings[pos];
                if (!p) return null;
                const medals = ["🥇", "🥈", "🥉"];
                const colors = [COLORS.accent, "#9a9a9a", "#cd7f32"];
                const heights = [115, 85, 65];
                return (
                  <div key={pos} style={{ textAlign: "center", flex: 1 }}>
                    <div style={{ fontSize: 22, marginBottom: 5 }}>{medals[pos]}</div>
                    <div style={{
                      background: COLORS.card, border: `2px solid ${colors[pos]}`,
                      borderRadius: 10, padding: "12px 8px", height: heights[pos],
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                      boxShadow: pos === 0 ? `0 0 28px ${COLORS.accentGlow}` : "none",
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: colors[pos] }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 3 }}>
                        {p.points}pt · {p.wins}V {p.draws}P {p.losses}S
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12, letterSpacing: 2 }}>CLASSIFICA COMPLETA</div>
              <StandingsTable rankings={rankings} />
            </div>

            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12, letterSpacing: 2 }}>RIASSUNTO TURNI</div>
              {allRounds.map(({ round: r, pairings: rp }) => (
                <div key={r} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: COLORS.blue, letterSpacing: 1, marginBottom: 5 }}>TURNO {r}</div>
                  {rp.map((m, i) => {
                    const p1w = m.score && m.score.p1 > m.score.p2;
                    const p2w = m.score && m.score.p2 > m.score.p1;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 12, borderBottom: `1px solid ${COLORS.border}22` }}>
                        <span style={{ flex: 1, textAlign: "right", color: p1w ? COLORS.green : COLORS.textDim, fontWeight: p1w ? 700 : 400 }}>{m.p1.name}</span>
                        <span style={{ color: COLORS.accent, fontWeight: 700, minWidth: 50, textAlign: "center" }}>
                          {!m.p2 ? "BYE" : m.score ? `${m.score.p1}–${m.score.p2}` : "—"}
                        </span>
                        <span style={{ flex: 1, color: p2w ? COLORS.green : COLORS.textDim, fontWeight: p2w ? 700 : 400 }}>{m.p2?.name || ""}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <button onClick={() => {
              setScreen(SCREENS.SETUP); setSetupTab("registro");
              setRound(1); setAllRounds([]); setSchedule([]); setPairings([]); setDraftSeating([]);
              setSwissTotalRounds(0); setSwissMatchHistory(new Set());
              setTimerRunning(false); setTimerExpired(false);
              setPlayers(Array.from({ length: playerCount }, (_, i) => ({
                id: i + 1, name: `Giocatore ${i + 1}`,
                points: 0, wins: 0, losses: 0, draws: 0, gamesWon: 0, gamesLost: 0, omwp: 0,
              })));
            }} style={{
              width: "100%", padding: "14px", borderRadius: 10,
              background: COLORS.card, color: COLORS.accent,
              border: `1px solid ${COLORS.accent}`, cursor: "pointer",
              fontSize: 14, fontWeight: 600, letterSpacing: 2, fontFamily: "Cinzel, serif",
            }}>🔄 NUOVO TORNEO</button>
          </div>
        )}

      </div>

      {/* ===== TIMER FULLSCREEN OVERLAY ===== */}
      {timerFullscreen && (
        <div
          onClick={() => setTimerFullscreen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 3000,
            background: timerExpired ? "#1a0000ee" : "#000d1aee",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 40,
            backdropFilter: "blur(6px)",
            cursor: "pointer",
          }}>
          {/* Close hint */}
          <div style={{ position: "absolute", top: 20, right: 24, color: COLORS.textDim, fontSize: 11, letterSpacing: 2 }}>
            TAP PER CHIUDERE ✕
          </div>

          {/* Round label */}
          <div style={{ fontSize: 14, color: COLORS.textDim, letterSpacing: 4 }}>
            TURNO {round}{totalRounds > 0 ? ` DI ${totalRounds}` : ""}
          </div>

          {/* Big timer */}
          <div style={{
            fontSize: "clamp(80px, 22vw, 160px)",
            fontWeight: 700,
            color: timerColor,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: 8,
            lineHeight: 1,
            textShadow: `0 0 60px ${timerColor}88`,
            transition: "color 1s, text-shadow 1s",
          }}>
            {timerExpired ? "⏰" : formatTime(timerSeconds)}
          </div>

          {timerExpired && (
            <div style={{ fontSize: 28, color: COLORS.red, letterSpacing: 4 }}>TEMPO SCADUTO!</div>
          )}

          {/* Pause / Play buttons — stop propagation so they don't close the overlay */}
          {!timerExpired && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ display: "flex", gap: 20 }}>
              <button
                onClick={() => setTimerRunning(false)}
                disabled={!timerRunning}
                style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: !timerRunning ? COLORS.border + "88" : COLORS.card,
                  border: `2px solid ${!timerRunning ? COLORS.border : COLORS.textDim}`,
                  color: !timerRunning ? COLORS.textDim : COLORS.text,
                  cursor: timerRunning ? "pointer" : "default",
                  fontSize: 26,
                }}>⏸</button>
              <button
                onClick={() => setTimerRunning(true)}
                disabled={timerRunning}
                style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: timerRunning ? COLORS.border + "88" : COLORS.green + "22",
                  border: `2px solid ${timerRunning ? COLORS.border : COLORS.green}`,
                  color: timerRunning ? COLORS.textDim : COLORS.green,
                  cursor: !timerRunning ? "pointer" : "default",
                  fontSize: 26,
                }}>▶</button>
            </div>
          )}
        </div>
      )}

      {/* ===== ADMIN BUTTON (fixed bottom) ===== */}
      <div style={{
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 1000,
      }}>
        <button
          onClick={() => setAdminOpen(true)}
          style={{
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            color: COLORS.textDim, padding: "7px 20px", borderRadius: 20,
            cursor: "pointer", fontSize: 11, fontFamily: "Cinzel, serif", letterSpacing: 2,
            boxShadow: "0 2px 12px #000a", transition: "border-color 0.2s, color 0.2s",
          }}
          onMouseEnter={(e) => { e.target.style.borderColor = COLORS.accent; e.target.style.color = COLORS.accent; }}
          onMouseLeave={(e) => { e.target.style.borderColor = COLORS.border; e.target.style.color = COLORS.textDim; }}
        >⚙ Admin</button>
      </div>

      {/* ===== ADMIN MODAL ===== */}
      {adminOpen && (
        <AdminModal
          onClose={() => setAdminOpen(false)}
          tournaments={registroTournaments}
          loading={registroLoading}
          onRefresh={() => { fetchTournaments(); fetchPlayerNames(); }}
          onDelete={deleteTournament}
          onSelect={handleSelectTournament}
          selectedId={selectedTournamentId}
          playerNames={savedPlayerNames}
          onDeletePlayer={deletePlayerName}
        />
      )}
    </div>
  );
}
