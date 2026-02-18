import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import {
    fetchEmployees,
    fetchShifts,
    fetchWeekStatus,
    updateWeekStatus,
    fetchStaticShifts,
    fetchEmployeeDailyLimits,
    fetchCompanyDailyLimits
} from '../services/api';
import {
    getCurrentWeekCode,
    nextWeek,
    parseWeekCode,
    getDateForWeekDay,
    formatDDMM
} from '../utils/dateUtils';
import ShiftModificationModal from '../components/ShiftModificationModal';
import ReportModal from '../components/ReportModal';
import './EmployeeScheduleList.css';

// Days in Hebrew – adjust as needed.
const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// Helper to compute the date range (Sunday–Saturday) for a given weekCode
const getWeekDateRange = (weekCode) => {
    const startDate = getDateForWeekDay(weekCode, 0); // Sunday
    const endDate   = getDateForWeekDay(weekCode, 6); // Saturday
    return `${formatDDMM(startDate)} - ${formatDDMM(endDate)}`;
};

/** Helper to compute total hours for a shift’s start/end time. */
function computeShiftHours(start, end) {
    const [sH, sM] = start.split(':').map(n => parseInt(n, 10));
    const [eH, eM] = end.split(':').map(n => parseInt(n, 10));
    let startMin = sH * 60 + sM;
    let endMin   = eH * 60 + eM;
    if (endMin <= startMin) endMin += 24 * 60; // cross-midnight
    return (endMin - startMin) / 60;
}

/** Format hours: drop ".0", otherwise show one digit */
function formatHours(hours) {
    return hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1);
}

// Helper: 2026-W04 => 202604 (sortable)
const weekNum = (wk) => {
    const { year, week } = parseWeekCode(wk);
    return year * 100 + week;
};

// Static shift applies to a given weekKey if within [start_week_code..end_week_code] (inclusive)
function staticAppliesToWeek(st, weekKey) {
    if (st.start_week_code && weekNum(weekKey) < weekNum(st.start_week_code)) return false;
    if (st.end_week_code && weekNum(weekKey) > weekNum(st.end_week_code)) return false;
    return true;
}

export default function EmployeeScheduleList() {
    const navigate = useNavigate();

    // Initialize weekKey from localStorage or fallback to the current week
    const [weekKey, setWeekKey] = useState(() => {
        const savedWeek = localStorage.getItem('currentWeekKey');
        return savedWeek ? savedWeek : getCurrentWeekCode();
    });

    // Update localStorage whenever weekKey changes
    useEffect(() => {
        localStorage.setItem('currentWeekKey', weekKey);
    }, [weekKey]);

    const [isPublished, setIsPublished] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [selectedShift, setSelectedShift] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);

    useEffect(() => {
        async function loadEmp() {
            try {
                const data = await fetchEmployees();
                setEmployees(Array.isArray(data) ? data : []);
            } catch (err) {
                alert(err.message || "נכשל בטעינת העובדים");
            }
        }
        loadEmp();
    }, []);

    useEffect(() => {
        async function loadData() {
            try {
                const raw = await fetchShifts(weekKey);
                const allShifts = Array.isArray(raw) ? raw : (Array.isArray(raw?.shifts) ? raw.shifts : []);

                // Fetch ALL static shifts (activeOnly=false) so we always have end_week_code in UI
                const allStatic = await fetchStaticShifts(false);
                const staticRows = Array.isArray(allStatic) ? allStatic : [];

                // Build lookup for static shifts that APPLY to this week, by (employee + day + start + end).
                const staticByKey = new Map();
                for (const st of staticRows) {
                    if (st.isactive === false) continue;
                    if (!staticAppliesToWeek(st, weekKey)) continue;

                    const key = `${st.employee_id}|${st.day_name}|${st.start_time}|${st.end_time}`;
                    staticByKey.set(key, st);
                }

                // Decorate normal shifts: if a matching static exists (for this week), mark it.
                const decoratedNormal = allShifts.map(ns => {
                    const key = `${ns.employee_id}|${ns.day_name}|${ns.start_time}|${ns.end_time}`;
                    const st = staticByKey.get(key);
                    if (!st) {
                        return { ...ns, isStatic: false, staticId: null, start_week_code: null, end_week_code: null };
                    }

                    return {
                        ...ns,
                        isStatic: true,
                        staticId: st.id,
                        start_week_code: st.start_week_code || null,
                        end_week_code: st.end_week_code || null,
                    };
                });

                // Create virtual static shifts ONLY when there is no NORMAL shift with the SAME time range.
                const normalKeys = new Set(
                    decoratedNormal.map(ns => `${ns.employee_id}|${ns.day_name}|${ns.start_time}|${ns.end_time}`)
                );

                const staticAsShifts = [];
                for (const st of staticRows) {
                    if (st.isactive === false) continue;
                    if (!staticAppliesToWeek(st, weekKey)) continue;

                    const key = `${st.employee_id}|${st.day_name}|${st.start_time}|${st.end_time}`;
                    if (normalKeys.has(key)) continue;

                    staticAsShifts.push({
                        id: `static-${st.id}`,
                        staticId: st.id,
                        isStatic: true,
                        start_week_code: st.start_week_code || null,
                        end_week_code: st.end_week_code || null,
                        week_code: weekKey,
                        day_name: st.day_name,
                        employee_id: st.employee_id,
                        start_time: st.start_time,
                        end_time: st.end_time,
                        note: '(קבוע)',
                        issent: true,
                        ispublished: false
                    });
                }

                setShifts([...decoratedNormal, ...staticAsShifts]);

                const ws = await fetchWeekStatus(weekKey);
                setIsPublished(ws.is_published);
            } catch (err) {
                alert(err.message || "שגיאה בטעינת הנתונים");
            }
        }
        loadData();
    }, [weekKey]);

    const handlePrevWeek = () => setWeekKey(prev => nextWeek(prev, -1));
    const handleNextWeek = () => setWeekKey(prev => nextWeek(prev, 1));

    const handlePublish = async () => {
        try {
            await updateWeekStatus(weekKey, { is_published: true });
            alert(isPublished ? "לוח המשמרות עודכן!" : "לוח המשמרות פורסם!");
            setIsPublished(true);
        } catch (err) {
            alert(err.message || "נכשל בפרסום");
        }
    };

    // Build schedule data by employee and by day.
    const scheduleByEmployee = employees.map(emp => {
        let totalHours = 0;
        const dailyShifts = {};

        days.forEach(day => {
            const shiftsForDay = shifts.filter(
                s => s.week_code === weekKey &&
                    s.day_name === day &&
                    s.employee_id === emp.id
            );
            const dayHours = shiftsForDay.reduce((acc, s) => acc + computeShiftHours(s.start_time, s.end_time), 0);
            totalHours += dayHours;
            dailyShifts[day] = { shifts: shiftsForDay, dayHours };
        });
        return { ...emp, dailyShifts, totalHours };
    });

    // Helper to fetch effective daily limit for an employee on a given day.
    async function getEffectiveDailyLimit(empId, dayName) {
        try {
            const empLimits = await fetchEmployeeDailyLimits(empId);
            const override = empLimits.find(limit => limit.day_name === dayName);
            if (override) return override.max_hours;

            const compLimits = await fetchCompanyDailyLimits();
            const compLimit = compLimits.find(limit => limit.day_name === dayName);
            return compLimit ? compLimit.max_hours : 12;
        } catch (e) {
            return 12;
        }
    }

    // When adding a new shift
    async function handleRegisterShift(emp, dayName) {
        const effectiveLimit = await getEffectiveDailyLimit(emp.id, dayName);
        setSelectedShift({
            id: null,
            employeeId: emp.id,
            employee: emp.name,
            weekCode: weekKey,
            dayName,
            start: '09:00',
            end: '17:00',
            note: '',
            existingDayHours: 0,
            maxDayHours: effectiveLimit,
            staticId: null,
            isStatic: false,
            start_week_code: null,
            end_week_code: null
        });
    }

    // When editing an existing shift
    async function handleModifyShift(emp, dayName, oldShift) {
        const empData = scheduleByEmployee.find(e => e.id === emp.id);
        const cell = empData ? empData.dailyShifts[dayName] : { dayHours: 0 };

        const shiftHours = computeShiftHours(oldShift.start_time, oldShift.end_time);
        const existingDayHours = cell.dayHours - shiftHours;
        const effectiveLimit = await getEffectiveDailyLimit(emp.id, dayName);

        const resolvedStaticId =
            oldShift.staticId != null
                ? oldShift.staticId
                : (typeof oldShift.id === 'string' && String(oldShift.id).startsWith('static-'))
                    ? parseInt(String(oldShift.id).split('-')[1], 10)
                    : null;

        // If ended, checkbox should appear OFF + disabled in modal (modal uses end_week_code)
        const resolvedIsStatic = !!oldShift.isStatic && !oldShift.end_week_code;

        setSelectedShift({
            id: oldShift.id,
            staticId: resolvedStaticId,
            isStatic: resolvedIsStatic,
            start_week_code: oldShift.start_week_code || null,
            end_week_code: oldShift.end_week_code || null,
            employeeId: emp.id,
            employee: emp.name,
            weekCode: weekKey,
            dayName,
            start: oldShift.start_time,
            end: oldShift.end_time,
            note: oldShift.note || '',
            existingDayHours,
            maxDayHours: effectiveLimit
        });
    }

    async function handleSaveShift(modData, normalShiftResponse, staticShiftResponse) {
        // simplest + safest: close modal and reload week data (ensures checkbox state correct across weeks)
        setSelectedShift(null);
        try {
            const raw = await fetchShifts(weekKey);
            const allShifts = Array.isArray(raw) ? raw : (Array.isArray(raw?.shifts) ? raw.shifts : []);
            const allStatic = await fetchStaticShifts(false);
            const staticRows = Array.isArray(allStatic) ? allStatic : [];

            const staticByKey = new Map();
            for (const st of staticRows) {
                if (st.isactive === false) continue;
                if (!staticAppliesToWeek(st, weekKey)) continue;
                const key = `${st.employee_id}|${st.day_name}|${st.start_time}|${st.end_time}`;
                staticByKey.set(key, st);
            }

            const decoratedNormal = allShifts.map(ns => {
                const key = `${ns.employee_id}|${ns.day_name}|${ns.start_time}|${ns.end_time}`;
                const st = staticByKey.get(key);
                if (!st) return { ...ns, isStatic: false, staticId: null, start_week_code: null, end_week_code: null };

                return {
                    ...ns,
                    isStatic: true,
                    staticId: st.id,
                    start_week_code: st.start_week_code || null,
                    end_week_code: st.end_week_code || null,
                };
            });

            const normalKeys = new Set(
                decoratedNormal.map(ns => `${ns.employee_id}|${ns.day_name}|${ns.start_time}|${ns.end_time}`)
            );

            const staticAsShifts = [];
            for (const st of staticRows) {
                if (st.isactive === false) continue;
                if (!staticAppliesToWeek(st, weekKey)) continue;
                const key = `${st.employee_id}|${st.day_name}|${st.start_time}|${st.end_time}`;
                if (normalKeys.has(key)) continue;

                staticAsShifts.push({
                    id: `static-${st.id}`,
                    staticId: st.id,
                    isStatic: true,
                    start_week_code: st.start_week_code || null,
                    end_week_code: st.end_week_code || null,
                    week_code: weekKey,
                    day_name: st.day_name,
                    employee_id: st.employee_id,
                    start_time: st.start_time,
                    end_time: st.end_time,
                    note: '(קבוע)',
                    issent: true,
                    ispublished: false
                });
            }

            setShifts([...decoratedNormal, ...staticAsShifts]);
        } catch (_e) {
            // ignore
        }
    }

    const currentWeek = getCurrentWeekCode();
    const isCurrentWeek = (weekKey === currentWeek);
    const hasUnpublishedShifts = shifts.some(
        s => s.week_code === currentWeek && !s.isStatic && !s.ispublished
    );
    const showUnpublishedWarning = isCurrentWeek && hasUnpublishedShifts;

    // For display: extract week number & year
    const { year, week } = parseWeekCode(weekKey);

    return (
        <div className="employee-schedule-list-page">
            <NavBar />
            {/* Title Row */}
            <div className="header-title-row">
                <h2>לוח משמרות עובדים</h2>
            </div>
            {/* Action Row */}
            <div className="header-actions-row">
                <div className="header-left">
                    <button className="download-button" onClick={() => setShowReportModal(true)}>
                        הורד דוח CSV
                    </button>
                    <button
                        className="download-button"
                        onClick={() => navigate('/employee-schedule-list/employee-skills-report')}
                    >
                        דוח כישורים
                    </button>
                </div>
                <div className="header-center">
                    <div className="week-navigation">
                        <button onClick={handlePrevWeek}>שבוע קודם</button>
                        <span className="week-label">
                            <div>שבוע {week} – {year}</div>
                            <div>{getWeekDateRange(weekKey)}</div>
                        </span>
                        <button onClick={handleNextWeek}>שבוע הבא</button>
                    </div>
                </div>
                <div className="header-right">
                    <span className="status">מצב: {isPublished ? "פורסם" : "לא פורסם"}</span>
                    {showUnpublishedWarning && (
                        <span className="not-published-warning">יש שינויים שלא פורסמו!</span>
                    )}
                </div>
            </div>

            <table>
                <thead>
                <tr>
                    <th>עובד</th>
                    {days.map((d, index) => {
                        const dateObj = getDateForWeekDay(weekKey, index);
                        const ddmm = formatDDMM(dateObj);
                        return <th key={d}>{d} ({ddmm})</th>;
                    })}
                    <th>סה״כ שעות</th>
                </tr>
                </thead>
                <tbody>
                {scheduleByEmployee.map(emp => (
                    <tr key={emp.id}>
                        <td>{emp.name}</td>
                        {days.map(dayName => {
                            const cell = emp.dailyShifts[dayName];
                            return (
                                <td key={dayName} className="schedule-cell">
                                    {cell.shifts.length === 0 ? (
                                        <div
                                            className="add-shift"
                                            onClick={() => handleRegisterShift(emp, dayName)}
                                        >
                                            -
                                        </div>
                                    ) : (
                                        <div className="shifts-container">
                                            {cell.shifts.map(shift => {
                                                const hours = computeShiftHours(
                                                    shift.start_time,
                                                    shift.end_time
                                                );
                                                return (
                                                    <div
                                                        key={shift.id}
                                                        className="shift-item"
                                                        onClick={() => handleModifyShift(emp, dayName, shift)}
                                                    >
                                                        {shift.start_time} – {shift.end_time} ({formatHours(hours)})
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </td>
                            );
                        })}
                        <td>{formatHours(emp.totalHours)}</td>
                    </tr>
                ))}
                </tbody>
            </table>

            {selectedShift && (
                <ShiftModificationModal
                    shift={selectedShift}
                    onClose={() => setSelectedShift(null)}
                    onSave={handleSaveShift}
                />
            )}

            {showReportModal && (
                <ReportModal onClose={() => setShowReportModal(false)} />
            )}
        </div>
    );
}
