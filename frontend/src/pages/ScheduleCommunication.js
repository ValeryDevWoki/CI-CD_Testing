// src/pages/ScheduleCommunication.js

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';

import {
    // 1) תבניות
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    // 2) תזכורות
    fetchReminders,
    createReminder,
    updateReminder,
    deleteReminder,
    // 3) לשליחה ידנית => fetchEmployees, manualSendReminder
    fetchEmployees,
    manualSendReminder,
    // 4) רישום שבועי => fetchWeeklyStatus, updateWeeklyStatus
    fetchWeeklyStatus,
    updateWeeklyStatus,
    // 5) פרסום => fetchWeekStatus, updateWeekStatus
    fetchWeekStatus,
    updateWeekStatus,
    // 6) הגעה יומית
    fetchDailyArrivalByWeek,
    upsertDailyArrival
} from '../services/api';

import {
    getCurrentWeekCode,
    nextWeek,
    prevWeek,
    parseWeekCode,
    getDateForWeekDay,
    formatDDMM
} from '../utils/dateUtils';
import './ScheduleCommunication.css';
// Helper: Sunday (dayIndex 0) → Saturday (6)
const getWeekDateRange = (weekCode) => {
    const startDate = getDateForWeekDay(weekCode, 0);
    const endDate   = getDateForWeekDay(weekCode, 6);
    return `${formatDDMM(startDate)} - ${formatDDMM(endDate)}`;
};

export default function ScheduleCommunication() {
    const navigate = useNavigate();

    // לשוניות
    const [activeTab, setActiveTab] = useState('templates');



    // תת-לשוניות עבור תבניות ותזכורות
    const [templatesSubTab, setTemplatesSubTab] = useState('list'); // 'list' or 'create'
    const [remindersSubTab, setRemindersSubTab] = useState('list'); // 'list' or 'create'

    // שבוע נוכחי (מבוסס על יום ראשון)
    // Initialize weekKey from localStorage (if available) or fallback to current week
    const [weekKey, setWeekKey] = useState(() => {
        const savedWeek = localStorage.getItem('currentWeekKey');
        return savedWeek ? savedWeek : getCurrentWeekCode();
    });
    // Persist weekKey to localStorage on every change
    useEffect(() => {
        localStorage.setItem('currentWeekKey', weekKey);
    }, [weekKey]);

    // for display
    const { week, year } = parseWeekCode(weekKey);

    const [weekStatus, setWeekStatus] = useState(null);

    // ============== תבניות ==============
    const [templates, setTemplates] = useState([]);
    // נתוני יצירה
    const [newTemplate, setNewTemplate] = useState({
        template_name: '',
        template_type: 'email',
        subject: '',
        opening_text: '',
        body: '',
        ending_text: ''
    });
    // עריכה
    const [editingTemplateId, setEditingTemplateId] = useState(null);
    const [editingTemplate, setEditingTemplate] = useState(null);

    // ============== תזכורות ==============
    const [reminders, setReminders] = useState([]);
    // נתוני יצירה (ללא lock_at)
    const [newReminder, setNewReminder] = useState({
        template_id: '',
        send_at: '',
        reminder_frequency: '',
        is_active: true
    });
    // עריכה
    const [editingReminderId, setEditingReminderId] = useState(null);
    const [editingReminder, setEditingReminder] = useState(null);

    // ============== שליחה ידנית ==============
    const [employeeList, setEmployeeList] = useState([]);
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [manualSendTemplateId, setManualSendTemplateId] = useState('');

    // בנוסף – רשימת רישום שבועי לשליחה ידנית
    const [weeklyStatusList, setWeeklyStatusList] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    const [includeNotSent, setIncludeNotSent] = useState(false);

    // ============== הגעה יומית ==============
    // עדכון הימים לעברית
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const [dailyArrivalData, setDailyArrivalData] = useState([]);

    // ============== חיפוש ברישום שבועי ==============
    const [weeklySearch, setWeeklySearch] = useState('');

    // ---------------------------------------------
    // טענות / אפקטים
    // ---------------------------------------------
    // תבניות
    useEffect(() => {
        async function loadTemplates() {
            try {
                const data = await fetchTemplates();
                setTemplates(data);
            } catch (err) {
                console.error('שגיאה בטעינת התבניות:', err);
            }
        }
        if (activeTab === 'templates') {
            loadTemplates();
        }
    }, [activeTab]);

    // תזכורות
    useEffect(() => {
        async function loadReminders() {
            try {
                const data = await fetchReminders(weekKey);
                setReminders(data);
            } catch (err) {
                console.error('שגיאה בטעינת התזכורות:', err);
            }
        }
        if (activeTab === 'reminders') {
            loadReminders();
        }
    }, [activeTab, weekKey]);

    // עובדים (לשליחה ידנית והגעה)
    useEffect(() => {
        async function loadEmps() {
            try {
                const list = await fetchEmployees();
                setEmployeeList(list);
            } catch (err) {
                console.error('שגיאה בטעינת העובדים:', err);
            }
        }
        if (activeTab === 'manual' || activeTab === 'arrival') {
            loadEmps();
        }
    }, [activeTab]);

    // סטטוס שבוע (לפרסום ורישום שבועי)
    useEffect(() => {
        async function loadWeekStatus() {
            try {
                const ws = await fetchWeekStatus(weekKey);
                setWeekStatus(ws);
            } catch (err) {
                console.error('שגיאה בטעינת סטטוס השבוע:', err);
            }
        }
        if (activeTab === 'publish' || activeTab === 'weeklyStatus') {
            loadWeekStatus();
        }
    }, [activeTab, weekKey]);

    // רישום שבועי
    useEffect(() => {
        async function loadWeeklyReg() {
            try {
                const data = await fetchWeeklyStatus(weekKey);
                setWeeklyStatusList(data);
            } catch (err) {
                console.error('שגיאה בטעינת הרישום השבועי:', err);
            }
        }
        if (activeTab === 'weeklyStatus' || activeTab === 'manual') {
            loadWeeklyReg();
        }
    }, [activeTab, weekKey]);

    // הגעה יומית
    useEffect(() => {
        async function loadArrival() {
            try {
                const arrivals = await fetchDailyArrivalByWeek(weekKey);
                const emps = await fetchEmployees();

                // יצירת מפה: עובד => { employee_id, name, dailyArrival: { ראשון:'', ...} }
                const map = {};
                for (const e of emps) {
                    map[e.id] = {
                        employee_id: e.id,
                        name: e.name,
                        dailyArrival: {}
                    };
                    days.forEach(d => {
                        map[e.id].dailyArrival[d] = '';
                    });
                }

                function getDayNameFromDateStr(isoDateString) {
                    const datePart = isoDateString.split('T')[0];
                    const [yyyy, mm, dd] = datePart.split('-').map(n => parseInt(n, 10));
                    const d = new Date(yyyy, mm - 1, dd);
                    return days[d.getDay()];
                }

                for (const arr of arrivals) {
                    if (!map[arr.employee_id]) {
                        map[arr.employee_id] = {
                            employee_id: arr.employee_id,
                            name: arr.employee_name || 'לא ידוע',
                            dailyArrival: {}
                        };
                        days.forEach(d => {
                            map[arr.employee_id].dailyArrival[d] = '';
                        });
                    }
                    const dayName = getDayNameFromDateStr(arr.date);
                    map[arr.employee_id].dailyArrival[dayName] = arr.status;
                }
                setDailyArrivalData(Object.values(map));
            } catch (err) {
                console.error('שגיאה בטעינת ההגעה היומית:', err);
            }
        }
        if (activeTab === 'arrival') {
            loadArrival();
        }
    }, [activeTab, weekKey]);

    // ---------------------------------------------
    // מפעילים: תבניות
    // ---------------------------------------------
    async function handleCreateTemplate() {
        if (!newTemplate.template_name || !newTemplate.body) {
            alert('שם התבנית וגוף ההודעה דרושים.');
            return;
        }
        try {
            const created = await createTemplate(newTemplate);
            setTemplates(prev => [...prev, created]);
            setNewTemplate({
                template_name: '',
                template_type: 'email',
                subject: '',
                opening_text: '',
                body: '',
                ending_text: ''
            });
            setTemplatesSubTab('list');
        } catch (err) {
            alert(err.message || 'יצירת התבנית נכשלה');
        }
    }

    function startEditTemplate(t) {
        setEditingTemplateId(t.id);
        setEditingTemplate({ ...t });
    }

    async function handleUpdateTemplate() {
        if (!editingTemplate) return;
        try {
            const upd = await updateTemplate(editingTemplateId, editingTemplate);
            setTemplates(prev => prev.map(x => x.id === upd.id ? upd : x));
            setEditingTemplateId(null);
            setEditingTemplate(null);
        } catch (err) {
            alert(err.message || 'עדכון התבנית נכשלה');
        }
    }

    async function handleDeleteTemplate(id) {
        if (!window.confirm('למחוק את התבנית?')) return;
        try {
            await deleteTemplate(id);
            setTemplates(prev => prev.filter(x => x.id !== id));
        } catch (err) {
            alert(err.message || 'מחיקת התבנית נכשלה');
        }
    }

    // ---------------------------------------------
    // מפעילים: תזכורות
    // ---------------------------------------------
    async function handleCreateReminder() {
        if (!newReminder.template_id || !newReminder.send_at) {
            alert('בחר תבנית וקבע זמן.');
            return;
        }
        try {
            const payload = {
                week_code: weekKey,
                template_id: parseInt(newReminder.template_id, 10),
                send_at: newReminder.send_at,
                reminder_frequency: newReminder.reminder_frequency || null,
                is_active: newReminder.is_active
            };
            const created = await createReminder(payload);
            setReminders(prev => [...prev, created]);
            setNewReminder({
                template_id: '',
                send_at: '',
                reminder_frequency: '',
                is_active: true
            });
            setRemindersSubTab('list');
        } catch (err) {
            alert(err.message || 'יצירת התזכורת נכשלה');
        }
    }

    function startEditReminder(r) {
        setEditingReminderId(r.id);
        setEditingReminder({ ...r });
    }

    async function handleUpdateReminder() {
        if (!editingReminder) return;
        try {
            const updObj = {
                template_id: editingReminder.template_id,
                send_at: editingReminder.send_at,
                reminder_frequency: editingReminder.reminder_frequency,
                is_active: editingReminder.is_active,
                is_sent: editingReminder.is_sent
            };
            const upd = await updateReminder(editingReminderId, updObj);
            setReminders(prev => prev.map(x => x.id === upd.id ? upd : x));
            setEditingReminderId(null);
            setEditingReminder(null);
        } catch (err) {
            alert(err.message || 'עדכון התזכורת נכשלה');
        }
    }

    async function handleDeleteReminder(id) {
        if (!window.confirm('למחוק את התזכורת?')) return;
        try {
            await deleteReminder(id);
            setReminders(prev => prev.filter(x => x.id !== id));
        } catch (err) {
            alert(err.message || 'מחיקת התזכורת נכשלה');
        }
    }

    // ---------------------------------------------
    // מפעילים: שליחה ידנית
    // ---------------------------------------------
    const lowerSearch = employeeSearch.toLowerCase();
    const suggestionEmployees = employeeList.filter(emp => {
        const isSelected = selectedEmployees.includes(String(emp.id));
        if (isSelected) return false;
        return emp.full_name.toLowerCase().includes(lowerSearch);
    });

    function handleSelectEmployee(empId) {
        setSelectedEmployees(prev => [...prev, empId]);
    }
    function handleRemoveEmployee(empId) {
        setSelectedEmployees(prev => prev.filter(id => id !== empId));
    }

    useEffect(() => {
        if (selectAll) {
            const allIds = employeeList.map(e => String(e.id));
            setSelectedEmployees(prev => {
                const combo = new Set([...prev, ...allIds]);
                return [...combo];
            });
        } else {
            setSelectedEmployees([]);
        }
    }, [selectAll, employeeList]);

    useEffect(() => {
        if (!weeklyStatusList || weeklyStatusList.length === 0) return;
        const notSentIds = weeklyStatusList
            .filter(ws => !ws.submitted_at)
            .map(ws => String(ws.employee_id));

        if (includeNotSent) {
            setSelectedEmployees(prev => {
                const combo = new Set([...prev, ...notSentIds]);
                return [...combo];
            });
        } else {
            setSelectedEmployees(prev => prev.filter(id => !notSentIds.includes(id)));
        }
    }, [includeNotSent, weeklyStatusList]);

    async function handleManualSend() {
        if (!manualSendTemplateId || selectedEmployees.length === 0) {
            alert('בחר תבנית ולפחות עובד אחד.');
            return;
        }
        try {
            const payload = {
                template_id: parseInt(manualSendTemplateId, 10),
                employeeIds: selectedEmployees.map(id => parseInt(id, 10))
            };
            if (payload.template_id === 2) {
                payload.week_code = weekKey;
            }
            await manualSendReminder(payload);
            alert('השליחה הידנית הופעלה!');
            setManualSendTemplateId('');
            setSelectedEmployees([]);
            setEmployeeSearch('');
            setSelectAll(false);
            setIncludeNotSent(false);
        } catch (err) {
            alert(err.message || 'השליחה הידנית נכשלה.');
        }
    }

    // ---------------------------------------------
    // פונקציות עזר לרישום שבועי
    // ---------------------------------------------
    function getLastActivityTime(ws) {
        if (ws.submitted_at) return new Date(ws.submitted_at).toLocaleString();
        if (ws.registered_at) return new Date(ws.registered_at).toLocaleString();
        if (ws.opened_at) return new Date(ws.opened_at).toLocaleString();
        return '-';
    }

    function interpretWeeklyStatus(ws) {
        if (ws.submitted_at) return 'נשלח';
        if (ws.registered_at) return 'נרשם';
        if (ws.opened_at) return 'נפתח';
        return 'לא נפתח';
    }

    // ---------------------------------------------
    // מפעילים: פרסום
    // ---------------------------------------------
    async function handlePublish() {
        if (!weekStatus) {
            alert('לא נטען סטטוס שבועי.');
            return;
        }
        try {
            const updated = await updateWeekStatus(weekKey, {
                is_published: true,
                changedShiftIds: []
            });
            alert(weekStatus.is_published ? 'פורסם מחדש!' : 'פורסם!');
            setWeekStatus(updated);
        } catch (err) {
            alert(err.message || 'הפרסום נכשל');
        }
    }

    // ---------------------------------------------
    // מפעילים: הגעה יומית
    // ---------------------------------------------
    const dayDates = days.map((_, i) => getDateForWeekDay(weekKey, i));

    function getDateOfSundayWeek(weekCode, dayName) {
        const dayIndex = days.indexOf(dayName);
        const dateObj = getDateForWeekDay(weekCode, dayIndex);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    async function handleDailyArrivalChange(empId, day, newStatus) {
        setDailyArrivalData(prev =>
            prev.map(e => {
                if (e.employee_id === empId) {
                    return {
                        ...e,
                        dailyArrival: {
                            ...e.dailyArrival,
                            [day]: newStatus
                        }
                    };
                }
                return e;
            })
        );
        const dateStr = getDateOfSundayWeek(weekKey, day);
        try {
            await upsertDailyArrival({
                employee_id: empId,
                date: dateStr,
                status: newStatus,
                week_code: weekKey
            });
        } catch (err) {
            console.error('שגיאה בעדכון הגעה:', err);
            alert('לא ניתן לשמור את סטטוס ההגעה.');
        }
    }

    // ---------------------------------------------
    // ניווט שבועי
    // ---------------------------------------------
    function incrementWeek(n) {
        if (n > 0) {
            const newer = nextWeek(weekKey, n);
            setWeekKey(newer);
        } else {
            const older = prevWeek(weekKey, Math.abs(n));
            setWeekKey(older);
        }
    }

    // ---------------------------------------------
    // לשוניות
    // ---------------------------------------------
    const tabs = [
        { key: 'templates', label: 'תבניות' },
        { key: 'reminders', label: 'תזכורות' },
        { key: 'manual', label: 'שליחה ידנית' },
        { key: 'weeklyStatus', label: 'רישום שבועי' },
        { key: 'publish', label: 'פרסום' },
        { key: 'arrival', label: 'הגעה יומית' }
    ];

    const filteredWeeklyStatusList = weeklyStatusList.filter(ws =>
        ws.employee_name.toLowerCase().includes(weeklySearch.toLowerCase())
    );

    return (
        <div className="schedule-comm-page">
            <NavBar />

            {/* כותרת ודגל ניווט שבועי באותו שורה */}
            <div className="sc-header-bar">
                <h1>ניהול תזכורות ומשמרות</h1>
                <div className="week-nav-inline">
                    <button className="btn-primary" onClick={() => incrementWeek(-1)}>שבוע קודם</button>
                    <span className="sc-week-label">
                        <div>שבוע {week} – {year}</div>
                        <div>{getWeekDateRange(weekKey)}</div>
                    </span>
                    <button className="btn-primary" onClick={() => incrementWeek(1)}>שבוע הבא</button>
                </div>
            </div>

            {/* לשוניות ראשיות */}
            <div className="sc-tabs">
                {tabs.map(t => (
                    <div
                        key={t.key}
                        className={`sc-tab ${activeTab === t.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.key)}
                    >
                        {t.label}
                    </div>
                ))}
            </div>

            {/* תוכן לשוניות */}
            <div className="sc-tab-content">
                {/* ========== לשונית תבניות ========== */}
                {activeTab === 'templates' && (
                    <section>
                        <div className="sc-sub-tabs">
                            <div
                                className={`sc-sub-tab ${templatesSubTab === 'list' ? 'active' : ''}`}
                                onClick={() => setTemplatesSubTab('list')}
                            >
                                רשימת תבניות
                            </div>
                            <div
                                className={`sc-sub-tab ${templatesSubTab === 'create' ? 'active' : ''}`}
                                onClick={() => setTemplatesSubTab('create')}
                            >
                                צור תבנית
                            </div>
                        </div>

                        {templatesSubTab === 'list' && (
                            <div style={{ marginTop: '20px' }}>
                                <h2>תבניות קיימות</h2>
                                <p>הצג, ערוך או מחק תבניות הודעות.</p>
                                <div className="templates-list">
                                    {templates.map(tpl => (
                                        <div key={tpl.id} className="template-card">
                                            <div className="card-header">
                                                <h4>{tpl.template_name} ({tpl.template_type})</h4>
                                                <button
                                                    className="delete-btn"
                                                    onClick={() => handleDeleteTemplate(tpl.id)}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            {tpl.subject && <p><strong>נושא:</strong> {tpl.subject}</p>}
                                            {tpl.opening_text && <p><em>פתיחה:</em> {tpl.opening_text}</p>}
                                            <p><em>גוף:</em> {tpl.body}</p>
                                            {tpl.ending_text && <p><em>סיום:</em> {tpl.ending_text}</p>}
                                            <button className="btn-primary" onClick={() => startEditTemplate(tpl)}>ערוך</button>
                                        </div>
                                    ))}
                                    {templates.length === 0 && <p>לא נמצאו תבניות.</p>}
                                </div>

                                {editingTemplateId && editingTemplate && (
                                    <div className="template-form" style={{ marginTop: '30px' }}>
                                        <h3>ערוך תבנית (מספר {editingTemplateId})</h3>
                                        <input
                                            type="text"
                                            placeholder="שם תבנית"
                                            value={editingTemplate.template_name}
                                            onChange={(e) =>
                                                setEditingTemplate({
                                                    ...editingTemplate,
                                                    template_name: e.target.value
                                                })
                                            }
                                        />
                                        <select
                                            value={editingTemplate.template_type}
                                            onChange={(e) =>
                                                setEditingTemplate({
                                                    ...editingTemplate,
                                                    template_type: e.target.value
                                                })
                                            }
                                        >
                                            <option value="email">אימייל</option>
                                            <option value="sms">SMS</option>
                                            <option value="both">שניהם</option>
                                        </select>
                                        <input
                                            type="text"
                                            placeholder="נושא"
                                            value={editingTemplate.subject || ''}
                                            onChange={(e) =>
                                                setEditingTemplate({
                                                    ...editingTemplate,
                                                    subject: e.target.value
                                                })
                                            }
                                        />
                                        <textarea
                                            placeholder="טקסט פתיחה"
                                            value={editingTemplate.opening_text || ''}
                                            onChange={(e) =>
                                                setEditingTemplate({
                                                    ...editingTemplate,
                                                    opening_text: e.target.value
                                                })
                                            }
                                        />
                                        <textarea
                                            placeholder="גוף ההודעה"
                                            value={editingTemplate.body}
                                            onChange={(e) =>
                                                setEditingTemplate({
                                                    ...editingTemplate,
                                                    body: e.target.value
                                                })
                                            }
                                        />
                                        <textarea
                                            placeholder="טקסט סיום"
                                            value={editingTemplate.ending_text || ''}
                                            onChange={(e) =>
                                                setEditingTemplate({
                                                    ...editingTemplate,
                                                    ending_text: e.target.value
                                                })
                                            }
                                        />
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn-primary" onClick={handleUpdateTemplate}>
                                                עדכן
                                            </button>
                                            <button className="btn-secondary" onClick={() => {
                                                setEditingTemplateId(null);
                                                setEditingTemplate(null);
                                            }}>
                                                ביטול
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {templatesSubTab === 'create' && (
                            <div className="template-form" style={{ marginTop: '20px' }}>
                                <h2>צור תבנית</h2>
                                <input
                                    type="text"
                                    placeholder="שם תבנית"
                                    value={newTemplate.template_name}
                                    onChange={(e) =>
                                        setNewTemplate({ ...newTemplate, template_name: e.target.value })
                                    }
                                />
                                <select
                                    value={newTemplate.template_type}
                                    onChange={(e) =>
                                        setNewTemplate({ ...newTemplate, template_type: e.target.value })
                                    }
                                >
                                    <option value="email">אימייל</option>
                                    <option value="sms">SMS</option>
                                    <option value="both">שניהם</option>
                                </select>
                                <input
                                    type="text"
                                    placeholder="נושא (רק לאימייל)"
                                    value={newTemplate.subject}
                                    onChange={(e) =>
                                        setNewTemplate({ ...newTemplate, subject: e.target.value })
                                    }
                                />
                                <textarea
                                    placeholder="טקסט פתיחה"
                                    value={newTemplate.opening_text}
                                    onChange={(e) =>
                                        setNewTemplate({ ...newTemplate, opening_text: e.target.value })
                                    }
                                />
                                <textarea
                                    placeholder="גוף ההודעה"
                                    value={newTemplate.body}
                                    onChange={(e) =>
                                        setNewTemplate({ ...newTemplate, body: e.target.value })
                                    }
                                />
                                <textarea
                                    placeholder="טקסט סיום"
                                    value={newTemplate.ending_text}
                                    onChange={(e) =>
                                        setNewTemplate({ ...newTemplate, ending_text: e.target.value })
                                    }
                                />
                                <button className="btn-success" onClick={handleCreateTemplate}>
                                    צור תבנית
                                </button>
                            </div>
                        )}
                    </section>
                )}

                {/* ========== לשונית תזכורות ========== */}
                {activeTab === 'reminders' && (
                    <section>
                        <div className="sc-sub-tabs">
                            <div
                                className={`sc-sub-tab ${remindersSubTab === 'list' ? 'active' : ''}`}
                                onClick={() => setRemindersSubTab('list')}
                            >
                                רשימת תזכורות
                            </div>
                            <div
                                className={`sc-sub-tab ${remindersSubTab === 'create' ? 'active' : ''}`}
                                onClick={() => setRemindersSubTab('create')}
                            >
                                צור תזכורת
                            </div>
                        </div>

                        {remindersSubTab === 'list' && (
                            <div style={{ marginTop: '20px' }}>
                                <h2>תזכורות לשבוע {weekKey}</h2>
                                <div className="reminders-list">
                                    {reminders.map(r => (
                                        <div key={r.id} className="reminder-card">
                                            <div className="card-header">
                                                <h4>תבנית #{r.template_id}</h4>
                                                <button className="delete-btn" onClick={() => handleDeleteReminder(r.id)}>
                                                    ✕
                                                </button>
                                            </div>
                                            <p><strong>נשלח ב:</strong> {r.send_at}</p>
                                            <p><strong>תדירות:</strong> {r.reminder_frequency || 'חד-פעמי'}</p>
                                            <p><strong>פעיל:</strong> {r.is_active ? 'כן' : 'לא'}</p>
                                            <button className="btn-primary" onClick={() => startEditReminder(r)}>ערוך</button>
                                        </div>
                                    ))}
                                    {reminders.length === 0 && (
                                        <p>לא נמצאו תזכורות לשבוע {weekKey}.</p>
                                    )}
                                </div>

                                {editingReminderId && editingReminder && (
                                    <div className="reminder-form" style={{ marginTop: '30px' }}>
                                        <h3>ערוך תזכורת (מספר {editingReminderId})</h3>
                                        <select
                                            value={editingReminder.template_id}
                                            onChange={(e) =>
                                                setEditingReminder({
                                                    ...editingReminder,
                                                    template_id: e.target.value
                                                })
                                            }
                                        >
                                            <option value="">-- בחר תבנית --</option>
                                            {templates.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.template_name} ({t.template_type})
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="datetime-local"
                                            value={editingReminder.send_at}
                                            onChange={(e) =>
                                                setEditingReminder({
                                                    ...editingReminder,
                                                    send_at: e.target.value
                                                })
                                            }
                                        />
                                        <select
                                            value={editingReminder.reminder_frequency || ''}
                                            onChange={(e) =>
                                                setEditingReminder({
                                                    ...editingReminder,
                                                    reminder_frequency: e.target.value
                                                })
                                            }
                                        >
                                            <option value="">חד-פעמי</option>
                                            <option value="weekly">שבועי</option>
                                            <option value="monthly">חודשי</option>
                                        </select>
                                        <label style={{ display: 'block', margin: '8px 0' }}>
                                            <input
                                                type="checkbox"
                                                checked={editingReminder.is_active}
                                                onChange={(e) =>
                                                    setEditingReminder({
                                                        ...editingReminder,
                                                        is_active: e.target.checked
                                                    })
                                                }
                                            />
                                            פעיל?
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn-primary" onClick={handleUpdateReminder}>
                                                עדכן
                                            </button>
                                            <button className="btn-secondary" onClick={() => {
                                                setEditingReminderId(null);
                                                setEditingReminder(null);
                                            }}>
                                                ביטול
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {remindersSubTab === 'create' && (
                            <div className="reminder-form" style={{ marginTop: '20px' }}>
                                <h2>צור תזכורת</h2>
                                <select
                                    value={newReminder.template_id}
                                    onChange={(e) =>
                                        setNewReminder({ ...newReminder, template_id: e.target.value })
                                    }
                                >
                                    <option value="">-- בחר תבנית --</option>
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>
                                            {t.template_name} ({t.template_type})
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="datetime-local"
                                    value={newReminder.send_at}
                                    onChange={(e) =>
                                        setNewReminder({ ...newReminder, send_at: e.target.value })
                                    }
                                />
                                <select
                                    value={newReminder.reminder_frequency}
                                    onChange={(e) =>
                                        setNewReminder({ ...newReminder, reminder_frequency: e.target.value })
                                    }
                                >
                                    <option value="">חד-פעמי</option>
                                    <option value="weekly">שבועי</option>
                                    <option value="monthly">חודשי</option>
                                </select>
                                <label style={{ display: 'block', margin: '8px 0' }}>
                                    <input
                                        type="checkbox"
                                        checked={newReminder.is_active}
                                        onChange={(e) =>
                                            setNewReminder({ ...newReminder, is_active: e.target.checked })
                                        }
                                    />
                                    פעיל?
                                </label>
                                <button className="btn-success" onClick={handleCreateReminder}>
                                    צור תזכורת
                                </button>
                            </div>
                        )}
                    </section>
                )}

                {/* ========== לשונית שליחה ידנית ========== */}
                {activeTab === 'manual' && (
                    <section>
                        <h2>שליחה ידנית</h2>
                        <p>בחר תבנית ובחר עובדים לשליחה כעת. עבור רשימות גדולות, השתמש בחיפוש למטה.</p>

                        <label style={{ display: 'block', marginTop: '10px' }}>
                            תבנית:
                            <select
                                value={manualSendTemplateId}
                                onChange={(e) => setManualSendTemplateId(e.target.value)}
                                style={{ marginLeft: '10px' }}
                            >
                                <option value="">-- בחר תבנית --</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.template_name} ({t.template_type})
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div style={{ marginTop: '10px' }}>
                            <label style={{ marginRight: '20px' }}>
                                <input
                                    type="checkbox"
                                    checked={selectAll}
                                    onChange={(e) => setSelectAll(e.target.checked)}
                                />
                                בחר את כל העובדים
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={includeNotSent}
                                    onChange={(e) => setIncludeNotSent(e.target.checked)}
                                />
                                עובדים שלא הגישו
                            </label>
                        </div>

                        <div className="manual-send-search-bar">
                            <input
                                type="text"
                                placeholder="חפש עובדים..."
                                value={employeeSearch}
                                onChange={(e) => setEmployeeSearch(e.target.value)}
                            />
                            {employeeSearch && (
                                <div className="manual-suggestions">
                                    {suggestionEmployees.length === 0 ? (
                                        <div className="no-match">לא נמצאו תוצאות</div>
                                    ) : (
                                        suggestionEmployees.map(emp => (
                                            <div
                                                key={emp.id}
                                                className="suggestion"
                                                onClick={() => handleSelectEmployee(String(emp.id))}
                                            >
                                                {emp.name} (מספר {emp.id})
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="manual-selected-area">
                            {selectedEmployees.length === 0 && (
                                <div className="no-selected">לא נבחרו עובדים</div>
                            )}
                            {selectedEmployees.map(empId => {
                                const emp = employeeList.find(e => String(e.id) === empId);
                                if (!emp) return null;
                                return (
                                    <div key={empId} className="manual-emp-tag">
                                        {emp.name} (מספר {emp.id})
                                        <button
                                            className="remove-tag-btn"
                                            onClick={() => handleRemoveEmployee(empId)}
                                        >
                                            x
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <button className="btn-success" onClick={handleManualSend}>
                            שלח
                        </button>
                    </section>
                )}

                {/* ========== לשונית רישום שבועי ========== */}
                {activeTab === 'weeklyStatus' && (
                    <section>
                        <h2>רישום שבועי לשבוע {weekKey}</h2>
                        <div className="weekly-search" style={{ marginBottom: '10px' }}>
                            <input
                                type="text"
                                placeholder="חפש לפי שם עובד"
                                value={weeklySearch}
                                onChange={(e) => setWeeklySearch(e.target.value)}
                            />
                        </div>
                        <table className="weekly-status-table">
                            <thead>
                            <tr>
                                <th>עובד</th>
                                <th>פעילות אחרונה</th>
                                <th>סטטוס</th>
                            </tr>
                            </thead>
                            <tbody>
                            {filteredWeeklyStatusList.map(ws => (
                                <tr key={ws.id}>
                                    <td>{ws.employee_name}</td>
                                    <td>{getLastActivityTime(ws)}</td>
                                    <td>{interpretWeeklyStatus(ws)}</td>
                                </tr>
                            ))}
                            {filteredWeeklyStatusList.length === 0 && (
                                <tr>
                                    <td colSpan={3}>אין נתוני רישום שבועי לשבוע {weekKey}.</td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </section>
                )}

                {/* ========== לשונית פרסום ========== */}
                {activeTab === 'publish' && (
                    <section>
                        <h2>פרסם שבוע {weekKey}</h2>
                        {weekStatus && (
                            <p>
                                סטטוס נוכחי: {weekStatus.is_published ? 'פורסם' : 'לא פורסם'}
                            </p>
                        )}
                        <p>
                            לחץ כדי {weekStatus?.is_published ? 'לפרסם מחדש' : 'לפרסם'} את לוח המשמרות.
                        </p>
                        <button className="publish-btn" onClick={handlePublish}>
                            {weekStatus?.is_published ? 'פרסם מחדש' : 'פרסם'}
                        </button>
                    </section>
                )}

                {/* ========== לשונית הגעה יומית ========== */}
                {activeTab === 'arrival' && (
                    <section>
                        <h2>הגעה יומית (שבוע {weekKey})</h2>
                        <p>כל תא הוא תפריט נפתח לבחירת סטטוס הגעה: הגיע, מאחר, לא הגיע, חולה, וכו'.</p>

                        <table
                            className="arrival-table"
                            style={{ marginTop: '20px', width: '100%', borderCollapse: 'collapse' }}
                        >
                            <thead>
                            <tr>
                                <th>עובד</th>
                                {days.map((d, i) => (
                                    <th key={d}>
                                        {d}
                                        <br />
                                        ({dayDates[i].toLocaleDateString('en-GB')})
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {dailyArrivalData.map(emp => (
                                <tr key={emp.employee_id}>
                                    <td>{emp.name} (מספר {emp.employee_id})</td>
                                    {days.map((d) => {
                                        const currentVal = emp.dailyArrival[d] || '';
                                        return (
                                            <td
                                                key={d}
                                                style={{ border: '1px solid #ccc', padding: '4px' }}
                                            >
                                                <select
                                                    value={currentVal}
                                                    onChange={(e) =>
                                                        handleDailyArrivalChange(
                                                            emp.employee_id,
                                                            d,
                                                            e.target.value
                                                        )
                                                    }
                                                >
                                                    <option value="">--בחר--</option>
                                                    <option value="Arrived">הגיע</option>
                                                    <option value="Late">מאחר</option>
                                                    <option value="Not Arrived">לא הגיע</option>
                                                    <option value="Sick">חולה</option>
                                                </select>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {dailyArrivalData.length === 0 && (
                                <tr>
                                    <td colSpan={days.length + 1}>
                                        לא נמצאו עובדים או נתוני הגעה.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </section>
                )}
            </div>
        </div>
    );
}
