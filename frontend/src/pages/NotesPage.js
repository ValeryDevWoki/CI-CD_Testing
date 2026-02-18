import React, { useEffect, useMemo, useState } from 'react';
import NavBar from '../components/NavBar';
import { fetchNotes, updateNote } from '../services/api';
import './NotesPage.css';

const PAGE_SIZE = 100;

const Pagination = ({ page, totalPages, totalItems, showingFrom, showingTo, onPrev, onNext }) => (
    <div className="pagination">
        <button onClick={onPrev} disabled={page <= 1} className="pagination-btn">
            הקודם
        </button>
        <span className="pagination-status">
      עמוד {page} מתוך {totalPages} • מציג {showingFrom}–{showingTo} מתוך {totalItems}
    </span>
        <button onClick={onNext} disabled={page >= totalPages} className="pagination-btn">
            הבא
        </button>
    </div>
);

const NotesPage = () => {
    const [notes, setNotes] = useState([]);
    const [activeTab, setActiveTab] = useState('new');
    const [pageNew, setPageNew] = useState(1);
    const [pageHandled, setPageHandled] = useState(1);

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchNotes();
                setNotes(data || []);
            } catch (err) {
                console.error('Error fetching notes:', err);
            }
        })();
    }, []);

    const handleDecisionChange = async (id, newDecision) => {
        try {
            const updatedNote = await updateNote({ id, decision: newDecision });
            setNotes(prev => prev.map(n => (n.id === id ? { ...n, ...updatedNote } : n)));
        } catch (err) {
            console.error('Error updating note:', err);
        }
    };

    const newNotes = useMemo(() => notes.filter(n => !n.handled_by), [notes]);
    const handledNotes = useMemo(() => notes.filter(n => n.handled_by), [notes]);

    const totalPagesNew = Math.max(1, Math.ceil(newNotes.length / PAGE_SIZE));
    const totalPagesHandled = Math.max(1, Math.ceil(handledNotes.length / PAGE_SIZE));

    // Keep pages in range when data changes
    useEffect(() => {
        if (pageNew > totalPagesNew) setPageNew(1);
    }, [totalPagesNew, pageNew]);
    useEffect(() => {
        if (pageHandled > totalPagesHandled) setPageHandled(1);
    }, [totalPagesHandled, pageHandled]);

    const sliceByPage = (arr, page) => {
        const start = (page - 1) * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, arr.length);
        return { rows: arr.slice(start, end), start: start + 1 || 0, end };
    };

    const newSlice = sliceByPage(newNotes, pageNew);
    const handledSlice = sliceByPage(handledNotes, pageHandled);

    const switchTab = tab => {
        setActiveTab(tab);
        if (tab === 'new') setPageNew(1);
        if (tab === 'handled') setPageHandled(1);
    };

    return (
        <div className="notes-page">
            <NavBar />
            <div className="header-row">
                <h2 className="page-title">הערות עובדים</h2>
            </div>

            <div className="tabs-row">
                <button
                    className={activeTab === 'new' ? 'tab-button active' : 'tab-button'}
                    onClick={() => switchTab('new')}
                    title="הערות ללא טיפול"
                >
                    הערות חדשות ({newNotes.length})
                </button>
                <button
                    className={activeTab === 'handled' ? 'tab-button active' : 'tab-button'}
                    onClick={() => switchTab('handled')}
                    title="הערות שטופלו"
                >
                    הערות שטופלו ({handledNotes.length})
                </button>
            </div>

            {activeTab === 'new' && (
                <>
                    <div className="table-wrapper">
                        <table>
                            <thead>
                            <tr>
                                <th>עובד</th>
                                <th>תאריך</th>
                                <th>הערה</th>
                                <th>החלטה</th>
                            </tr>
                            </thead>
                            <tbody>
                            {newSlice.rows.map(note => (
                                <tr key={note.id}>
                                    <td>{note.employee_name || note.employee}</td>
                                    <td>{note.date}</td>
                                    <td>{note.note}</td>
                                    <td>
                                        <select
                                            value={note.decision || 'pending'}
                                            onChange={e => handleDecisionChange(note.id, e.target.value)}
                                        >
                                            <option value="pending">בהמתנה</option>
                                            <option value="accepted">מאושר</option>
                                            <option value="denied">נדחה</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                            {newSlice.rows.length === 0 && (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center' }}>
                                        אין נתונים להצגה
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        page={pageNew}
                        totalPages={totalPagesNew}
                        totalItems={newNotes.length}
                        showingFrom={newSlice.start || 0}
                        showingTo={newSlice.end || 0}
                        onPrev={() => setPageNew(p => Math.max(1, p - 1))}
                        onNext={() => setPageNew(p => Math.min(totalPagesNew, p + 1))}
                    />
                </>
            )}

            {activeTab === 'handled' && (
                <>
                    <div className="table-wrapper">
                        <table>
                            <thead>
                            <tr>
                                <th>עובד</th>
                                <th>תאריך</th>
                                <th>הערה</th>
                                <th>החלטה</th>
                                <th>טופל על ידי</th>
                            </tr>
                            </thead>
                            <tbody>
                            {handledSlice.rows.map(note => (
                                <tr key={note.id}>
                                    <td>{note.employee_name || note.employee}</td>
                                    <td>{note.date}</td>
                                    <td>{note.note}</td>
                                    <td>{note.decision}</td>
                                    <td>{note.handled_by}</td>
                                </tr>
                            ))}
                            {handledSlice.rows.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center' }}>
                                        אין נתונים להצגה
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        page={pageHandled}
                        totalPages={totalPagesHandled}
                        totalItems={handledNotes.length}
                        showingFrom={handledSlice.start || 0}
                        showingTo={handledSlice.end || 0}
                        onPrev={() => setPageHandled(p => Math.max(1, p - 1))}
                        onNext={() => setPageHandled(p => Math.min(totalPagesHandled, p + 1))}
                    />
                </>
            )}
        </div>
    );
};

export default NotesPage;
