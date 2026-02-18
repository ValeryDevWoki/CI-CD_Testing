// src/pages/ScheduleDetail.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import ShiftModificationModal from '../components/ShiftModificationModal';
import { fetchEmployees, fetchShiftsByWeek, fetchNotes, deleteShift, fetchWanted } from '../services/api';
import { getDateForWeekDay, formatDDMM } from '../utils/dateUtils';
import './ScheduleDetail.css';

// Days of the week (in Hebrew)
const days = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

// ----- Minute-accurate helpers -----
function toMinutes(str) {
    const [hStr, mStr = '0'] = str.split(':');
    const h = Number(hStr), m = Number(mStr);
    if (h === 24 && m === 0) return 24 * 60; // treat 24:00 as end-of-day
    return h * 60 + m;
}
function normalizeDay(str) {
    // strip RTL/LTR & bidi marks that sometimes sneak in
    return (str || '').replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
}

// Split cross-midnight shifts into (day, end=24:00) + (next day, 00:00 -> end),
// BUT if the original end_time is exactly "00:00", DO NOT create a zero-length next-day part.
function splitCrossMidnight(rawShifts) {
    const out = [];
    for (const sh of rawShifts) {
        const s = toMinutes(sh.start_time);
        const e = toMinutes(sh.end_time);
        const endsExactlyAtMidnight = (sh.end_time || '').trim() === '00:00';

        if (e <= s) {
            // first part: current day until midnight
            out.push({ ...sh, end_time: '24:00' });

            // second part: only if it actually has length (i.e., NOT 00:00)
            if (!endsExactlyAtMidnight) {
                const dayIndex = days.indexOf(sh.day_name);
                const nextDay = days[(dayIndex + 1) % 7];
                out.push({
                    ...sh,
                    day_name: nextDay,
                    start_time: '00:00',
                    end_time: sh.end_time
                });
            }
        } else {
            out.push(sh);
        }
    }

    // Safety net: remove any accidental zero-length segments
    return out.filter(seg => toMinutes(seg.end_time) > toMinutes(seg.start_time));
}


// For sorting in lists
function computeSortEndForShift(s) {
    return toMinutes(s.end_time);
}

function computeShiftHours(start, end) {
    const s = toMinutes(start), e = toMinutes(end);
    const diff = e - s >= 0 ? (e - s) : (24 * 60 - s + e);
    return Math.round((diff / 60) * 10) / 10; // 1 decimal hour display
}

export default function ScheduleDetail() {
    const { weekCode, dayIdx, hourIdx } = useParams();
    const navigate = useNavigate();

    const [currentDayIdx, setCurrentDayIdx] = useState(parseInt(dayIdx, 10));
    const [currentHourIdx, setCurrentHourIdx] = useState(parseInt(hourIdx, 10));
    const [wanted, setWanted] = useState(5);

    const [employees, setEmployees] = useState([]);
    const [allShifts, setAllShifts] = useState([]);
    const [notes, setNotes] = useState([]);
    const [selectedShift, setSelectedShift] = useState(null);

    // Local searches for filtering shifts
    const [searchCovering, setSearchCovering] = useState('');
    const [searchNotCovering, setSearchNotCovering] = useState('');
    const [searchNone, setSearchNone] = useState('');

    // Load employees + ALL shifts from backend (no issent/ispublished filters)
    useEffect(() => {
        async function loadData() {
            try {
                const emps = await fetchEmployees();
                setEmployees(emps);

                const raw = await fetchShiftsByWeek(weekCode);
                const arr = Array.isArray(raw) ? raw : raw.shifts;
                // Normalize day_name; DO NOT FILTER or DEDUPE — show ALL from backend
                const normalized = (arr || []).map(s => ({ ...s, day_name: normalizeDay(s.day_name) }));
                const splitted = splitCrossMidnight(normalized);
                setAllShifts(splitted);
            } catch (err) {
                alert(err.message || 'Failed to load data');
            }
        }
        loadData();
    }, [weekCode]);

    // Load notes
    useEffect(() => {
        async function loadNotes() {
            try {
                const data = await fetchNotes();
                setNotes(data);
            } catch (err) {
                console.error("Error fetching notes:", err);
            }
        }
        loadNotes();
    }, []);

    // Load wanted count for the current day/hour
    useEffect(() => {
        async function loadWanted() {
            try {
                const wantedData = await fetchWanted(weekCode);
                const found = wantedData.find(row => row.day_name === days[currentDayIdx] && row.hour === currentHourIdx);
                setWanted(found ? found.wanted_count : 5);
            } catch (err) {
                console.error("Error fetching wanted data", err);
            }
        }
        loadWanted();
    }, [weekCode, currentDayIdx, currentHourIdx]);

    const currentDayName = days[currentDayIdx] || 'Sunday';
    // Compute current day date using weekCode and currentDayIdx
    const dateObj = getDateForWeekDay(weekCode, currentDayIdx);
    const ddmm = formatDDMM(dateObj);
    const currentDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;

    const hr = isNaN(currentHourIdx) ? 0 : currentHourIdx;

    // After splitting, just take shifts that belong to the current day
    const dayShifts = allShifts
        .filter(s => s.day_name === currentDayName)
        .map(s => {
            const emp = employees.find(e => e.id === s.employee_id);
            let shiftObj = { ...s, employee: emp ? emp.full_name : 'Emp#' + s.employee_id };

            // Notes for *this* day (no prev-day handling needed after split)
            const noteForShift = notes.find(n => n.employee_id === s.employee_id && n.date === currentDate);

            // ---- OVERRIDE LOGIC ----
            // If the shift itself has a note from /api/shifts, we:
            //   1) show that note,
            //   2) force decision = 'pending' (yellow),
            //   3) ignore decision/handled_by from /api/notes.
            const shiftNote = (s.note ?? '').trim();
            if (shiftNote) {
                shiftObj = {
                    ...shiftObj,
                    note: shiftNote,
                    decision: 'pending',
                    handled_by: null,
                };
            } else if (noteForShift) {
                shiftObj = {
                    ...shiftObj,
                    note: noteForShift.note,
                    decision: noteForShift.decision,
                    handled_by: noteForShift.handled_by ?? null,
                };
            } else {
                shiftObj = {
                    ...shiftObj,
                    note: '',
                    decision: '',
                    handled_by: null,
                };
            }

            return shiftObj;
        });

    // SHIFT actions
    const handleAddShift = (emp) => {
        const startHr = (currentHourIdx < 0 || isNaN(currentHourIdx)) ? 9 : currentHourIdx;
        let endHr = startHr + 8;
        if (endHr > 24) endHr = 24;
        const start = String(startHr).padStart(2, '0') + ':00';
        const end = String(endHr).padStart(2, '0') + ':00';
        setSelectedShift({
            id: null,
            employeeId: emp.id,
            employee: emp.full_name,
            weekCode,
            dayName: currentDayName,
            start,
            end: end,
            note: '',
            isStatic: false, // Default to false for new shifts
            staticId: null
        });};

    const handleModifyShift = (shift) => {
        setSelectedShift({
            id: shift.id,
            employeeId: shift.employee_id,
            employee: shift.employee,
            weekCode,
            dayName: shift.day_name,
            start: shift.start_time,
            end: shift.end_time,
            note: shift.note || '',
            isStatic: shift.is_static || false,
            staticId: shift.static_id || null
        });
    };

    const rebuildAllShiftsFromServer = async () => {
        const raw = await fetchShiftsByWeek(weekCode);
        const arr = Array.isArray(raw) ? raw : raw.shifts;
        const normalized = (arr || []).map(s => ({ ...s, day_name: normalizeDay(s.day_name) }));
        const splitted = splitCrossMidnight(normalized);
        setAllShifts(splitted);
    };

    const handleDeleteShift = async (shiftId) => {
        try {
            await deleteShift(shiftId);
            await rebuildAllShiftsFromServer(); // reload ALL shifts
        } catch (err) {
            alert(err.message || 'Cannot delete shift');
        }
    };

    async function handleSaveShift(mod, normalShiftResponse, staticShiftResponse) {
        await rebuildAllShiftsFromServer(); // reload ALL shifts
        setSelectedShift(null);
    }

    // Minute-accurate coverage (≥ 30 minutes overlap within [hr:00, hr+1:00); end-exclusive)
    const THRESHOLD = 30; // minutes
    const winStart = hr * 60;
    const winEnd = (hr + 1) * 60;
    const covering = [];
    const notCovering = [];
    for (const s of dayShifts) {
        const sStart = toMinutes(s.start_time);
        const sEnd = toMinutes(s.end_time);
        const overlap = Math.max(0, Math.min(sEnd, winEnd) - Math.max(sStart, winStart));
        (overlap >= THRESHOLD ? covering : notCovering).push(s);
    }

    covering.sort((a, b) => computeSortEndForShift(a) - computeSortEndForShift(b));
    notCovering.sort((a, b) => computeSortEndForShift(a) - computeSortEndForShift(b));

    const coveringFiltered = covering.filter(s => (s.employee || '').toLowerCase().includes(searchCovering.toLowerCase()));
    const notCoveringFiltered = notCovering.filter(s => (s.employee || '').toLowerCase().includes(searchNotCovering.toLowerCase()));

    // For unregistered employees, consider only shifts that officially belong to the current day.
    const dayEmployeeIds = dayShifts.map(s => s.employee_id);
    let unregistered = employees.filter(e => !dayEmployeeIds.includes(e.id));
    unregistered = unregistered.map(emp => {
        const noteForEmp = notes.find(n => n.employee_id === emp.id && n.date === currentDate);
        return { ...emp, note: noteForEmp ? noteForEmp.note : '', decision: noteForEmp ? noteForEmp.decision : '', handled_by: noteForEmp ? noteForEmp.handled_by : null };
    });
    if (searchNone) {
        unregistered = unregistered.filter(e => (e.full_name || '').toLowerCase().includes(searchNone.toLowerCase()));
    }
    unregistered.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    // Navigation handlers
    const handlePrevDay = () => {
        const newDay = (currentDayIdx + 6) % 7;
        setCurrentDayIdx(newDay);
        navigate(`/schedule-detail/${weekCode}/${newDay}/${currentHourIdx}`);
    };
    const handleNextDay = () => {
        const newDay = (currentDayIdx + 1) % 7;
        setCurrentDayIdx(newDay);
        navigate(`/schedule-detail/${weekCode}/${newDay}/${currentHourIdx}`);
    };
    const handlePrevHour = () => {
        const newHr = (hr + 23) % 24;
        setCurrentHourIdx(newHr);
        navigate(`/schedule-detail/${weekCode}/${currentDayIdx}/${newHr}`);
    };
    const handleNextHour = () => {
        const newHr = (hr + 1) % 24;
        setCurrentHourIdx(newHr);
        navigate(`/schedule-detail/${weekCode}/${currentDayIdx}/${newHr}`);
    };

    function getNoteClass(decision) {
        if (decision === 'accepted') return 'accepted';
        else if (decision === 'denied') return 'denied';
        else return 'pending';
    }

    return (
        <div className="schedule-detail-page">
            <NavBar />
            <div className="header-row">
                <div className="title-info">
                    <h1 className="page-title">פרטי לוח משמרות</h1>
                    <div className="date-info">
                        יום: {currentDayName} ({ddmm}) - שעה: {hr}:00
                    </div>
                    {/* New counter display */}
                    <div className="counter-info">
                        <span>נרשם: {covering.length} / מבוקש: {wanted}</span>
                    </div>
                </div>
                <div className="nav-buttons">
                    <button onClick={handlePrevDay}>&lt; יום קודם</button>
                    <button onClick={handleNextDay}>יום הבא &gt;</button>
                    <button onClick={handlePrevHour}>&lt; שעה קודמת</button>
                    <button onClick={handleNextHour}>שעה הבאה &gt;</button>
                </div>
            </div>

            <div className="columns-container">
                {/* 1) Shifts covering the current hour */}
                <div className="column">
                    <h3>רשומים בזמן זה</h3>
                    <div className="search-row">
                        <input
                            type="text"
                            placeholder="חפש..."
                            value={searchCovering}
                            onChange={e => setSearchCovering(e.target.value)}
                        />
                    </div>
                    <ul>
                        {coveringFiltered.map(s => {
                            const hrs = computeShiftHours(s.start_time, s.end_time);
                            const empObj = employees.find(e => e.id === s.employee_id);
                            const employeeShiftCount = dayShifts.filter(shift => shift.employee_id === s.employee_id).length;
                            return (
                                <li key={`${s.id}-${s.start_time}-${s.end_time}-${s.day_name}`} className="shift-item">
                  <span>
                    <span className="employee-name">{s.employee}</span>
                      {s.note && (
                          <>
                              {' - '}
                              <span className={`note-text ${getNoteClass(s.decision)}`}>
                          {s.note}
                        </span>
                              {s.handled_by && (
                                  <>
                                      {' - '}
                                      <span className="manager-name">{s.handled_by}</span>
                                  </>
                              )}
                          </>
                      )}
                      {' ('}{s.start_time} - {s.end_time}, {hrs}h{')'}
                  </span>
                                    <div className="btn-group">
                                        <button onClick={() => handleModifyShift(s)}>עריכה</button>
                                        <button onClick={() => handleDeleteShift(s.id)}>מחיקה</button>
                                        {employeeShiftCount < 2 && empObj && (
                                            <button onClick={() => handleAddShift(empObj)}>הוסף משמרת נוספת</button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* 2) Shifts registered for the day but not covering the current hour */}
                <div className="column">
                    <h3>רשומים ביום אך לא בזמן זה</h3>
                    <div className="search-row">
                        <input
                            type="text"
                            placeholder="חפש..."
                            value={searchNotCovering}
                            onChange={e => setSearchNotCovering(e.target.value)}
                        />
                    </div>
                    <ul>
                        {notCoveringFiltered.map(s => {
                            const hrs = computeShiftHours(s.start_time, s.end_time);
                            const empObj = employees.find(e => e.id === s.employee_id);
                            const employeeShiftCount = dayShifts.filter(shift => shift.employee_id === s.employee_id).length;
                            return (
                                <li key={`${s.id}-${s.start_time}-${s.end_time}-${s.day_name}`} className="shift-item">
                  <span>
                    <span className="employee-name">{s.employee}</span>
                      {s.note && (
                          <>
                              {' - '}
                              <span className={`note-text ${getNoteClass(s.decision)}`}>
                          {s.note}
                        </span>
                              {s.handled_by && (
                                  <>
                                      {' - '}
                                      <span className="manager-name">{s.handled_by}</span>
                                  </>
                              )}
                          </>
                      )}
                      {' ('}{s.start_time} - {s.end_time}, {hrs}h{')'}
                  </span>
                                    <div className="btn-group">
                                        <button onClick={() => handleModifyShift(s)}>עריכה</button>
                                        <button onClick={() => handleDeleteShift(s.id)}>מחיקה</button>
                                        {employeeShiftCount < 2 && empObj && (
                                            <button onClick={() => handleAddShift(empObj)}>הוסף משמרת נוספת</button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* 3) Employees not registered on the current day */}
                <div className="column">
                    <h3>לא רשומים כלל</h3>
                    <div className="search-row">
                        <input
                            type="text"
                            placeholder="חפש..."
                            value={searchNone}
                            onChange={e => setSearchNone(e.target.value)}
                        />
                    </div>
                    <ul>
                        {unregistered.map(emp => (
                            <li key={emp.id} className="shift-item">
                <span className="employee-name">
                  {emp.full_name}
                    {emp.note && (
                        <>
                            {' - '}
                            <span className={`note-text ${getNoteClass(emp.decision)}`}>
                        {emp.note}
                      </span>
                            {emp.handled_by && (
                                <>
                                    {' - '}
                                    <span className="manager-name">{emp.handled_by}</span>
                                </>
                            )}
                        </>
                    )}
                </span>
                                <div className="btn-group">
                                    <button onClick={() => handleAddShift(emp)}>הוסף</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {selectedShift && (
                <ShiftModificationModal
                    shift={selectedShift}
                    onClose={() => setSelectedShift(null)}
                    onSave={handleSaveShift}
                />
            )}
        </div>
    );
}
