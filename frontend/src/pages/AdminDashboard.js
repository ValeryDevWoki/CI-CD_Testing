import React, { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import EditableWeeklyScheduleTable from '../components/EditableWeeklyScheduleTable';
import {
    getCurrentWeekCode,
    nextWeek,
    withinMaxFutureWeeks,
    parseWeekCode,
    getDateForWeekDay,
    formatDDMM
} from '../utils/dateUtils';
import { fetchShiftsByWeek, copyWantedCoverage } from '../services/api';
import './AdminDashboard.css';

// Helper to compute the date range for a given week.
const getWeekDateRange = (weekCode) => {
    const startDate = getDateForWeekDay(weekCode, 0); // Sunday
    const endDate = getDateForWeekDay(weekCode, 6);   // Saturday
    return `${formatDDMM(startDate)} - ${formatDDMM(endDate)}`;
};

function normalizeDay(str) {
    return (str || '').replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
}

const AdminDashboard = () => {
    // Initialize week from storage or current
    const [weekKey, setWeekKey] = useState(() => {
        const savedWeek = localStorage.getItem('currentWeekKey');
        return savedWeek ? savedWeek : getCurrentWeekCode();
    });

    const [copyFromWeek, setCopyFromWeek] = useState(nextWeek(weekKey, -1));
    const [infoMsg, setInfoMsg] = useState(null);

    // IMPORTANT: null = not loaded yet; array = authoritative dataset
    const [sentShifts, setSentShifts] = useState(null);

    useEffect(() => {
        localStorage.setItem('currentWeekKey', weekKey);
        setInfoMsg(null);
    }, [weekKey]);

    useEffect(() => {
        async function loadShifts() {
            try {
                const raw = await fetchShiftsByWeek(weekKey);
                const all = Array.isArray(raw) ? raw : raw.shifts;
                // MANAGER VIEW: show ALL from backend — ignore issent/ispublished and NO dedupe
                const normalized = (all || []).map(s => ({ ...s, day_name: normalizeDay(s.day_name) }));
                setSentShifts(normalized);
            } catch (err) {
                console.error('שגיאה בטעינת המשמרות:', err);
                alert(`שגיאה בטעינת המשמרות: ${err}`);
            }
        }
        loadShifts();
    }, [weekKey]);

    useEffect(() => {
        setCopyFromWeek(nextWeek(weekKey, -1));
    }, [weekKey]);

    const handlePrevWeek = () => setWeekKey(prev => nextWeek(prev, -1));

    const handleNextWeek = () => {
        const maybeNext = nextWeek(weekKey, 1);
        if (withinMaxFutureWeeks(maybeNext, 4)) {
            setWeekKey(maybeNext);
        } else {
            alert('לא ניתן לעבור מעל 4 שבועות בעתיד');
        }
    };

    const handleCopySelected = async () => {
        try {
            const result = await copyWantedCoverage(copyFromWeek, weekKey);
            setInfoMsg(result.message);
        } catch (err) {
            console.error('שגיאה בהעתקת הכיסוי הרצוי:', err);
            alert(err.message || 'נכשל בהעתקת הכיסוי הרצוי');
        }
    };

    const previousWeeks = [];
    for (let i = 1; i <= 6; i++) {
        previousWeeks.push(nextWeek(weekKey, -i));
    }

    const { year, week } = parseWeekCode(weekKey);

    return (
        <div className="admin-dashboard">
            <NavBar />
            <div className="header-row">
                <h1 className="dashboard-title">סקירת לוח משמרות שבועית</h1>
                <div className="action-buttons">
                    <div className="week-navigation">
                        <button onClick={handlePrevWeek}>שבוע קודם</button>
                        <span className="week-label">
              <div>שבוע {week} - {year}</div>
              <div>{getWeekDateRange(weekKey)}</div>
            </span>
                        <button onClick={handleNextWeek}>שבוע הבא</button>
                    </div>
                    <div className="copy-controls">
                        <label htmlFor="copyFromWeekSelect">העתק משבוע:</label>
                        <select
                            id="copyFromWeekSelect"
                            value={copyFromWeek}
                            onChange={e => setCopyFromWeek(e.target.value)}
                        >
                            {previousWeeks.map(week => (
                                <option key={week} value={week}>
                                    {week}
                                </option>
                            ))}
                        </select>
                        <button className="copy-button" onClick={handleCopySelected}>
                            העתק כיסוי רצוי מהשבוע הנבחר
                        </button>
                    </div>
                </div>
            </div>

            {infoMsg && <div className="info-message">{infoMsg}</div>}

            {/* Pass the authoritative dataset down. When null => child waits for shifts */}
            <EditableWeeklyScheduleTable weekKey={weekKey} forcedShifts={sentShifts} />
        </div>
    );
};

export default AdminDashboard;
